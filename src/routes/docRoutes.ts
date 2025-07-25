import { Router } from 'express';
import { getAllDocs, getDocById, createDoc, updateDoc, deleteDoc } from '../controllers/docController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', getAllDocs);
router.get('/:id', getDocById);
router.post('/', requireAuth, createDoc);
router.put('/:id', requireAuth, updateDoc);
router.delete('/:id', requireAuth, deleteDoc);

export default router;