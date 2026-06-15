import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';

async function bootApp() {
  const authRepository = createInMemoryAuthRepository();
  const app = await buildApp({ logger: false, authRepository, enableBackgroundPolling: false });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string };
}

describe('queue status API', () => {
  it('returns disabled queue foundation status in test mode for system admins', async () => {
    const { app, token } = await bootApp();

    const response = await app.inject({ method: 'GET', url: '/api/system/queues', headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().queues).toMatchObject({
      enabled: false,
      mode: 'disabled',
      redis: { configured: false, connected: false },
      queues: [
        { name: 'instance-checks', description: expect.any(String), waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
        { name: 'database-maintenance', description: expect.any(String), waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
        { name: 'system-maintenance', description: expect.any(String), waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 }
      ]
    });

    await app.close();
  });

  it('requires system poller management permission', async () => {
    const { app } = await bootApp();

    const response = await app.inject({ method: 'GET', url: '/api/system/queues' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
