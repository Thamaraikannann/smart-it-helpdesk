// TODO: Wire auth routes (Task 3.5)
import { Router } from 'express';
import { login } from './auth.controller';
import { unauthenticatedRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

// POST /api/v1/auth/login — unauthenticated rate limiter: 10 attempts/IP/minute (Requirement 12.6)
router.post('/login', unauthenticatedRateLimiter, login);

export default router;
