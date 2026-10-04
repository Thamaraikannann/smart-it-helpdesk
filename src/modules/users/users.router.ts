import { Router } from 'express';
import { Role } from '@prisma/client';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { createUser, listUsers, updateUser } from './users.controller';

const router = Router();

// All user management routes are Admin-only (Requirement 10.x)
router.use(authMiddleware, requireRole(Role.Admin));

// POST  /api/v1/users  — create user account
router.post('/', createUser);

// GET   /api/v1/users  — list users (paginated)
router.get('/', listUsers);

// PATCH /api/v1/users/:id  — update role or deactivate account
router.patch('/:id', updateUser);

export default router;
