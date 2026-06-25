import type { AppLogRepository } from '../appLogs/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';
import { QueueJobGuardError, QueueJobValidationError } from './retryPolicy.js';
import { summarizeSafeQueueJobResult } from './queueStatus.js';
import type { DatabaseBackupRunner } from './databaseBackupRunner.js';

const forbiddenPayloadKeys = ['password', 'secret', 'token', 'apiKey', 'connectionString', 'encryptedPassword', 'credential'] as const;

export type DatabaseMaintenanceTask = 'purge-logs' | 'prune-check-history' | 'analyze-tables' | 'optimize-tables' | 'backup-database';

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
  databaseBackupRunner?: DatabaseBackupRunner;
};

function assertSafePayload(data: Record<string, unknown>) {
  const lowerKeys = Object.keys(data).map((key) => key.toLowerCase());
  for (const forbidden of forbiddenPayloadKeys) {
    if (lowerKeys.includes(forbidden.toLowerCase())) {
      throw new QueueJobValidationError('Database maintenance job payloads must not contain credentials or secrets.');
    }
  }
}

const supportedTasks = new Set<DatabaseMaintenanceTask>(['purge-logs', 'prune-check-history', 'analyze-tables', 'optimize-tables', 'backup-database']);

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

async function appendDatabaseMaintenanceLog(appLogRepository: AppLogRepository | undefined, entry: { severity: 'Logging' | 'Warning' | 'Error'; task: DatabaseMaintenanceTask; message: string; requestedBy?: string; details?: unknown }) {
  if (!appLogRepository) return;
  await appLogRepository.append({
    type: 'Service',
    severity: entry.severity,
    source: 'CMS Queue Worker',
    userName: entry.requestedBy ?? null,
    tenantId: null,
    entityGuid: null,
    message: entry.message,
    details: {
      queue: 'database-maintenance',
      task: entry.task,
      requestedBy: entry.requestedBy ?? null,
      ...(entry.details && typeof entry.details === 'object' && !Array.isArray(entry.details) ? entry.details as Record<string, unknown> : {})
    }
  });
}

async function executeDatabaseMaintenanceJob(job: DatabaseMaintenanceJobData, { appLogRepository, appSettingsRepository, databaseMaintenanceRunner, databaseBackupRunner }: DatabaseMaintenanceProcessorOptions) {
  if (job.task === 'backup-database') {
    if (!databaseBackupRunner) throw new QueueJobGuardError('Database backup requires an explicit database backup runner.');
    return databaseBackupRunner.backupDatabase();
  }
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

export async function processDatabaseMaintenanceJob(options: DatabaseMaintenanceProcessorOptions & { data: unknown }) {
  const { data, appLogRepository } = options;
  const job = parseDatabaseMaintenanceJob(data);
  await appendDatabaseMaintenanceLog(appLogRepository, {
    severity: 'Logging',
    task: job.task,
    requestedBy: job.requestedBy,
    message: `Database maintenance job started: ${job.task}`
  });
  try {
    const result = await executeDatabaseMaintenanceJob(job, options);
    const summary = summarizeSafeQueueJobResult('database-maintenance', job.task, result);
    await appendDatabaseMaintenanceLog(appLogRepository, {
      severity: summary?.warningCount && summary.warningCount > 0 ? 'Warning' : 'Logging',
      task: job.task,
      requestedBy: job.requestedBy,
      message: `Database maintenance job completed: ${job.task}`,
      details: { result: summary ?? null }
    });
    return result;
  } catch (error) {
    await appendDatabaseMaintenanceLog(appLogRepository, {
      severity: 'Error',
      task: job.task,
      requestedBy: job.requestedBy,
      message: `Database maintenance job failed: ${job.task}`,
      details: { error: error instanceof Error ? error.message : 'Database maintenance job failed.' }
    });
    throw error;
  }
}
