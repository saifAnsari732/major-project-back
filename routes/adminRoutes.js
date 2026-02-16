import express from 'express';
import {
  getDashboardStats,
  getPendingPapers
} from '../controllers/adminController.js';
import {protect, authorize} from '../middleware/auth.js';

const router = express.Router();
 
router.get('/dashboard',protect,authorize('admin'), getDashboardStats);
router.get('/papers/pending', protect, authorize('admin'), getPendingPapers);

export default router;
