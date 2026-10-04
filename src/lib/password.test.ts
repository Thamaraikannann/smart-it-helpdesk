/**
 * Unit tests for src/lib/password.ts
 * Validates Requirement 1.7 — password never stored in plaintext
 */

import { hashPassword, verifyPassword } from './password';

describe('password utilities', () => {
  describe('hashPassword', () => {
    it('returns a string that is not equal to the plaintext', async () => {
      const hash = await hashPassword('MyS3cretP@ss!');
      expect(hash).not.toBe('MyS3cretP@ss!');
    });

    it('returns a bcrypt hash (starts with $2b$)', async () => {
      const hash = await hashPassword('anypassword');
      expect(hash).toMatch(/^\$2b\$/);
    });

    it('produces a hash containing the cost factor 12', async () => {
      const hash = await hashPassword('anypassword');
      // bcrypt hash format: $2b$<cost>$...
      expect(hash).toMatch(/^\$2b\$12\$/);
    });

    it('produces different hashes for the same password (salt randomness)', async () => {
      const hash1 = await hashPassword('samepassword');
      const hash2 = await hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string without throwing', async () => {
      await expect(hashPassword('')).resolves.toMatch(/^\$2b\$12\$/);
    });

    it('handles unicode passwords', async () => {
      const hash = await hashPassword('пароль123🔐');
      expect(hash).toMatch(/^\$2b\$12\$/);
    });
  });

  describe('verifyPassword', () => {
    it('returns true when the password matches the hash', async () => {
      const password = 'correct-horse-battery-staple';
      const hash = await hashPassword(password);
      await expect(verifyPassword(password, hash)).resolves.toBe(true);
    });

    it('returns false when the password does not match', async () => {
      const hash = await hashPassword('original-password');
      await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    });

    it('returns false for empty string against a non-empty hash', async () => {
      const hash = await hashPassword('not-empty');
      await expect(verifyPassword('', hash)).resolves.toBe(false);
    });

    it('round-trips correctly for unicode passwords', async () => {
      const password = 'пароль123🔐';
      const hash = await hashPassword(password);
      await expect(verifyPassword(password, hash)).resolves.toBe(true);
    });
  });
});
