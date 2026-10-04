import { Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { buildPaginationEnvelope } from '../../lib/pagination';
import { invalidateUserStatusCache } from '../../middleware/auth';

export interface CreateUserData {
  email: string;
  displayName: string;
  role: Role;
  password: string;
}

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: string;
}

export interface UserListResult {
  data: UserRecord[];
  pagination: ReturnType<typeof buildPaginationEnvelope>;
}

export class UsersService {
  /**
   * Create a new user account (Requirement 10.1, 10.2).
   * Requires unique email, display name, role, and password.
   * Throws ConflictError (HTTP 409) when the email is already registered.
   */
  async createUser(data: CreateUserData): Promise<UserRecord> {
    const existing = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new ConflictError('Email address is already registered');
    }

    const password_hash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        display_name: data.displayName,
        role: data.role,
        password_hash,
      },
    });

    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      status: user.status,
    };
  }

  /**
   * Deactivate a user account (Requirement 10.3).
   * Sets status to INACTIVE and immediately invalidates the LRU cache entry
   * so the auth middleware rejects the user within 60 seconds.
   */
  async deactivateUser(userId: string): Promise<{ success: true }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });

    // Immediately evict the LRU cache entry so the deactivated user is
    // rejected on their very next request (well within the 60-second window).
    invalidateUserStatusCache(userId);

    return { success: true };
  }

  /**
   * Update a user's role (Requirement 10.6).
   * The new role takes effect on next JWT issuance (re-authentication);
   * existing active JWTs retain the old role until expiry.
   */
  async updateUserRole(userId: string, role: Role): Promise<UserRecord> {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.display_name,
      role: updated.role,
      status: updated.status,
    };
  }

  /**
   * List all users with pagination (Requirement 10.5).
   * Returns ID, display name, email, role, and status for each user.
   */
  async listUsers(page: number, pageSize: number): Promise<UserListResult> {
    const [users, total_count] = await Promise.all([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          display_name: true,
          email: true,
          role: true,
          status: true,
        },
      }),
      prisma.user.count(),
    ]);

    const data: UserRecord[] = users.map((u) => ({
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      role: u.role,
      status: u.status,
    }));

    const pagination = buildPaginationEnvelope(total_count, page, pageSize);

    return { data, pagination };
  }
}

export const usersService = new UsersService();
