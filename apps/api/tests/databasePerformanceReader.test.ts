import { describe, expect, it, vi } from 'vitest';
import type { SetupSettingsStore } from '../src/setup/fileSetupSettingsStore.js';
import { createDatabasePerformanceReader } from '../src/system/databasePerformance.js';

const rawMock = vi.fn();
const destroyMock = vi.fn(async () => undefined);
const tableMock = vi.fn();

vi.mock('knex', () => ({
  default: vi.fn(() => Object.assign(tableMock, { raw: rawMock, destroy: destroyMock }))
}));

function rows<T>(value: T[]): [T[]] {
  return [value];
}

function makeBuilder(result: unknown[]) {
  const builder = {
    where: vi.fn(() => builder),
    select: vi.fn(() => builder),
    orderByRaw: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => void, reject?: (error: unknown) => void) => Promise.resolve(result).then(resolve, reject)
  };
  return builder;
}

function store(schemaCurrent = false): SetupSettingsStore {
  return {
    async getDatabaseSettings() { return { host: 'mysql', port: 3306, database: 'O2IAS_CMS', user: 'oxygen_cms', password: 'secret' }; },
    async saveDatabaseSettings() {},
    async getSchemaDatabaseSettings() { return null; },
    async saveSchemaDatabaseSettings() {},
    async clearSchemaDatabaseSettings() {},
    async isSchemaCurrent() { return schemaCurrent; },
    async markSchemaCurrent() {}
  };
}

describe('database performance reader', () => {
  it('includes schema version status and an explicit unavailable query-digest status', async () => {
    tableMock.mockReset();
    rawMock.mockReset();
    destroyMock.mockClear();

    tableMock
      .mockReturnValueOnce(makeBuilder([{ tableCount: 2, estimatedRows: 20, dataSizeBytes: 1024, indexSizeBytes: 256, freeBytes: 0 }]))
      .mockReturnValueOnce(makeBuilder([]));

    rawMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SHOW GLOBAL STATUS')) return rows([]);
      if (sql.includes('SHOW VARIABLES')) return rows([{ Variable_name: 'version', Value: '8.4.0' }]);
      if (sql.includes('events_statements_summary_by_digest')) throw new Error('performance schema denied');
      if (sql.includes('cms_schema_versions')) return rows([{ version: '0.13' }]);
      return rows([]);
    });

    const snapshot = await createDatabasePerformanceReader(store(false)).readSnapshot();

    expect(snapshot.schema).toEqual({ currentVersion: '0.13', targetVersion: '0.16', current: false, upgradeAvailable: true });
    expect(snapshot.queryDigestStatus).toEqual({ available: false, state: 'unavailable', reason: 'performance schema denied' });
    expect(snapshot.queryDigests).toEqual([]);
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});
