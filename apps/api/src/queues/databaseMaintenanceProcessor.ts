import type { AppLogRepository } from '../appLogs/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';
import { QueueJobGuardError, QueueJobValidationError } from './retryPolicy.js';

const forbiddenPayloadKeys = ['password', 'secret', 'token', 'apiKey', 'connectionString', 'encryptedPassword', 'credential'] as const;

export type DatabaseMaintenanceTask = 'purge-logs' | 'prune-check-history' | 'analyze-tables' | 'optimize-tables';

export type DatabaseMaintenanceJobData = {
  task: DatabaseMaintenanceTask;
  requestedBy?: string;
};

export type DatabaseMaintenanceRunner = {
  analyzeTables(): Promise<{ task: 'analyze-tables'; tables: string[]; warnings?: string[] }>;
  optimizeTables(): Promise<{ task: 'optimize-tables'; tables: string[]; warnings?: string[] }>;
};

export type DatabaseMaintenanceProcessorOptions = {
  appLogRepository?: AppLogRepository;
  appSettingsRepository?: AppSettingsRepository;
  databaseMaintenanceRunner?: DatabaseMaintenanceRunner;
};

function assertSafePayload(data: Record<string, unknown>) {
  const lowerKeys = Object.keys(data).map((key) => key.toLowerCase());
  for (const forbidden of forbiddenPayloadKeys) {
    if (lowerKeys.includes(forbidden.toLowerCase())) {
      throw new QueueJobValidationError('Database maintenance job payloads must not contain credentials or secrets.');
    }
  }
}

const supportedTasks = new Set<DatabaseMaintenanceTask>(['purge-logs', 'prune-check-history', 'analyze-tables', 'optimize-tables']);

function parseDatabaseMaintenanceJob(data: unknown): DatabaseMaintenanceJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new QueueJobValidationError('Invalid database-maintenance job payload.');
  }
  const payload = data as Record<string, unknown>;
  assertSafePayload(payload);
  if (!supportedTasks.has(payload.task as DatabaseMaintenanceTask)) {
    throw new QueueJobValidationError(`Unsupported database-maintenance task: ${String(payload.task ?? 'unknown')}.`);
  }
  return { task: payload.task as DatabaseMaintenanceTask, requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy : undefined };
}

export async function processDatabaseMaintenanceJob({ data, appLogRepository, appSettingsRepository, databaseMaintenanceRunner }: DatabaseMaintenanceProcessorOptions & { data: unknown }) {
  const job = parseDatabaseMaintenanceJob(data);
  if (job.task === 'analyze-tables') {
    if (!databaseMaintenanceRunner) throw new QueueJobGuardError('Analyze tables requires an explicit database maintenance runner.');
    return databaseMaintenanceRunner.analyzeTables();
  }
  if (job.task === 'optimize-tables') {
    if (!databaseMaintenanceRunner) throw new QueueJobGuardError('Optimize tables requires an explicit database maintenance runner.');
    return databaseMaintenanceRunner.optimizeTables();
  }

  if (!appLogRepository || !appSettingsRepository) {
    throw new QueueJobGuardError('Database maintenance worker dependencies are required.');
  }

  const retention = await appSettingsRepository.getLogRetention();
  const result = await appLogRepository.pruneOlderThan(retention.days);
  return { task: job.task, retention, ...result };
}
