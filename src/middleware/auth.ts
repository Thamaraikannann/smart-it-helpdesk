import { Request, Response, NextFunction } from 'express';
import { LRUCache } from 'lru-cache';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { AuthenticationError } from '../lib/errors';

/**
 * In-process cache of user status.
 * Key: user ID (string)
 * Value: 'ACTIVE' | 'INACTIVE' | 'NOT_FOUND'
 * TTL: 60 seconds — honouring the "invalidate within 60 s" requirement after deactivation.
 */
const userStatusCache = new LRUCache<string, string>({
  max: 5000,
  ttl: 60 * 1000, // 60 seconds in ms
});

/**
 * Fetches the user status from cache, falling back to the database.
 * Returns the status string, or 'NOT_FOUND' if the user doesn't exist.
 */
async function getUserStatus(userId: string): Promise<string> {
  const cached = userStatusCache.get(userId);
  if (cached !== undefined) {
    return cached;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  const status = user ? user.status : 'NOT_FOUND';
  userStatusCache.set(userId, status);
  return status;
}

/**
 * JWT authentication middleware.
 *
 * - Extracts the Bearer token from the Authorization header.
 * - Verifies the token signature and expiry.
 * - Checks the user's status (cached with 60s TTL) and rejects deactivated users.
 * - Attaches { id, email, role } to req.user on success.
 * - Calls next(AuthenticationError) on any failure, resulting in HTTP 401.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next(new AuthenticationError('Missing or malformed Authorization header'));
      return;
    }

    const token = authHeader.slice(7); // remove "Bearer " prefix

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      next(new AuthenticationError('Invalid or expired token'));
      return;
    }

    // Check user status — deactivated users are rejected within 60 s of deactivation
    const status = await getUserStatus(payload.sub);

    if (status === 'NOT_FOUND') {
      next(new AuthenticationError('User account not found'));
      return;
    }

    if (status === 'INACTIVE') {
      next(new AuthenticationError('User account is deactivated'));
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Exported for testing — allows callers to invalidate a specific user's
 * cached status entry (e.g. immediately after deactivation in tests).
 */
export function invalidateUserStatusCache(userId: string): void {
  userStatusCache.delete(userId);
}
