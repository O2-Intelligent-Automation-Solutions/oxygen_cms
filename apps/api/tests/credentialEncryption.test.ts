import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createCredentialCipher, createCredentialCipherFromEnvironment } from '../src/instances/credentialEncryption.js';

function key() {
  return randomBytes(32).toString('base64');
}

describe('credential encryption', () => {
  it('encrypts credentials with authenticated encryption and decrypts them with the same key', () => {
    const cipher = createCredentialCipher(key());

    const first = cipher.encrypt('RemotePassword!42');
    const second = cipher.encrypt('RemotePassword!42');

    expect(first).toMatch(/^o2cms:v1:/);
    expect(second).toMatch(/^o2cms:v1:/);
    expect(first).not.toContain('RemotePassword!42');
    expect(second).not.toContain('RemotePassword!42');
    expect(first).not.toEqual(second);
    expect(cipher.decrypt(first)).toBe('RemotePassword!42');
    expect(cipher.decrypt(second)).toBe('RemotePassword!42');
  });

  it('rejects missing or invalid encryption keys', () => {
    expect(() => createCredentialCipher('')).toThrow('OXYGEN_CMS_ENCRYPTION_KEY is required');
    expect(() => createCredentialCipher('not-a-32-byte-key')).toThrow('OXYGEN_CMS_ENCRYPTION_KEY must be 32 bytes');
    expect(() => createCredentialCipherFromEnvironment({})).toThrow('OXYGEN_CMS_ENCRYPTION_KEY is required');
  });
});
