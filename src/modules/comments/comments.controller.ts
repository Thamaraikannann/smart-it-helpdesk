import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { CommentsService } from './comments.service';
import { AuthorizationError } from '../../lib/errors';

const commentsService = new CommentsService();

// ── Helpers ──────────────────────────────────────────────────────────────────

function requireAuth(
  req: Request,
  res: Response,
): req is Request & { user: NonNullable<Request['user']> } {
  if (!req.user) {
    res.status(401).json({
      error_code: 'AUTHENTICATION_ERROR',
      message: 'Authentication required',
    });
    return false;
  }
  return true;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/incidents/:id/comments
 * Requirements: 5.1-5.6
 */
export async function addComment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const actor = { id: req.user.id, role: req.user.role as Role };

    // Employees may never post internal notes (Requirement 5.2)
    if (req.body.is_internal === true && actor.role === Role.Employee) {
      next(new AuthorizationError('Employees cannot post internal notes'));
      return;
    }

    const comment = await commentsService.addComment(
      req.params['id']!,
      req.body,
      actor,
    );

    res.status(201).json({ data: comment });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/incidents/:id/comments
 * Requirements: 4.5, 4.6, 5.3
 */
export async function listComments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const comments = await commentsService.listComments(req.params['id']!, {
      id: req.user.id,
      role: req.user.role as Role,
    });

    res.status(200).json({ data: comments });
  } catch (err) {
    next(err);
  }
}
