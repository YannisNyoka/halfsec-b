import express from 'express';
import {
  getMySavedSearches,
  saveSearch,
  deleteSavedSearch,
  toggleSearchAlert,
  getMyPriceAlerts,
  setPriceAlert,
  deletePriceAlert,
} from '../controllers/savedSearchController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

router.get('/searches', getMySavedSearches);
router.post('/searches', saveSearch);
router.delete('/searches/:id', deleteSavedSearch);
router.patch('/searches/:id/toggle-alert', toggleSearchAlert);

router.get('/price-alerts', getMyPriceAlerts);
router.post('/price-alerts', setPriceAlert);
router.delete('/price-alerts/:id', deletePriceAlert);

export default router;