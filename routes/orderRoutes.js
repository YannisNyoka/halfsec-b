import express from 'express';
import {
  placeOrder, getMyOrders, getMyOrder,
  getAllOrders, getOrderAdmin, updateOrderStatus, getDashboardStats,
} from '../controllers/orderController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { orderValidator } from '../middleware/validators.js';

const router = express.Router();

// Customer routes
router.post('/', protect, orderValidator, placeOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/my-orders/:id', protect, getMyOrder);

// Admin routes
router.get('/admin/all', protect, adminOnly, getAllOrders);
router.get('/admin/stats', protect, adminOnly, getDashboardStats);
router.get('/admin/:id', protect, adminOnly, getOrderAdmin);
router.patch('/admin/:id/status', protect, adminOnly, updateOrderStatus);

export default router;