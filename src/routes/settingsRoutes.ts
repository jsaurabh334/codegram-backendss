import { Router } from 'express';
import {
  getPreferences,
  updatePreferences,
  updateProfile,
  deleteAccount,
  getDashboardStats,
} from '../controllers/settingsController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/preferences', requireAuth, getPreferences);
router.patch('/preferences', requireAuth, updatePreferences);
router.patch('/profile', requireAuth, updateProfile);
router.delete('/account', requireAuth, deleteAccount);
router.get('/dashboard', requireAuth, getDashboardStats);

export default router;
