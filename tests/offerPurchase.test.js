import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { installFetchMock, restoreFetch } from './helpers/mockFetch.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { createUser, createProduct, createCartForUser } from './helpers/fixtures.js';
import { waitFor } from './helpers/waitFor.js';

import Offer from '../models/Offer.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import Notification from '../models/Notification.js';
import { getOfferCheckout, purchaseOffer } from '../controllers/offerController.js';
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

const checkoutReq = (userId, bodyOverrides = {}) => mockReq({
  body: { shippingAddress: baseShippingAddress(), paymentMethod: 'yoco', ...bodyOverrides },
  user: { id: userId.toString() },
});

const purchaseReq = (userId, offerId, bodyOverrides = {}) => mockReq({
  params: { id: offerId.toString() },
  body: { shippingAddress: baseShippingAddress(), paymentMethod: 'yoco', ...bodyOverrides },
  user: { id: userId.toString() },
});

const createOfferWithStatus = async (status, { price = 100, offerPrice = 60, stock = 5 } = {}) => {
  const seller = await createUser();
  const buyer = await createUser();
  const product = await createProduct({ sellerId: seller._id, price, stock });
  const offer = await Offer.create({
    product: product._id,
    buyer: buyer._id,
    seller: seller._id,
    offerPrice,
    originalPrice: price,
    status,
    respondedAt: status !== 'pending' ? new Date() : null,
  });
  return { seller, buyer, product, offer };
};

const createAcceptedOffer = (opts) => createOfferWithStatus('accepted', opts);

describe('getOfferCheckout', () => {
  test('returns a preview priced at the offer, not the listing price', async () => {
    const { buyer, offer } = await createAcceptedOffer({ price: 100, offerPrice: 60 });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await getOfferCheckout(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.itemsTotal, 60);
  });

  test('404s for someone else\'s offer', async () => {
    const { offer } = await createAcceptedOffer();
    const stranger = await createUser();

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: stranger._id.toString() } });
    const res = mockRes();
    await getOfferCheckout(req, res);

    assert.equal(res.statusCode, 404);
  });

  test('rejects a non-accepted offer', async () => {
    const { buyer, offer } = await createOfferWithStatus('pending');

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await getOfferCheckout(req, res);

    assert.equal(res.statusCode, 400);
  });

  test('reports alreadyPurchased for a purchased offer', async () => {
    const { buyer, offer } = await createAcceptedOffer();
    const fakeOrderId = new mongoose.Types.ObjectId();
    await Offer.updateOne({ _id: offer._id }, { status: 'purchased', order: fakeOrderId });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await getOfferCheckout(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadyPurchased, true);
    assert.equal(res.body.orderId.toString(), fakeOrderId.toString());
  });
});

describe('purchaseOffer — happy path', () => {
  test('creates an order at the negotiated price and marks the offer purchased', async () => {
    const { offer, buyer } = await createAcceptedOffer({ price: 100, offerPrice: 60 });

    const res = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

    assert.equal(res.statusCode, 201);
    const order = res.body.order;
    assert.equal(order.itemsTotal, 60);
    assert.equal(order.items[0].price, 60);
    assert.equal(order.subOrders[0].escrowStatus, 'held');
    assert.equal(order.offer.toString(), offer._id.toString());

    const updatedOffer = await Offer.findById(offer._id);
    assert.equal(updatedOffer.status, 'purchased');
    assert.equal(updatedOffer.order.toString(), order._id.toString());
  });

  test('decrements stock by 1 and increments sold by 1', async () => {
    const { product, buyer, offer } = await createAcceptedOffer({ stock: 5 });

    const res = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

    assert.equal(res.statusCode, 201);
    const updatedProduct = await Product.findById(product._id);
    assert.equal(updatedProduct.stock, 4);
    assert.equal(updatedProduct.sold, 1);
  });

  test('leaves the buyer\'s cart completely untouched', async () => {
    const { buyer, offer } = await createAcceptedOffer();
    const unrelatedProduct = await createProduct({ price: 50 });
    await createCartForUser(buyer._id, [{ product: unrelatedProduct, quantity: 1 }]);

    const res = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

    assert.equal(res.statusCode, 201);
    const cart = await Cart.findOne({ user: buyer._id });
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].product.toString(), unrelatedProduct._id.toString());
  });

  test('notifies both buyer and seller', async () => {
    const { seller, buyer, offer } = await createAcceptedOffer();

    const res = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

    assert.equal(res.statusCode, 201);
    const buyerNotifications = await waitFor(() => Notification.find({ user: buyer._id }), (r) => r.length > 0);
    const sellerNotifications = await waitFor(() => Notification.find({ user: seller._id }), (r) => r.length > 0);
    assert.ok(buyerNotifications.length > 0);
    assert.ok(sellerNotifications.length > 0);
  });
});

describe('purchaseOffer — rejections', () => {
  for (const status of ['pending', 'declined', 'expired', 'withdrawn']) {
    test(`409s a ${status} offer`, async () => {
      const { buyer, offer } = await createOfferWithStatus(status);

      const res = mockRes();
      await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

      assert.equal(res.statusCode, 409);
    });
  }

  test('409s a retry on an already-purchased offer', async () => {
    const { buyer, offer } = await createAcceptedOffer();

    await purchaseOffer(purchaseReq(buyer._id, offer._id), mockRes());

    const res2 = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res2);

    assert.equal(res2.statusCode, 409);
    const count = await mongoose.model('Order').countDocuments({ offer: offer._id });
    assert.equal(count, 1);
  });

  test('404s when the caller is not the offer\'s buyer', async () => {
    const { offer, seller } = await createAcceptedOffer();

    const res = mockRes();
    await purchaseOffer(purchaseReq(seller._id, offer._id), res);

    assert.equal(res.statusCode, 404);
  });

  test('400s and rolls the offer back to accepted when stock runs out before purchase', async () => {
    const { buyer, offer, product } = await createAcceptedOffer({ stock: 1 });
    await Product.findByIdAndUpdate(product._id, { stock: 0 }); // sold via another path in the meantime

    const res = mockRes();
    await purchaseOffer(purchaseReq(buyer._id, offer._id), res);

    assert.equal(res.statusCode, 400);
    const updatedOffer = await Offer.findById(offer._id);
    assert.equal(updatedOffer.status, 'accepted');
    assert.equal(updatedOffer.order, null);
  });
});

describe('purchaseOffer — concurrency', () => {
  test('two concurrent purchase attempts on the same offer cannot both succeed', async () => {
    const { buyer, offer } = await createAcceptedOffer();

    const res1 = mockRes();
    const res2 = mockRes();

    await Promise.all([
      purchaseOffer(purchaseReq(buyer._id, offer._id), res1),
      purchaseOffer(purchaseReq(buyer._id, offer._id), res2),
    ]);

    const statusCodes = [res1.statusCode, res2.statusCode].sort();
    assert.deepEqual(statusCodes, [201, 409]);

    const orderCount = await mongoose.model('Order').countDocuments({ offer: offer._id });
    assert.equal(orderCount, 1);
  });

  test('purchaseOffer racing a placeOrder cart checkout for the same last unit — exactly one wins', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const cartBuyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100, stock: 1 });

    const offer = await Offer.create({
      product: product._id, buyer: buyer._id, seller: seller._id,
      offerPrice: 60, originalPrice: 100, status: 'accepted', respondedAt: new Date(),
    });

    await createCartForUser(cartBuyer._id, [{ product, quantity: 1 }]);

    const offerRes = mockRes();
    const cartRes = mockRes();

    await Promise.all([
      purchaseOffer(purchaseReq(buyer._id, offer._id), offerRes),
      placeOrder(checkoutReq(cartBuyer._id), cartRes),
    ]);

    const successes = [offerRes.statusCode === 201, cartRes.statusCode === 201].filter(Boolean).length;
    assert.equal(successes, 1, 'exactly one of the offer purchase / cart checkout should win the last unit');

    const updatedProduct = await Product.findById(product._id);
    assert.equal(updatedProduct.stock, 0, 'stock must never go negative across the two controllers sharing claimStock');
  });
});
