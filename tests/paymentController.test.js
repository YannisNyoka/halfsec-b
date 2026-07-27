import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { createUser, createOrder } from './helpers/fixtures.js';
import Order from '../models/Order.js';
import { yocoWebhook } from '../controllers/paymentController.js';
import { mockRes } from './helpers/mockReqRes.js';

before(connectTestDb);
after(disconnectTestDb);
beforeEach(clearTestDb);

const WEBHOOK_SECRET = 'whsec_' + Buffer.from('a-fixed-test-secret-key').toString('base64');

const signedWebhookReq = (body) => {
  process.env.YOCO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const rawBody = JSON.stringify(body);
  const id = 'msg_' + crypto.randomBytes(8).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secretBytes = Buffer.from(WEBHOOK_SECRET.split('_')[1], 'base64');
  const sig = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest('base64');

  return {
    body: Buffer.from(rawBody, 'utf8'),
    headers: { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${sig}` },
  };
};

describe('yocoWebhook', () => {
  test('marks an order paid on payment.succeeded', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id, order: { paymentStatus: 'pending', orderStatus: 'pending' } });

    const req = signedWebhookReq({ type: 'payment.succeeded', payload: { metadata: { orderId: order._id.toString() } } });
    const res = mockRes();

    await yocoWebhook(req, res);

    assert.equal(res.statusCode, 200);
    const updated = await Order.findById(order._id);
    assert.equal(updated.paymentStatus, 'paid');
    assert.equal(updated.orderStatus, 'confirmed');
    assert.ok(updated.paidAt);
  });

  test('redelivering the same event twice is idempotent — no duplicate state change', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id, order: { paymentStatus: 'pending', orderStatus: 'pending' } });

    const eventBody = { type: 'payment.succeeded', payload: { metadata: { orderId: order._id.toString() } } };

    await yocoWebhook(signedWebhookReq(eventBody), mockRes());
    const firstPaidAt = (await Order.findById(order._id)).paidAt;

    // Yoco (like most webhook providers) can redeliver the same event more than once.
    await yocoWebhook(signedWebhookReq(eventBody), mockRes());
    const updated = await Order.findById(order._id);

    assert.equal(updated.paymentStatus, 'paid');
    assert.equal(updated.paidAt.getTime(), firstPaidAt.getTime(), 'paidAt must not be overwritten by a redelivered event');
  });

  test('rejects an event with an invalid signature', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const order = await createOrder({ buyerId: buyer._id, sellerId: seller._id, order: { paymentStatus: 'pending' } });

    const req = signedWebhookReq({ type: 'payment.succeeded', payload: { metadata: { orderId: order._id.toString() } } });
    req.headers['webhook-signature'] = 'v1,dGFtcGVyZWQ=';
    const res = mockRes();

    await yocoWebhook(req, res);

    assert.equal(res.statusCode, 401);
    const updated = await Order.findById(order._id);
    assert.equal(updated.paymentStatus, 'pending');
  });

  test('an unknown order id in the payload is a no-op, not an error', async () => {
    const req = signedWebhookReq({ type: 'payment.succeeded', payload: { metadata: { orderId: '507f1f77bcf86cd799439011' } } });
    const res = mockRes();

    await yocoWebhook(req, res);

    assert.equal(res.statusCode, 200);
  });

  test('a non-raw body is rejected rather than trusted', async () => {
    const req = { body: { type: 'payment.succeeded' }, headers: {} }; // pre-parsed object, not a Buffer
    const res = mockRes();

    await yocoWebhook(req, res);

    assert.equal(res.statusCode, 500);
  });
});
