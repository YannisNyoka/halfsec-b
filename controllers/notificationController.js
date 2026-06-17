import Notification from '../models/Notification.js';

// ── Get my notifications ─────────────────────────────────────────────────────────
export const getMyNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const skip = (pageNum - 1) * parseInt(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments({ user: req.user.id }),
      Notification.countDocuments({ user: req.user.id, read: false }),
    ]);

    res.status(200).json({
      notifications,
      unreadCount,
      pagination: { total, page: pageNum, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get unread count only (polled frequently) ────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user.id,
      read: false,
    });
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Mark one as read ─────────────────────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true, readAt: new Date() }
    );
    res.status(200).json({ message: 'Marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Mark all as read ─────────────────────────────────────────────────────────────
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true, readAt: new Date() }
    );
    res.status(200).json({ message: 'All marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Delete a notification ────────────────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    res.status(200).json({ message: 'Deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Clear all read notifications ─────────────────────────────────────────────────
export const clearReadNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id, read: true });
    res.status(200).json({ message: 'Cleared.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};