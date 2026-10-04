import { prisma } from '../../lib/prisma';
import { signToken } from '../../lib/jwt';
import { verifyPassword } from '../../lib/password';
import { AuthenticationError } from '../../lib/errors';
import { Role } from '@prisma/client';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
  };
}

export class AuthService {
  /**
   * Authenticate a user by email and password.
   *
   * Security note (Requirement 1.2): the same error message is used for both
   * "email not found" and "password mismatch" to prevent user enumeration.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { email } });

    // Constant-time path: always attempt bcrypt comparison to prevent timing-based
    // enumeration. When the user does not exist we compare against a dummy hash.
    const DUMMY_HASH =
      '$2b$12$invalidhashusedtopreventtimingattacksXXXXXXXXXXXXXXXXXX';

    const passwordMatch = await verifyPassword(
      password,
      user?.password_hash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatch) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (user.status === 'INACTIVE') {
      throw new AuthenticationError('Account is deactivated');
    }

    const token = signToken({ sub: user.id, email: user.email, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    };
  }
}

export const authService = new AuthService();
