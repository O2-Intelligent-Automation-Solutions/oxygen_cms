import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';
import { createDisabledQueueStatusProvider, type QueueRuntime } from '../src/queues/queueStatus.js';

async function bootApp(queueStatusProvider?: QueueRuntime) {
  const authRepository = createInMemoryAuthRepository();
  const instanceRepository = createInMemoryInstanceRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const app = await buildApp({ logger: false, authRepository, instanceRepository, appSettingsRepository, queueStatusProvider, enableBackgroundPolling: false });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string, authRepository, instanceRepository, appSettingsRepository };
}

describe('queue status API', () => {
  it('returns disabled queue foundation status in test mode for system admins', async () => {
    const { app, token } = await bootApp(createDisabledQueueStatusProvider());

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

  it('returns sanitized native queue job summaries without raw payload secrets', async () => {
    const queueStatusProvider: QueueRuntime = {
      async readStatus() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', redis: { configured: true, connected: true, host: '127.0.0.1', port: 6379, error: null }, bullBoard: { enabled: true, path: '/admin/queues' }, queues: [] };
      },
      async readJobs(limit = 25) {
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: '2026-06-16T00:00:00.000Z',
          jobs: [{
            id: 'job-1',
            queue: 'instance-checks' as const,
            name: 'manual-instance-check',
            state: 'waiting' as const,
            attemptsMade: 0,
            queueSequence: 1,
            nextProcessAt: '2026-06-16T00:01:00.000Z',
            timestamp: '2026-06-16T00:00:00.000Z',
            processedOn: null,
            finishedOn: null,
            failedReason: null,
            data: { instanceId: 'instance-1', source: 'manual' }
          }].slice(0, limit)
        };
      }
    };
    const { app, token, authRepository, instanceRepository } = await bootApp(queueStatusProvider);
    const tenant = await authRepository.createTenant({ name: 'Central Tenant', description: null });
    await instanceRepository.createInstance({ id: 'instance-1', name: 'Alpha Dispatch', description: null, tenantId: tenant.id, host: 'alpha.example.com', username: 'admin', password: 'RemotePassword!42' });

    const response = await app.inject({ method: 'GET', url: '/api/system/queue-jobs?limit=5', headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().queueJobs).toMatchObject({
      enabled: true,
      mode: 'bullmq',
      jobs: [{ id: 'job-1', queue: 'instance-checks', name: 'manual-instance-check', state: 'waiting', queueSequence: 1, nextProcessAt: '2026-06-16T00:01:00.000Z', data: { instanceId: 'instance-1', instanceName: 'Alpha Dispatch', tenantId: tenant.id, tenantName: 'Central Tenant', source: 'manual' } }]
    });
    expect(JSON.stringify(response.json())).not.toMatch(/password|secret|token|connectionString/i);
    await app.close();
  });

  it('requires system poller management permission for native queue job summaries', async () => {
    const { app } = await bootApp();

    const response = await app.inject({ method: 'GET', url: '/api/system/queue-jobs' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('pauses, resumes, and runs scheduled jobs without changing one-off paused state', async () => {
    const actions: Array<{ action: string; key: string; requestedBy?: string }> = [];
    const queueStatusProvider: QueueRuntime = {
      async readStatus() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', redis: { configured: true, connected: true, host: '127.0.0.1', port: 6379, error: null }, bullBoard: { enabled: false, path: null }, queues: [] };
      },
      async readJobs() {
        return { enabled: true, mode: 'bullmq', generatedAt: '2026-06-16T00:00:00.000Z', jobs: [] };
      },
      async reconcileQueueSchedules(settings) {
        actions.push({ action: 'reconcile', key: settings.jobs.find((job) => job.key === 'database-maintenance:purge-logs')?.enabled ? 'enabled' : 'disabled' });
      },
      async runScheduledJobNow(key, requestedBy) {
        actions.push({ action: 'run-now', key, requestedBy });
        return { queued: true, key, jobId: `${key}:manual:test` };
      }
    };
    const { app, token, appSettingsRepository } = await bootApp(queueStatusProvider);

    const paused = await app.inject({ method: 'POST', url: '/api/system/queue-jobs/database-maintenance%3Apurge-logs/pause', headers: { authorization: `Bearer ${token}` } });
    expect(paused.statusCode).toBe(200);
    expect((await appSettingsRepository.getQueueSchedules()).jobs.find((job) => job.key === 'database-maintenance:purge-logs')).toMatchObject({ enabled: false });

    const runNow = await app.inject({ method: 'POST', url: '/api/system/queue-jobs/database-maintenance%3Apurge-logs/run-now', headers: { authorization: `Bearer ${token}` } });
    expect(runNow.statusCode).toBe(202);
    expect(runNow.json()).toMatchObject({ queued: true, key: 'database-maintenance:purge-logs' });
    expect((await appSettingsRepository.getQueueSchedules()).jobs.find((job) => job.key === 'database-maintenance:purge-logs')).toMatchObject({ enabled: false });

    const resumed = await app.inject({ method: 'POST', url: '/api/system/queue-jobs/database-maintenance%3Apurge-logs/resume', headers: { authorization: `Bearer ${token}` } });
    expect(resumed.statusCode).toBe(200);
    expect((await appSettingsRepository.getQueueSchedules()).jobs.find((job) => job.key === 'database-maintenance:purge-logs')).toMatchObject({ enabled: true });
    expect(actions).toEqual(expect.arrayContaining([
      { action: 'reconcile', key: 'disabled' },
      { action: 'run-now', key: 'database-maintenance:purge-logs', requestedBy: 'Admin User' },
      { action: 'reconcile', key: 'enabled' }
    ]));

    await app.close();
  });
});
