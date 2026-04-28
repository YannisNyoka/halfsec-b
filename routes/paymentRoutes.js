import express from 'express';
import {
  createCheckoutSession,
  yocoWebhook,
  verifyPayment,
  getPublicKey,
} from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Webhook — no auth, raw body needed
router.post('/webhook', yocoWebhook);

// Protected routes
router.get('/key', protect, getPublicKey);
router.post('/checkout', protect, createCheckoutSession);
router.get('/verify/:orderId', protect, verifyPayment);

export default router;