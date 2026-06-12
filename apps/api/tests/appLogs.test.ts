import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAppLogRepository } from '../src/appLogs/inMemoryAppLogRepository.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryGridPreferenceRepository } from '../src/gridPreferences/inMemoryGridPreferenceRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';
import type { ConnectivityResult } from '../src/instances/types.js';

async function bootApp() {
  const authRepository = createInMemoryAuthRepository();
  const appLogRepository = createInMemoryAppLogRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const instanceRepository = createInMemoryInstanceRepository();
  const app = await buildApp({ logger: false, authRepository, appLogRepository, appSettingsRepository, gridPreferenceRepository: createInMemoryGridPreferenceRepository(), instanceRepository, enableBackgroundPolling: false });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string, appLogRepository, appSettingsRepository, instanceRepository };
}

function failedDnsConnectivity(): ConnectivityResult {
  return {
    ok: false,
    status: 'unreachable',
    message: 'DNS Error: getaddrinfo ENOTFOUND beta.fakedomain.com (unreachable)',
    checkedAt: new Date().toISOString(),
    durationMs: 12,
    responseTimeMs: null,
    httpStatusCode: null,
    dns: { ok: false, errorCode: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND beta.fakedomain.com' },
    connect: { ok: false, skipped: true, message: 'Connection skipped because DNS resolution failed.' },
    ssl: { ok: false, valid: null, expiresAt: null },
    authentication: { ok: false },
    api: { ok: false },
    settingsJson: null,
    license: { step: { ok: false }, status: 'unknown', key: null, payload: null }
  };
}

describe('application logs API', () => {
  it('logs successful sign-in audit activity with the authenticated user name', async () => {
    const { app, appLogRepository } = await bootApp();

    const { logs, total } = await appLogRepository.list({ type: ['Audit'], search: 'User signed in.' });

    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ type: 'Audit', severity: 'Logging', source: 'Admin User', userName: 'Admin User', message: 'User signed in.' });

    await app.close();
  });

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

    const multi = await app.inject({ method: 'GET', url: '/api/logs?type=Service&type=Connection&severity=Logging,Warning', headers: { authorization: `Bearer ${token}` } });
    expect(multi.statusCode).toBe(200);
    const multiBody = multi.json();
    expect(multiBody.total).toBe(2);
    expect(multiBody.logs.map((log: { type: string }) => log.type).sort()).toEqual(['Connection', 'Service']);

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

  it('logs grid preference saves as one UI activity with structured API details', async () => {
    const { app, token, appLogRepository } = await bootApp();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/grid-preferences/application-logs',
      headers: { authorization: `Bearer ${token}` },
      payload: { columns: [], sort: [], group: [], filter: null, filtersVisible: false }
    });

    expect(response.statusCode).toBe(200);
    const { logs } = await appLogRepository.list({ search: 'grid layout preferences' });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ type: 'UI', severity: 'Logging', source: 'admin@example.com', userName: 'admin@example.com', message: 'Updated grid layout preferences for application-logs.' });
    expect(logs[0].details).toMatchObject({ apiCall: 'PUT /api/grid-preferences/application-logs', responseCode: 200, entityGuid: null });

    const crudLogs = await appLogRepository.list({ type: ['CRUD'], search: '/api/grid-preferences/application-logs' });
    expect(crudLogs.total).toBe(0);

    await app.close();
  });

  it('logs instance updates as one CRUD row with friendly message and separated structured fields', async () => {
    const { app, token, appLogRepository } = await bootApp();

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'App Log Patch Test', description: null, tenantId: null, host: 'app-log-patch-test.example.com', password: 'RemotePassword!42' }
    });
    expect(created.statusCode).toBe(201);
    const instanceId = created.json().instance.id as string;
    await appLogRepository.clear();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/instances/${instanceId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'App Log Patch Test Updated', description: null, tenantId: null, protocol: 'https', host: 'app-log-patch-test.example.com', port: 443, username: 'admin', pollingIntervalSeconds: 300, isEnabled: true }
    });
    expect(updated.statusCode).toBe(200);

    const { logs, total } = await appLogRepository.list({ type: ['CRUD'], search: instanceId });
    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ type: 'CRUD', source: 'admin@example.com', userName: 'admin@example.com', entityGuid: instanceId, tenantId: null, message: 'Updated Instance' });
    expect(logs[0].details).toMatchObject({ apiCall: 'PATCH /api/instances/{Entity_Guid}', responseCode: 200, entityGuid: instanceId, tenantId: null });

    await app.close();
  });

  it('logs failed API responses with error severity and the response error message', async () => {
    const { app, token, appLogRepository } = await bootApp();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/instances/00000000-0000-4000-8000-000000000000',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Missing Instance', description: null, tenantId: null, protocol: 'https', host: 'missing.example.com', port: 443, username: 'admin', pollingIntervalSeconds: 300, isEnabled: true }
    });

    expect(response.statusCode).toBe(404);
    const { logs, total } = await appLogRepository.list({ type: ['CRUD'], severity: ['Error'], search: 'Failed' });
    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ type: 'CRUD', severity: 'Error', message: 'Updated Instance Failed' });
    expect(logs[0].details).toMatchObject({ apiCall: 'PATCH /api/instances/{Entity_Guid}', responseCode: 404, error: 'Instance not found.' });

    await app.close();
  });

  it('logs failed manual connectivity checks from the connectivity result instead of the HTTP 200 status', async () => {
    const { app, token, appLogRepository, instanceRepository } = await bootApp();
    const created = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${token}` }, payload: { name: 'DNS Failure Test', host: 'beta.fakedomain.com', password: 'RemotePassword!42' } });
    expect(created.statusCode).toBe(201);
    const instanceId = created.json().instance.id as string;
    instanceRepository.testConnectivity = vi.fn(async () => failedDnsConnectivity());

    const response = await app.inject({ method: 'POST', url: `/api/instances/${instanceId}/test-connectivity`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: false, status: 'unreachable' });
    const { logs, total } = await appLogRepository.list({ type: ['Connection'], search: 'DNS Error' });
    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ type: 'Connection', severity: 'Error', entityGuid: instanceId, message: 'Manual connectivity check failed: unreachable.' });
    expect(logs[0].details).toMatchObject({ apiCall: 'POST /api/instances/{Entity_Guid}/test-connectivity', entityGuid: instanceId, connectivityStatus: 'unreachable', errorCode: 'ENOTFOUND' });

    const filtered = await appLogRepository.list({ type: ['Connection'], entityGuid: instanceId });
    expect(filtered.total).toBe(1);

    await app.close();
  });

  it('logs unsaved connectivity tests against the caller supplied draft instance GUID', async () => {
    const { app, token, appLogRepository } = await bootApp();
    const draftInstanceId = '11111111-1111-4111-8111-111111111111';

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/test-connectivity',
      headers: { authorization: `Bearer ${token}` },
      payload: { instanceId: draftInstanceId, name: 'Draft DNS Failure', protocol: 'https', host: 'draft.invalid', port: 443, username: 'admin', password: 'RemotePassword!42' }
    });

    expect(response.statusCode).toBe(200);
    const { logs, total } = await appLogRepository.list({ type: ['Connection'], entityGuid: draftInstanceId });
    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ severity: 'Error', entityGuid: draftInstanceId, source: 'admin@example.com' });
    expect(logs[0].details).toMatchObject({ entityGuid: draftInstanceId, instanceName: 'Draft DNS Failure', apiCall: 'POST /api/instances/{Entity_Guid}/test-connectivity' });

    await app.close();
  });

  it('enforces log retention before returning the log list', async () => {
    const { app, token, appLogRepository, appSettingsRepository } = await bootApp();
    await appSettingsRepository.saveLogRetention({ days: 30 });
    const oldLog = await appLogRepository.append({ type: 'Service', severity: 'Logging', source: 'OxyGen CMS', message: 'Old log row' });
    oldLog.createdAt = '2026-01-01T00:00:00.000Z';
    const currentLog = await appLogRepository.append({ type: 'Service', severity: 'Logging', source: 'OxyGen CMS', message: 'Current log row' });
    currentLog.createdAt = new Date().toISOString();

    const response = await app.inject({ method: 'GET', url: '/api/logs?type=Service', headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const messages = response.json().logs.map((log: { message: string }) => log.message);
    expect(messages).toContain('Current log row');
    expect(messages).not.toContain('Old log row');
    await app.close();
  });

  it('clears application logs without writing a duplicate clear-log row', async () => {
    const { app, token, appLogRepository } = await bootApp();
    await appLogRepository.append({ type: 'Service', severity: 'Logging', source: 'OxyGen CMS', message: 'Background poller completed' });
    await appLogRepository.append({ type: 'UI', severity: 'Logging', source: 'admin@example.com', userName: 'admin@example.com', message: 'User action completed' });

    const cleared = await app.inject({ method: 'DELETE', url: '/api/logs', headers: { authorization: `Bearer ${token}` } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ deleted: 4, tables: [{ tableName: 'application_logs', deleted: 4 }] });

    const remaining = await appLogRepository.list();
    expect(remaining.total).toBe(0);

    await app.close();
  });
});
