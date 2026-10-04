// TODO: Wire audit routes (Task 9.1)
// Note: This router is mounted at /api/v1/incidents/:id/audit
import { Router } from 'express';
import { getAuditLog } from './audit.controller';

const router = Router({ mergeParams: true });

// GET /api/v1/incidents/:id/audit
router.get('/', getAuditLog);

export default router;
