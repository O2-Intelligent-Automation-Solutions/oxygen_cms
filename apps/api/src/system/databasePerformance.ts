import knex, { type Knex } from 'knex';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';

export type DatabaseTablePerformance = {
  tableName: string;
  engine: string | null;
  rowEstimate: number;
  dataSizeBytes: number;
  indexSizeBytes: number;
  freeBytes: number;
  totalSizeBytes: number;
  updatedAt: string | null;
};

export type DatabaseQueryDigestPerformance = {
  digestText: string;
  count: number;
  totalTimeSeconds: number;
  avgTimeSeconds: number;
  rowsExamined: number;
  rowsSent: number;
  errors: number;
  warnings: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type DatabasePerformanceSnapshot = {
  configured: boolean;
  connected: boolean;
  database: string | null;
  generatedAt: string;
  error: string | null;
  summary: {
    tableCount: number;
    estimatedRows: number;
    dataSizeBytes: number;
    indexSizeBytes: number;
    freeBytes: number;
    totalSizeBytes: number;
  };
  server: {
    version: string | null;
    uptimeSeconds: number | null;
    maxConnections: number | null;
    threadsConnected: number | null;
    maxUsedConnections: number | null;
    slowQueries: number | null;
    longQueryTimeSeconds: number | null;
    questions: number | null;
    abortedConnects: number | null;
    bufferPoolReadHitPercent: number | null;
  };
  topTables: DatabaseTablePerformance[];
  queryDigests: DatabaseQueryDigestPerformance[];
};

export type DatabasePerformanceReader = {
  readSnapshot(): Promise<DatabasePerformanceSnapshot>;
};

type NumericRow = Record<string, unknown>;

const emptySummary = {
  tableCount: 0,
  estimatedRows: 0,
  dataSizeBytes: 0,
  indexSizeBytes: 0,
  freeBytes: 0,
  totalSizeBytes: 0
};

const emptyServer = {
  version: null,
  uptimeSeconds: null,
  maxConnections: null,
  threadsConnected: null,
  maxUsedConnections: null,
  slowQueries: null,
  longQueryTimeSeconds: null,
  questions: null,
  abortedConnects: null,
  bufferPoolReadHitPercent: null
};

function createConnection(settings: DatabaseSettings): Knex {
  return knex({
    client: 'mysql2',
    connection: {
      host: settings.host,
      port: settings.port,
      user: settings.user,
      password: settings.password,
      database: settings.database
    },
    pool: { min: 0, max: 2 }
  });
}

function rowsFromRaw<T extends NumericRow>(result: unknown): T[] {
  if (Array.isArray(result)) {
    const first = result[0];
    return Array.isArray(first) ? first as T[] : result as T[];
  }
  return [];
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

async function readStatus(client: Knex) {
  try {
    const rows = rowsFromRaw<{ Variable_name: string; Value: string }>(await client.raw("SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Max_used_connections','Slow_queries','Questions','Aborted_connects','Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests')"));
    return Object.fromEntries(rows.map((row) => [row.Variable_name, row.Value]));
  } catch {
    return {} as Record<string, string>;
  }
}

async function readVariables(client: Knex) {
  try {
    const rows = rowsFromRaw<{ Variable_name: string; Value: string }>(await client.raw("SHOW VARIABLES WHERE Variable_name IN ('version','max_connections','long_query_time')"));
    return Object.fromEntries(rows.map((row) => [row.Variable_name, row.Value]));
  } catch {
    return {} as Record<string, string>;
  }
}

async function readQueryDigests(client: Knex, database: string): Promise<DatabaseQueryDigestPerformance[]> {
  try {
    const rows = rowsFromRaw<NumericRow>(await client.raw(`
      SELECT
        DIGEST_TEXT AS digestText,
        COUNT_STAR AS count,
        SUM_TIMER_WAIT AS totalTimerWait,
        AVG_TIMER_WAIT AS avgTimerWait,
        SUM_ROWS_EXAMINED AS rowsExamined,
        SUM_ROWS_SENT AS rowsSent,
        SUM_ERRORS AS errors,
        SUM_WARNINGS AS warnings,
        FIRST_SEEN AS firstSeen,
        LAST_SEEN AS lastSeen
      FROM performance_schema.events_statements_summary_by_digest
      WHERE SCHEMA_NAME = ? AND DIGEST_TEXT IS NOT NULL
      ORDER BY SUM_TIMER_WAIT DESC
      LIMIT 8
    `, [database]));
    return rows.map((row) => ({
      digestText: String(row.digestText ?? ''),
      count: numberValue(row.count),
      totalTimeSeconds: Number((numberValue(row.totalTimerWait) / 1_000_000_000_000).toFixed(3)),
      avgTimeSeconds: Number((numberValue(row.avgTimerWait) / 1_000_000_000_000).toFixed(6)),
      rowsExamined: numberValue(row.rowsExamined),
      rowsSent: numberValue(row.rowsSent),
      errors: numberValue(row.errors),
      warnings: numberValue(row.warnings),
      firstSeen: row.firstSeen instanceof Date ? row.firstSeen.toISOString() : nullableString(row.firstSeen),
      lastSeen: row.lastSeen instanceof Date ? row.lastSeen.toISOString() : nullableString(row.lastSeen)
    })).filter((row) => row.digestText);
  } catch {
    return [];
  }
}

function bufferPoolHitPercent(status: Record<string, string>) {
  const reads = numberValue(status.Innodb_buffer_pool_reads);
  const requests = numberValue(status.Innodb_buffer_pool_read_requests);
  if (requests <= 0) return null;
  return Math.max(0, Math.min(100, Number((((requests - reads) / requests) * 100).toFixed(2))));
}

export function createDatabasePerformanceReader(setupSettingsStore: SetupSettingsStore): DatabasePerformanceReader {
  return {
    async readSnapshot() {
      const settings = await setupSettingsStore.getDatabaseSettings();
      const generatedAt = new Date().toISOString();
      if (!settings) {
        return {
          configured: false,
          connected: false,
          database: null,
          generatedAt,
          error: 'Database settings have not been configured yet.',
          summary: emptySummary,
          server: emptyServer,
          topTables: [],
          queryDigests: []
        };
      }

      const client = createConnection(settings);
      try {
        const [summaryRows, tableRows, status, variables, queryDigests] = await Promise.all([
          client('information_schema.tables')
            .where('table_schema', settings.database)
            .select(client.raw('COUNT(*) AS tableCount'))
            .select(client.raw('COALESCE(SUM(table_rows), 0) AS estimatedRows'))
            .select(client.raw('COALESCE(SUM(data_length), 0) AS dataSizeBytes'))
            .select(client.raw('COALESCE(SUM(index_length), 0) AS indexSizeBytes'))
            .select(client.raw('COALESCE(SUM(data_free), 0) AS freeBytes')),
          client('information_schema.tables')
            .where('table_schema', settings.database)
            .select({ tableName: 'table_name', engine: 'engine', updatedAt: 'update_time' })
            .select(client.raw('COALESCE(table_rows, 0) AS rowEstimate'))
            .select(client.raw('COALESCE(data_length, 0) AS dataSizeBytes'))
            .select(client.raw('COALESCE(index_length, 0) AS indexSizeBytes'))
            .select(client.raw('COALESCE(data_free, 0) AS freeBytes'))
            .orderByRaw('(COALESCE(data_length, 0) + COALESCE(index_length, 0)) DESC')
            .limit(8),
          readStatus(client),
          readVariables(client),
          readQueryDigests(client, settings.database)
        ]);

        const summaryRow = summaryRows[0] as NumericRow | undefined;
        const dataSizeBytes = numberValue(summaryRow?.dataSizeBytes);
        const indexSizeBytes = numberValue(summaryRow?.indexSizeBytes);
        const freeBytes = numberValue(summaryRow?.freeBytes);

        return {
          configured: true,
          connected: true,
          database: settings.database,
          generatedAt,
          error: null,
          summary: {
            tableCount: numberValue(summaryRow?.tableCount),
            estimatedRows: numberValue(summaryRow?.estimatedRows),
            dataSizeBytes,
            indexSizeBytes,
            freeBytes,
            totalSizeBytes: dataSizeBytes + indexSizeBytes
          },
          server: {
            version: nullableString(variables.version),
            uptimeSeconds: nullableNumber(status.Uptime),
            maxConnections: nullableNumber(variables.max_connections),
            threadsConnected: nullableNumber(status.Threads_connected),
            maxUsedConnections: nullableNumber(status.Max_used_connections),
            slowQueries: nullableNumber(status.Slow_queries),
            longQueryTimeSeconds: nullableNumber(variables.long_query_time),
            questions: nullableNumber(status.Questions),
            abortedConnects: nullableNumber(status.Aborted_connects),
            bufferPoolReadHitPercent: bufferPoolHitPercent(status)
          },
          topTables: (tableRows as NumericRow[]).map((row) => {
            const rowDataSize = numberValue(row.dataSizeBytes);
            const rowIndexSize = numberValue(row.indexSizeBytes);
            return {
              tableName: String(row.tableName ?? ''),
              engine: nullableString(row.engine),
              rowEstimate: numberValue(row.rowEstimate),
              dataSizeBytes: rowDataSize,
              indexSizeBytes: rowIndexSize,
              freeBytes: numberValue(row.freeBytes),
              totalSizeBytes: rowDataSize + rowIndexSize,
              updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : nullableString(row.updatedAt)
            };
          }),
          queryDigests
        };
      } catch (error) {
        return {
          configured: true,
          connected: false,
          database: settings.database,
          generatedAt,
          error: error instanceof Error ? error.message : 'Unable to read database performance metrics.',
          summary: emptySummary,
          server: emptyServer,
          topTables: [],
          queryDigests: []
        };
      } finally {
        await client.destroy();
      }
    }
  };
}
