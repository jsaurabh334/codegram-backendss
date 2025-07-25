import { Router } from 'express';
import { toggleBookmark, checkBookmark, getUserBookmarks } from '../controllers/bookmarkController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', requireAuth, toggleBookmark);
router.get('/check', requireAuth, checkBookmark);
router.get('/user/:userId', getUserBookmarks);

export default router;