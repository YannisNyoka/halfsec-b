import express from 'express';
import {
  getCategories, getAllCategoriesAdmin, getCategoryBySlug,
  createCategory, updateCategory, deleteCategory,
} from '../controllers/categoryController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { categoryValidator } from '../middleware/validators.js';

const router = express.Router();

router.get('/', getCategories);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/admin/all', protect, adminOnly, getAllCategoriesAdmin);
router.post('/', protect, adminOnly, categoryValidator, createCategory);
router.patch('/:id', protect, adminOnly, categoryValidator, updateCategory);
router.delete('/:id', protect, adminOnly, deleteCategory);

export default router;