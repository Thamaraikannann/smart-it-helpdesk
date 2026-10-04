import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { usersService } from './users.service';
import { ValidationError } from '../../lib/errors';

const VALID_ROLES: Role[] = [Role.Employee, Role.Support_Agent, Role.Admin];

/**
 * POST /api/v1/users
 * Admin creates a new user account (Requirements 10.1, 10.2).
 */
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, displayName, role, password } = req.body as Record<string, unknown>;

    const fieldErrors: { field: string; message: string }[] = [];

    if (typeof email !== 'string' || email.trim() === '') {
      fieldErrors.push({ field: 'email', message: 'Email is required' });
    }

    if (typeof displayName !== 'string' || displayName.trim() === '') {
      fieldErrors.push({ field: 'displayName', message: 'Display name is required' });
    }

    if (typeof role !== 'string' || !VALID_ROLES.includes(role as Role)) {
      fieldErrors.push({
        field: 'role',
        message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    if (typeof password !== 'string' || password === '') {
      fieldErrors.push({ field: 'password', message: 'Password is required' });
    }

    if (fieldErrors.length > 0) {
      throw new ValidationError('Request validation failed', fieldErrors);
    }

    const user = await usersService.createUser({
      email: (email as string).trim(),
      displayName: (displayName as string).trim(),
      role: role as Role,
      password: password as string,
    });

    res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/users
 * Admin lists all users with pagination (Requirement 10.5).
 */
export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawPage = req.query['page'];
    const rawPageSize = req.query['page_size'];

    const page = rawPage !== undefined ? parseInt(String(rawPage), 10) : 1;
    const pageSize =
      rawPageSize !== undefined ? parseInt(String(rawPageSize), 10) : 20;

    const fieldErrors: { field: string; message: string }[] = [];

    if (isNaN(page) || page < 1) {
      fieldErrors.push({ field: 'page', message: 'page must be a positive integer' });
    }

    if (isNaN(pageSize) || pageSize <= 0) {
      fieldErrors.push({
        field: 'page_size',
        message: 'page_size must be a positive integer',
      });
    }

    const cappedPageSize = Math.min(pageSize, 100);

    if (fieldErrors.length > 0) {
      throw new ValidationError('Request validation failed', fieldErrors);
    }

    const result = await usersService.listUsers(page, cappedPageSize);

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/users/:id
 * Admin updates a user's role or deactivates their account (Requirements 10.3, 10.6).
 *
 * Body may contain:
 *   - { action: "deactivate" }          → deactivateUser
 *   - { role: "Employee" | ... }        → updateUserRole
 */
export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    if (body['action'] === 'deactivate') {
      const result = await usersService.deactivateUser(id);
      res.json({ data: result });
      return;
    }

    if (body['role'] !== undefined) {
      const { role } = body;

      if (typeof role !== 'string' || !VALID_ROLES.includes(role as Role)) {
        throw new ValidationError('Request validation failed', [
          {
            field: 'role',
            message: `Role must be one of: ${VALID_ROLES.join(', ')}`,
          },
        ]);
      }

      const updated = await usersService.updateUserRole(id, role as Role);
      res.json({ data: updated });
      return;
    }

    throw new ValidationError('Request validation failed', [
      {
        field: 'body',
        message: 'Provide either { action: "deactivate" } or { role: "<Role>" }',
      },
    ]);
  } catch (err) {
    next(err);
  }
}
