import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlDatabaseMaintenanceRunner } from '../src/queues/databaseMaintenanceRunner.js';

type QueryCall = { sql: string; values?: unknown[] };

function fakePool(tableRows: Array<Record<string, unknown>>, operationRows: Record<string, Array<Record<string, unknown>>> = {}) {
  const calls: QueryCall[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('information_schema.tables')) return [tableRows, []];
      const tableName = sql.match(/`([^`]+)`/)?.[1] ?? 'unknown';
      return [operationRows[tableName] ?? [{ Msg_type: 'status', Msg_text: 'OK' }], []];
    },
    end: vi.fn(async () => undefined)
  } as unknown as Pool;
  return { pool, calls };
}

describe('database maintenance runner', () => {
  it('analyzes only allowlisted CMS maintenance tables', async () => {
    const { pool, calls } = fakePool([
      { tableName: 'application_logs', engine: 'InnoDB', freeBytes: 0 },
      { tableName: 'oxygen_instance_check_history', engine: 'InnoDB', freeBytes: 1024 },
      { tableName: 'unrelated_customer_table', engine: 'InnoDB', freeBytes: 2048 }
    ]);
    const runner = createMysqlDatabaseMaintenanceRunner(pool, 'oxygen_cms');

    await expect(runner.analyzeTables()).resolves.toMatchObject({
      task: 'analyze-tables',
      tables: ['application_logs', 'oxygen_instance_check_history'],
      warnings: []
    });
    expect(calls[0]?.sql).toContain('information_schema.tables');
    expect(calls[0]?.values).toEqual(['oxygen_cms', 'application_logs', 'oxygen_instance_check_history', 'cms_schema_versions', 'application_settings']);
    expect(calls.slice(1).map((call) => call.sql)).toEqual([
      'ANALYZE TABLE `application_logs`',
      'ANALYZE TABLE `oxygen_instance_check_history`'
    ]);
  });

  it('optimizes only InnoDB tables with reported free space and records skips as warnings', async () => {
    const { pool, calls } = fakePool([
      { tableName: 'application_logs', engine: 'InnoDB', freeBytes: 4096 },
      { tableName: 'oxygen_instance_check_history', engine: 'InnoDB', freeBytes: 0 },
      { tableName: 'cms_schema_versions', engine: 'MEMORY', freeBytes: 2048 }
    ]);
    const runner = createMysqlDatabaseMaintenanceRunner(pool, 'oxygen_cms');

    await expect(runner.optimizeTables()).resolves.toMatchObject({
      task: 'optimize-tables',
      tables: ['application_logs', 'oxygen_instance_check_history', 'cms_schema_versions'],
      warnings: [
        'oxygen_instance_check_history: Skipped table with no reported free space.',
        'cms_schema_versions: Skipped MEMORY table engine.'
      ]
    });
    expect(calls.slice(1).map((call) => call.sql)).toEqual(['OPTIMIZE TABLE `application_logs`']);
  });

  it('reports table-operation warning messages without failing the whole job', async () => {
    const { pool } = fakePool(
      [{ tableName: 'application_logs', engine: 'InnoDB', freeBytes: 128 }],
      { application_logs: [{ Msg_type: 'warning', Msg_text: 'Table rebuild required' }] }
    );
    const runner = createMysqlDatabaseMaintenanceRunner(pool, 'oxygen_cms');

    await expect(runner.optimizeTables()).resolves.toMatchObject({
      task: 'optimize-tables',
      warnings: ['application_logs: Table rebuild required']
    });
  });
});
