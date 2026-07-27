import Order from '../models/Order.js';
import Payout from '../models/Payout.js';
import User from '../models/User.js';
import { getSellerBalance, getAllSellerBalances } from '../utils/ledger.js';
import { sendPayoutProcessedEmail } from '../utils/email.js';
import { notifyPayoutProcessed } from '../utils/notify.js';
import { pushPayoutProcessed } from '../utils/pushNotify.js';

// ── Seller: get my balance ───────────────────────────────────────────────────────
export const getMyBalance = async (req, res) => {
  try {
    const balance = await getSellerBalance(req.user.id);
    res.status(200).json({ balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Seller: get my payout history ────────────────────────────────────────────────
export const getMyPayouts = async (req, res) => {
  try {
    const payouts = await Payout.find({ seller: req.user.id })
      .sort({ paidAt: -1 });
    res.status(200).json({ payouts });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// ADMIN
// ════════════════════════════════════════════════════════════════════════════════

// ── Admin: get all seller balances ───────────────────────────────────────────────
export const getAllBalances = async (req, res) => {
  try {
    const balances = await getAllSellerBalances();
    res.status(200).json({ balances });
  } catch (error) {
    console.error('Get all balances error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: get single seller's full detail (balance + history) ──────────────────
export const getSellerPayoutDetail = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const [seller, balance, payouts] = await Promise.all([
      User.findById(sellerId).select('name email sellerProfile'),
      getSellerBalance(sellerId),
      Payout.find({ seller: sellerId }).sort({ paidAt: -1 }),
    ]);

    if (!seller) return res.status(404).json({ message: 'Seller not found.' });

    res.status(200).json({ seller, balance, payouts });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: record a payout to a seller ───────────────────────────────────────────
export const recordPayout = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { method, reference, notes, subOrderIds } = req.body;
    // subOrderIds: array of { orderId, subOrderId } — which available balances to mark as paid

    if (!Array.isArray(subOrderIds) || subOrderIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one item to include in this payout.' });
    }

    const seller = await User.findById(sellerId).select('name email');
    if (!seller) return res.status(404).json({ message: 'Seller not found.' });

    let totalAmount = 0;
    const payoutSubOrders = [];
    const now = new Date();

    for (const { orderId, subOrderId } of subOrderIds) {
      // Atomically claim this sub-order: the filter re-checks seller/released/unpaid
      // at write time, so two concurrent payout requests can't both claim the same
      // sub-order the way a read-then-save race would allow.
      const claimed = await Order.findOneAndUpdate(
        {
          _id: orderId,
          subOrders: {
            $elemMatch: {
              _id: subOrderId,
              seller: sellerId,
              escrowStatus: 'released',
              paidOutAt: { $exists: false },
            },
          },
        },
        { $set: { 'subOrders.$.paidOutAt': now } },
        { returnDocument: 'after' }
      );

      if (!claimed) continue;

      const sub = claimed.subOrders.id(subOrderId);
      totalAmount += sub.subtotal;
      payoutSubOrders.push({
        order: claimed._id,
        subOrderId: sub._id,
        amount: sub.subtotal,
      });
    }

    if (payoutSubOrders.length === 0) {
      return res.status(400).json({ message: 'No valid items found for this payout. They may already be paid.' });
    }

    const payout = await Payout.create({
      seller: sellerId,
      amount: totalAmount,
      subOrders: payoutSubOrders,
      method: method || 'eft',
      reference: reference?.trim() || '',
      notes: notes?.trim() || '',
      paidBy: req.user.id,
      paidAt: now,
    });

    // Link payout back onto sub-orders
    for (const { order: orderId, subOrderId } of payoutSubOrders) {
      const order = await Order.findById(orderId);
      const sub = order.subOrders.id(subOrderId);
      sub.payout = payout._id;
      await order.save();
    }

    notifyPayoutProcessed(sellerId, totalAmount);
    pushPayoutProcessed(sellerId, totalAmount);
    try {
      sendPayoutProcessedEmail(seller.email, seller.name, payout);
    } catch {}

    res.status(201).json({ message: 'Payout recorded.', payout });
  } catch (error) {
    console.error('Record payout error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: get all payouts (history across all sellers) ─────────────────────────
export const getAllPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);

    const [payouts, total] = await Promise.all([
      Payout.find()
        .populate('seller', 'name email sellerProfile.businessName')
        .populate('paidBy', 'name')
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Payout.countDocuments(),
    ]);

    res.status(200).json({
      payouts,
      pagination: { total, page: pageNum, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};