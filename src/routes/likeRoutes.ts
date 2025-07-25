import { Router } from 'express';
import { toggleLike, checkLike, getUserLikes } from '../controllers/likeController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', requireAuth, toggleLike);
router.get('/check', requireAuth, checkLike);
router.get('/user/:userId', getUserLikes);

export default router;
