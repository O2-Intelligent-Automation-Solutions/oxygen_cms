import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { DatabasePerformanceReader, DatabasePerformanceSnapshot } from '../src/system/databasePerformance.js';
import type { IssueCatalogReader, IssueCatalogSnapshot } from '../src/system/issueCatalog.js';

function fakeDatabaseSnapshot(): DatabasePerformanceSnapshot {
  return {
    configured: true,
    connected: true,
    database: 'O2IAS_CMS',
    generatedAt: '2026-06-13T12:00:00.000Z',
    error: null,
    schema: { currentVersion: '0.16', targetVersion: '0.16', current: true, upgradeAvailable: false },
    queryDigestStatus: { available: true, state: 'empty', reason: null },
    summary: { tableCount: 0, estimatedRows: 0, dataSizeBytes: 0, indexSizeBytes: 0, freeBytes: 0, totalSizeBytes: 0 },
    server: { version: null, uptimeSeconds: null, maxConnections: null, threadsConnected: null, maxUsedConnections: null, slowQueries: null, longQueryTimeSeconds: null, questions: null, abortedConnects: null, bufferPoolReadHitPercent: null },
    topTables: [],
    queryDigests: []
  };
}

function fakeIssueCatalog(): IssueCatalogSnapshot {
  return {
    configured: true,
    connected: true,
    generatedAt: '2026-06-13T12:00:00.000Z',
    error: null,
    categories: [{ id: 'ssl', code: 'ssl', name: 'SSL', sortOrder: 20 }],
    severities: [{ id: 'warning', code: 'warning', name: 'Warning', rank: 30, sortOrder: 30 }],
    issueTypes: [{
      id: 'ssl-untrusted-chain',
      code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      label: 'SSL untrusted certificate chain',
      description: 'Remote HTTPS certificate chain cannot be verified.',
      matchKind: 'last-error-contains',
      matchValue: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      enabled: true,
      sortOrder: 120,
      category: { id: 'ssl', code: 'ssl', name: 'SSL', sortOrder: 20 },
      severity: { id: 'warning', code: 'warning', name: 'Warning', rank: 30, sortOrder: 30 },
      affectedCount: 1,
      affectedInstances: [{ id: 'instance-1', name: 'Norel', tenantId: null, tenantName: null, status: 'ssl-error', lastCheckedAt: '2026-06-13T11:58:54.000Z', lastError: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', evidence: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }]
    }]
  };
}

async function bootApp(issueCatalogReader: IssueCatalogReader) {
  const authRepository = createInMemoryAuthRepository();
  const databasePerformanceReader: DatabasePerformanceReader = { readSnapshot: vi.fn(async () => fakeDatabaseSnapshot()) };
  const app = await buildApp({ logger: false, authRepository, enableBackgroundPolling: false, databasePerformanceReader, issueCatalogReader });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string };
}

describe('issue catalog system API', () => {
  it('returns issue type mappings and affected instances to system administrators', async () => {
    const reader: IssueCatalogReader = { readSnapshot: vi.fn(async () => fakeIssueCatalog()) };
    const { app, token } = await bootApp(reader);

    const response = await app.inject({ method: 'GET', url: '/api/system/issue-types', headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().issueCatalog).toMatchObject({
      configured: true,
      connected: true,
      categories: [{ code: 'ssl', name: 'SSL' }],
      severities: [{ code: 'warning', name: 'Warning' }],
      issueTypes: [{ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', category: { code: 'ssl' }, severity: { code: 'warning' }, affectedCount: 1, affectedInstances: [{ name: 'Norel' }] }]
    });
    expect(reader.readSnapshot).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('requires authentication', async () => {
    const reader: IssueCatalogReader = { readSnapshot: vi.fn(async () => fakeIssueCatalog()) };
    const { app } = await bootApp(reader);

    const response = await app.inject({ method: 'GET', url: '/api/system/issue-types' });

    expect(response.statusCode).toBe(401);
    expect(reader.readSnapshot).not.toHaveBeenCalled();

    await app.close();
  });
});
