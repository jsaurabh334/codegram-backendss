import { Router } from 'express';
import { createComment, updateComment, deleteComment, getComments } from '../controllers/commentController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', getComments);
router.post('/', requireAuth, createComment);
router.put('/:id', requireAuth, updateComment);
router.delete('/:id', requireAuth, deleteComment);

export default router;