import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { DatabasePerformanceReader, DatabasePerformanceSnapshot } from '../src/system/databasePerformance.js';
import type { OxyGenInstance } from '../src/instances/types.js';
import { issueCatalogTestInternals, type IssueCatalogReader, type IssueCatalogSnapshot } from '../src/system/issueCatalog.js';

function fakeDatabaseSnapshot(): DatabasePerformanceSnapshot {
  return {
    configured: true,
    connected: true,
    database: 'O2IAS_CMS',
    generatedAt: '2026-06-13T12:00:00.000Z',
    error: null,
    schema: { currentVersion: '0.17', targetVersion: '0.21', current: true, upgradeAvailable: false },
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

  it('matches license-expiring-soon as a real warning issue type', () => {
    const instance: OxyGenInstance = {
      id: 'license-soon',
      name: 'License Soon',
      description: null,
      tenantId: null,
      protocol: 'https',
      host: 'license-soon.example.com',
      port: 443,
      hostname: 'license-soon.example.com',
      baseUrl: 'https://license-soon.example.com:443',
      launchUrl: 'https://license-soon.example.com:443/optws/oxygen.aspx',
      apiBaseUrl: 'https://license-soon.example.com:443/OPTWS',
      username: 'admin',
      pollingIntervalSeconds: 300,
      isEnabled: true,
      checkLicense: true,
      archived: false,
      metadata: null,
      notes: null,
      status: 'up',
      sslValid: true,
      sslExpiresAt: null,
      lastCheckedAt: '2026-06-13T11:58:54.000Z',
      lastSuccessAt: '2026-06-13T11:58:54.000Z',
      lastFailureAt: null,
      uptimePercent24h: 100,
      uptimePercent7d: 100,
      responseTimeMs: 100,
      processingStatus: 'ok',
      emmQueueStatus: 'ok',
      smsStatus: 'ok',
      hangfireStatus: 'ok',
      licenseKey: 'LICENSE-SOON',
      licenseStatus: 'valid',
      licenseJson: { IsValid: true, IsExpired: false, ExpiryDate: new Date(Date.now() + 20 * 86400000).toISOString() },
      settingsJson: null,
      workflowSummaryJson: null,
      lastError: null,
      createdAt: '2026-06-13T11:58:54.000Z',
      updatedAt: '2026-06-13T11:58:54.000Z'
    };
    const type = { matchKind: 'license-expiring-soon' } as Parameters<typeof issueCatalogTestInternals.affectedBy>[0];
    const latestLicense = { status: 'ok', errorCode: null, errorMessage: null, httpStatusCode: 200, detailsJson: { keyPresent: true, payload: { IsValid: true, IsExpired: false, ExpiryDate: new Date(Date.now() + 20 * 86400000).toISOString(), LicenseKey: 'LICENSE-SOON' } } };

    expect(issueCatalogTestInternals.affectedBy(type, instance, null, latestLicense, { daysBeforeExpiration: 30 }, { daysBeforeExpiration: 45 })).toContain('License is valid but within');
    expect(issueCatalogTestInternals.affectedBy(type, instance, null, latestLicense, { daysBeforeExpiration: 30 }, { daysBeforeExpiration: 10 })).toBeNull();
  });

  it('matches ssl-expiring-soon as a real warning issue type', () => {
    const instance: OxyGenInstance = {
      id: 'ssl-soon',
      name: 'SSL Soon',
      description: null,
      tenantId: null,
      protocol: 'https',
      host: 'ssl-soon.example.com',
      port: 443,
      hostname: 'ssl-soon.example.com',
      baseUrl: 'https://ssl-soon.example.com:443',
      launchUrl: 'https://ssl-soon.example.com:443/optws/oxygen.aspx',
      apiBaseUrl: 'https://ssl-soon.example.com:443/OPTWS',
      username: 'admin',
      pollingIntervalSeconds: 300,
      isEnabled: true,
      checkLicense: true,
      archived: false,
      metadata: null,
      notes: null,
      status: 'up',
      sslValid: true,
      sslExpiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
      lastCheckedAt: '2026-06-13T11:58:54.000Z',
      lastSuccessAt: '2026-06-13T11:58:54.000Z',
      lastFailureAt: null,
      uptimePercent24h: 100,
      uptimePercent7d: 100,
      responseTimeMs: 100,
      processingStatus: 'ok',
      emmQueueStatus: 'ok',
      smsStatus: 'ok',
      hangfireStatus: 'ok',
      licenseKey: null,
      licenseStatus: 'unknown',
      licenseJson: null,
      settingsJson: null,
      workflowSummaryJson: null,
      lastError: null,
      createdAt: '2026-06-13T11:58:54.000Z',
      updatedAt: '2026-06-13T11:58:54.000Z'
    };
    const type = { matchKind: 'ssl-expiring-soon' } as Parameters<typeof issueCatalogTestInternals.affectedBy>[0];

    expect(issueCatalogTestInternals.affectedBy(type, instance, null, null, { daysBeforeExpiration: 45 }, { daysBeforeExpiration: 30 })).toContain('SSL certificate is valid but within');
    expect(issueCatalogTestInternals.affectedBy(type, instance, null, null, { daysBeforeExpiration: 10 }, { daysBeforeExpiration: 30 })).toBeNull();
  });

});
