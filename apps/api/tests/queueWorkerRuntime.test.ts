import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { createQueueJobProcessor, createQueueWorkerRuntime } from '../src/queues/workerRuntime.js';
import type { AppLogRepository } from '../src/appLogs/types.js';
import type { AppSettingsRepository } from '../src/appSettings/types.js';
import type { InstanceRepository } from '../src/instances/types.js';

function fakeRepositories() {
  const instanceRepository = { getInstance: vi.fn(), testConnectivity: vi.fn() } as unknown as InstanceRepository;
  const appLogRepository = {
    append: vi.fn(),
    list: vi.fn(),
    pruneOlderThan: vi.fn(async () => ({
      deleted: 7,
      tables: [
        { tableName: 'application_logs', deleted: 2 },
        { tableName: 'oxygen_instance_check_history', deleted: 5 }
      ]
    })),
    clear: vi.fn()
  } as unknown as AppLogRepository;
  const appSettingsRepository = {
    getLabels: vi.fn(),
    saveLabels: vi.fn(),
    getLogRetention: vi.fn(async () => ({ days: 14 })),
    saveLogRetention: vi.fn()
  } as unknown as AppSettingsRepository;
  return { instanceRepository, appLogRepository, appSettingsRepository };
}

describe('queue worker runtime', () => {
  it('stays disabled when BullMQ is not configured', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const config = loadConfig({ BULLMQ_ENABLED: 'false', REDIS_HOST: '', REDIS_PORT: '6379' });
    const runtime = await createQueueWorkerRuntime(config, logger);

    expect(runtime.state).toBe('disabled');
    expect(runtime.queueNames).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('BullMQ worker disabled'));
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it('dispatches instance-checks jobs to the saved-instance processor and rejects unsafe payloads', async () => {
    const { instanceRepository } = fakeRepositories();
    const processor = createQueueJobProcessor({ instanceRepository });

    await expect(processor('instance-checks', { instanceId: 'not-a-real-id', source: 'scheduled', password: 'secret' })).rejects.toThrow('must not contain credentials');
    expect(instanceRepository.testConnectivity).not.toHaveBeenCalled();
  });

  it('skips orphaned scheduled instance-check jobs without marking the job failed', async () => {
    const { instanceRepository } = fakeRepositories();
    instanceRepository.getInstance = vi.fn(async () => null);
    const processor = createQueueJobProcessor({ instanceRepository });

    await expect(processor('instance-checks', { instanceId: 'deleted-instance-id', source: 'scheduled' })).resolves.toEqual({
      instanceId: 'deleted-instance-id',
      status: 'skipped',
      ok: true,
      skipped: true,
      message: 'Skipped scheduled instance check because the instance no longer exists.'
    });
    expect(instanceRepository.testConnectivity).not.toHaveBeenCalled();
  });

  it('keeps manual missing-instance checks as errors', async () => {
    const { instanceRepository } = fakeRepositories();
    instanceRepository.getInstance = vi.fn(async () => null);
    const processor = createQueueJobProcessor({ instanceRepository });

    await expect(processor('instance-checks', { instanceId: 'deleted-instance-id', source: 'manual' })).rejects.toThrow('Instance not found.');
    expect(instanceRepository.testConnectivity).not.toHaveBeenCalled();
  });

  it('dispatches database-maintenance purge-logs jobs through configured retention maintenance', async () => {
    const { instanceRepository, appLogRepository, appSettingsRepository } = fakeRepositories();
    const processor = createQueueJobProcessor({ instanceRepository, appLogRepository, appSettingsRepository });

    await expect(processor('database-maintenance', { task: 'purge-logs', requestedBy: 'system' })).resolves.toEqual({
      task: 'purge-logs',
      retention: { days: 14 },
      deleted: 7,
      tables: [
        { tableName: 'application_logs', deleted: 2 },
        { tableName: 'oxygen_instance_check_history', deleted: 5 }
      ]
    });
    expect(appSettingsRepository.getLogRetention).toHaveBeenCalledTimes(1);
    expect(appLogRepository.pruneOlderThan).toHaveBeenCalledWith(14);
  });

  it('rejects unknown or unsafe database-maintenance jobs without touching logs', async () => {
    const { instanceRepository, appLogRepository, appSettingsRepository } = fakeRepositories();
    const processor = createQueueJobProcessor({ instanceRepository, appLogRepository, appSettingsRepository });

    await expect(processor('database-maintenance', { task: 'backup' })).rejects.toThrow('Unsupported database-maintenance task');
    await expect(processor('database-maintenance', { task: 'purge-logs', password: 'secret' })).rejects.toThrow('must not contain credentials');
    expect(appLogRepository.pruneOlderThan).not.toHaveBeenCalled();
  });

  it('dispatches guarded analyze and optimize database-maintenance definitions when a runner is configured', async () => {
    const { instanceRepository, appLogRepository, appSettingsRepository } = fakeRepositories();
    const databaseMaintenanceRunner = {
      analyzeTables: vi.fn(async () => ({ task: 'analyze-tables' as const, tables: ['application_logs'] })),
      optimizeTables: vi.fn(async () => ({ task: 'optimize-tables' as const, tables: ['oxygen_instance_check_history'], warnings: ['metadata lock wait avoided'] }))
    };
    const processor = createQueueJobProcessor({ instanceRepository, appLogRepository, appSettingsRepository, databaseMaintenanceRunner });

    await expect(processor('database-maintenance', { task: 'analyze-tables', requestedBy: 'system' })).resolves.toEqual({ task: 'analyze-tables', tables: ['application_logs'] });
    await expect(processor('database-maintenance', { task: 'optimize-tables', requestedBy: 'system' })).resolves.toEqual({ task: 'optimize-tables', tables: ['oxygen_instance_check_history'], warnings: ['metadata lock wait avoided'] });
    expect(databaseMaintenanceRunner.analyzeTables).toHaveBeenCalledTimes(1);
    expect(databaseMaintenanceRunner.optimizeTables).toHaveBeenCalledTimes(1);
    expect(appLogRepository.pruneOlderThan).not.toHaveBeenCalled();
  });

  it('guards analyze and optimize definitions when no database-maintenance runner is configured', async () => {
    const { instanceRepository, appLogRepository, appSettingsRepository } = fakeRepositories();
    const processor = createQueueJobProcessor({ instanceRepository, appLogRepository, appSettingsRepository });

    await expect(processor('database-maintenance', { task: 'analyze-tables' })).rejects.toThrow('requires an explicit database maintenance runner');
    await expect(processor('database-maintenance', { task: 'optimize-tables' })).rejects.toThrow('requires an explicit database maintenance runner');
    expect(appLogRepository.pruneOlderThan).not.toHaveBeenCalled();
  });
});
