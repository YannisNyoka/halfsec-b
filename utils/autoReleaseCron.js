import cron from 'node-cron';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendFundsReleasedToSellerEmail, sendReviewReminderEmail } from './email.js';
import { REMINDER_DAY } from './escrow.js';
import { checkPriceAlerts, checkSavedSearchAlerts } from '../controllers/savedSearchController.js';

// ── Auto-release funds past their review window ─────────────────────────────────
const runAutoRelease = async () => {
  try {
    const now = new Date();

    const orders = await Order.find({
      'subOrders.escrowStatus': 'held',
      'subOrders.autoReleaseAt': { $lte: now },
    }).populate('user', 'name email');

    let releasedCount = 0;

    for (const order of orders) {
      let changed = false;

      for (const sub of order.subOrders) {
        if (sub.escrowStatus === 'held' && sub.autoReleaseAt && sub.autoReleaseAt <= now) {
          sub.escrowStatus = 'released';
          sub.releasedAt = now;
          changed = true;
          releasedCount++;

          if (sub.seller) {
            try {
              const seller = await User.findById(sub.seller).select('name email');
              if (seller) {
                sendFundsReleasedToSellerEmail(seller.email, seller.name, order, sub);
              }
            } catch {}
          }
        }
      }

      if (changed) await order.save();
    }

    if (releasedCount > 0) {
      console.log(`[auto-release] Released ${releasedCount} sub-order(s).`);
    }
  } catch (error) {
    console.error('[auto-release] Error:', error.message);
  }
};

// ── Send reminder emails 2 days before auto-release ──────────────────────────────
const runReviewReminders = async () => {
  try {
    const now = new Date();
    const reminderWindowStart = new Date(now);
    reminderWindowStart.setDate(reminderWindowStart.getDate() + (7 - REMINDER_DAY)); // days until auto-release <= 2

    const orders = await Order.find({
      'subOrders.escrowStatus': 'held',
      'subOrders.autoReleaseAt': { $exists: true, $lte: reminderWindowStart, $gt: now },
      'subOrders.reminderSentAt': { $exists: false },
    }).populate('user', 'name email');

    for (const order of orders) {
      let changed = false;

      for (const sub of order.subOrders) {
        if (
          sub.escrowStatus === 'held' &&
          sub.autoReleaseAt &&
          sub.autoReleaseAt <= reminderWindowStart &&
          sub.autoReleaseAt > now &&
          !sub.reminderSentAt
        ) {
          try {
            sendReviewReminderEmail(order, sub, order.user.email, order.user.name);
            sub.reminderSentAt = now;
            changed = true;
          } catch {}
        }
      }

      if (changed) await order.save();
    }
  } catch (error) {
    console.error('[review-reminder] Error:', error.message);
  }
};

// ── Schedule: runs once a day at 03:00 ───────────────────────────────────────────
export const startAutoReleaseCron = () => {
  cron.schedule('0 3 * * *', () => {
    console.log('[cron] Running escrow auto-release check...');
    runAutoRelease();
    runReviewReminders();
    checkPriceAlerts();
  checkSavedSearchAlerts();
  });

  console.log('[cron] Escrow auto-release scheduled (daily 03:00).');
};

// Export for manual testing
export { runAutoRelease, runReviewReminders };