import PushSubscription from '../models/PushSubscription.js';

// ── Save a subscription ──────────────────────────────────────────────────────────
export const saveSubscription = async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Invalid subscription data.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user.id,
        endpoint,
        keys,
        userAgent: userAgent || '',
        active: true,
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Push subscription saved.' });
  } catch (error) {
    console.error('Save subscription error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Remove a subscription ────────────────────────────────────────────────────────
export const removeSubscription = async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.findOneAndDelete({ endpoint, user: req.user.id });
    res.status(200).json({ message: 'Subscription removed.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get VAPID public key ─────────────────────────────────────────────────────────
export const getVapidPublicKey = async (req, res) => {
  res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};