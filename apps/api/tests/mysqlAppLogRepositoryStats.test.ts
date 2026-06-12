import type { Pool } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { createMysqlAppLogRepository } from '../src/appLogs/mysqlAppLogRepository.js';

type QueryCall = { sql: string; values?: unknown[] };

function fakePool(counts: Record<string, number>) {
  const calls: QueryCall[] = [];
  const pool = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('COUNT(*) AS total') && sql.includes('application_logs')) return [[{ total: counts.application_logs ?? 0 }], []];
      if (sql.includes('COUNT(*) AS total') && sql.includes('oxygen_instance_check_history')) return [[{ total: counts.oxygen_instance_check_history ?? 0 }], []];
      if (sql.includes('DELETE FROM application_logs')) return [{ affectedRows: counts.application_logs ?? 0 }, []];
      if (sql.includes('DELETE FROM oxygen_instance_check_history')) return [{ affectedRows: counts.oxygen_instance_check_history ?? 0 }, []];
      return [{ affectedRows: 0 }, []];
    }
  } as unknown as Pool;
  return { pool, calls };
}

describe('mysql application log storage maintenance', () => {
  it('truncates all current activity tables when clearing logs', async () => {
    const { pool, calls } = fakePool({ application_logs: 12, oxygen_instance_check_history: 340 });
    const repository = createMysqlAppLogRepository(pool);

    const result = await repository.clear();

    expect(result).toEqual({
      deleted: 352,
      tables: [
        { tableName: 'application_logs', deleted: 12 },
        { tableName: 'oxygen_instance_check_history', deleted: 340 }
      ]
    });
    expect(calls.map((call) => call.sql)).toEqual([
      'SELECT COUNT(*) AS total FROM application_logs',
      'SELECT COUNT(*) AS total FROM oxygen_instance_check_history',
      'SET FOREIGN_KEY_CHECKS = 0',
      'TRUNCATE TABLE application_logs',
      'TRUNCATE TABLE oxygen_instance_check_history',
      'SET FOREIGN_KEY_CHECKS = 1',
      'ANALYZE TABLE application_logs',
      'ANALYZE TABLE oxygen_instance_check_history'
    ]);
  });

  it('prunes expired rows from all current activity tables', async () => {
    const { pool, calls } = fakePool({ application_logs: 4, oxygen_instance_check_history: 9 });
    const repository = createMysqlAppLogRepository(pool);

    const result = await repository.pruneOlderThan(30);

    expect(result).toEqual({
      deleted: 13,
      tables: [
        { tableName: 'application_logs', deleted: 4 },
        { tableName: 'oxygen_instance_check_history', deleted: 9 }
      ]
    });
    expect(calls.map((call) => call.sql)).toEqual([
      'DELETE FROM application_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)',
      'DELETE FROM oxygen_instance_check_history WHERE started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)',
      'ANALYZE TABLE application_logs',
      'ANALYZE TABLE oxygen_instance_check_history'
    ]);
    expect(calls[0]?.values).toEqual([30]);
    expect(calls[1]?.values).toEqual([30]);
  });

  it('does not truncate or analyze activity tables when no activity rows exist', async () => {
    const { pool, calls } = fakePool({ application_logs: 0, oxygen_instance_check_history: 0 });
    const repository = createMysqlAppLogRepository(pool);

    const result = await repository.clear();

    expect(result).toEqual({
      deleted: 0,
      tables: [
        { tableName: 'application_logs', deleted: 0 },
        { tableName: 'oxygen_instance_check_history', deleted: 0 }
      ]
    });
    expect(calls.map((call) => call.sql)).toEqual([
      'SELECT COUNT(*) AS total FROM application_logs',
      'SELECT COUNT(*) AS total FROM oxygen_instance_check_history'
    ]);
  });
});
