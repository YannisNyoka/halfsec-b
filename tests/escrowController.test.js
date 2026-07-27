import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { installFetchMock, restoreFetch, setFetchHandler, resetFetchHandler } from './helpers/mockFetch.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { waitFor } from './helpers/waitFor.js';

import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import {
  confirmReceipt,
  raiseDispute,
  getDisputes,
  resolveDispute,
} from '../controllers/escrowController.js';
import { createUser, createOrder } from './helpers/fixtures.js';

before(async () => {
  await connectTestDb();
  installFetchMock();
});

after(async () => {
  restoreFetch();
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  resetFetchHandler();
});

// ════════════════════════════════════════════════════════════════════════════
describe('confirmReceipt', () => {
  test('releases escrow when order is delivered and sub-order is held', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await confirmReceipt(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /Thanks for confirming/);

    const updated = await Order.findById(order._id);
    assert.equal(updated.subOrders[0].escrowStatus, 'released');
    assert.ok(updated.subOrders[0].releasedAt);

    const notifications = await waitFor(() => Notification.find({ user: seller._id }), (r) => r.length > 0);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].type, 'escrow_released');
  });

  test('404s when the order does not belong to the requesting user', async () => {
    const buyer = await createUser();
    const stranger = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      user: { id: stranger._id.toString() },
    });
    const res = mockRes();

    await confirmReceipt(req, res);

    assert.equal(res.statusCode, 404);
  });

  test('404s on an unknown sub-order id', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: new mongoose.Types.ObjectId().toString() },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await confirmReceipt(req, res);

    assert.equal(res.statusCode, 404);
  });

  test('rejects confirming receipt on a sub-order that is not held', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: { escrowStatus: 'released' },
    });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await confirmReceipt(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already been released/);
  });

  test('rejects confirming receipt before the order is marked delivered', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      order: { orderStatus: 'shipped' },
    });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await confirmReceipt(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /marked delivered/);

    const updated = await Order.findById(order._id);
    assert.equal(updated.subOrders[0].escrowStatus, 'held');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('raiseDispute', () => {
  test('moves a held sub-order to disputed and notifies admin', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { reason: 'item_not_as_described', description: 'The item arrived damaged.' },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await raiseDispute(req, res);

    assert.equal(res.statusCode, 200);

    const updated = await Order.findById(order._id);
    const sub = updated.subOrders[0];
    assert.equal(sub.escrowStatus, 'disputed');
    assert.equal(sub.dispute.reason, 'item_not_as_described');
    assert.equal(sub.dispute.description, 'The item arrived damaged.');
    assert.equal(sub.dispute.resolution, 'none');
    assert.equal(sub.dispute.raisedBy.toString(), buyer._id.toString());

    const adminNotifications = await waitFor(() => Notification.find({ user: admin._id }), (r) => r.length > 0);
    assert.equal(adminNotifications.length, 1);
    assert.equal(adminNotifications[0].type, 'escrow_disputed');
  });

  test('rejects a dispute with no reason', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { description: 'Something is wrong.' },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await raiseDispute(req, res);

    assert.equal(res.statusCode, 400);
    const updated = await Order.findById(order._id);
    assert.equal(updated.subOrders[0].escrowStatus, 'held');
  });

  test('rejects a dispute with a blank description', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { reason: 'item_not_as_described', description: '   ' },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await raiseDispute(req, res);

    assert.equal(res.statusCode, 400);
  });

  test('cannot dispute a sub-order that is already released', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: { escrowStatus: 'released' },
    });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { reason: 'item_not_as_described', description: 'Too late but trying anyway.' },
      user: { id: buyer._id.toString() },
    });
    const res = mockRes();

    await raiseDispute(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /already been released/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('getDisputes', () => {
  test('returns only open disputes by default, and only the disputed sub-order within an order', async () => {
    const buyer = await createUser();
    const seller = await createUser();

    // Order with one disputed (open) sub and one held sub — held one must not leak into results
    const mixedOrder = await Order.create({
      user: buyer._id,
      subOrders: [
        {
          seller: seller._id,
          items: [{ product: new mongoose.Types.ObjectId(), name: 'Disputed Item', image: 'x', price: 50, quantity: 1 }],
          subtotal: 50,
          escrowStatus: 'disputed',
          dispute: { reason: 'not_received', description: 'Never arrived.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'none' },
        },
        {
          seller: seller._id,
          items: [{ product: new mongoose.Types.ObjectId(), name: 'Fine Item', image: 'x', price: 60, quantity: 1 }],
          subtotal: 60,
          escrowStatus: 'held',
        },
      ],
      items: [],
      shippingAddress: { name: 'B', street: 'S', city: 'C', province: 'P', postalCode: '1', country: 'South Africa', phone: '0' },
      paymentMethod: 'yoco', paymentStatus: 'paid', orderStatus: 'delivered',
      itemsTotal: 110, shippingCost: 0, total: 110,
    });

    // Separate order with a resolved dispute — must not show under status=open
    await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: {
        escrowStatus: 'disputed',
        dispute: { reason: 'not_received', description: 'Resolved already.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'refunded_to_buyer', resolvedAt: new Date() },
      },
    });

    const req = mockReq({ query: { status: 'open' } });
    const res = mockRes();
    await getDisputes(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.disputes.length, 1);
    assert.equal(res.body.disputes[0].orderId.toString(), mixedOrder._id.toString());
    assert.equal(res.body.disputes[0].subtotal, 50);
  });

  test('status=resolved returns only resolved disputes', async () => {
    const buyer = await createUser();
    const seller = await createUser();

    await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: {
        escrowStatus: 'disputed',
        dispute: { reason: 'not_received', description: 'Open one.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'none' },
      },
    });
    const resolvedOrder = await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: {
        escrowStatus: 'refunded',
        dispute: { reason: 'not_received', description: 'Resolved one.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'refunded_to_buyer', resolvedAt: new Date() },
      },
    });

    const req = mockReq({ query: { status: 'resolved' } });
    const res = mockRes();
    await getDisputes(req, res);

    assert.equal(res.body.disputes.length, 1);
    assert.equal(res.body.disputes[0].orderId.toString(), resolvedOrder._id.toString());
  });

  test('status=all returns both open and resolved disputes', async () => {
    const buyer = await createUser();
    const seller = await createUser();

    await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: { escrowStatus: 'disputed', dispute: { reason: 'a', description: 'Open.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'none' } },
    });
    await createOrder({
      buyerId: buyer._id, sellerId: seller._id,
      subOrder: { escrowStatus: 'refunded', dispute: { reason: 'a', description: 'Resolved.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'refunded_to_buyer', resolvedAt: new Date() } },
    });

    const req = mockReq({ query: { status: 'all' } });
    const res = mockRes();
    await getDisputes(req, res);

    assert.equal(res.body.disputes.length, 2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('resolveDispute', () => {
  const disputedOrder = (buyer, seller, extra = {}) => createOrder({
    buyerId: buyer._id, sellerId: seller._id,
    subOrder: {
      escrowStatus: 'disputed',
      dispute: { reason: 'not_received', description: 'Never arrived.', raisedAt: new Date(), raisedBy: buyer._id, resolution: 'none' },
    },
    order: extra,
  });

  test('rejects an invalid resolution value', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await disputedOrder(buyer, seller);

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'something_else' },
      user: { id: (await createUser({ role: 'admin' }))._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 400);
  });

  test('rejects resolving a sub-order that is not under dispute', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id }); // held, not disputed
    const admin = await createUser({ role: 'admin' });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'released_to_seller' },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /not under dispute/);
  });

  test('released_to_seller releases escrow and notifies buyer + seller', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const order = await disputedOrder(buyer, seller);

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'released_to_seller', adminNotes: 'Seller provided proof of delivery.' },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 200);

    const updated = await Order.findById(order._id);
    const sub = updated.subOrders[0];
    assert.equal(sub.escrowStatus, 'released');
    assert.ok(sub.releasedAt);
    assert.equal(sub.dispute.resolution, 'released_to_seller');
    assert.equal(sub.dispute.resolvedBy.toString(), admin._id.toString());

    const buyerNotifications = await waitFor(() => Notification.find({ user: buyer._id, type: 'dispute_resolved' }), (r) => r.length > 0);
    const sellerNotifications = await waitFor(() => Notification.find({ user: seller._id, type: 'escrow_released' }), (r) => r.length > 0);
    assert.equal(buyerNotifications.length, 1);
    assert.equal(sellerNotifications.length, 1);
  });

  test('refunded_to_buyer without a Yoco checkout id flags for manual refund and never calls Yoco', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const order = await disputedOrder(buyer, seller); // no yocoCheckoutId set

    // Only the Yoco refund endpoint should flip this — email sends (fire-and-forget,
    // routed through the same global fetch) must not be mistaken for a refund call.
    let fetchCalled = false;
    setFetchHandler(async (url) => {
      if (typeof url === 'string' && url.includes('/refund')) fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'refunded_to_buyer' },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(fetchCalled, false, 'should not call Yoco when there is no checkout id to refund against');

    const updated = await Order.findById(order._id);
    const sub = updated.subOrders[0];
    assert.equal(sub.escrowStatus, 'refunded');
    assert.match(sub.dispute.adminNotes, /must be processed manually/);
  });

  test('refunded_to_buyer with a Yoco checkout id calls Yoco and records the auto-refund', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const order = await disputedOrder(buyer, seller, { yocoCheckoutId: 'checkout_abc123' });

    // Same isolation as above: ignore whatever the fire-and-forget email fetch does.
    let calledUrl;
    setFetchHandler(async (url) => {
      if (typeof url === 'string' && url.includes('/refund')) {
        calledUrl = url;
        return { ok: true, json: async () => ({ id: 'refund_1', status: 'succeeded' }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'refunded_to_buyer' },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 200);
    assert.match(calledUrl, /checkout_abc123\/refund/);

    const updated = await Order.findById(order._id);
    const sub = updated.subOrders[0];
    assert.equal(sub.escrowStatus, 'refunded');
    assert.ok(sub.refundedAt);
    assert.match(sub.dispute.adminNotes, /Auto-refund processed/);
  });

  test('refunded_to_buyer leaves the order untouched in the DB when the Yoco refund fails', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });
    const order = await disputedOrder(buyer, seller, { yocoCheckoutId: 'checkout_will_fail' });

    setFetchHandler(async () => ({ ok: false, json: async () => ({ message: 'card issuer declined' }) }));

    const req = mockReq({
      params: { orderId: order._id.toString(), subOrderId: order.subOrders[0]._id.toString() },
      body: { resolution: 'refunded_to_buyer' },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await resolveDispute(req, res);

    assert.equal(res.statusCode, 502);
    assert.match(res.body.message, /manually/);

    // Critical: nothing should have been persisted — no partial state corruption
    const updated = await Order.findById(order._id);
    const sub = updated.subOrders[0];
    assert.equal(sub.escrowStatus, 'disputed');
    assert.equal(sub.dispute.resolution, 'none');
    assert.equal(sub.dispute.resolvedAt, undefined);
  });
});
