import express from 'express';
import {
  getCart, addToCart, updateCartItem, removeFromCart, clearCart,
} from '../controllers/cartController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All cart routes require login
router.use(protect);

router.get('/', getCart);
router.post('/add', addToCart);
router.patch('/item/:productId', updateCartItem);
router.delete('/item/:productId', removeFromCart);
router.delete('/clear', clearCart);

export default router;