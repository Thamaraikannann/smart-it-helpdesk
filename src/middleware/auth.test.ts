/**
 * Unit tests for src/middleware/auth.ts
 * Validates Requirements 1.1, 1.3, 1.4
 */

// Set env vars before any module imports that may trigger config validation
process.env['JWT_SECRET'] = 'test-secret-value-that-is-at-least-32-chars!!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'http://localhost:11434';
process.env['AI_API_KEY'] = 'test-key';

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { signToken } from '../lib/jwt';
import { AuthenticationError } from '../lib/errors';

// Mock prisma before importing auth middleware
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '../lib/prisma';
import { authMiddleware, invalidateUserStatusCache } from './auth';

const mockFindUnique = prisma.user.findUnique as jest.Mock;

const activeUser = { status: 'ACTIVE' };
const inactiveUser = { status: 'INACTIVE' };

function makeReq(authHeader?: string): Partial<Request> {
  return {
    headers: {
      authorization: authHeader,
    } as Record<string, string>,
  };
}

function makeNext(): jest.Mock {
  return jest.fn();
}

const validPayload = { sub: 'user-uuid-1', email: 'alice@test.com', role: Role.Employee };

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the LRU cache between tests by invalidating known IDs
    invalidateUserStatusCache(validPayload.sub);
  });

  it('calls next() with no error for a valid token and active user', async () => {
    mockFindUnique.mockResolvedValue(activeUser);
    const token = signToken(validPayload);
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request).user).toEqual({
      id: validPayload.sub,
      email: validPayload.email,
      role: validPayload.role,
    });
  });

  it('attaches correct user fields to req.user', async () => {
    mockFindUnique.mockResolvedValue(activeUser);
    const token = signToken({ sub: 'admin-id', email: 'admin@test.com', role: Role.Admin });
    invalidateUserStatusCache('admin-id');
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect((req as Request).user).toEqual({
      id: 'admin-id',
      email: 'admin@test.com',
      role: Role.Admin,
    });
  });

  it('calls next(AuthenticationError) when Authorization header is missing', async () => {
    const req = makeReq(undefined);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    const err = next.mock.calls[0][0] as AuthenticationError;
    expect(err.statusCode).toBe(401);
  });

  it('calls next(AuthenticationError) when Authorization scheme is not Bearer', async () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('calls next(AuthenticationError) for an invalid (garbage) token', async () => {
    const req = makeReq('Bearer not-a-real-jwt');
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('calls next(AuthenticationError) for an expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      validPayload,
      process.env['JWT_SECRET'],
      { expiresIn: -1 },
    );
    const req = makeReq(`Bearer ${expiredToken}`);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('calls next(AuthenticationError) when user is INACTIVE', async () => {
    mockFindUnique.mockResolvedValue(inactiveUser);
    const token = signToken(validPayload);
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    const err = next.mock.calls[0][0] as AuthenticationError;
    expect(err.statusCode).toBe(401);
  });

  it('calls next(AuthenticationError) when user does not exist in DB', async () => {
    mockFindUnique.mockResolvedValue(null);
    const token = signToken(validPayload);
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    await authMiddleware(req as Request, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('uses the LRU cache on repeated calls (DB queried only once)', async () => {
    mockFindUnique.mockResolvedValue(activeUser);
    const token = signToken(validPayload);

    for (let i = 0; i < 3; i++) {
      const req = makeReq(`Bearer ${token}`);
      const next = makeNext();
      await authMiddleware(req as Request, {} as Response, next as NextFunction);
      expect(next).toHaveBeenCalledWith();
    }

    // prisma should only have been called once because the result is cached
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
  });
});
