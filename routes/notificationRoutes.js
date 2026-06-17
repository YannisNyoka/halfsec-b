import express from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getMyNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/clear-read', clearReadNotifications);
router.delete('/:id', deleteNotification);

export default router;