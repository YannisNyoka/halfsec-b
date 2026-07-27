import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { createUser, createOrder } from './helpers/fixtures.js';
import { getSellerBalance, getAllSellerBalances } from '../utils/ledger.js';

before(connectTestDb);
after(disconnectTestDb);
beforeEach(clearTestDb);

describe('getSellerBalance', () => {
  test('buckets a seller\'s sub-orders into held / available / paidOut / refunded, ignoring other sellers', async () => {
    const buyer = await createUser();
    const seller = await createUser();
    const otherSeller = await createUser();

    await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'held', subtotal: 50 } });
    const availableOrder = await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 75 } });
    await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 40, paidOutAt: new Date() } });
    await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'refunded', subtotal: 30 } });

    // Belongs to a different seller entirely — must not leak into this balance
    await createOrder({ buyerId: buyer._id, sellerId: otherSeller._id, subOrder: { escrowStatus: 'released', subtotal: 999 } });

    const balance = await getSellerBalance(seller._id.toString());

    assert.equal(balance.held, 50);
    assert.equal(balance.available, 75);
    assert.equal(balance.paidOut, 40);
    assert.equal(balance.refunded, 30);
    assert.equal(balance.availableSubOrders.length, 1);
    assert.equal(balance.availableSubOrders[0].order.toString(), availableOrder._id.toString());
    assert.equal(balance.availableSubOrders[0].amount, 75);
  });

  test('returns all zeros for a seller with no orders', async () => {
    const seller = await createUser();
    const balance = await getSellerBalance(seller._id.toString());

    assert.equal(balance.held, 0);
    assert.equal(balance.available, 0);
    assert.equal(balance.paidOut, 0);
    assert.equal(balance.refunded, 0);
    assert.equal(balance.availableSubOrders.length, 0);
  });

  test('sums multiple available sub-orders across separate orders', async () => {
    const buyer = await createUser();
    const seller = await createUser();

    await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 20 } });
    await createOrder({ buyerId: buyer._id, sellerId: seller._id, subOrder: { escrowStatus: 'released', subtotal: 30 } });

    const balance = await getSellerBalance(seller._id.toString());

    assert.equal(balance.available, 50);
    assert.equal(balance.availableSubOrders.length, 2);
  });
});

describe('getAllSellerBalances', () => {
  test('returns one entry per seller, sorted by available balance descending', async () => {
    const buyer = await createUser();
    const sellerLow = await createUser({ name: 'Low Seller' });
    const sellerHigh = await createUser({ name: 'High Seller' });
    const sellerHeldOnly = await createUser({ name: 'Held Only Seller' });

    await createOrder({ buyerId: buyer._id, sellerId: sellerLow._id, subOrder: { escrowStatus: 'released', subtotal: 10 } });
    await createOrder({ buyerId: buyer._id, sellerId: sellerHigh._id, subOrder: { escrowStatus: 'released', subtotal: 500 } });
    await createOrder({ buyerId: buyer._id, sellerId: sellerHeldOnly._id, subOrder: { escrowStatus: 'held', subtotal: 200 } });

    const balances = await getAllSellerBalances();

    assert.equal(balances.length, 3);
    assert.equal(balances[0].seller._id.toString(), sellerHigh._id.toString());
    assert.equal(balances[0].available, 500);
    assert.equal(balances[1].seller._id.toString(), sellerLow._id.toString());

    const heldOnlyEntry = balances.find((b) => b.seller._id.toString() === sellerHeldOnly._id.toString());
    assert.equal(heldOnlyEntry.available, 0);
    assert.equal(heldOnlyEntry.held, 200);
  });

  test('platform-owned sub-orders (no seller) are excluded entirely', async () => {
    const buyer = await createUser();

    await createOrder({ buyerId: buyer._id, sellerId: null, subOrder: { escrowStatus: 'released', subtotal: 100 } });

    const balances = await getAllSellerBalances();
    assert.equal(balances.length, 0);
  });
});
