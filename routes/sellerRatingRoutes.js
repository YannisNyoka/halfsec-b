import express from 'express';
import { rateSeller, getSellerRatings } from '../controllers/sellerRatingController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public — view a seller's ratings
router.get('/:sellerId', getSellerRatings);

// Authenticated — submit a rating
router.post('/orders/:orderId/sub-orders/:subOrderId', protect, rateSeller);

export default router;