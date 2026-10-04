import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';

export interface JWTPayload {
  sub: string;   // user ID
  email: string;
  role: Role;
  iat: number;
  exp: number;   // iat + 24h
}

/**
 * Returns the JWT secret, falling back to process.env directly so that test
 * environments (which may not satisfy the full config schema) still work.
 */
function getSecret(): string {
  // Lazy import of config to avoid crashing when DATABASE_URL is absent in tests
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../config') as { config: { JWT_SECRET: string } };
    return config.JWT_SECRET;
  } catch {
    const secret = process.env['JWT_SECRET'];
    if (!secret) throw new Error('JWT_SECRET is not set');
    return secret;
  }
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '24h' });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSecret()) as JWTPayload;
}
