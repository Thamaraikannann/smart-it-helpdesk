// Mounted at /api/v1/incidents/:id/comments
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { addComment, listComments } from './comments.controller';

// mergeParams: true so :id from the parent incidents route is available
const router = Router({ mergeParams: true });

router.use(authMiddleware);

// POST   /api/v1/incidents/:id/comments
router.post('/', addComment);

// GET    /api/v1/incidents/:id/comments
router.get('/', listComments);

export default router;
