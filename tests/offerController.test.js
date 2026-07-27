import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { mockReq, mockRes } from './helpers/mockReqRes.js';
import { createUser, createProduct } from './helpers/fixtures.js';

import Offer from '../models/Offer.js';
import { makeOffer, withdrawOffer, acceptOffer, declineOffer } from '../controllers/offerController.js';

before(connectTestDb);
after(disconnectTestDb);
beforeEach(clearTestDb);

describe('makeOffer', () => {
  test('creates a pending offer within the allowed price band', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });

    const req = mockReq({ body: { productId: product._id.toString(), offerPrice: 60 }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await makeOffer(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.offer.offerPrice, 60);
  });

  test('rejects an offer on your own listing', async () => {
    const seller = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });

    const req = mockReq({ body: { productId: product._id.toString(), offerPrice: 60 }, user: { id: seller._id.toString() } });
    const res = mockRes();
    await makeOffer(req, res);

    assert.equal(res.statusCode, 400);
  });

  test('rejects an offer below 30% of the listing price', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });

    const req = mockReq({ body: { productId: product._id.toString(), offerPrice: 20 }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await makeOffer(req, res);

    assert.equal(res.statusCode, 400);
  });

  test('rejects a second pending offer on the same product from the same buyer', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });

    await makeOffer(mockReq({ body: { productId: product._id.toString(), offerPrice: 60 }, user: { id: buyer._id.toString() } }), mockRes());

    const res2 = mockRes();
    await makeOffer(mockReq({ body: { productId: product._id.toString(), offerPrice: 70 }, user: { id: buyer._id.toString() } }), res2);

    assert.equal(res2.statusCode, 409);
    const count = await Offer.countDocuments({ product: product._id, buyer: buyer._id, status: 'pending' });
    assert.equal(count, 1);
  });

  test('two concurrent offer submissions from the same buyer cannot both create a pending offer', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });

    const makeReq = () => mockReq({ body: { productId: product._id.toString(), offerPrice: 60 }, user: { id: buyer._id.toString() } });
    const res1 = mockRes();
    const res2 = mockRes();

    await Promise.all([
      makeOffer(makeReq(), res1),
      makeOffer(makeReq(), res2),
    ]);

    const successCount = [res1, res2].filter((r) => r.statusCode === 201).length;
    assert.equal(successCount, 1, 'exactly one concurrent submission should have created the pending offer');

    const count = await Offer.countDocuments({ product: product._id, buyer: buyer._id, status: 'pending' });
    assert.equal(count, 1);
  });
});

describe('withdrawOffer', () => {
  test('withdraws a pending offer', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });
    const offer = await Offer.create({ product: product._id, buyer: buyer._id, seller: seller._id, offerPrice: 60, originalPrice: 100 });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: buyer._id.toString() } });
    const res = mockRes();
    await withdrawOffer(req, res);

    assert.equal(res.statusCode, 200);
    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'withdrawn');
  });

  test('404s for someone else\'s offer', async () => {
    const seller = await createUser();
    const buyer = await createUser();
    const stranger = await createUser();
    const product = await createProduct({ sellerId: seller._id, price: 100 });
    const offer = await Offer.create({ product: product._id, buyer: buyer._id, seller: seller._id, offerPrice: 60, originalPrice: 100 });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: stranger._id.toString() } });
    const res = mockRes();
    await withdrawOffer(req, res);

    assert.equal(res.statusCode, 404);
  });
});

describe('acceptOffer / declineOffer', () => {
  const createPendingOffer = async ({ price = 100, stock = 5 } = {}) => {
    const seller = await createUser();
    const buyer = await createUser();
    const product = await createProduct({ sellerId: seller._id, price, stock });
    const offer = await Offer.create({ product: product._id, buyer: buyer._id, seller: seller._id, offerPrice: price * 0.6, originalPrice: price });
    return { seller, buyer, product, offer };
  };

  test('accepts a pending offer', async () => {
    const { seller, offer } = await createPendingOffer();

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: seller._id.toString() } });
    const res = mockRes();
    await acceptOffer(req, res);

    assert.equal(res.statusCode, 200);
    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'accepted');
  });

  test('rejects accepting an out-of-stock offer', async () => {
    const { seller, offer } = await createPendingOffer({ stock: 0 });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: seller._id.toString() } });
    const res = mockRes();
    await acceptOffer(req, res);

    assert.equal(res.statusCode, 400);
    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'pending');
  });

  test('rejects accepting an expired offer and marks it expired', async () => {
    const { seller, offer } = await createPendingOffer();
    await Offer.updateOne({ _id: offer._id }, { expiresAt: new Date(Date.now() - 1000) });

    const req = mockReq({ params: { id: offer._id.toString() }, user: { id: seller._id.toString() } });
    const res = mockRes();
    await acceptOffer(req, res);

    assert.equal(res.statusCode, 400);
    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'expired');
  });

  test('declines a pending offer', async () => {
    const { seller, offer } = await createPendingOffer();

    const req = mockReq({ params: { id: offer._id.toString() }, body: { sellerNote: 'too low' }, user: { id: seller._id.toString() } });
    const res = mockRes();
    await declineOffer(req, res);

    assert.equal(res.statusCode, 200);
    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'declined');
    assert.equal(updated.sellerNote, 'too low');
  });

  test('two concurrent accept requests on the same offer cannot both succeed', async () => {
    const { seller, offer } = await createPendingOffer();

    const makeAcceptReq = () => mockReq({ params: { id: offer._id.toString() }, user: { id: seller._id.toString() } });
    const res1 = mockRes();
    const res2 = mockRes();

    await Promise.all([
      acceptOffer(makeAcceptReq(), res1),
      acceptOffer(makeAcceptReq(), res2),
    ]);

    const successCount = [res1, res2].filter((r) => r.statusCode === 200).length;
    assert.equal(successCount, 1, 'exactly one of the two concurrent accepts should succeed');

    const updated = await Offer.findById(offer._id);
    assert.equal(updated.status, 'accepted');
  });

  test('a buyer withdrawing at the same moment a seller accepts cannot result in both taking effect', async () => {
    const { seller, buyer, offer } = await createPendingOffer();

    const acceptReq = mockReq({ params: { id: offer._id.toString() }, user: { id: seller._id.toString() } });
    const withdrawReq = mockReq({ params: { id: offer._id.toString() }, user: { id: buyer._id.toString() } });
    const acceptRes = mockRes();
    const withdrawRes = mockRes();

    await Promise.all([
      acceptOffer(acceptReq, acceptRes),
      withdrawOffer(withdrawReq, withdrawRes),
    ]);

    const successCount = [acceptRes.statusCode === 200, withdrawRes.statusCode === 200].filter(Boolean).length;
    assert.equal(successCount, 1, 'exactly one of accept/withdraw should have won');

    const updated = await Offer.findById(offer._id);
    assert.ok(['accepted', 'withdrawn'].includes(updated.status));
  });
});
