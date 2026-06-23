import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createUpdateChecker } from '../src/system/updateInfo.js';
import { createUpdateRunnerStatusProvider } from '../src/system/updateStatus.js';

async function loginToken(options: { updateStatusProvider?: ReturnType<typeof createUpdateRunnerStatusProvider> } = {}) {
  const authRepository = createInMemoryAuthRepository();
  const app = await buildApp({
    logger: false,
    authRepository,
    enableBackgroundPolling: false,
    updateStatusProvider: options.updateStatusProvider,
    updateChecker: createUpdateChecker({
      repository: 'O2-Intelligent-Automation-Solutions/oxygen_cms',
      fetchImpl: async () => new Response(JSON.stringify({ tag_name: 'v0.2.0', name: 'CMS v0.2.0', html_url: 'https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/releases/tag/v0.2.0', published_at: '2026-06-01T00:00:00Z' }), { status: 200 }),
      now: () => new Date('2026-06-11T12:00:00Z')
    })
  });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json<{ token: string }>().token };
}

async function flushAsyncRunner() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('system version/update routes', () => {
  it('returns current version metadata and latest GitHub release status', async () => {
    const { app, token } = await loginToken();
    const response = await app.inject({ method: 'GET', url: '/api/system/version', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version.current.version).toMatch(/^0\.1\.0\+[0-9a-f]{12}$/);
    expect(body.version.current.repository).toBe('O2-Intelligent-Automation-Solutions/oxygen_cms');
    expect(body.version.update.source).toBe('github-release');
    expect(body.version.update.latestVersion).toBe('v0.2.0');
    expect(body.version.update.available).toBe(true);
    await app.close();
  });

  it('returns guarded update command status for the non-technical update flow', async () => {
    const { app, token } = await loginToken();
    const response = await app.inject({ method: 'GET', url: '/api/system/update-status', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().updateStatus).toMatchObject({
      runner: {
        enabled: false,
        state: 'blocked',
        inProgress: false,
        canRun: false,
        mode: 'host-script',
        command: 'scripts/deploy.sh update',
        dryRunCommand: 'scripts/deploy.sh update --dry-run',
        requiresConfirmation: true,
        confirmationVariable: 'CONFIRM_UPDATE',
        currentRef: null,
        targetRef: null
      },
      lastRun: null,
      lastError: null
    });
    expect(response.json().updateStatus.generatedAt).toEqual(expect.any(String));
    expect(response.json().updateStatus.steps.map((step: { code: string; state: string; startedAt: string | null; finishedAt: string | null; description: string }) => [step.code, step.state, step.startedAt, step.finishedAt, Boolean(step.description)])).toEqual([
      ['dry-run', 'pending', null, null, true],
      ['backup', 'pending', null, null, true],
      ['checkout', 'pending', null, null, true],
      ['build', 'pending', null, null, true],
      ['restart', 'pending', null, null, true],
      ['schema', 'pending', null, null, true]
    ]);
    await app.close();
  });

  it('blocks update runner actions when guarded execution is disabled', async () => {
    const { app, token } = await loginToken();
    const response = await app.inject({ method: 'POST', url: '/api/system/update-runner/dry-run', headers: { authorization: `Bearer ${token}` }, payload: { targetRef: 'v0.2.0' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Update runner is disabled');
    await app.close();
  });

  it('requires explicit confirmation for real update requests', async () => {
    const provider = createUpdateRunnerStatusProvider({ enabled: true, executor: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }) });
    const { app, token } = await loginToken({ updateStatusProvider: provider });
    const response = await app.inject({ method: 'POST', url: '/api/system/update-runner/update', headers: { authorization: `Bearer ${token}` }, payload: { targetRef: 'v0.2.0' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('CONFIRM_UPDATE=YES');
    await app.close();
  });

  it('starts dry-run update runner requests with target ref tracking', async () => {
    const executor = vi.fn(async () => ({ exitCode: 0, stdout: 'dry run ok', stderr: '' }));
    const provider = createUpdateRunnerStatusProvider({ enabled: true, idFactory: () => 'run-1', now: () => new Date('2026-06-11T12:00:00Z'), executor });
    const { app, token } = await loginToken({ updateStatusProvider: provider });
    const response = await app.inject({ method: 'POST', url: '/api/system/update-runner/dry-run', headers: { authorization: `Bearer ${token}` }, payload: { targetRef: 'v0.2.0' } });
    expect(response.statusCode).toBe(202);
    expect(response.json().updateStatus).toMatchObject({
      runner: { enabled: true, state: 'running', inProgress: true, canRun: false, targetRef: 'v0.2.0' },
      lastRun: { id: 'run-1', mode: 'dry-run', targetRef: 'v0.2.0', state: 'running' }
    });
    expect(executor).toHaveBeenCalledWith(['update', '--dry-run'], expect.objectContaining({ env: expect.objectContaining({ CMS_UPDATE_TARGET_REF: 'v0.2.0' }) }));
    await flushAsyncRunner();
    const status = await app.inject({ method: 'GET', url: '/api/system/update-status', headers: { authorization: `Bearer ${token}` } });
    expect(status.json().updateStatus.lastRun).toMatchObject({ id: 'run-1', state: 'completed', summary: 'dry run ok' });
    await app.close();
  });

  it('starts confirmed update requests with confirmation env guard', async () => {
    const executor = vi.fn(async () => ({ exitCode: 0, stdout: 'updated', stderr: '' }));
    const provider = createUpdateRunnerStatusProvider({ enabled: true, idFactory: () => 'run-2', confirmationVariable: 'CMS_CONFIRM_UPDATE', executor });
    const { app, token } = await loginToken({ updateStatusProvider: provider });
    const response = await app.inject({ method: 'POST', url: '/api/system/update-runner/update', headers: { authorization: `Bearer ${token}` }, payload: { targetRef: 'v0.3.0', confirmed: true } });
    expect(response.statusCode).toBe(202);
    expect(executor).toHaveBeenCalledWith(['update'], expect.objectContaining({ env: expect.objectContaining({ CMS_UPDATE_TARGET_REF: 'v0.3.0', CMS_CONFIRM_UPDATE: 'YES' }) }));
    await app.close();
  });

  it('falls back to tags when no GitHub release exists', async () => {
    let calls = 0;
    const checker = createUpdateChecker({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        return new Response(JSON.stringify([{ name: 'v0.1.0' }]), { status: 200 });
      },
      now: () => new Date('2026-06-11T12:00:00Z')
    });
    const snapshot = await checker.getVersionSnapshot();
    expect(snapshot.update.source).toBe('github-tag');
    expect(snapshot.update.latestVersion).toBe('v0.1.0');
    expect(snapshot.update.available).toBe(false);
  });


  it('falls back to the default branch commit when releases and tags are absent', async () => {
    let calls = 0;
    const checker = createUpdateChecker({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
        if (calls === 2) return new Response(JSON.stringify([]), { status: 200 });
        if (calls === 3) return new Response(JSON.stringify({ default_branch: 'main', html_url: 'https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms', pushed_at: '2026-06-12T00:00:00Z' }), { status: 200 });
        return new Response(JSON.stringify({ sha: '19b1884abcdef1234567890', html_url: 'https://github.com/O2-Intelligent-Automation-Solutions/oxygen_cms/commit/19b1884abcdef1234567890', commit: { committer: { date: '2026-06-12T00:00:00Z' } } }), { status: 200 });
      },
      now: () => new Date('2026-06-12T12:00:00Z')
    });
    const snapshot = await checker.getVersionSnapshot();
    expect(snapshot.update.source).toBe('github-branch');
    expect(snapshot.update.latestVersion).toBe('19b1884abcde');
    expect(snapshot.update.latestName).toBe('main @ 19b1884abcde');
    expect(snapshot.update.error).toBeNull();
  });

  it('returns an offline-safe unavailable update state on network failure', async () => {
    const checker = createUpdateChecker({
      fetchImpl: async () => { throw new Error('network unavailable'); },
      now: () => new Date('2026-06-11T12:00:00Z')
    });
    const snapshot = await checker.getVersionSnapshot();
    expect(snapshot.update.source).toBe('unavailable');
    expect(snapshot.update.available).toBe(false);
    expect(snapshot.update.error).toBe('network unavailable');
  });

  it('caches GitHub update checks within the configured TTL', async () => {
    let calls = 0;
    let currentTime = new Date('2026-06-11T12:00:00Z');
    const checker = createUpdateChecker({
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ tag_name: 'v0.2.0' }), { status: 200 });
      },
      now: () => currentTime,
      timeoutMs: 1000
    });

    const first = await checker.getVersionSnapshot();
    currentTime = new Date('2026-06-11T12:01:00Z');
    const second = await checker.getVersionSnapshot();

    expect(first).toBe(second);
    expect(calls).toBe(1);
  });
});
