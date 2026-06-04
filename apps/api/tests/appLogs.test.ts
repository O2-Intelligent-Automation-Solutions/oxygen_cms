import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAppLogRepository } from '../src/appLogs/inMemoryAppLogRepository.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';

async function bootApp() {
  const authRepository = createInMemoryAuthRepository();
  const appLogRepository = createInMemoryAppLogRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const app = await buildApp({ logger: false, authRepository, appLogRepository, appSettingsRepository, enableBackgroundPolling: false });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string, appLogRepository };
}

describe('application logs API', () => {
  it('persists and filters application logs by type severity source and search text', async () => {
    const { app, token, appLogRepository } = await bootApp();
    await appLogRepository.append({ type: 'Service', severity: 'Logging', source: 'OxyGen CMS', message: 'Background poller checked 2 instances', details: { checked: 2 } });
    await appLogRepository.append({ type: 'Connection', severity: 'Warning', source: 'admin@example.com', userName: 'admin@example.com', message: 'Manual connectivity check failed', details: { instanceName: 'Demo' } });
    await appLogRepository.append({ type: 'CRUD', severity: 'Logging', source: 'admin@example.com', userName: 'admin@example.com', message: 'Created instance Demo' });

    const response = await app.inject({ method: 'GET', url: '/api/logs?type=Service&severity=Logging&source=OxyGen%20CMS&search=poller', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.logs).toHaveLength(1);
    expect(body.logs[0]).toMatchObject({ type: 'Service', severity: 'Logging', source: 'OxyGen CMS', message: 'Background poller checked 2 instances' });
    expect(body.total).toBe(1);

    await app.close();
  });

  it('exposes editable log retention settings under application settings', async () => {
    const { app, token } = await bootApp();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/log-retention', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().retention).toEqual({ days: 90 });

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/log-retention', headers: { authorization: `Bearer ${token}` }, payload: { days: 30 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().retention).toEqual({ days: 30 });

    await app.close();
  });
});
