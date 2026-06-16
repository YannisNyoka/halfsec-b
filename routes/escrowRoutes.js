import express from 'express';
import {
  confirmReceipt,
  raiseDispute,
  getDisputes,
  resolveDispute,
} from '../controllers/escrowController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Customer routes
router.post('/orders/:orderId/sub-orders/:subOrderId/confirm', confirmReceipt);
router.post('/orders/:orderId/sub-orders/:subOrderId/dispute', raiseDispute);

// Admin routes
router.get('/admin/disputes', adminOnly, getDisputes);
router.patch('/admin/orders/:orderId/sub-orders/:subOrderId/resolve', adminOnly, resolveDispute);

export default router;