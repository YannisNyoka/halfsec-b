import express from 'express';
import {
  getProductReviews,
  createReview,
  updateReview,
  deleteReview,
  getMyReview,
  getAllReviewsAdmin,
} from '../controllers/reviewController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Public
router.get('/product/:productId', getProductReviews);

// Protected
router.post('/', protect, createReview);
router.get('/my/:productId', protect, getMyReview);
router.patch('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);

// Admin
router.get('/admin/all', protect, adminOnly, getAllReviewsAdmin);

export default router;