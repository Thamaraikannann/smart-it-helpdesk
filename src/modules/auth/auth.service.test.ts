/**
 * Unit tests for AuthService.login
 *
 * Prisma client is mocked so no database connection is required.
 * All required env vars are set before any module import to satisfy config validation.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Must be set before any module that transitively imports config.ts
process.env['JWT_SECRET'] = 'test-secret-for-auth-service-unit-tests-32chars!';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['AI_API_URL'] = 'https://api.openai.com/v1';
process.env['AI_API_KEY'] = 'test-ai-key';
process.env['NODE_ENV'] = 'test';

// Mock Prisma before importing the service
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';
import { AuthService } from './auth.service';
import { AuthenticationError } from '../../lib/errors';
import { Role, UserStatus } from '@prisma/client';

const mockFindUnique = prisma.user.findUnique as jest.MockedFunction<
  typeof prisma.user.findUnique
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAINTEXT_PASSWORD = 'SuperSecret123!';
let validHash: string;

beforeAll(async () => {
  validHash = await bcrypt.hash(PLAINTEXT_PASSWORD, 10); // cost 10 for speed in tests
});

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
}> = {}) {
  return {
    id: 'user-id-abc123',
    email: 'alice@example.com',
    display_name: 'Alice Smith',
    password_hash: validHash,
    role: Role.Employee,
    status: UserStatus.ACTIVE,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService.login', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
  });

  // ── Success path ──────────────────────────────────────────────────────────

  it('returns a token and user object on valid credentials', async () => {
    const user = makeUser();
    mockFindUnique.mockResolvedValueOnce(user as any);

    const result = await service.login(user.email, PLAINTEXT_PASSWORD);

    expect(result).toHaveProperty('token');
    expect(typeof result.token).toBe('string');
    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
    });
  });

  it('returns a valid JWT with the correct sub, email, and role claims', async () => {
    const user = makeUser({ role: Role.Admin });
    mockFindUnique.mockResolvedValueOnce(user as any);

    const { token } = await service.login(user.email, PLAINTEXT_PASSWORD);

    const decoded = jwt.verify(token, process.env['JWT_SECRET']!) as Record<string, unknown>;

    expect(decoded['sub']).toBe(user.id);
    expect(decoded['email']).toBe(user.email);
    expect(decoded['role']).toBe(Role.Admin);
  });

  it('JWT expiry is approximately 24 hours after issuance', async () => {
    const user = makeUser();
    mockFindUnique.mockResolvedValueOnce(user as any);

    const beforeIssuance = Math.floor(Date.now() / 1000);
    const { token } = await service.login(user.email, PLAINTEXT_PASSWORD);
    const afterIssuance = Math.floor(Date.now() / 1000);

    const decoded = jwt.verify(token, process.env['JWT_SECRET']!) as Record<string, unknown>;
    const iat = decoded['iat'] as number;
    const exp = decoded['exp'] as number;

    // exp should be iat + 24 h (86400 s), allow ±2 s for test timing
    expect(iat).toBeGreaterThanOrEqual(beforeIssuance);
    expect(iat).toBeLessThanOrEqual(afterIssuance);
    expect(exp - iat).toBeGreaterThanOrEqual(86398);
    expect(exp - iat).toBeLessThanOrEqual(86402);
  });

  // ── Wrong password ────────────────────────────────────────────────────────

  it('throws AuthenticationError when the password is wrong', async () => {
    const user = makeUser();
    mockFindUnique.mockResolvedValueOnce(user as any);

    await expect(service.login(user.email, 'WrongPassword!')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('wrong-password error message does not reveal which field failed', async () => {
    const user = makeUser();
    mockFindUnique.mockResolvedValueOnce(user as any);

    const err = await service.login(user.email, 'WrongPassword!').catch((e) => e);

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe('Invalid email or password');
  });

  // ── Non-existent email ────────────────────────────────────────────────────

  it('throws AuthenticationError when the email does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      service.login('nobody@example.com', PLAINTEXT_PASSWORD),
    ).rejects.toThrow(AuthenticationError);
  });

  it('non-existent email error message does not reveal which field failed', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const err = await service
      .login('nobody@example.com', PLAINTEXT_PASSWORD)
      .catch((e) => e);

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toBe('Invalid email or password');
  });

  // ── Inactive account ──────────────────────────────────────────────────────

  it('throws AuthenticationError when the user account is INACTIVE', async () => {
    const user = makeUser({ status: UserStatus.INACTIVE });
    mockFindUnique.mockResolvedValueOnce(user as any);

    await expect(service.login(user.email, PLAINTEXT_PASSWORD)).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('inactive account error returns 401 status code', async () => {
    const user = makeUser({ status: UserStatus.INACTIVE });
    mockFindUnique.mockResolvedValueOnce(user as any);

    const err = await service.login(user.email, PLAINTEXT_PASSWORD).catch((e) => e);

    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Account is deactivated');
  });

  // ── Error code ───────────────────────────────────────────────────────────

  it('AuthenticationError has AUTHENTICATION_ERROR error code', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const err = await service
      .login('nobody@example.com', PLAINTEXT_PASSWORD)
      .catch((e) => e);

    expect(err.errorCode).toBe('AUTHENTICATION_ERROR');
  });
});
