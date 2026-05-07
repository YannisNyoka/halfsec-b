import express from 'express';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
  clearWishlist,
} from '../controllers/wishlistController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect); // all wishlist routes require login

router.get('/', getWishlist);
router.post('/add', addToWishlist);
router.post('/toggle', toggleWishlist);
router.delete('/item/:productId', removeFromWishlist);
router.delete('/clear', clearWishlist);

export default router;