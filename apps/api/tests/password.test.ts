import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password without storing the plaintext', async () => {
    const password = 'CorrectHorseBatteryStaple!42';

    const result = await hashPassword(password);

    expect(result.passwordHash).not.toContain(password);
    expect(result.passwordSalt).toHaveLength(32);
    await expect(verifyPassword(password, result)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', result)).resolves.toBe(false);
  });
});
