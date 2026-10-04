/**
 * Unit tests for src/lib/jwt.ts
 * Validates Requirements 1.1, 1.3, 1.4
 */

// Set env vars before importing anything that touches config or jwt
process.env['JWT_SECRET'] = 'test-secret-value-that-is-at-least-32-chars!!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'http://localhost:11434';
process.env['AI_API_KEY'] = 'test-key';

import jwt from 'jsonwebtoken';
import { signToken, verifyToken, JWTPayload } from './jwt';
import { Role } from '@prisma/client';

const TEST_SECRET = process.env['JWT_SECRET'] as string;

const basePayload: Omit<JWTPayload, 'iat' | 'exp'> = {
  sub: 'user-uuid-123',
  email: 'alice@example.com',
  role: Role.Employee,
};

describe('jwt helpers', () => {
  describe('signToken', () => {
    it('returns a valid JWT string', () => {
      const token = signToken(basePayload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('embeds sub, email, and role in the payload', () => {
      const token = signToken(basePayload);
      const decoded = jwt.decode(token) as JWTPayload;
      expect(decoded.sub).toBe(basePayload.sub);
      expect(decoded.email).toBe(basePayload.email);
      expect(decoded.role).toBe(basePayload.role);
    });

    it('sets expiry approximately 24 hours from now', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signToken(basePayload);
      const after = Math.floor(Date.now() / 1000);
      const decoded = jwt.decode(token) as JWTPayload;

      const expectedMin = before + 24 * 3600;
      const expectedMax = after + 24 * 3600;

      expect(decoded.exp).toBeGreaterThanOrEqual(expectedMin);
      expect(decoded.exp).toBeLessThanOrEqual(expectedMax);
    });

    it('includes iat (issued-at) field', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signToken(basePayload);
      const after = Math.floor(Date.now() / 1000);
      const decoded = jwt.decode(token) as JWTPayload;

      expect(decoded.iat).toBeGreaterThanOrEqual(before);
      expect(decoded.iat).toBeLessThanOrEqual(after);
    });

    it('signs tokens for each role variant', () => {
      for (const role of [Role.Employee, Role.Support_Agent, Role.Admin]) {
        const token = signToken({ ...basePayload, role });
        const decoded = jwt.decode(token) as JWTPayload;
        expect(decoded.role).toBe(role);
      }
    });
  });

  describe('verifyToken', () => {
    it('returns the correct payload for a valid token', () => {
      const token = signToken(basePayload);
      const payload = verifyToken(token);
      expect(payload.sub).toBe(basePayload.sub);
      expect(payload.email).toBe(basePayload.email);
      expect(payload.role).toBe(basePayload.role);
    });

    it('throws on a tampered token', () => {
      const token = signToken(basePayload);
      const parts = token.split('.');
      // flip one character in the signature
      parts[2] = parts[2]!.slice(0, -1) + (parts[2]!.endsWith('a') ? 'b' : 'a');
      expect(() => verifyToken(parts.join('.'))).toThrow();
    });

    it('throws on a token signed with a different secret', () => {
      const foreignToken = jwt.sign(basePayload, 'completely-different-secret-!!!!!!!!', {
        expiresIn: '24h',
      });
      expect(() => verifyToken(foreignToken)).toThrow();
    });

    it('throws on an expired token', () => {
      // sign with -1s expiry so it is immediately expired
      const expiredToken = jwt.sign(basePayload, TEST_SECRET, { expiresIn: -1 });
      expect(() => verifyToken(expiredToken)).toThrow();
    });

    it('throws on a completely invalid string', () => {
      expect(() => verifyToken('not.a.jwt')).toThrow();
      expect(() => verifyToken('')).toThrow();
    });
  });
});
