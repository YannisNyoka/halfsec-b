import express from 'express';
import {
  validateCoupon,
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
} from '../controllers/couponController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Customer — validate
router.post('/validate', protect, validateCoupon);

// Admin
router.get('/', protect, adminOnly, getAllCoupons);
router.post('/', protect, adminOnly, createCoupon);
router.patch('/:id', protect, adminOnly, updateCoupon);
router.patch('/:id/toggle', protect, adminOnly, toggleCoupon);
router.delete('/:id', protect, adminOnly, deleteCoupon);

export default router;