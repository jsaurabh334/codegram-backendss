import { Router } from 'express';
import { getFeed, getPublicFeed } from '../controllers/feedController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', requireAuth, getFeed);
router.get('/public', getPublicFeed);

export default router;