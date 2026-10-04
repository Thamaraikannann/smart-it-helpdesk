import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthorizationError } from '../lib/errors';

/**
 * Role guard factory.
 *
 * Usage (in a router):
 *   router.get('/admin-only', authMiddleware, requireRole(Role.Admin), handler);
 *
 * Returns HTTP 403 when the requesting user's role is not in the allowed list.
 * Must be used after authMiddleware so that req.user is already populated.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user || !roles.includes(user.role)) {
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }

    next();
  };
}
