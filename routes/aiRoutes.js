import express from 'express';
import { generateDescription } from '../controllers/aiController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();
router.post('/description', protect, adminOnly, generateDescription);

export default router;