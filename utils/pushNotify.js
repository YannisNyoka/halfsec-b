import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const sendPushToUser = async (userId, { title, body, icon, badge, url, tag }) => {
  try {
    const subscriptions = await PushSubscription.find({
      user: userId,
      active: true,
    });

    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/pwa-192x192.png',
      badge: badge || '/pwa-64x64.png',
      url: url || '/',
      tag: tag || 'halfsec-notification',
      timestamp: Date.now(),
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        )
      )
    );

    // Deactivate expired/invalid subscriptions
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const statusCode = result.reason?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await PushSubscription.findByIdAndUpdate(
            subscriptions[i]._id,
            { active: false }
          );
          console.log(`[push] Deactivated expired subscription for user ${userId}`);
        }
      }
    }
  } catch (error) {
    console.error('[push] Error sending push notification:', error.message);
  }
};

// ── Preset push builders — mirror the in-app notify utils ────────────────────────
export const pushOrderPlaced = (userId, orderNumber, orderId) =>
  sendPushToUser(userId, {
    title: '🛍️ Order placed!',
    body: `Your order ${orderNumber} has been received.`,
    url: `/orders/${orderId}`,
    tag: `order-${orderId}`,
  });

export const pushOrderStatus = (userId, orderNumber, orderId, status) => {
  const messages = {
    confirmed: { title: '✅ Order confirmed', body: `Your order ${orderNumber} is confirmed.` },
    shipped: { title: '🚚 Order shipped!', body: `Your order ${orderNumber} is on its way.` },
    delivered: { title: '🎉 Order delivered!', body: `${orderNumber} delivered — please confirm receipt.` },
    cancelled: { title: '❌ Order cancelled', body: `Your order ${orderNumber} was cancelled.` },
  };
  const info = messages[status];
  if (!info) return;
  return sendPushToUser(userId, { ...info, url: `/orders/${orderId}`, tag: `order-${orderId}` });
};

export const pushEscrowReleased = (sellerId, orderNumber) =>
  sendPushToUser(sellerId, {
    title: '💰 Funds released!',
    body: `Payment for order ${orderNumber} added to your balance.`,
    url: '/seller',
    tag: `escrow-${orderNumber}`,
  });

export const pushNewSale = (sellerId, orderNumber) =>
  sendPushToUser(sellerId, {
    title: '🛒 New sale!',
    body: `You have a new order: ${orderNumber}.`,
    url: '/seller/orders',
    tag: `sale-${orderNumber}`,
  });

export const pushPayoutProcessed = (sellerId, amount) =>
  sendPushToUser(sellerId, {
    title: '🏦 Payout sent!',
    body: `R${amount.toLocaleString()} has been paid to your bank account.`,
    url: '/seller',
    tag: 'payout',
  });

export const pushDisputeResolved = (userId, orderNumber) =>
  sendPushToUser(userId, {
    title: '⚖️ Dispute resolved',
    body: `Your dispute for order ${orderNumber} has been resolved.`,
    url: '/orders',
    tag: `dispute-${orderNumber}`,
  });