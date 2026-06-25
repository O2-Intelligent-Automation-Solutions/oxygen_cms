import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import type { DatabaseMaintenanceRunner } from './databaseMaintenanceProcessor.js';

const maintenanceTables = ['application_logs', 'oxygen_instance_check_history', 'cms_schema_versions', 'application_settings'] as const;

type MaintenanceTableName = typeof maintenanceTables[number];

type TableRow = RowDataPacket & {
  tableName: string;
  engine: string | null;
  freeBytes: string | number | null;
};

export type DatabaseMaintenanceTableResult = {
  tableName: string;
  status: 'ok' | 'skipped' | 'warning';
  operation: 'analyze' | 'optimize';
  message: string | null;
};

function databaseKey(settings: DatabaseSettings) {
  return `${settings.host}:${settings.port}:${settings.database}:${settings.user}`;
}

function quoteIdentifier(identifier: MaintenanceTableName) {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function rowsFromQuery(result: unknown): TableRow[] {
  if (!Array.isArray(result)) return [];
  return Array.isArray(result[0]) ? result[0] as TableRow[] : result as TableRow[];
}

async function readMaintenanceTables(pool: Pool, database: string) {
  const [rows] = await pool.query<TableRow[]>(
    `SELECT table_name AS tableName, engine, COALESCE(data_free, 0) AS freeBytes
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name IN (${maintenanceTables.map(() => '?').join(', ')})
     ORDER BY table_name ASC`,
    [database, ...maintenanceTables]
  );
  return rows.filter((row): row is TableRow & { tableName: MaintenanceTableName } => maintenanceTables.includes(row.tableName as MaintenanceTableName));
}

async function runTableOperation(pool: Pool, operation: 'analyze' | 'optimize', tableName: MaintenanceTableName): Promise<DatabaseMaintenanceTableResult> {
  const sqlOperation = operation === 'analyze' ? 'ANALYZE' : 'OPTIMIZE';
  const rows = rowsFromQuery(await pool.query(`${sqlOperation} TABLE ${quoteIdentifier(tableName)}`));
  const message = rows.map((row) => String((row as Record<string, unknown>).Msg_text ?? '')).filter(Boolean).join('; ') || null;
  const statusText = rows.map((row) => String((row as Record<string, unknown>).Msg_type ?? '').toLowerCase()).join(' ');
  return {
    tableName,
    operation,
    status: statusText.includes('error') || statusText.includes('warning') ? 'warning' : 'ok',
    message
  };
}

export function createMysqlDatabaseMaintenanceRunner(pool: Pool, database: string): DatabaseMaintenanceRunner {
  return {
    async analyzeTables() {
      const tables = await readMaintenanceTables(pool, database);
      const results = await Promise.all(tables.map((table) => runTableOperation(pool, 'analyze', table.tableName)));
      return {
        task: 'analyze-tables' as const,
        tables: results.map((result) => result.tableName),
        results,
        warnings: results.filter((result) => result.status === 'warning').map((result) => `${result.tableName}: ${result.message ?? 'warning'}`)
      };
    },
    async optimizeTables() {
      const tables = await readMaintenanceTables(pool, database);
      const results: DatabaseMaintenanceTableResult[] = [];
      for (const table of tables) {
        if (String(table.engine ?? '').toLowerCase() !== 'innodb') {
          results.push({ tableName: table.tableName, operation: 'optimize', status: 'skipped', message: `Skipped ${table.engine ?? 'unknown'} table engine.` });
          continue;
        }
        const freeBytes = Number(table.freeBytes ?? 0);
        if (!Number.isFinite(freeBytes) || freeBytes <= 0) {
          results.push({ tableName: table.tableName, operation: 'optimize', status: 'skipped', message: 'Skipped table with no reported free space.' });
          continue;
        }
        results.push(await runTableOperation(pool, 'optimize', table.tableName));
      }
      return {
        task: 'optimize-tables' as const,
        tables: results.map((result) => result.tableName),
        results,
        warnings: results.filter((result) => result.status === 'warning' || result.status === 'skipped').map((result) => `${result.tableName}: ${result.message ?? result.status}`)
      };
    }
  };
}

export function createSetupAwareDatabaseMaintenanceRunner(setupSettingsStore: SetupSettingsStore): DatabaseMaintenanceRunner {
  let pool: Pool | null = null;
  let runner: DatabaseMaintenanceRunner | null = null;
  let activeKey = '';

  async function currentRunner() {
    const settings = await setupSettingsStore.getDatabaseSettings();
    const schemaCurrent = await setupSettingsStore.isSchemaCurrent();
    if (!settings || !schemaCurrent) throw new Error('Database maintenance runner requires configured current CMS database settings.');
    const key = databaseKey(settings);
    if (!pool || !runner || key !== activeKey) {
      if (pool) await pool.end();
      pool = createPool({ host: settings.host, port: settings.port, database: settings.database, user: settings.user, password: settings.password, connectionLimit: 2 });
      runner = createMysqlDatabaseMaintenanceRunner(pool, settings.database);
      activeKey = key;
    }
    return runner;
  }

  return {
    async analyzeTables() { return (await currentRunner()).analyzeTables(); },
    async optimizeTables() { return (await currentRunner()).optimizeTables(); }
  };
}
