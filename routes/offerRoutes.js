import express from 'express';
import {
  makeOffer,
  getMyOffers,
  withdrawOffer,
  getSellerOffers,
  acceptOffer,
  declineOffer,
  getOfferCheckout,
  purchaseOffer,
} from '../controllers/offerController.js';
import { protect, sellerOnly } from '../middleware/auth.js';
import { orderValidator } from '../middleware/validators.js';

const router = express.Router();
router.use(protect);

// Buyer
router.post('/', makeOffer);
router.get('/mine', getMyOffers);
router.patch('/:id/withdraw', withdrawOffer);
router.get('/:id/checkout', getOfferCheckout);
router.post('/:id/checkout', orderValidator, purchaseOffer);

// Seller
router.get('/seller', sellerOnly, getSellerOffers);
router.patch('/:id/accept', sellerOnly, acceptOffer);
router.patch('/:id/decline', sellerOnly, declineOffer);

export default router;