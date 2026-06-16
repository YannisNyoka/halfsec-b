import Order from '../models/Order.js';
import Payout from '../models/Payout.js';
import mongoose from 'mongoose';

// ── Get a seller's balance breakdown ─────────────────────────────────────────────
// held       = funds still in escrow (not yet released)
// available  = released but not yet paid out
// paidOut    = total ever paid to this seller
export const getSellerBalance = async (sellerId) => {
  const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

  const orders = await Order.find({ 'subOrders.seller': sellerObjectId });

  let held = 0;
  let available = 0;
  let paidOut = 0;
  let refunded = 0;

  const availableSubOrders = [];

  for (const order of orders) {
    for (const sub of order.subOrders) {
      if (!sub.seller || sub.seller.toString() !== sellerId.toString()) continue;

      if (sub.escrowStatus === 'held') {
        held += sub.subtotal;
      } else if (sub.escrowStatus === 'released') {
        if (sub.paidOutAt) {
          paidOut += sub.subtotal;
        } else {
          available += sub.subtotal;
          availableSubOrders.push({
            order: order._id,
            orderNumber: order.orderNumber,
            subOrderId: sub._id,
            amount: sub.subtotal,
            releasedAt: sub.releasedAt,
            items: sub.items,
          });
        }
      } else if (sub.escrowStatus === 'refunded') {
        refunded += sub.subtotal;
      }
    }
  }

  return { held, available, paidOut, refunded, availableSubOrders };
};

// ── Get balances for all sellers (admin overview) ────────────────────────────────
export const getAllSellerBalances = async () => {
  const orders = await Order.find({ 'subOrders.seller': { $ne: null } })
    .populate('subOrders.seller', 'name email sellerProfile.businessName sellerProfile.bankDetails');

  const balances = {};

  for (const order of orders) {
    for (const sub of order.subOrders) {
      if (!sub.seller) continue;
      const sellerId = sub.seller._id.toString();

      if (!balances[sellerId]) {
        balances[sellerId] = {
          seller: {
            _id: sub.seller._id,
            name: sub.seller.name,
            email: sub.seller.email,
            businessName: sub.seller.sellerProfile?.businessName,
            bankDetails: sub.seller.sellerProfile?.bankDetails,
          },
          held: 0,
          available: 0,
          paidOut: 0,
          refunded: 0,
        };
      }

      if (sub.escrowStatus === 'held') {
        balances[sellerId].held += sub.subtotal;
      } else if (sub.escrowStatus === 'released') {
        if (sub.paidOutAt) {
          balances[sellerId].paidOut += sub.subtotal;
        } else {
          balances[sellerId].available += sub.subtotal;
        }
      } else if (sub.escrowStatus === 'refunded') {
        balances[sellerId].refunded += sub.subtotal;
      }
    }
  }

  return Object.values(balances).sort((a, b) => b.available - a.available);
};