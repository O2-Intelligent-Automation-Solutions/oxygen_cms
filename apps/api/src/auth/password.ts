import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export type PasswordHash = {
  passwordHash: string;
  passwordSalt: string;
};

export async function hashPassword(password: string): Promise<PasswordHash> {
  const passwordSalt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, passwordSalt, KEY_LENGTH)) as Buffer;
  return {
    passwordHash: derived.toString('hex'),
    passwordSalt
  };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const derived = (await scryptAsync(password, stored.passwordSalt, KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(stored.passwordHash, 'hex');
  if (derived.length !== storedBuffer.length) return false;
  return timingSafeEqual(derived, storedBuffer);
}
