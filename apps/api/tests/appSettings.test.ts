import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';

async function loginAdmin() {
  const authRepository = createInMemoryAuthRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const app = await buildApp({ logger: false, authRepository, appSettingsRepository });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string };
}

describe('application settings API', () => {
  it('returns default labels and persists tenant label overrides', async () => {
    const { app, token } = await loginAdmin();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/labels', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().labels).toEqual({ tenant: 'Tenant' });

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/labels', headers: { authorization: `Bearer ${token}` }, payload: { tenant: 'Partner' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().labels).toEqual({ tenant: 'Partner' });

    const loaded = await app.inject({ method: 'GET', url: '/api/app-settings/labels', headers: { authorization: `Bearer ${token}` } });
    expect(loaded.json().labels).toEqual({ tenant: 'Partner' });
    await app.close();
  });

  it('returns and updates log retention settings using the frontend contract', async () => {
    const { app, token } = await loginAdmin();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/log-retention', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toEqual({ retention: { days: 90 } });

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/log-retention', headers: { authorization: `Bearer ${token}` }, payload: { days: 120 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ retention: { days: 120 } });

    await app.close();
  });



  it('returns and updates SSL certificate warning settings', async () => {
    const { app, token } = await loginAdmin();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/ssl-certificate-warning', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toEqual({ sslCertificateWarning: { daysBeforeExpiration: 30 } });

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/ssl-certificate-warning', headers: { authorization: `Bearer ${token}` }, payload: { daysBeforeExpiration: 45 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ sslCertificateWarning: { daysBeforeExpiration: 45 } });

    const invalid = await app.inject({ method: 'PUT', url: '/api/app-settings/ssl-certificate-warning', headers: { authorization: `Bearer ${token}` }, payload: { daysBeforeExpiration: -1 } });
    expect(invalid.statusCode).toBe(400);

    await app.close();
  });

  it('returns and updates license expiration warning settings', async () => {
    const { app, token } = await loginAdmin();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/license-expiration-warning', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toEqual({ licenseExpirationWarning: { daysBeforeExpiration: 30 } });

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/license-expiration-warning', headers: { authorization: `Bearer ${token}` }, payload: { daysBeforeExpiration: 60 } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ licenseExpirationWarning: { daysBeforeExpiration: 60 } });

    const invalid = await app.inject({ method: 'PUT', url: '/api/app-settings/license-expiration-warning', headers: { authorization: `Bearer ${token}` }, payload: { daysBeforeExpiration: -1 } });
    expect(invalid.statusCode).toBe(400);

    await app.close();
  });

  it('returns and updates configurable queue job schedules', async () => {
    const { app, token } = await loginAdmin();

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().queueSchedules.jobs).toEqual(expect.arrayContaining([
      { key: 'database-maintenance:purge-logs', queue: 'database-maintenance', name: 'purge-logs', label: 'Purge Logs', enabled: true, everySeconds: 86400 },
      { key: 'system-maintenance:check-application-updates', queue: 'system-maintenance', name: 'check-application-updates', label: 'Check Application Updates', enabled: true, everySeconds: 86400 }
    ]));

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` }, payload: { jobs: [
      { key: 'database-maintenance:purge-logs', enabled: false, everySeconds: 172800 },
      { key: 'system-maintenance:check-application-updates', enabled: true, everySeconds: 86400 }
    ] } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().queueSchedules.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'database-maintenance:purge-logs', enabled: false, everySeconds: 172800 }),
      expect.objectContaining({ key: 'system-maintenance:check-application-updates', enabled: true, everySeconds: 86400 })
    ]));

    const invalid = await app.inject({ method: 'PUT', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` }, payload: { jobs: [{ key: 'database-maintenance:purge-logs', enabled: true, everySeconds: 10 }] } });
    expect(invalid.statusCode).toBe(400);

    await app.close();
  });

  it('requires authentication and validates label values', async () => {
    const app = await buildApp({ logger: false, authRepository: createInMemoryAuthRepository(), appSettingsRepository: createInMemoryAppSettingsRepository() });

    expect((await app.inject({ method: 'GET', url: '/api/app-settings/labels' })).statusCode).toBe(401);
    const invalid = await app.inject({ method: 'PUT', url: '/api/app-settings/labels', payload: { tenant: '' } });
    expect(invalid.statusCode).toBe(401);

    await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
    const badLabel = await app.inject({ method: 'PUT', url: '/api/app-settings/labels', headers: { authorization: `Bearer ${login.json().token}` }, payload: { tenant: '   ' } });
    expect(badLabel.statusCode).toBe(400);

    await app.close();
  });
});
