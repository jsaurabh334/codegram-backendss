import { Router } from 'express';
import { upload, uploadFiles, deleteFile } from '../controllers/uploadController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Upload files (profile pictures or media)
router.post('/:type', requireAuth, upload.array('files', 5), uploadFiles);

// Delete file
router.delete('/:type/:filename', requireAuth, deleteFile);

export default router;