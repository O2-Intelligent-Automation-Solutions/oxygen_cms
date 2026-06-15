import type { AppLogRepository } from '../appLogs/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';

const forbiddenPayloadKeys = ['password', 'secret', 'token', 'apiKey', 'connectionString', 'encryptedPassword', 'credential'] as const;

export type DatabaseMaintenanceJobData = {
  task: 'purge-logs';
  requestedBy?: string;
};

export type DatabaseMaintenanceProcessorOptions = {
  appLogRepository?: AppLogRepository;
  appSettingsRepository?: AppSettingsRepository;
};

function assertSafePayload(data: Record<string, unknown>) {
  const lowerKeys = Object.keys(data).map((key) => key.toLowerCase());
  for (const forbidden of forbiddenPayloadKeys) {
    if (lowerKeys.includes(forbidden.toLowerCase())) {
      throw new Error('Database maintenance job payloads must not contain credentials or secrets.');
    }
  }
}

function parseDatabaseMaintenanceJob(data: unknown): DatabaseMaintenanceJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid database-maintenance job payload.');
  }
  const payload = data as Record<string, unknown>;
  assertSafePayload(payload);
  if (payload.task !== 'purge-logs') {
    throw new Error(`Unsupported database-maintenance task: ${String(payload.task ?? 'unknown')}.`);
  }
  return { task: 'purge-logs', requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy : undefined };
}

export async function processDatabaseMaintenanceJob({ data, appLogRepository, appSettingsRepository }: DatabaseMaintenanceProcessorOptions & { data: unknown }) {
  const job = parseDatabaseMaintenanceJob(data);
  if (!appLogRepository || !appSettingsRepository) {
    throw new Error('Database maintenance worker dependencies are required.');
  }

  const retention = await appSettingsRepository.getLogRetention();
  const result = await appLogRepository.pruneOlderThan(retention.days);
  return { task: job.task, retention, ...result };
}
