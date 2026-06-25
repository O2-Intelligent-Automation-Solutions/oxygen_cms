import { describe, expect, it, vi } from 'vitest';
import { createInMemoryInstanceCheckRunGuard, processInstanceCheckJob, type InstanceCheckJobData } from '../src/queues/instanceCheckProcessor.js';
import type { AppLogRepository } from '../src/appLogs/types.js';
import type { ConnectivityResult, InstanceRepository, OxyGenInstance } from '../src/instances/types.js';

function instance(overrides: Partial<OxyGenInstance> = {}): OxyGenInstance {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Demo OxyGen',
    description: null,
    tenantId: '22222222-2222-4222-8222-222222222222',
    protocol: 'https',
    host: 'demo.example.com',
    port: 443,
    hostname: 'demo.example.com',
    baseUrl: 'https://demo.example.com',
    launchUrl: 'https://demo.example.com',
    apiBaseUrl: 'https://demo.example.com/web-api',
    username: 'admin',
    pollingIntervalSeconds: 300,
    isEnabled: true,
    checkLicense: true,
    archived: false,
    metadata: null,
    notes: null,
    status: 'unknown',
    sslValid: null,
    sslExpiresAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    uptimePercent24h: null,
    uptimePercent7d: null,
    responseTimeMs: null,
    lastError: null,
    processingStatus: 'unknown',
    emmQueueStatus: 'unknown',
    smsStatus: 'unknown',
    hangfireStatus: 'unknown',
    licenseKey: null,
    licenseStatus: 'unknown',
    licenseJson: null,
    settingsJson: null,
    workflowSummaryJson: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function connectivity(overrides: Partial<ConnectivityResult> = {}): ConnectivityResult {
  const okStep = { ok: true, message: 'ok' };
  return {
    ok: true,
    status: 'reachable',
    message: 'Connectivity passed.',
    checkedAt: '2026-01-01T00:01:00.000Z',
    durationMs: 123,
    responseTimeMs: 80,
    httpStatusCode: 200,
    dns: okStep,
    connect: okStep,
    ssl: { ...okStep, valid: true, expiresAt: '2027-01-01T00:00:00.000Z' },
    authentication: okStep,
    api: okStep,
    settingsJson: { sample: true },
    license: { step: okStep, status: 'valid', key: 'LIC-123', payload: { status: 'valid' } },
    ...overrides
  };
}

function appLogRepository() {
  const entries: Awaited<ReturnType<AppLogRepository['append']>>[] = [];
  const repo: AppLogRepository = {
    append: vi.fn(async (entry) => {
      const stored = { id: String(entries.length + 1), createdAt: '2026-01-01T00:00:00.000Z', userName: null, entityGuid: null, tenantId: null, details: null, ...entry };
      entries.push(stored);
      return stored;
    }),
    list: vi.fn(async () => ({ logs: entries, total: entries.length })),
    pruneOlderThan: vi.fn(async () => ({ deleted: 0, tables: [] })),
    clear: vi.fn(async () => ({ deleted: 0, tables: [] }))
  };
  return { repo, entries };
}

describe('processInstanceCheckJob', () => {
  it('rejects job payloads that include credential-like fields', async () => {
    const data = { instanceId: '11111111-1111-4111-8111-111111111111', source: 'manual', password: 'secret' } as InstanceCheckJobData;
    const repository = { getInstance: vi.fn(), testConnectivity: vi.fn() } as unknown as InstanceRepository;

    await expect(processInstanceCheckJob({ data, repository })).rejects.toThrow('must not contain credentials');
    expect(repository.testConnectivity).not.toHaveBeenCalled();
  });

  it('runs the saved-instance connectivity path and writes a service log without secrets', async () => {
    const saved = instance();
    const result = connectivity();
    const repository = {
      getInstance: vi.fn(async () => saved),
      testConnectivity: vi.fn(async () => result)
    } as unknown as InstanceRepository;
    const { repo: logs, entries } = appLogRepository();

    const summary = await processInstanceCheckJob({ data: { instanceId: saved.id, source: 'scheduled' }, repository, appLogRepository: logs });

    expect(repository.getInstance).toHaveBeenCalledWith(saved.id);
    expect(repository.testConnectivity).toHaveBeenCalledWith(saved.id);
    expect(summary).toEqual({ instanceId: saved.id, status: 'reachable', ok: true, message: 'Connectivity passed.' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'Connection', severity: 'Verbose', source: 'BullMQ', entityGuid: saved.id, tenantId: saved.tenantId });
    expect(JSON.stringify(entries[0])).not.toMatch(/password|secret|credential/i);
  });

  it('prevents overlapping checks for the same instance within one worker runtime', async () => {
    const saved = instance();
    let releaseConnectivity!: (result: ConnectivityResult) => void;
    const firstConnectivity = new Promise<ConnectivityResult>((resolve) => { releaseConnectivity = resolve; });
    const repository = {
      getInstance: vi.fn(async () => saved),
      testConnectivity: vi.fn(() => firstConnectivity)
    } as unknown as InstanceRepository;
    const runGuard = createInMemoryInstanceCheckRunGuard();

    const first = processInstanceCheckJob({ data: { instanceId: saved.id, source: 'scheduled' }, repository, runGuard });
    await vi.waitFor(() => expect(repository.testConnectivity).toHaveBeenCalledTimes(1));

    await expect(processInstanceCheckJob({ data: { instanceId: saved.id, source: 'scheduled' }, repository, runGuard })).resolves.toMatchObject({
      instanceId: saved.id,
      ok: true,
      skipped: true,
      status: 'skipped'
    });
    await expect(processInstanceCheckJob({ data: { instanceId: saved.id, source: 'manual' }, repository, runGuard })).rejects.toThrow('already running');
    expect(repository.testConnectivity).toHaveBeenCalledTimes(1);

    releaseConnectivity?.(connectivity());
    await expect(first).resolves.toMatchObject({ instanceId: saved.id, ok: true });

    await expect(processInstanceCheckJob({ data: { instanceId: saved.id, source: 'manual' }, repository, runGuard })).resolves.toMatchObject({ instanceId: saved.id, ok: true });
    expect(repository.testConnectivity).toHaveBeenCalledTimes(2);
  });
});
