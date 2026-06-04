import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'o2cms:v1';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

export type CredentialCipher = {
  encrypt(plaintext: string): string;
  decrypt(secret: string): string;
};

function decodeKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  if (!trimmed) throw new Error('OXYGEN_CMS_ENCRYPTION_KEY is required before storing remote OxyGen credentials.');

  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error('OXYGEN_CMS_ENCRYPTION_KEY must be 32 bytes. Generate one with: openssl rand -base64 32');
  }
  return key;
}

export function createCredentialCipher(rawKey: string): CredentialCipher {
  const key = decodeKey(rawKey);

  return {
    encrypt(plaintext: string) {
      const iv = randomBytes(IV_LENGTH_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
      const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [PREFIX, iv.toString('base64url'), authTag.toString('base64url'), ciphertext.toString('base64url')].join(':');
    },

    decrypt(secret: string) {
      const [prefix, version, ivText, authTagText, ciphertextText] = secret.split(':');
      if (`${prefix}:${version}` !== PREFIX || !ivText || !authTagText || !ciphertextText) {
        throw new Error('Unsupported credential secret format.');
      }

      const iv = Buffer.from(ivText, 'base64url');
      const authTag = Buffer.from(authTagText, 'base64url');
      const ciphertext = Buffer.from(ciphertextText, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
  };
}

export function createCredentialCipherFromEnvironment(env: NodeJS.ProcessEnv = process.env): CredentialCipher {
  return createCredentialCipher(env.OXYGEN_CMS_ENCRYPTION_KEY ?? '');
}
