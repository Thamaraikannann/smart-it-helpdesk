import { Router } from 'express';
import { Role } from '@prisma/client';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getDashboard } from './dashboard.controller';

const router = Router();

// GET /api/v1/dashboard — Support_Agent and Admin only (Requirement 9)
router.get(
  '/',
  authMiddleware,
  requireRole(Role.Support_Agent, Role.Admin),
  getDashboard,
);

export default router;
