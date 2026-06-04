import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { InstancePoller, InstancePollerStatus } from '../src/instances/instancePoller.js';

async function bootApp(poller: InstancePoller) {
  const authRepository = createInMemoryAuthRepository();
  const app = await buildApp({ logger: false, authRepository, enableBackgroundPolling: false, instancePoller: poller });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string };
}

function fakePoller(): InstancePoller {
  let paused = false;
  return {
    pollDueInstances: vi.fn(async () => ({ checked: 0, skipped: 0, failed: 0 })),
    runNow: vi.fn(async () => ({ checked: 3, skipped: 1, failed: 0 })),
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(() => { paused = true; }),
    resume: vi.fn(() => { paused = false; }),
    getStatus: vi.fn((): InstancePollerStatus => ({
      state: paused ? 'paused' : 'running',
      isRunning: true,
      isPaused: paused,
      tickIntervalMs: 30000,
      inFlight: 0,
      lastRunAt: '2026-06-04T00:01:00.000Z',
      nextRunAt: paused ? null : '2026-06-04T00:01:30.000Z',
      lastSummary: { checked: 2, skipped: 1, failed: 0 },
      lastError: null
    }))
  };
}

describe('poller status and controls API', () => {
  it('exposes poller status on dashboard and system route', async () => {
    const poller = fakePoller();
    const { app, token } = await bootApp(poller);

    const status = await app.inject({ method: 'GET', url: '/api/system/poller', headers: { authorization: `Bearer ${token}` } });
    expect(status.statusCode).toBe(200);
    expect(status.json().poller).toMatchObject({ state: 'running', isPaused: false, lastSummary: { checked: 2, skipped: 1, failed: 0 } });

    const dashboard = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${token}` } });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().dashboard.poller).toMatchObject({ state: 'running', nextRunAt: '2026-06-04T00:01:30.000Z' });

    await app.close();
  });

  it('allows a system admin to pause and resume the background poller', async () => {
    const poller = fakePoller();
    const { app, token } = await bootApp(poller);

    const paused = await app.inject({ method: 'POST', url: '/api/system/poller/pause', headers: { authorization: `Bearer ${token}` } });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().poller).toMatchObject({ state: 'paused', isPaused: true, nextRunAt: null });
    expect(poller.pause).toHaveBeenCalledTimes(1);

    const resumed = await app.inject({ method: 'POST', url: '/api/system/poller/resume', headers: { authorization: `Bearer ${token}` } });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().poller).toMatchObject({ state: 'running', isPaused: false });
    expect(poller.resume).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('allows a system admin to run the background poller immediately', async () => {
    const poller = fakePoller();
    const { app, token } = await bootApp(poller);

    const run = await app.inject({ method: 'POST', url: '/api/system/poller/run-now', headers: { authorization: `Bearer ${token}` } });
    expect(run.statusCode).toBe(200);
    expect(run.json().summary).toMatchObject({ checked: 3, skipped: 1, failed: 0 });
    expect(run.json().poller).toMatchObject({ state: 'running', isPaused: false });
    expect(poller.runNow).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
