import { Router } from 'express';
import { getUserProfile, updateUserProfile, getUserContent } from '../controllers/userController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Get user profile by username
router.get('/:username', getUserProfile);

// Update profile (auth required)
router.put('/profile', requireAuth, updateUserProfile);

// Get user's content (snippets, docs, bugs)
router.get('/:username/content', getUserContent);

export default router;