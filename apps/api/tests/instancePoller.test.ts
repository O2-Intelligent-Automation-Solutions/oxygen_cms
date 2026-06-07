import { describe, expect, it, vi } from 'vitest';
import { createInMemoryAppLogRepository } from '../src/appLogs/inMemoryAppLogRepository.js';
import { createInstancePoller } from '../src/instances/instancePoller.js';
import type { ConnectivityResult, InstanceRepository, OxyGenInstance } from '../src/instances/types.js';

function instance(overrides: Partial<OxyGenInstance>): OxyGenInstance {
  return {
    id: 'instance-1',
    name: 'Poll Target',
    description: null,
    tenantId: null,
    protocol: 'https',
    host: 'oxygen.example.com',
    port: 443,
    hostname: 'oxygen.example.com:443',
    baseUrl: 'https://oxygen.example.com:443',
    launchUrl: 'https://oxygen.example.com:443/OPTWS/OxyGen.aspx',
    apiBaseUrl: 'https://oxygen.example.com:443',
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
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides
  };
}

function connectivityResult(): ConnectivityResult {
  return {
    ok: true,
    status: 'reachable',
    message: 'Connectivity test passed.',
    checkedAt: '2026-06-04T00:00:00.000Z',
    durationMs: 42,
    responseTimeMs: 12,
    httpStatusCode: 200,
    dns: { ok: true },
    connect: { ok: true, durationMs: 4 },
    ssl: { ok: true, valid: true, expiresAt: '2026-12-31T00:00:00.000Z' },
    authentication: { ok: true, httpStatusCode: 200 },
    api: { ok: true, httpStatusCode: 200 },
    settingsJson: null,
    license: { step: { ok: true, httpStatusCode: 200 }, status: 'valid', key: 'KEY-123', payload: { licenseKey: 'KEY-123' } }
  };
}

function failedConnectivityResult(): ConnectivityResult {
  return {
    ...connectivityResult(),
    ok: false,
    status: 'unreachable',
    message: 'DNS Error: ENOTFOUND oxygen.example.com',
    responseTimeMs: null,
    httpStatusCode: null,
    dns: { ok: false, message: 'DNS Error: ENOTFOUND oxygen.example.com', errorCode: 'ENOTFOUND' },
    connect: { ok: false, skipped: true, message: 'Connection skipped because DNS resolution failed.' },
    ssl: { ok: false, skipped: true, message: 'Skipped because DNS failed.' },
    authentication: { ok: false, skipped: true, message: 'Skipped because DNS failed.' },
    api: { ok: false, skipped: true, message: 'Skipped because DNS failed.' },
    license: { step: { ok: false, skipped: true, message: 'Skipped because DNS failed.' }, status: 'unknown', key: null, payload: null }
  };
}

function repository(instances: OxyGenInstance[], testConnectivity = vi.fn(async () => connectivityResult())): InstanceRepository {
  return {
    createInstance: vi.fn(),
    updateInstance: vi.fn(),
    deleteInstance: vi.fn(),
    listInstances: vi.fn(async () => instances),
    getInstance: vi.fn(),
    getHealthDetails: vi.fn(async (instanceId: string) => {
      const found = instances.find((entry) => entry.id === instanceId);
      if (!found) throw new Error('Instance not found.');
      return { instance: found, availability: [], latestConnectivity: null, licenseHistory: [] };
    }),
    testConnectivity
  };
}

describe('background instance poller', () => {
  it('polls enabled due instances through the saved-instance connectivity path', async () => {
    const repo = repository([
      instance({ id: 'due', pollingIntervalSeconds: 300, lastCheckedAt: '2026-06-04T00:00:00.000Z' }),
      instance({ id: 'recent', pollingIntervalSeconds: 300, lastCheckedAt: '2026-06-04T00:04:59.000Z' }),
      instance({ id: 'disabled', isEnabled: false, pollingIntervalSeconds: 300, lastCheckedAt: null })
    ]);
    const poller = createInstancePoller({ repository: repo, now: () => new Date('2026-06-04T00:05:00.000Z') });

    const summary = await poller.pollDueInstances();

    expect(repo.listInstances).toHaveBeenCalledWith({ includeAll: true });
    expect(repo.testConnectivity).toHaveBeenCalledTimes(1);
    expect(repo.testConnectivity).toHaveBeenCalledWith('due');
    expect(summary).toEqual({ checked: 1, skipped: 2, failed: 0 });
  });

  it('treats never-checked enabled instances as due', async () => {
    const repo = repository([instance({ id: 'new-instance', lastCheckedAt: null })]);
    const poller = createInstancePoller({ repository: repo, now: () => new Date('2026-06-04T00:05:00.000Z') });

    await poller.pollDueInstances();

    expect(repo.testConnectivity).toHaveBeenCalledWith('new-instance');
  });

  it('does not start an overlapping poll for the same instance', async () => {
    let release!: () => void;
    const slowTest = vi.fn(() => new Promise<ConnectivityResult>((resolve) => {
      release = () => resolve(connectivityResult());
    }));
    const repo = repository([instance({ id: 'slow', lastCheckedAt: null })], slowTest);
    const poller = createInstancePoller({ repository: repo, now: () => new Date('2026-06-04T00:05:00.000Z') });

    const firstPoll = poller.pollDueInstances();
    const secondPoll = await poller.pollDueInstances();
    release();
    const firstSummary = await firstPoll;

    expect(slowTest).toHaveBeenCalledTimes(1);
    expect(secondPoll).toEqual({ checked: 0, skipped: 1, failed: 0 });
    expect(firstSummary).toEqual({ checked: 1, skipped: 0, failed: 0 });
  });

  it('writes routine completed summaries as verbose service logs', async () => {
    const appLogRepository = createInMemoryAppLogRepository();
    const repo = repository([instance({ id: 'disabled', isEnabled: false, lastCheckedAt: null })]);
    const poller = createInstancePoller({ repository: repo, appLogRepository, now: () => new Date('2026-06-04T00:05:00.000Z') });

    const summary = await poller.pollDueInstances();

    expect(summary).toEqual({ checked: 0, skipped: 1, failed: 0 });
    const { logs, total } = await appLogRepository.list({ type: ['Service'] });
    expect(total).toBe(1);
    expect(logs[0]).toMatchObject({ severity: 'Verbose', message: 'Background poller completed: 0 checked, 1 skipped, 0 failed' });
  });

  it('writes verbose per-instance checks, logs repeated issues once, and logs nominal resolution once', async () => {
    const appLogRepository = createInMemoryAppLogRepository();
    const testConnectivity = vi.fn()
      .mockResolvedValueOnce(failedConnectivityResult())
      .mockResolvedValueOnce(failedConnectivityResult())
      .mockResolvedValueOnce(connectivityResult());
    const repo = repository([instance({ id: 'instance-1', lastCheckedAt: null })], testConnectivity);
    const poller = createInstancePoller({ repository: repo, appLogRepository, now: () => new Date('2026-06-04T00:05:00.000Z') });

    await poller.pollDueInstances();
    await poller.pollDueInstances();
    await poller.pollDueInstances();

    const { logs } = await appLogRepository.list({ type: ['Connection'], entityGuid: 'instance-1' });
    const messages = logs.map((log) => `${log.severity}:${log.message}`);
    expect(messages.filter((message) => message.startsWith('Verbose:'))).toHaveLength(3);
    expect(messages.filter((message) => message.includes('connectivity failed'))).toHaveLength(1);
    expect(messages.filter((message) => message.includes('is now nominal'))).toHaveLength(1);
    expect(logs.every((log) => log.entityGuid === 'instance-1')).toBe(true);
  });
});
