import type { Queue } from 'bullmq';
import type { QueueName } from './queueStatus.js';
import type { UpdateChecker } from '../system/updateInfo.js';

export type SystemMaintenanceTask = 'check-application-updates' | 'prune-queue-history';

export type SystemMaintenanceJobData = {
  task: SystemMaintenanceTask;
  source?: string;
  requestedBy?: string;
};

export type SystemMaintenanceProcessorOptions = {
  updateChecker?: UpdateChecker;
  queues?: Array<Queue<unknown, unknown, string>>;
};

const forbiddenPayloadKeys = ['password', 'secret', 'token', 'apiKey', 'connectionString', 'encryptedPassword', 'credential'] as const;

function assertSafePayload(data: Record<string, unknown>) {
  const lowerKeys = Object.keys(data).map((key) => key.toLowerCase());
  for (const forbidden of forbiddenPayloadKeys) {
    if (lowerKeys.includes(forbidden.toLowerCase())) throw new Error('System maintenance job payloads must not contain credentials or secrets.');
  }
}

function parseSystemMaintenanceJob(data: unknown): SystemMaintenanceJobData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid system-maintenance job payload.');
  const payload = data as Record<string, unknown>;
  assertSafePayload(payload);
  if (payload.task !== 'check-application-updates' && payload.task !== 'prune-queue-history') throw new Error(`Unsupported system-maintenance task: ${String(payload.task ?? 'unknown')}.`);
  return {
    task: payload.task,
    source: typeof payload.source === 'string' ? payload.source : undefined,
    requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy : undefined
  };
}

export async function processSystemMaintenanceJob({ data, updateChecker, queues = [] }: SystemMaintenanceProcessorOptions & { data: unknown }) {
  const job = parseSystemMaintenanceJob(data);
  if (job.task === 'check-application-updates') {
    if (!updateChecker) throw new Error('Update checker dependency is required.');
    const version = await updateChecker.getVersionSnapshot();
    return { task: job.task, updateAvailable: version.update.available, currentVersion: version.update.currentVersion, latestVersion: version.update.latestVersion };
  }

  const cleaned = await Promise.all(queues.map(async (queue) => {
    const completed = await queue.clean(24 * 60 * 60 * 1000, 100, 'completed');
    const failed = await queue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');
    return { queue: queue.name as QueueName, completed: completed.length, failed: failed.length };
  }));
  return { task: job.task, cleaned };
}
