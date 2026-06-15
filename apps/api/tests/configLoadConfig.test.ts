import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';

describe('loadConfig queue settings', () => {
  it('defaults queues to disabled when Redis is not configured', () => {
    const config = loadConfig({ NODE_ENV: 'test' });

    expect(config.queues).toEqual({
      enabled: false,
      redis: { host: null, port: null, password: null, tls: false },
      bullBoard: { enabled: false, path: '/admin/queues' }
    });
  });

  it('enables BullMQ settings from environment', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      BULLMQ_ENABLED: 'true',
      REDIS_HOST: 'redis.internal',
      REDIS_PORT: '6380',
      REDIS_PASSWORD: 'secret',
      REDIS_TLS: 'true',
      BULL_BOARD_ENABLED: 'true',
      BULL_BOARD_PATH: '/ops/bull-board'
    });

    expect(config.queues).toEqual({
      enabled: true,
      redis: { host: 'redis.internal', port: 6380, password: 'secret', tls: true },
      bullBoard: { enabled: true, path: '/ops/bull-board' }
    });
  });
});
