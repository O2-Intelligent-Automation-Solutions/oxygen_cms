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
      return [{ affectedRows: 0 }, []];
    }
  } as unknown as Pool;
  return { pool, calls };
}

describe('mysql application log storage maintenance', () => {
  it('truncates all current activity tables when clearing logs', async () => {
    const { pool, calls } = fakePool({ application_logs: 12, oxygen_instance_check_history: 340 });
    const repository = createMysqlAppLogRepository(pool);

    const deleted = await repository.clear();

    expect(deleted).toBe(352);
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

  it('does not truncate or analyze activity tables when no activity rows exist', async () => {
    const { pool, calls } = fakePool({ application_logs: 0, oxygen_instance_check_history: 0 });
    const repository = createMysqlAppLogRepository(pool);

    const deleted = await repository.clear();

    expect(deleted).toBe(0);
    expect(calls.map((call) => call.sql)).toEqual([
      'SELECT COUNT(*) AS total FROM application_logs',
      'SELECT COUNT(*) AS total FROM oxygen_instance_check_history'
    ]);
  });
});
