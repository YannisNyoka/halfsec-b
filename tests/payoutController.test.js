import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { installFetchMock, restoreFetch } from './helpers/mockFetch.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { createUser, createOrder } from './helpers/fixtures.js';

import Order from '../models/Order.js';
import Payout from '../models/Payout.js';
import Notification from '../models/Notification.js';
import { getSellerBalance } from '../utils/ledger.js';
import { recordPayout } from '../controllers/payoutController.js';

before(async () => {
  await connectTestDb();
  installFetchMock(); // payout emails route through Resend's fetch — never hit the real network
});
after(async () => {
  restoreFetch();
  await disconnectTestDb();
});
beforeEach(clearTestDb);

describe('recordPayout', () => {
  test('pays out selected released-but-unpaid sub-orders and links them to the payout', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });

    const order1 = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 60 } });
    const order2 = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 40 } });

    const req = mockReq({
      params: { sellerId: seller._id.toString() },
      body: {
        method: 'eft',
        reference: 'REF-001',
        subOrderIds: [
          { orderId: order1._id.toString(), subOrderId: order1.subOrders[0]._id.toString() },
          { orderId: order2._id.toString(), subOrderId: order2.subOrders[0]._id.toString() },
        ],
      },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await recordPayout(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.payout.amount, 100);
    assert.equal(res.body.payout.subOrders.length, 2);

    const updated1 = await Order.findById(order1._id);
    const updated2 = await Order.findById(order2._id);
    assert.ok(updated1.subOrders[0].paidOutAt);
    assert.ok(updated2.subOrders[0].paidOutAt);
    assert.equal(updated1.subOrders[0].payout.toString(), res.body.payout._id.toString());

    const balance = await getSellerBalance(seller._id.toString());
    assert.equal(balance.available, 0);
    assert.equal(balance.paidOut, 100);

    const notifications = await Notification.find({ user: seller._id, type: 'payout_processed' });
    assert.equal(notifications.length, 1);
  });

  test('rejects an empty selection', async () => {
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });

    const req = mockReq({
      params: { sellerId: seller._id.toString() },
      body: { subOrderIds: [] },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await recordPayout(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(await Payout.countDocuments(), 0);
  });

  test('404s for an unknown seller', async () => {
    const admin = await createUser({ role: 'admin' });
    const fakeSellerId = '507f1f77bcf86cd799439011';

    const req = mockReq({
      params: { sellerId: fakeSellerId },
      body: { subOrderIds: [{ orderId: '507f1f77bcf86cd799439012', subOrderId: '507f1f77bcf86cd799439013' }] },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await recordPayout(req, res);

    assert.equal(res.statusCode, 404);
  });

  test('silently skips already-paid, held, and wrong-seller sub-orders — only the valid one is paid', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const otherSeller = await createUser();
    const admin = await createUser({ role: 'admin' });

    const validOrder = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 60 } });
    const alreadyPaidOrder = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 999, paidOutAt: new Date() } });
    const heldOrder = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'held', subtotal: 999 } });
    const wrongSellerOrder = await createOrder({ buyerId: buyer._id, sellerId: otherSeller._id, subOrder: { escrowStatus: 'released', subtotal: 999 } });

    const req = mockReq({
      params: { sellerId: seller._id.toString() },
      body: {
        subOrderIds: [
          { orderId: validOrder._id.toString(), subOrderId: validOrder.subOrders[0]._id.toString() },
          { orderId: alreadyPaidOrder._id.toString(), subOrderId: alreadyPaidOrder.subOrders[0]._id.toString() },
          { orderId: heldOrder._id.toString(), subOrderId: heldOrder.subOrders[0]._id.toString() },
          { orderId: wrongSellerOrder._id.toString(), subOrderId: wrongSellerOrder.subOrders[0]._id.toString() },
        ],
      },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await recordPayout(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.payout.amount, 60);
    assert.equal(res.body.payout.subOrders.length, 1);

    const updatedHeld = await Order.findById(heldOrder._id);
    assert.equal(updatedHeld.subOrders[0].escrowStatus, 'held');
    assert.equal(updatedHeld.subOrders[0].paidOutAt, undefined);
  });

  test('rejects when every selected sub-order is invalid', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });

    const alreadyPaidOrder = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 50, paidOutAt: new Date() } });

    const req = mockReq({
      params: { sellerId: seller._id.toString() },
      body: { subOrderIds: [{ orderId: alreadyPaidOrder._id.toString(), subOrderId: alreadyPaidOrder.subOrders[0]._id.toString() }] },
      user: { id: admin._id.toString() },
    });
    const res = mockRes();

    await recordPayout(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(await Payout.countDocuments(), 0);
  });

  test('concurrent payout requests for the same sub-order must not both succeed', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const admin = await createUser({ role: 'admin' });

    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 60 } });
    const subOrderId = order.subOrders[0]._id.toString();

    const makeReq = () => mockReq({
      params: { sellerId: seller._id.toString() },
      body: { subOrderIds: [{ orderId: order._id.toString(), subOrderId }] },
      user: { id: admin._id.toString() },
    });

    const res1 = mockRes();
    const res2 = mockRes();

    // Simulate an admin double-clicking "Pay" — or two admins acting at once.
    await Promise.all([
      recordPayout(makeReq(), res1),
      recordPayout(makeReq(), res2),
    ]);

    const successCount = [res1, res2].filter((r) => r.statusCode === 201).length;
    const payouts = await Payout.find({ seller: seller._id });
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);

    assert.equal(successCount, 1, 'exactly one of the two concurrent requests should have claimed this sub-order');
    assert.equal(payouts.length, 1, 'only one Payout document should exist for this sub-order');
    assert.equal(totalPaid, 60, 'the seller must not be paid twice for the same R60 sub-order');
  });
});
