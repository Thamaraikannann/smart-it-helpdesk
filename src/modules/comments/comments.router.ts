// TODO: Wire comment routes (Task 8.1)
// Note: This router is mounted at /api/v1/incidents/:id/comments
import { Router } from 'express';
import { addComment, listComments } from './comments.controller';

const router = Router({ mergeParams: true });

// POST   /api/v1/incidents/:id/comments
router.post('/', addComment);

// GET    /api/v1/incidents/:id/comments
router.get('/', listComments);

export default router;
