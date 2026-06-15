import { describe, expect, it, vi } from 'vitest';
import { enqueueImmediateInstanceCheck, reconcileInstanceCheckSchedules, instanceCheckSchedulerId, type InstanceCheckQueueScheduler } from '../src/queues/instanceCheckScheduler.js';
import type { InstanceRepository, OxyGenInstance } from '../src/instances/types.js';

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

describe('instance check scheduler', () => {
  it('uses deterministic scheduler IDs', () => {
    expect(instanceCheckSchedulerId('abc')).toBe('instance-check:abc');
  });

  it('upserts enabled non-archived instances and removes disabled/stale schedules with safe payloads', async () => {
    const enabled = instance();
    const disabled = instance({ id: '33333333-3333-4333-8333-333333333333', isEnabled: false });
    const archived = instance({ id: '44444444-4444-4444-8444-444444444444', archived: true });
    const repository = {
      listInstances: vi.fn(async () => [enabled, disabled, archived])
    } as unknown as InstanceRepository;
    const queue: InstanceCheckQueueScheduler = {
      upsertJobScheduler: vi.fn(async () => undefined),
      removeJobScheduler: vi.fn(async () => true),
      getJobSchedulers: vi.fn(async () => [
        { id: instanceCheckSchedulerId(enabled.id) },
        { id: instanceCheckSchedulerId(disabled.id) },
        { id: instanceCheckSchedulerId('deleted-instance') }
      ]),
      add: vi.fn(async () => undefined)
    };

    const result = await reconcileInstanceCheckSchedules({ repository, queue });

    expect(repository.listInstances).toHaveBeenCalledWith({ includeAll: true, includeArchived: true });
    expect(result).toEqual({ upserted: 1, removed: 2, skipped: 2 });
    expect(queue.upsertJobScheduler).toHaveBeenCalledOnce();
    const [schedulerId, repeatOptions, jobTemplate] = vi.mocked(queue.upsertJobScheduler).mock.calls[0];
    expect(schedulerId).toBe(instanceCheckSchedulerId(enabled.id));
    expect(repeatOptions.every).toBe(300_000);
    expect(repeatOptions.immediately).toBe(false);
    expect(jobTemplate).toMatchObject({ name: 'scheduled-instance-check', data: { instanceId: enabled.id, source: 'scheduled' } });
    expect(JSON.stringify(jobTemplate)).not.toMatch(/password|secret|credential|token|apiKey/i);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(instanceCheckSchedulerId(disabled.id));
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(instanceCheckSchedulerId('deleted-instance'));
  });

  it('clamps very short intervals and supports deterministic jitter', async () => {
    const enabled = instance({ pollingIntervalSeconds: 5 });
    const repository = { listInstances: vi.fn(async () => [enabled]) } as unknown as InstanceRepository;
    const queue: InstanceCheckQueueScheduler = {
      upsertJobScheduler: vi.fn(async () => undefined),
      removeJobScheduler: vi.fn(async () => true),
      getJobSchedulers: vi.fn(async () => []),
      add: vi.fn(async () => undefined)
    };

    await reconcileInstanceCheckSchedules({ repository, queue, minimumIntervalSeconds: 60, jitterSeed: 'test' });

    const [, repeatOptions, jobTemplate] = vi.mocked(queue.upsertJobScheduler).mock.calls[0];
    expect(repeatOptions.every).toBe(60_000);
    expect(jobTemplate.opts?.delay).toBeGreaterThanOrEqual(0);
    expect(jobTemplate.opts?.delay).toBeLessThan(60_000);
  });

  it('enqueues manual checks with high priority and credential-free payloads', async () => {
    const queue = { add: vi.fn<InstanceCheckQueueScheduler['add']>(async () => undefined) };
    const now = new Date('2026-01-02T03:04:05.000Z');
    await enqueueImmediateInstanceCheck(queue, '11111111-1111-4111-8111-111111111111', now);

    expect(queue.add).toHaveBeenCalledOnce();
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe('manual-instance-check');
    expect(data).toEqual({ instanceId: '11111111-1111-4111-8111-111111111111', source: 'manual' });
    expect(opts).toMatchObject({ jobId: 'instance-check:11111111-1111-4111-8111-111111111111:manual:2026-01-02T03:04:05.000Z', priority: 1, attempts: 3 });
    expect(JSON.stringify({ data, opts })).not.toMatch(/password|secret|credential|token|apiKey/i);
  });
});
