import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';

describe('loadConfig queue and update runner settings', () => {
  it('defaults queues and update runner to disabled when optional infrastructure is not configured', () => {
    const config = loadConfig({ NODE_ENV: 'test' });

    expect(config.queues).toEqual({
      enabled: false,
      redis: { host: null, port: null, password: null, tls: false },
      bullBoard: { enabled: false, path: '/admin/queues' }
    });
    expect(config.updateRunner).toEqual({
      enabled: false,
      command: 'scripts/deploy.sh',
      cwd: process.cwd(),
      confirmationVariable: 'CONFIRM_UPDATE',
      targetRef: null
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

  it('loads guarded update runner settings from environment', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      CMS_UPDATE_RUNNER_ENABLED: 'true',
      CMS_UPDATE_RUNNER_COMMAND: '/opt/oxygen-cms/deploy.sh',
      CMS_UPDATE_RUNNER_CWD: '/opt/oxygen-cms',
      CMS_UPDATE_CONFIRMATION_VARIABLE: 'CMS_CONFIRM_UPDATE',
      CMS_UPDATE_TARGET_REF: 'v0.3.0'
    });

    expect(config.updateRunner).toEqual({
      enabled: true,
      command: '/opt/oxygen-cms/deploy.sh',
      cwd: '/opt/oxygen-cms',
      confirmationVariable: 'CMS_CONFIRM_UPDATE',
      targetRef: 'v0.3.0'
    });
  });
});
