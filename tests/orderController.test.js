import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { installFetchMock, restoreFetch } from './helpers/mockFetch.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { createUser, createProduct, createCartForUser } from './helpers/fixtures.js';

import Coupon from '../models/Coupon.js';
import Product from '../models/Product.js';
import { placeOrder } from '../controllers/orderController.js';

before(async () => {
  await connectTestDb();
  installFetchMock(); // order-confirmation emails route through Resend's fetch
});
after(async () => {
  restoreFetch();
  await disconnectTestDb();
});
beforeEach(clearTestDb);

const baseShippingAddress = () => ({
  name: 'Test Buyer', street: '1 Main Rd', city: 'Cape Town',
  province: 'Western Cape', postalCode: '8000', country: 'South Africa', phone: '0821234567',
});

const placeOrderReq = (userId, bodyOverrides = {}) => mockReq({
  body: { shippingAddress: baseShippingAddress(), paymentMethod: 'yoco', ...bodyOverrides },
  user: { id: userId.toString() },
});

describe('placeOrder — coupon handling', () => {
  test('places an order with no coupon at full price', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.order.discountAmount, 0);
    assert.equal(res.body.order.couponCode, null);
  });

  test('a valid active coupon does not crash the order and correctly discounts the total', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'SAVE10', type: 'percentage', value: 10 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'save10' }), res);

    assert.equal(res.statusCode, 201);
    const order = res.body.order;
    assert.equal(order.couponCode, 'SAVE10');
    assert.equal(order.discountAmount, 30); // 10% of R300
    assert.equal(order.total, order.itemsTotal + order.buyerProtectionFee + order.shippingCost - 30);

    const coupon = await Coupon.findOne({ code: 'SAVE10' });
    assert.equal(coupon.usageCount, 1);
    assert.equal(coupon.usedBy.length, 1);
    assert.equal(coupon.usedBy[0].user.toString(), buyer._id.toString());
  });

  test('percentage discount is capped by maxDiscount', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 1000 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'BIG50', type: 'percentage', value: 50, maxDiscount: 100 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'BIG50' }), res);

    assert.equal(res.body.order.discountAmount, 100);
  });

  test('fixed discount is capped at itemsTotal, never going negative', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 50 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'FLAT100', type: 'fixed', value: 100 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'FLAT100' }), res);

    const order = res.body.order;
    assert.equal(order.discountAmount, 50);
    assert.equal(order.total, order.buyerProtectionFee + order.shippingCost);
  });

  test('an unknown coupon code is silently ignored — order still succeeds at full price', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'DOESNOTEXIST' }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.order.discountAmount, 0);
    assert.equal(res.body.order.couponCode, null);
  });

  test('an expired coupon gives no discount and is not marked used', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'OLD10', type: 'percentage', value: 10, expiresAt: new Date(Date.now() - 86400000) });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'OLD10' }), res);

    assert.equal(res.body.order.discountAmount, 0);
    const coupon = await Coupon.findOne({ code: 'OLD10' });
    assert.equal(coupon.usageCount, 0);
  });

  test('a not-yet-started coupon gives no discount', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'FUTURE10', type: 'percentage', value: 10, startsAt: new Date(Date.now() + 86400000) });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'FUTURE10' }), res);

    assert.equal(res.body.order.discountAmount, 0);
  });

  test('an order below minOrderAmount gets no discount', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 50 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'BIGORDER', type: 'percentage', value: 10, minOrderAmount: 500 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'BIGORDER' }), res);

    assert.equal(res.body.order.discountAmount, 0);
  });

  test('a coupon that already hit its global usage limit gives no discount', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'LIMITED', type: 'percentage', value: 10, usageLimit: 1, usageCount: 1 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'LIMITED' }), res);

    assert.equal(res.body.order.discountAmount, 0);
  });

  test('a user who already used up their per-user limit cannot use the coupon again', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300 });
    await createCartForUser(buyer._id, [{ product, quantity: 1 }]);
    await Coupon.create({ code: 'ONEUSE', type: 'percentage', value: 10, userUsageLimit: 1, usedBy: [{ user: buyer._id }] });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id, { couponCode: 'ONEUSE' }), res);

    assert.equal(res.body.order.discountAmount, 0);
    const coupon = await Coupon.findOne({ code: 'ONEUSE' });
    assert.equal(coupon.usageCount, 0, 'this failed attempt must not have been counted as a claim');
  });

  test('two concurrent checkouts cannot both claim the last remaining use of a coupon', async () => {
    const buyerA = await createUser();
    const buyerB = await createUser();
    const productA = await createProduct({ price: 300 });
    const productB = await createProduct({ price: 300 });
    await createCartForUser(buyerA._id, [{ product: productA, quantity: 1 }]);
    await createCartForUser(buyerB._id, [{ product: productB, quantity: 1 }]);
    await Coupon.create({ code: 'LASTONE', type: 'percentage', value: 10, usageLimit: 1 });

    const resA = mockRes();
    const resB = mockRes();

    await Promise.all([
      placeOrder(placeOrderReq(buyerA._id, { couponCode: 'LASTONE' }), resA),
      placeOrder(placeOrderReq(buyerB._id, { couponCode: 'LASTONE' }), resB),
    ]);

    assert.equal(resA.statusCode, 201);
    assert.equal(resB.statusCode, 201);

    const winners = [resA, resB].filter((r) => r.body.order.discountAmount > 0).length;
    assert.equal(winners, 1, 'exactly one of the two concurrent checkouts should have won the last coupon use');

    const coupon = await Coupon.findOne({ code: 'LASTONE' });
    assert.equal(coupon.usageCount, 1);
    assert.equal(coupon.usedBy.length, 1);
  });
});

describe('placeOrder — stock reservation', () => {
  test('decrements stock and increments sold on a normal purchase', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300, stock: 5 });
    await createCartForUser(buyer._id, [{ product, quantity: 2 }]);

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id), res);

    assert.equal(res.statusCode, 201);
    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 3);
    assert.equal(updated.sold, 2);
  });

  test('rejects checkout when stock is insufficient and does not touch stock', async () => {
    const buyer = await createUser();
    const product = await createProduct({ price: 300, stock: 1 });
    await createCartForUser(buyer._id, [{ product, quantity: 2 }]);

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id), res);

    assert.equal(res.statusCode, 400);
    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 1);
  });

  test('two concurrent checkouts for the last unit cannot both succeed', async () => {
    const buyerA = await createUser();
    const buyerB = await createUser();
    const product = await createProduct({ price: 300, stock: 1 });
    await createCartForUser(buyerA._id, [{ product, quantity: 1 }]);
    await createCartForUser(buyerB._id, [{ product, quantity: 1 }]);

    const resA = mockRes();
    const resB = mockRes();

    await Promise.all([
      placeOrder(placeOrderReq(buyerA._id), resA),
      placeOrder(placeOrderReq(buyerB._id), resB),
    ]);

    const successes = [resA, resB].filter((r) => r.statusCode === 201).length;
    const failures = [resA, resB].filter((r) => r.statusCode === 400).length;

    assert.equal(successes, 1, 'exactly one of the two concurrent checkouts should get the last unit');
    assert.equal(failures, 1);

    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 0, 'stock must never go negative — no oversell');
    assert.equal(updated.sold, 1);
  });

  test('rolls back an earlier item\'s claimed stock when a later item in the same order loses the stock race', async () => {
    const buyer = await createUser();
    const inStockProduct = await createProduct({ price: 100, stock: 5 });
    const raceProduct = await createProduct({ price: 100, stock: 1 });
    await createCartForUser(buyer._id, [
      { product: inStockProduct, quantity: 1 },
      { product: raceProduct, quantity: 1 },
    ]);

    // Simulate someone else buying the last unit between cart population and
    // checkout — passes the earlier advisory check (cart snapshot said stock:1),
    // but fails the live atomic claim.
    await Product.findByIdAndUpdate(raceProduct._id, { stock: 0 });

    const res = mockRes();
    await placeOrder(placeOrderReq(buyer._id), res);

    assert.equal(res.statusCode, 400);
    const updatedInStock = await Product.findById(inStockProduct._id);
    assert.equal(updatedInStock.stock, 5, 'the first item\'s claim must be rolled back when the order as a whole fails');
  });
});
