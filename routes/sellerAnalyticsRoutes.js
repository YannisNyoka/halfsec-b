import express from 'express';
import {
  getSellerOverview,
  getTopProducts,
  getEscrowBreakdown,
  getOrderStatusBreakdown,
} from '../controllers/sellerAnalyticsController.js';
import { protect, sellerOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect, sellerOnly);

router.get('/overview', getSellerOverview);
router.get('/top-products', getTopProducts);
router.get('/escrow-breakdown', getEscrowBreakdown);
router.get('/order-status', getOrderStatusBreakdown);

export default router;