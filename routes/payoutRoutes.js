import express from 'express';
import {
  getMyBalance,
  getMyPayouts,
  getAllBalances,
  getSellerPayoutDetail,
  recordPayout,
  getAllPayouts,
} from '../controllers/payoutController.js';
import { protect, adminOnly, sellerOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Seller routes
router.get('/me/balance', sellerOnly, getMyBalance);
router.get('/me/history', sellerOnly, getMyPayouts);

// Admin routes
router.get('/admin/balances', adminOnly, getAllBalances);
router.get('/admin/sellers/:sellerId', adminOnly, getSellerPayoutDetail);
router.post('/admin/sellers/:sellerId/pay', adminOnly, recordPayout);
router.get('/admin/history', adminOnly, getAllPayouts);

export default router;