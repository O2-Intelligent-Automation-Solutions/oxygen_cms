import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { DatabasePerformanceReader, DatabasePerformanceSnapshot } from '../src/system/databasePerformance.js';

function fakeSnapshot(overrides: Partial<DatabasePerformanceSnapshot> = {}): DatabasePerformanceSnapshot {
  return {
    configured: true,
    connected: true,
    database: 'O2IAS_CMS',
    generatedAt: '2026-06-11T12:00:00.000Z',
    error: null,
    schema: {
      currentVersion: '0.14',
      targetVersion: '0.14',
      current: true,
      upgradeAvailable: false
    },
    queryDigestStatus: {
      available: true,
      state: 'available',
      reason: null
    },
    summary: {
      tableCount: 42,
      estimatedRows: 250000,
      dataSizeBytes: 734003200,
      indexSizeBytes: 209715200,
      freeBytes: 10485760,
      totalSizeBytes: 943718400
    },
    server: {
      version: '8.4.0',
      uptimeSeconds: 86400,
      maxConnections: 151,
      threadsConnected: 12,
      maxUsedConnections: 28,
      slowQueries: 7,
      longQueryTimeSeconds: 10,
      questions: 1250000,
      abortedConnects: 1,
      bufferPoolReadHitPercent: 99.93
    },
    topTables: [
      {
        tableName: 'instance_connectivity_history',
        engine: 'InnoDB',
        rowEstimate: 120000,
        dataSizeBytes: 314572800,
        indexSizeBytes: 104857600,
        freeBytes: 0,
        totalSizeBytes: 419430400,
        updatedAt: '2026-06-11T11:59:00.000Z'
      }
    ],
    queryDigests: [
      {
        digestText: 'SELECT * FROM application_logs WHERE created_at < ?',
        count: 3,
        totalTimeSeconds: 12.3,
        avgTimeSeconds: 4.1,
        rowsExamined: 900000,
        rowsSent: 12,
        errors: 0,
        warnings: 1,
        firstSeen: '2026-06-11T11:00:00.000Z',
        lastSeen: '2026-06-11T11:59:00.000Z'
      }
    ],
    ...overrides
  };
}

async function bootApp(reader: DatabasePerformanceReader) {
  const authRepository = createInMemoryAuthRepository();
  const app = await buildApp({ logger: false, authRepository, enableBackgroundPolling: false, databasePerformanceReader: reader });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  return { app, token: login.json().token as string };
}

describe('database performance system API', () => {
  it('returns a database performance snapshot to system administrators', async () => {
    const reader: DatabasePerformanceReader = { readSnapshot: vi.fn(async () => fakeSnapshot()) };
    const { app, token } = await bootApp(reader);

    const response = await app.inject({ method: 'GET', url: '/api/system/database-performance', headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json().databasePerformance).toMatchObject({
      configured: true,
      connected: true,
      database: 'O2IAS_CMS',
      schema: {
        currentVersion: '0.14',
        targetVersion: '0.14',
        current: true,
        upgradeAvailable: false
      },
      queryDigestStatus: {
        available: true,
        state: 'available',
        reason: null
      },
      summary: { tableCount: 42, estimatedRows: 250000 },
      server: { threadsConnected: 12, slowQueries: 7, longQueryTimeSeconds: 10, bufferPoolReadHitPercent: 99.93 },
      topTables: [{ tableName: 'instance_connectivity_history', totalSizeBytes: 419430400 }],
      queryDigests: [{ digestText: 'SELECT * FROM application_logs WHERE created_at < ?', totalTimeSeconds: 12.3 }]
    });
    expect(reader.readSnapshot).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('requires authentication', async () => {
    const reader: DatabasePerformanceReader = { readSnapshot: vi.fn(async () => fakeSnapshot()) };
    const { app } = await bootApp(reader);

    const response = await app.inject({ method: 'GET', url: '/api/system/database-performance' });

    expect(response.statusCode).toBe(401);
    expect(reader.readSnapshot).not.toHaveBeenCalled();

    await app.close();
  });
});
