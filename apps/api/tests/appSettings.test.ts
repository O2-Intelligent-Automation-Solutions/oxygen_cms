import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import type { QueueRuntime } from '../src/queues/queueStatus.js';

async function loginAdmin(queueStatusProvider?: QueueRuntime) {
  const authRepository = createInMemoryAuthRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const app = await buildApp({ logger: false, authRepository, appSettingsRepository, queueStatusProvider });
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
    const reconcileQueueSchedules = vi.fn(async () => undefined);
    const queueStatusProvider: QueueRuntime = {
      async readStatus() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', redis: { configured: true, connected: true, host: '127.0.0.1', port: 6379, error: null }, bullBoard: { enabled: false, path: null }, queues: [] };
      },
      async readJobs() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', jobs: [] };
      },
      reconcileQueueSchedules
    };
    const { app, token } = await loginAdmin(queueStatusProvider);

    const defaults = await app.inject({ method: 'GET', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` } });
    expect(defaults.statusCode).toBe(200);
    expect(defaults.json().queueSchedules.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'database-maintenance:purge-logs', queue: 'database-maintenance', name: 'purge-logs', label: 'Purge Logs', enabled: true, everySeconds: 86400, schedule: { type: 'interval', everySeconds: 86400 } }),
      expect.objectContaining({ key: 'database-maintenance:analyze-tables', queue: 'database-maintenance', name: 'analyze-tables', label: 'Analyze Tables', enabled: false, everySeconds: 86400, schedule: { type: 'interval', everySeconds: 86400 } }),
      expect.objectContaining({ key: 'database-maintenance:optimize-tables', queue: 'database-maintenance', name: 'optimize-tables', label: 'Optimize Tables', enabled: false, everySeconds: 86400, schedule: { type: 'interval', everySeconds: 86400 } }),
      expect.objectContaining({ key: 'system-maintenance:check-application-updates', queue: 'system-maintenance', name: 'check-application-updates', label: 'Check Application Updates', enabled: true, everySeconds: 86400, schedule: { type: 'interval', everySeconds: 86400 } })
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
    expect(reconcileQueueSchedules).toHaveBeenCalledWith(expect.objectContaining({
      jobs: expect.arrayContaining([
        expect.objectContaining({ key: 'database-maintenance:purge-logs', everySeconds: 172800 })
      ])
    }));

    const invalid = await app.inject({ method: 'PUT', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` }, payload: { jobs: [{ key: 'database-maintenance:purge-logs', enabled: true, everySeconds: 10 }] } });
    expect(invalid.statusCode).toBe(400);

    await app.close();
  });

  it('accepts normalized interval schedule objects while preserving everySeconds compatibility', async () => {
    const reconcileQueueSchedules = vi.fn(async () => undefined);
    const queueStatusProvider: QueueRuntime = {
      async readStatus() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', redis: { configured: true, connected: true, host: '127.0.0.1', port: 6379, error: null }, bullBoard: { enabled: false, path: null }, queues: [] };
      },
      async readJobs() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', jobs: [] };
      },
      reconcileQueueSchedules
    };
    const { app, token } = await loginAdmin(queueStatusProvider);

    const updated = await app.inject({ method: 'PUT', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` }, payload: { jobs: [
      { key: 'database-maintenance:purge-logs', enabled: true, schedule: { type: 'interval', everySeconds: 259200 } },
      { key: 'system-maintenance:check-application-updates', enabled: true, schedule: { type: 'interval', everySeconds: 86400 } }
    ] } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().queueSchedules.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'database-maintenance:purge-logs', everySeconds: 259200, schedule: { type: 'interval', everySeconds: 259200 } })
    ]));
    expect(reconcileQueueSchedules).toHaveBeenCalledWith(expect.objectContaining({
      jobs: expect.arrayContaining([
        expect.objectContaining({ key: 'database-maintenance:purge-logs', everySeconds: 259200, schedule: { type: 'interval', everySeconds: 259200 } })
      ])
    }));

    const invalidCron = await app.inject({ method: 'PUT', url: '/api/app-settings/queue-schedules', headers: { authorization: `Bearer ${token}` }, payload: { jobs: [{ key: 'database-maintenance:purge-logs', enabled: true, schedule: { type: 'cron', expression: '0 16 * * *', timezone: 'America/Chicago' } }] } });
    expect(invalidCron.statusCode).toBe(400);

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
