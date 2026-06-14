// ── Buyer Protection Fee tiers ───────────────────────────────────────────────────
// Sliding scale similar to YAGA's model
export const calculateProtectionFee = (itemsTotal) => {
  if (itemsTotal <= 0) return 0;
  if (itemsTotal <= 200) return 15;
  if (itemsTotal <= 500) return 25;
  if (itemsTotal <= 1000) return 40;
  if (itemsTotal <= 2000) return 60;
  return Math.round(itemsTotal * 0.04); // 4% above R2000
};

// ── Group cart items by seller ────────────────────────────────────────────────────
// Returns: { sellerId|'platform': [items] }
export const groupItemsBySeller = (items) => {
  const groups = {};
  for (const item of items) {
    const key = item.seller ? item.seller.toString() : 'platform';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
};