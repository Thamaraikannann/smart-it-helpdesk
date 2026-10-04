import bcrypt from 'bcrypt';

const COST_FACTOR = 12;

/**
 * Hash a plaintext password with bcrypt (cost factor 12).
 * Never store the plaintext — always store the returned hash.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST_FACTOR);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 * Returns true only when the password matches the hash.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
