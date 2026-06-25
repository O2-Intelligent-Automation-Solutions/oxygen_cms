import type { DatabaseMaintenanceTask } from './databaseMaintenanceProcessor.js';
import type { AppConfig } from '../config/loadConfig.js';
import { createQueueConnectionOptions } from './queueStatus.js';

export const DATABASE_MAINTENANCE_QUEUE_NAME = 'database-maintenance';

export type DatabaseMaintenanceQueue = {
  add(name: DatabaseMaintenanceTask, data: DatabaseMaintenanceQueueJobData, opts: DatabaseMaintenanceQueueJobOptions): Promise<{ id?: string } | unknown>;
};

export type DatabaseMaintenanceQueueJobData = {
  task: DatabaseMaintenanceTask;
  requestedBy?: string;
};

export type DatabaseMaintenanceQueueJobOptions = {
  jobId: string;
  attempts: number;
  removeOnComplete: number;
  removeOnFail: number;
};

const REMOVE_ON_COMPLETE = 100;
const REMOVE_ON_FAIL = 500;

export async function createDatabaseMaintenanceQueue(config: AppConfig): Promise<(DatabaseMaintenanceQueue & { close(): Promise<void> }) | null> {
  const connection = createQueueConnectionOptions(config);
  if (!connection) return null;
  const { Queue } = await import('bullmq');
  return new Queue(DATABASE_MAINTENANCE_QUEUE_NAME, { connection }) as DatabaseMaintenanceQueue & { close(): Promise<void> };
}

export async function enqueueDatabaseMaintenanceTask(queue: Pick<DatabaseMaintenanceQueue, 'add'>, task: DatabaseMaintenanceTask, requestedBy: string | undefined, now: Date = new Date()) {
  const job = await queue.add(task, { task, requestedBy }, {
    jobId: `${DATABASE_MAINTENANCE_QUEUE_NAME}:${task}:${now.toISOString()}`,
    attempts: 1,
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL
  });
  return { queued: true as const, queue: DATABASE_MAINTENANCE_QUEUE_NAME, jobId: typeof job === 'object' && job && 'id' in job ? String(job.id) : null, task };
}

export async function enqueueLogRetentionPurge(queue: Pick<DatabaseMaintenanceQueue, 'add'>, requestedBy: string | undefined, now: Date = new Date()) {
  return enqueueDatabaseMaintenanceTask(queue, 'purge-logs', requestedBy, now);
}
