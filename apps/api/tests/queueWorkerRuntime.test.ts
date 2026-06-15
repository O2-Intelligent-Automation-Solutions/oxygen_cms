import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { createQueueJobProcessor, createQueueWorkerRuntime } from '../src/queues/workerRuntime.js';
import type { InstanceRepository } from '../src/instances/types.js';

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

  it('dispatches instance-checks jobs to the saved-instance processor and rejects unimplemented queues', async () => {
    const repository = { getInstance: vi.fn(), testConnectivity: vi.fn() } as unknown as InstanceRepository;
    const processor = createQueueJobProcessor({ instanceRepository: repository });

    await expect(processor('database-maintenance', { task: 'purge-logs' })).rejects.toThrow('No processor registered');
    await expect(processor('instance-checks', { instanceId: 'not-a-real-id', source: 'scheduled', password: 'secret' })).rejects.toThrow('must not contain credentials');
    expect(repository.testConnectivity).not.toHaveBeenCalled();
  });
});
