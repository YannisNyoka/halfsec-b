import Product from '../models/Product.js';

// ── Atomically claim stock for a list of items ───────────────────────────────
// Each claim is its own conditional findOneAndUpdate (stock:{$gte:quantity}),
// so two concurrent callers contending for the same last unit can't both
// succeed — one wins the atomic decrement, the other sees a failed match.
// If a later item in the list can't be claimed, everything already claimed
// in this call is released before returning.
export const claimStock = async (items) => {
  const claimed = [];

  for (const item of items) {
    const result = await Product.findOneAndUpdate(
      { _id: item.product, stock: { $gte: item.quantity }, isSoldOut: { $ne: true } },
      { $inc: { stock: -item.quantity, sold: item.quantity } },
      { returnDocument: 'after' }
    );

    if (!result) {
      await releaseStock(claimed);
      return { success: false, failedItem: item };
    }

    claimed.push({ product: item.product, quantity: item.quantity });
  }

  return { success: true, claimed };
};

// ── Release previously-claimed stock (rollback) ──────────────────────────────
export const releaseStock = (claims) =>
  Promise.all(
    claims.map(({ product, quantity }) =>
      Product.findByIdAndUpdate(product, { $inc: { stock: quantity, sold: -quantity } })
    )
  );
