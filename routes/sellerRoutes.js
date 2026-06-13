import express from 'express';
import {
  applyAsSeller,
  getMyApplicationStatus,
  updateSellerProfile,
  getSellerStats,
  getMyProducts,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
  getSellerProduct,
  getSellerOrders,
} from '../controllers/sellerController.js';
import { protect, sellerOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Application
router.post('/apply', applyAsSeller);
router.get('/application', getMyApplicationStatus);

// Seller-only routes below
router.patch('/profile', sellerOnly, updateSellerProfile);
router.get('/stats', sellerOnly, getSellerStats);

router.get('/products', sellerOnly, getMyProducts);
router.post('/products', sellerOnly, createSellerProduct);
router.get('/products/:id', sellerOnly, getSellerProduct);
router.patch('/products/:id', sellerOnly, updateSellerProduct);
router.delete('/products/:id', sellerOnly, deleteSellerProduct);

router.get('/orders', sellerOnly, getSellerOrders);

export default router;