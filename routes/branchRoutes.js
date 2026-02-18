import express from 'express';
import {
  getAllBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  getPapersByBranch
} from '../controllers/branchController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllBranches);
router.get('/:id', getBranch);
router.post('/', protect, createBranch);
router.put('/:id', protect, authorize('admin'), updateBranch);
router.delete('/:id', protect, authorize('admin'), deleteBranch);
router.get('/:id/papers', getPapersByBranch);

export default router;
