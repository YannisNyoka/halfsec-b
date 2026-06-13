import express from 'express';
import {
  getAllSellers,
  approveSeller,
  rejectSeller,
  toggleSellerSuspension,
} from '../controllers/sellerController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect, adminOnly);

router.get('/', getAllSellers);
router.patch('/:id/approve', approveSeller);
router.patch('/:id/reject', rejectSeller);
router.patch('/:id/toggle', toggleSellerSuspension);

export default router;