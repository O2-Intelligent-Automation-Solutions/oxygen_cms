import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';

describe('first-run database setup API', () => {
  it('reports database setup is required before first admin creation on a fresh install', async () => {
    const app = await buildApp({ logger: false, authRepository: createInMemoryAuthRepository() });

    const status = await app.inject({ method: 'GET', url: '/api/setup/status' });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      database: {
        configured: false,
        connected: false,
        schemaCurrent: false,
        defaultDatabaseName: 'O2IAS_CMS'
      },
      admin: {
        exists: false
      },
      nextStep: 'database',
      requiresSetup: true
    });

    await app.close();
  });
});
