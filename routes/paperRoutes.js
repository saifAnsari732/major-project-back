import express from 'express';
import {
  getAllPapers,
  getPaper,
  uploadPaper,
  updatePaper,
  deletePaper,
  approvePaper,
  rejectPaper,
  incrementDownload,
  getMyPapers,
} from '../controllers/paperController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getAllPapers);
router.get('/my-papers', protect, getMyPapers);
router.get('/:id', getPaper);
router.post('/', uploadPaper);
// router.post('/solve', solvepaper);
router.put('/:id', protect, updatePaper);
router.delete('/:id', protect, deletePaper);
router.put('/:id/approve', protect, authorize('admin'), approvePaper);
router.put('/:id/reject', protect, authorize('admin'), rejectPaper);
router.put('/:id/download', incrementDownload);

export default router;
