import { Router } from 'express';
import {
  toggleBlock,
  checkBlockStatus,
  getBlockedUsers,
  createReport,
  getReports,
  updateReportStatus,
} from '../controllers/moderationController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Blocking functionality
router.post('/block', requireAuth, toggleBlock);
router.get('/block/check/:userId', requireAuth, checkBlockStatus);
router.get('/blocked', requireAuth, getBlockedUsers);

// Reporting functionality
router.post('/report', requireAuth, createReport);
router.get('/reports', requireAuth, getReports);
router.patch('/reports/:reportId/status', requireAuth, updateReportStatus);

export default router;