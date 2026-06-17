import Order from '../models/Order.js';
import User from '../models/User.js';
import {
  sendDisputeReceivedEmail,
  sendDisputeResolvedEmail,
  sendFundsReleasedToSellerEmail,
} from '../utils/email.js';
import { processYocoRefund } from '../utils/yocoRefund.js';
import {
  notifyEscrowReleased,
  notifyDisputeRaised,
  notifyDisputeResolved,
} from '../utils/notify.js';
import { pushEscrowReleased, pushDisputeResolved } from '../utils/pushNotify.js';

// ── Buyer: confirm receipt for a sub-order ───────────────────────────────────────
export const confirmReceipt = async (req, res) => {
  try {
    const { orderId, subOrderId } = req.params;

    const order = await Order.findOne({ _id: orderId, user: req.user.id })
      .populate('user', 'name email');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const sub = order.subOrders.id(subOrderId);
    if (!sub) return res.status(404).json({ message: 'Sub-order not found.' });

    if (sub.escrowStatus !== 'held') {
      return res.status(400).json({ message: `This item's payment has already been ${sub.escrowStatus}.` });
    }

    if (order.orderStatus !== 'delivered') {
      return res.status(400).json({ message: 'You can only confirm receipt once the order is marked delivered.' });
    }

    sub.escrowStatus = 'released';
    sub.releasedAt = new Date();
    await order.save();
    if (sub.seller) notifyEscrowReleased(sub.seller, order.orderNumber, order._id);
    if (sub.seller) pushEscrowReleased(sub.seller, order.orderNumber, order._id);

    // Notify seller their funds were released
    try {
      if (sub.seller) {
        const seller = await User.findById(sub.seller).select('name email');
        if (seller) {
          sendFundsReleasedToSellerEmail(seller.email, seller.name, order, sub);
        }
      }
    } catch {}

    res.status(200).json({ message: 'Thanks for confirming! The seller has been notified.', subOrder: sub });
  } catch (error) {
    console.error('Confirm receipt error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Buyer: raise a dispute for a sub-order ───────────────────────────────────────
export const raiseDispute = async (req, res) => {
  try {
    const { orderId, subOrderId } = req.params;
    const { reason, description } = req.body;

    if (!reason || !description?.trim()) {
      return res.status(400).json({ message: 'Please select a reason and describe the issue.' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.id })
      .populate('user', 'name email');

    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const sub = order.subOrders.id(subOrderId);
    if (!sub) return res.status(404).json({ message: 'Sub-order not found.' });

    if (sub.escrowStatus !== 'held') {
      return res.status(400).json({ message: `This item's payment has already been ${sub.escrowStatus}.` });
    }

    sub.escrowStatus = 'disputed';
    sub.dispute = {
      reason,
      description: description.trim(),
      raisedAt: new Date(),
      raisedBy: req.user.id,
      resolution: 'none',
    };
    await order.save();

    // Notify admin — get admin user id
const adminUser = await User.findOne({ role: 'admin' }).select('_id');
if (adminUser) notifyDisputeRaised(adminUser._id, order.orderNumber, order._id);

    // Notify admin
    try {
      sendDisputeReceivedEmail(order, sub);
    } catch {}

    res.status(200).json({
      message: 'Your dispute has been submitted. Our team will review it and get back to you within 2 business days.',
      subOrder: sub,
    });
  } catch (error) {
    console.error('Raise dispute error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: get all disputed sub-orders ───────────────────────────────────────────
export const getDisputes = async (req, res) => {
  try {
    const { status = 'open' } = req.query; // 'open' | 'resolved' | 'all'

    let resolutionFilter;
    if (status === 'open') resolutionFilter = 'none';
    else if (status === 'resolved') resolutionFilter = { $ne: 'none' };

    const matchStage = {
      'subOrders.escrowStatus': 'disputed',
      ...(resolutionFilter !== undefined
        ? { 'subOrders.dispute.resolution': resolutionFilter }
        : {}),
    };

    const orders = await Order.find(matchStage)
      .populate('user', 'name email')
      .sort({ 'subOrders.dispute.raisedAt': -1 });

    // Flatten to individual disputed sub-orders with order context
    const disputes = [];
    for (const order of orders) {
      for (const sub of order.subOrders) {
        if (sub.escrowStatus !== 'disputed') continue;
        if (status === 'open' && sub.dispute?.resolution !== 'none') continue;
        if (status === 'resolved' && sub.dispute?.resolution === 'none') continue;

        let sellerInfo = null;
        if (sub.seller) {
          sellerInfo = await User.findById(sub.seller).select('name email sellerProfile.businessName');
        }

        disputes.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          subOrderId: sub._id,
          customer: order.user,
          seller: sellerInfo,
          items: sub.items,
          subtotal: sub.subtotal,
          dispute: sub.dispute,
          deliveredAt: sub.deliveredAt,
        });
      }
    }

    res.status(200).json({ disputes });
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: resolve a dispute ─────────────────────────────────────────────────────
export const resolveDispute = async (req, res) => {
  try {
    const { orderId, subOrderId } = req.params;
    const { resolution, adminNotes } = req.body;

    if (!['released_to_seller', 'refunded_to_buyer'].includes(resolution)) {
      return res.status(400).json({ message: 'Invalid resolution.' });
    }

    const order = await Order.findById(orderId).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const sub = order.subOrders.id(subOrderId);
    if (!sub) return res.status(404).json({ message: 'Sub-order not found.' });

    if (sub.escrowStatus !== 'disputed') {
      return res.status(400).json({ message: 'This sub-order is not under dispute.' });
    }

    sub.dispute.resolution = resolution;
    sub.dispute.resolvedAt = new Date();
    sub.dispute.resolvedBy = req.user.id;
    if (adminNotes) sub.dispute.adminNotes = adminNotes.trim();

    if (resolution === 'released_to_seller') {
      sub.escrowStatus = 'released';
      sub.releasedAt = new Date();
    } else {
      // ── Process real refund via Yoco ──────────────────────────────────────────
      if (order.yocoCheckoutId) {
        const refundAmountCents = Math.round(sub.subtotal * 100);
        const refundResult = await processYocoRefund(
          order.yocoCheckoutId,
          refundAmountCents,
          `Dispute: ${sub.dispute.reason}`
        );

        if (!refundResult.success) {
          return res.status(502).json({
            message: `Refund could not be processed automatically: ${refundResult.error}. Please process it manually in your Yoco dashboard and contact support to mark this resolved.`,
          });
        }

        sub.dispute.adminNotes = (sub.dispute.adminNotes || '') +
          `\n[Auto-refund processed: R${sub.subtotal.toLocaleString()} via Yoco]`;
      } else {
        // No Yoco checkout ID on this order — flag for manual handling
        sub.dispute.adminNotes = (sub.dispute.adminNotes || '') +
          `\n[⚠️ No Yoco checkout ID found — refund R${sub.subtotal.toLocaleString()} must be processed manually]`;
      }

      sub.escrowStatus = 'refunded';
      sub.refundedAt = new Date();
    }

    await order.save();
    notifyDisputeResolved(order.user._id, order.orderNumber, order._id, resolution);
if (resolution === 'released_to_seller' && sub.seller) {
  notifyEscrowReleased(sub.seller, order.orderNumber, order._id);
}

pushDisputeResolved(order.user._id, order.orderNumber);
if (resolution === 'released_to_seller' && sub.seller) {
  pushEscrowReleased(sub.seller, order.orderNumber);
}

    try {
      sendDisputeResolvedEmail(order, sub, resolution);
    } catch {}

    res.status(200).json({ message: 'Dispute resolved.', subOrder: sub });
  } catch (error) {
    console.error('Resolve dispute error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};