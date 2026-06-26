import express from 'express';
import {
  getCategories, getAllCategoriesAdmin, getCategoryBySlug,
  createCategory, updateCategory, deleteCategory, migrateImages,
} from '../controllers/categoryController.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { categoryValidator } from '../middleware/validators.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();

router.get('/', getCategories);
router.get('/slug/:slug', getCategoryBySlug);
router.get('/admin/all', protect, adminOnly, getAllCategoriesAdmin);
router.post('/migrate-images', protect, adminOnly, migrateImages);
router.post('/', protect, adminOnly, upload.single('image'), categoryValidator, createCategory);
router.patch('/:id', protect, adminOnly, upload.single('image'), categoryValidator, updateCategory);
router.delete('/:id', protect, adminOnly, deleteCategory);

export default router;