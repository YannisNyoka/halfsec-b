import express from 'express';
import {
  getLowStockProducts,
  updateStock,
  getStockOverview,
} from '../controllers/stockController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.get('/overview', protect, adminOnly, getStockOverview);
router.get('/low', protect, adminOnly, getLowStockProducts);
router.patch('/:id', protect, adminOnly, updateStock);

export default router;