import express from 'express';
import {
  getProducts, getProductBySlug, getAllProductsAdmin,
  createProduct, updateProduct, deleteProduct, toggleFeatured,
} from '../controllers/productController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { productValidator } from '../middleware/validators.js';
import { getPendingProducts, moderateProduct } from '../controllers/productController.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/slug/:slug', getProductBySlug);
router.get('/admin/all', protect, adminOnly, getAllProductsAdmin);
router.post('/', protect, adminOnly, productValidator, createProduct);
router.patch('/:id', protect, adminOnly, updateProduct);
router.patch('/:id/featured', protect, adminOnly, toggleFeatured);
router.delete('/:id', protect, adminOnly, deleteProduct);
router.get('/admin/pending', protect, adminOnly, getPendingProducts);
router.patch('/admin/:id/moderate', protect, adminOnly, moderateProduct);
export default router;