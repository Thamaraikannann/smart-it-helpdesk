/**
 * Unit tests for UsersService
 * Requirements: 10.1, 10.2, 10.3, 10.5, 10.6
 */

import { Role, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';
import { ConflictError, NotFoundError } from '../../lib/errors';

// ── Mock Prisma ──────────────────────────────────────────────────────────────
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// ── Mock password hashing ────────────────────────────────────────────────────
jest.mock('../../lib/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
}));

// ── Mock auth middleware cache invalidation ──────────────────────────────────
jest.mock('../../middleware/auth', () => ({
  invalidateUserStatusCache: jest.fn(),
}));

import { prisma } from '../../lib/prisma';
import { invalidateUserStatusCache } from '../../middleware/auth';

const mockedPrismaUser = prisma.user as jest.Mocked<typeof prisma.user>;
const mockedInvalidateCache = invalidateUserStatusCache as jest.MockedFunction<
  typeof invalidateUserStatusCache
>;

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeDbUser(overrides: Partial<{
  id: string;
  email: string;
  display_name: string;
  role: Role;
  status: UserStatus;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}> = {}) {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    display_name: 'Alice',
    role: Role.Employee,
    status: UserStatus.ACTIVE,
    password_hash: '$2b$12$hashedpassword',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService();
    jest.clearAllMocks();
  });

  // ── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('creates a user and returns the user record', async () => {
      const dbUser = makeDbUser();
      mockedPrismaUser.findUnique.mockResolvedValue(null);
      mockedPrismaUser.create.mockResolvedValue(dbUser);

      const result = await service.createUser({
        email: 'alice@example.com',
        displayName: 'Alice',
        role: Role.Employee,
        password: 'secret123',
      });

      expect(result).toEqual({
        id: dbUser.id,
        email: dbUser.email,
        displayName: dbUser.display_name,
        role: dbUser.role,
        status: dbUser.status,
      });
      expect(mockedPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'alice@example.com',
            display_name: 'Alice',
            role: Role.Employee,
          }),
        }),
      );
    });

    it('throws ConflictError (HTTP 409) when email is already registered', async () => {
      // Requirement 10.2 — duplicate email → 409
      mockedPrismaUser.findUnique.mockResolvedValue(makeDbUser());

      await expect(
        service.createUser({
          email: 'alice@example.com',
          displayName: 'Alice',
          role: Role.Employee,
          password: 'secret123',
        }),
      ).rejects.toThrow(ConflictError);

      await expect(
        service.createUser({
          email: 'alice@example.com',
          displayName: 'Alice',
          role: Role.Employee,
          password: 'secret123',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('does not call prisma.user.create when email already exists', async () => {
      mockedPrismaUser.findUnique.mockResolvedValue(makeDbUser());

      await expect(
        service.createUser({
          email: 'alice@example.com',
          displayName: 'Alice',
          role: Role.Employee,
          password: 'secret123',
        }),
      ).rejects.toThrow(ConflictError);

      expect(mockedPrismaUser.create).not.toHaveBeenCalled();
    });
  });

  // ── deactivateUser ─────────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('sets status to INACTIVE and invalidates the cache', async () => {
      // Requirement 10.3 — deactivation sets INACTIVE + cache invalidation
      mockedPrismaUser.findUnique.mockResolvedValue(makeDbUser());
      mockedPrismaUser.update.mockResolvedValue(
        makeDbUser({ status: UserStatus.INACTIVE }),
      );

      const result = await service.deactivateUser('user-1');

      expect(result).toEqual({ success: true });

      expect(mockedPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: 'INACTIVE' },
      });

      // Cache must be invalidated so deactivated users are rejected within 60s
      expect(mockedInvalidateCache).toHaveBeenCalledWith('user-1');
      expect(mockedInvalidateCache).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when user does not exist', async () => {
      mockedPrismaUser.findUnique.mockResolvedValue(null);

      await expect(service.deactivateUser('nonexistent')).rejects.toThrow(
        NotFoundError,
      );

      expect(mockedPrismaUser.update).not.toHaveBeenCalled();
      expect(mockedInvalidateCache).not.toHaveBeenCalled();
    });
  });

  // ── updateUserRole ─────────────────────────────────────────────────────────

  describe('updateUserRole', () => {
    it('updates the role and returns the updated user record', async () => {
      // Requirement 10.6 — new role takes effect on next JWT issuance
      const original = makeDbUser({ role: Role.Employee });
      const updated = makeDbUser({ role: Role.Support_Agent });

      mockedPrismaUser.findUnique.mockResolvedValue(original);
      mockedPrismaUser.update.mockResolvedValue(updated);

      const result = await service.updateUserRole('user-1', Role.Support_Agent);

      expect(result.role).toBe(Role.Support_Agent);
      expect(mockedPrismaUser.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: Role.Support_Agent },
      });
    });

    it('throws NotFoundError when user does not exist', async () => {
      mockedPrismaUser.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole('nonexistent', Role.Admin),
      ).rejects.toThrow(NotFoundError);

      expect(mockedPrismaUser.update).not.toHaveBeenCalled();
    });
  });

  // ── listUsers ──────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns a paginated list of users with the pagination envelope', async () => {
      // Requirement 10.5 — paginated list with id, displayName, email, role, status
      const dbUsers = [
        {
          id: 'user-1',
          display_name: 'Alice',
          email: 'alice@example.com',
          role: Role.Employee,
          status: UserStatus.ACTIVE,
        },
        {
          id: 'user-2',
          display_name: 'Bob',
          email: 'bob@example.com',
          role: Role.Support_Agent,
          status: UserStatus.ACTIVE,
        },
      ];

      mockedPrismaUser.findMany.mockResolvedValue(dbUsers as any);
      mockedPrismaUser.count.mockResolvedValue(2);

      const result = await service.listUsers(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual({
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: Role.Employee,
        status: UserStatus.ACTIVE,
      });

      // Pagination envelope (Requirement 13.3)
      expect(result.pagination).toEqual({
        total_count: 2,
        page: 1,
        page_size: 20,
        total_pages: 1,
      });
    });

    it('calculates correct total_pages for multi-page datasets', async () => {
      mockedPrismaUser.findMany.mockResolvedValue([]);
      mockedPrismaUser.count.mockResolvedValue(45);

      const result = await service.listUsers(1, 20);

      expect(result.pagination.total_count).toBe(45);
      expect(result.pagination.total_pages).toBe(3); // ceil(45/20)
    });

    it('passes correct skip/take values to prisma for page 2', async () => {
      mockedPrismaUser.findMany.mockResolvedValue([]);
      mockedPrismaUser.count.mockResolvedValue(50);

      await service.listUsers(2, 10);

      expect(mockedPrismaUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('returns empty data array when there are no users', async () => {
      mockedPrismaUser.findMany.mockResolvedValue([]);
      mockedPrismaUser.count.mockResolvedValue(0);

      const result = await service.listUsers(1, 20);

      expect(result.data).toEqual([]);
      expect(result.pagination.total_count).toBe(0);
      expect(result.pagination.total_pages).toBe(0);
    });
  });
});
