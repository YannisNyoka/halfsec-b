import Notification from '../models/Notification.js';

export const notify = async (userId, { type, title, message, link = null }) => {
  try {
    await Notification.create({ user: userId, type, title, message, link });
  } catch (error) {
    console.error('[notify] Failed to create notification:', error.message);
  }
};

// ── Preset notification builders ─────────────────────────────────────────────────

export const notifyOrderPlaced = (userId, orderNumber, orderId) =>
  notify(userId, {
    type: 'order_placed',
    title: 'Order placed!',
    message: `Your order ${orderNumber} has been placed and is being reviewed.`,
    link: `/orders/${orderId}`,
  });

export const notifyOrderStatus = (userId, orderNumber, orderId, status) => {
  const messages = {
    confirmed: { title: 'Order confirmed', message: `Your order ${orderNumber} has been confirmed.` },
    processing: { title: 'Order processing', message: `Your order ${orderNumber} is being packed.` },
    shipped: { title: 'Order shipped!', message: `Your order ${orderNumber} is on its way.` },
    delivered: { title: 'Order delivered!', message: `Your order ${orderNumber} has been delivered. Please confirm receipt.` },
    cancelled: { title: 'Order cancelled', message: `Your order ${orderNumber} has been cancelled.` },
  };
  const info = messages[status];
  if (!info) return;
  return notify(userId, { type: `order_${status}`, ...info, link: `/orders/${orderId}` });
};

export const notifyEscrowReleased = (userId, orderNumber, orderId) =>
  notify(userId, {
    type: 'escrow_released',
    title: 'Funds released!',
    message: `Payment for order ${orderNumber} has been released to your balance.`,
    link: `/seller`,
  });

export const notifyDisputeRaised = (adminId, orderNumber, orderId) =>
  notify(adminId, {
    type: 'escrow_disputed',
    title: 'New dispute raised',
    message: `A buyer has raised a dispute on order ${orderNumber}.`,
    link: `/admin/disputes`,
  });

export const notifyDisputeResolved = (userId, orderNumber, orderId, resolution) =>
  notify(userId, {
    type: 'dispute_resolved',
    title: 'Dispute resolved',
    message: `Your dispute for order ${orderNumber} has been resolved: ${
      resolution === 'refunded_to_buyer' ? 'refund issued' : 'payment released to seller'
    }.`,
    link: `/orders/${orderId}`,
  });

export const notifyPayoutProcessed = (sellerId, amount) =>
  notify(sellerId, {
    type: 'payout_processed',
    title: 'Payout sent!',
    message: `R${amount.toLocaleString()} has been paid to your bank account.`,
    link: `/seller`,
  });

export const notifySellerApproved = (userId) =>
  notify(userId, {
    type: 'seller_approved',
    title: "You're approved to sell!",
    message: 'Your seller application has been approved. Start listing your items.',
    link: `/seller`,
  });

export const notifySellerRejected = (userId) =>
  notify(userId, {
    type: 'seller_rejected',
    title: 'Seller application update',
    message: 'Your seller application was not approved. You can apply again with updated information.',
    link: `/sell`,
  });

export const notifyNewOrderSeller = (sellerId, orderNumber, orderId) =>
  notify(sellerId, {
    type: 'new_order_seller',
    title: 'New sale!',
    message: `Someone bought your item in order ${orderNumber}.`,
    link: `/seller/orders`,
  });

export const notifyLowStock = (adminId, productName, stock) =>
  notify(adminId, {
    type: 'low_stock',
    title: 'Low stock alert',
    message: `"${productName}" only has ${stock} unit${stock !== 1 ? 's' : ''} left.`,
    link: `/admin/stock`,
  });