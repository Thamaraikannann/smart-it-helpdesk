/**
 * Unit tests for src/middleware/rbac.ts
 * Validates Requirements 1.5, 1.6
 */

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { requireRole } from './rbac';
import { AuthorizationError } from '../lib/errors';

function makeReq(role?: Role): Partial<Request> {
  return {
    user: role ? { id: 'user-1', email: 'u@test.com', role } : undefined,
  };
}

function makeNext(): jest.Mock<void, [unknown?]> {
  return jest.fn();
}

describe('requireRole middleware', () => {
  it('calls next() with no error when the user role is allowed', () => {
    const req = makeReq(Role.Admin);
    const next = makeNext();
    requireRole(Role.Admin)(req as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(); // called with no arguments = success
  });

  it('calls next(AuthorizationError) when the user role is not in the allowed list', () => {
    const req = makeReq(Role.Employee);
    const next = makeNext();
    requireRole(Role.Admin)(req as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('allows access when one of multiple allowed roles matches', () => {
    const req = makeReq(Role.Support_Agent);
    const next = makeNext();
    requireRole(Role.Support_Agent, Role.Admin)(
      req as Request,
      {} as Response,
      next as NextFunction,
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when req.user is undefined (unauthenticated)', () => {
    const req = makeReq(undefined);
    const next = makeNext();
    requireRole(Role.Employee)(req as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('returns 403 status code via AuthorizationError', () => {
    const req = makeReq(Role.Employee);
    const next = makeNext();
    requireRole(Role.Admin)(req as Request, {} as Response, next as NextFunction);
    const err = next.mock.calls[0]![0] as AuthorizationError;
    expect(err.statusCode).toBe(403);
  });

  it('rejects Employee from Admin-only route', () => {
    const req = makeReq(Role.Employee);
    const next = makeNext();
    requireRole(Role.Admin)(req as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('rejects Support_Agent from Admin-only route', () => {
    const req = makeReq(Role.Support_Agent);
    const next = makeNext();
    requireRole(Role.Admin)(req as Request, {} as Response, next as NextFunction);
    expect(next).toHaveBeenCalledWith(expect.any(AuthorizationError));
  });

  it('allows all three roles when all are specified', () => {
    for (const role of [Role.Employee, Role.Support_Agent, Role.Admin]) {
      const req = makeReq(role);
      const next = makeNext();
      requireRole(Role.Employee, Role.Support_Agent, Role.Admin)(
        req as Request,
        {} as Response,
        next as NextFunction,
      );
      expect(next).toHaveBeenCalledWith();
    }
  });
});
