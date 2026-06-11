import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createUpdateChecker } from '../src/system/updateInfo.js';

async function loginToken() {
  const authRepository = createInMemoryAuthRepository();
  const app = await buildApp({
    logger: false,
    authRepository,
    enableBackgroundPolling: false,
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

describe('system version/update routes', () => {
  it('returns current version metadata and latest GitHub release status', async () => {
    const { app, token } = await loginToken();
    const response = await app.inject({ method: 'GET', url: '/api/system/version', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version.current.version).toBe('0.1.0');
    expect(body.version.current.repository).toBe('O2-Intelligent-Automation-Solutions/oxygen_cms');
    expect(body.version.update.source).toBe('github-release');
    expect(body.version.update.latestVersion).toBe('v0.2.0');
    expect(body.version.update.available).toBe(true);
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
});
