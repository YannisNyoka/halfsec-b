import express from 'express';
import {
  register, login, logout, getMe, updateProfile, changePassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import {
  registerValidator, loginValidator,
  updateProfileValidator, changePasswordValidator,
} from '../middleware/validators.js';
import { authLimiter, passwordLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public — rate limited
router.post('/register', authLimiter, registerValidator, register);
router.post('/login', authLimiter, loginValidator, login);
router.post('/logout', logout);

// Protected
router.get('/me', protect, getMe);
router.patch('/update-profile', protect, updateProfileValidator, updateProfile);
router.patch('/change-password', protect, passwordLimiter, changePasswordValidator, changePassword);

export default router;