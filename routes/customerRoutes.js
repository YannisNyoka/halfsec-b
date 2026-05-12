import express from 'express';
import {
  getAllCustomers,
  getCustomer,
  toggleCustomerStatus,
} from '../controllers/customerController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

router.use(protect, adminOnly);

router.get('/', getAllCustomers);
router.get('/:id', getCustomer);
router.patch('/:id/toggle', toggleCustomerStatus);

export default router;