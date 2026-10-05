import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { IncidentsService } from './incidents.service';
import { AuthenticationError } from '../../lib/errors';

const incidentsService = new IncidentsService();

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
 * POST /api/v1/incidents
 * Requirements: 2.1-2.9, 3.1-3.5
 */
export async function createIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const incident = await incidentsService.createIncident(
      req.body,
      req.user.id,
    );

    res.status(201).json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/incidents
 * Requirements: 4.1-4.2, 6.1-6.7, 7.1, 8.1-8.6
 */
export async function listIncidents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const result = await incidentsService.listIncidents(req.query, {
      id: req.user.id,
      role: req.user.role as Role,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/incidents/:id
 * Requirements: 4.3-4.5
 */
export async function getIncidentById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const incident = await incidentsService.getIncidentById(req.params['id']!, {
      id: req.user.id,
      role: req.user.role as Role,
    });

    res.status(200).json({ data: incident });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/incidents/:id
 * Requirements: 7.2-7.7
 */
export async function updateIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!requireAuth(req, res)) return;

    const incident = await incidentsService.updateIncident(
      req.params['id']!,
      req.body,
      req.user.id,
      req.user.role as Role,
    );

    res.status(200).json({ data: incident });
  } catch (err) {
    next(err);
  }
}
