import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { createInMemoryAppLogRepository } from './inMemoryAppLogRepository.js';
import type { AppLogEntry, AppLogListResult, AppLogQuery, AppLogRepository, CreateAppLogEntry } from './types.js';

type AppLogRow = RowDataPacket & {
  id: string;
  log_type: AppLogEntry['type'];
  severity: AppLogEntry['severity'];
  source: string;
  user_name: string | null;
  message: string;
  details_json: string | object | null;
  created_at: Date | string;
};

type CountRow = RowDataPacket & { total: number };

function parseDetails(value: AppLogRow['details_json']) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function mapRow(row: AppLogRow): AppLogEntry {
  return {
    id: row.id,
    type: row.log_type,
    severity: row.severity,
    source: row.source,
    userName: row.user_name,
    message: row.message,
    details: parseDetails(row.details_json),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}

function whereClause(query: AppLogQuery) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (query.type) { clauses.push('log_type = ?'); values.push(query.type); }
  if (query.severity) { clauses.push('severity = ?'); values.push(query.severity); }
  if (query.source) { clauses.push('source = ?'); values.push(query.source); }
  if (query.userName) { clauses.push('user_name = ?'); values.push(query.userName); }
  if (query.search) {
    clauses.push('(message LIKE ? OR source LIKE ? OR user_name LIKE ? OR CAST(details_json AS CHAR) LIKE ?)');
    const needle = `%${query.search}%`;
    values.push(needle, needle, needle, needle);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

export function createMysqlAppLogRepository(pool: Pool): AppLogRepository {
  return {
    async append(entry: CreateAppLogEntry) {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO application_logs (id, log_type, severity, source, user_name, message, details_json)
         VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
        [id, entry.type, entry.severity, entry.source, entry.userName ?? null, entry.message, JSON.stringify(entry.details ?? null)]
      );
      const [rows] = await pool.query<AppLogRow[]>('SELECT * FROM application_logs WHERE id = ? LIMIT 1', [id]);
      return mapRow(rows[0]);
    },
    async list(query: AppLogQuery = {}): Promise<AppLogListResult> {
      const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
      const offset = Math.max(query.offset ?? 0, 0);
      const where = whereClause(query);
      const [rows] = await pool.query<AppLogRow[]>(`SELECT * FROM application_logs ${where.sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...where.values, limit, offset]);
      const [countRows] = await pool.query<CountRow[]>(`SELECT COUNT(*) AS total FROM application_logs ${where.sql}`, where.values);
      return { logs: rows.map(mapRow), total: Number(countRows[0]?.total ?? 0) };
    },
    async pruneOlderThan(days: number) {
      const [result] = await pool.query<ResultSetHeader>('DELETE FROM application_logs WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]);
      return result.affectedRows;
    }
  };
}

function databaseKey(settings: DatabaseSettings) {
  return `${settings.host}:${settings.port}:${settings.database}:${settings.user}`;
}

export function createSetupAwareAppLogRepository(setupSettingsStore: SetupSettingsStore, fallbackRepository: AppLogRepository = createInMemoryAppLogRepository()): AppLogRepository {
  let pool: Pool | null = null;
  let repository: AppLogRepository | null = null;
  let activeKey = '';

  async function currentRepository() {
    const settings = await setupSettingsStore.getDatabaseSettings();
    const schemaCurrent = await setupSettingsStore.isSchemaCurrent();
    if (!settings || !schemaCurrent) return fallbackRepository;
    const key = databaseKey(settings);
    if (!pool || !repository || key !== activeKey) {
      if (pool) await pool.end();
      pool = createPool({ host: settings.host, port: settings.port, database: settings.database, user: settings.user, password: settings.password, connectionLimit: 5 });
      repository = createMysqlAppLogRepository(pool);
      activeKey = key;
    }
    return repository;
  }

  return {
    async append(entry) { return (await currentRepository()).append(entry); },
    async list(query) { return (await currentRepository()).list(query); },
    async pruneOlderThan(days) { return (await currentRepository()).pruneOlderThan(days); }
  };
}
