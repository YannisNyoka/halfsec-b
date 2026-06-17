import express from 'express';
import {
  saveSubscription,
  removeSubscription,
  getVapidPublicKey,
} from '../controllers/pushController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', protect, saveSubscription);
router.post('/unsubscribe', protect, removeSubscription);

export default router;