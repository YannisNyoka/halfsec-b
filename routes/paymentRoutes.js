import express from 'express';
import { createCharge, getPublicKey } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get public key (authenticated — we don't want bots scraping it)
router.get('/key', protect, getPublicKey);

// Process payment (must be logged in)
router.post('/charge', protect, createCharge);

export default router;