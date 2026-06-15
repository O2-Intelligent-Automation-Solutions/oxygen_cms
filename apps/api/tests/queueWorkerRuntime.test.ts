import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { createQueueWorkerRuntime } from '../src/queues/workerRuntime.js';

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
});
