import './helpers/env.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb.js';
import { createProduct } from './helpers/fixtures.js';

import Product from '../models/Product.js';
import { claimStock, releaseStock } from '../utils/stock.js';

before(connectTestDb);
after(disconnectTestDb);
beforeEach(clearTestDb);

describe('claimStock', () => {
  test('claims a single item with sufficient stock', async () => {
    const product = await createProduct({ stock: 5 });

    const result = await claimStock([{ product: product._id, quantity: 2 }]);

    assert.equal(result.success, true);
    assert.equal(result.claimed.length, 1);
    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 3);
    assert.equal(updated.sold, 2);
  });

  test('fails and claims nothing when a single item is out of stock', async () => {
    const product = await createProduct({ stock: 1 });

    const result = await claimStock([{ product: product._id, quantity: 2 }]);

    assert.equal(result.success, false);
    assert.equal(result.failedItem.product.toString(), product._id.toString());
    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 1);
  });

  test('rolls back an earlier claim when a later item in the same call fails', async () => {
    const inStock = await createProduct({ stock: 5 });
    const outOfStock = await createProduct({ stock: 0 });

    const result = await claimStock([
      { product: inStock._id, quantity: 1 },
      { product: outOfStock._id, quantity: 1 },
    ]);

    assert.equal(result.success, false);
    const updatedInStock = await Product.findById(inStock._id);
    assert.equal(updatedInStock.stock, 5, 'the first claim must be rolled back');
    assert.equal(updatedInStock.sold, 0);
  });

  test('two concurrent single-item claims against stock:1 — exactly one succeeds', async () => {
    const product = await createProduct({ stock: 1 });

    const [resultA, resultB] = await Promise.all([
      claimStock([{ product: product._id, quantity: 1 }]),
      claimStock([{ product: product._id, quantity: 1 }]),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success).length;
    assert.equal(successes, 1, 'exactly one of the two concurrent claims should succeed');

    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 0, 'stock must never go negative');
    assert.equal(updated.sold, 1);
  });
});

describe('releaseStock', () => {
  test('restores stock and sold count for released claims', async () => {
    const product = await createProduct({ stock: 5 });
    const claimResult = await claimStock([{ product: product._id, quantity: 3 }]);
    assert.equal(claimResult.success, true);

    await releaseStock(claimResult.claimed);

    const updated = await Product.findById(product._id);
    assert.equal(updated.stock, 5);
    assert.equal(updated.sold, 0);
  });
});
