import type { AppConfig } from '../config/loadConfig.js';

export const QUEUE_NAMES = ['instance-checks', 'database-maintenance', 'system-maintenance'] as const;

export type QueueName = typeof QUEUE_NAMES[number];
export type QueueMode = 'disabled' | 'bullmq';

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type QueueStatusItem = QueueCounts & {
  name: QueueName;
  description: string;
};

export type QueueStatusSnapshot = {
  enabled: boolean;
  mode: QueueMode;
  generatedAt: string;
  redis: {
    configured: boolean;
    connected: boolean;
    host: string | null;
    port: number | null;
    error: string | null;
  };
  bullBoard: {
    enabled: boolean;
    path: string | null;
  };
  queues: QueueStatusItem[];
};

export type QueueJobState = 'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'unknown';

export type QueueJobSummary = {
  id: string | null;
  queue: QueueName;
  name: string;
  state: QueueJobState;
  attemptsMade: number;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string | null;
  data: {
    task?: string;
    source?: string;
    instanceId?: string;
    requestedBy?: string;
  };
};

export type QueueJobsSnapshot = {
  enabled: boolean;
  mode: QueueMode;
  generatedAt: string;
  jobs: QueueJobSummary[];
};

export type QueueStatusProvider = {
  readStatus(): Promise<QueueStatusSnapshot>;
  readJobs?(limit?: number): Promise<QueueJobsSnapshot>;
  close?(): Promise<void>;
};

export type QueueBoardRegistration = {
  basePath: string;
  plugin: unknown;
};

export type QueueRuntime = QueueStatusProvider & {
  bullBoard?: QueueBoardRegistration;
};

export type QueueConnectionOptions = {
  host: string;
  port: number;
  password?: string;
  tls?: object;
  maxRetriesPerRequest: null;
  enableOfflineQueue: false;
};

const DESCRIPTIONS: Record<QueueName, string> = {
  'instance-checks': 'Manual and scheduled OxyGen instance connectivity, license, settings, and workflow checks.',
  'database-maintenance': 'CMS MySQL maintenance jobs such as purge, analyze, optimize, backup, and restore.',
  'system-maintenance': 'Low-risk operational cleanup and retention jobs that do not belong to a domain queue.'
};

const JOB_TYPES = ['active', 'waiting', 'delayed', 'failed', 'completed'] as const;

function emptyQueue(name: QueueName): QueueStatusItem {
  return { name, description: DESCRIPTIONS[name], waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
}

function isoFromMillis(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

function truncate(value: string | undefined, maxLength = 240): string | null {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function safeJobData(data: unknown): QueueJobSummary['data'] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const payload = data as Record<string, unknown>;
  const safe: QueueJobSummary['data'] = {};
  if (typeof payload.task === 'string') safe.task = payload.task;
  if (typeof payload.source === 'string') safe.source = payload.source;
  if (typeof payload.instanceId === 'string') safe.instanceId = payload.instanceId;
  if (typeof payload.requestedBy === 'string') safe.requestedBy = payload.requestedBy;
  return safe;
}

function normalizeJobState(value: string): QueueJobState {
  return (JOB_TYPES as readonly string[]).includes(value) ? value as QueueJobState : 'unknown';
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

export function createDisabledQueueStatusProvider(): QueueStatusProvider {
  return {
    async readStatus(): Promise<QueueStatusSnapshot> {
      return {
        enabled: false,
        mode: 'disabled',
        generatedAt: new Date().toISOString(),
        redis: { configured: false, connected: false, host: null, port: null, error: null },
        bullBoard: { enabled: false, path: null },
        queues: QUEUE_NAMES.map(emptyQueue)
      };
    },
    async readJobs(): Promise<QueueJobsSnapshot> {
      return {
        enabled: false,
        mode: 'disabled',
        generatedAt: new Date().toISOString(),
        jobs: []
      };
    }
  };
}

export function createQueueConnectionOptions(config: AppConfig): QueueConnectionOptions | null {
  if (!config.queues.enabled || !config.queues.redis.host || !config.queues.redis.port) return null;
  return {
    host: config.queues.redis.host,
    port: config.queues.redis.port,
    password: config.queues.redis.password ?? undefined,
    tls: config.queues.redis.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false
  };
}

export async function createQueueRuntime(config: AppConfig): Promise<QueueRuntime> {
  const connection = createQueueConnectionOptions(config);
  if (!connection) {
    return createDisabledQueueStatusProvider();
  }

  const { Queue } = await import('bullmq');
  const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection }));

  const provider: QueueRuntime = {
    async readStatus(): Promise<QueueStatusSnapshot> {
      try {
        const counts = await Promise.all(queues.map(async (queue) => ({ queue, counts: await timeout(queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'), 1500, 'BullMQ queue count timed out') })));
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: new Date().toISOString(),
          redis: { configured: true, connected: true, host: config.queues.redis.host, port: config.queues.redis.port, error: null },
          bullBoard: { enabled: config.queues.bullBoard.enabled, path: config.queues.bullBoard.enabled ? config.queues.bullBoard.path : null },
          queues: counts.map(({ queue, counts }) => ({
            name: queue.name as QueueName,
            description: DESCRIPTIONS[queue.name as QueueName],
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
            completed: counts.completed ?? 0
          }))
        };
      } catch (error) {
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: new Date().toISOString(),
          redis: { configured: true, connected: false, host: config.queues.redis.host, port: config.queues.redis.port, error: error instanceof Error ? error.message : 'Unable to read Redis queue status' },
          bullBoard: { enabled: config.queues.bullBoard.enabled, path: config.queues.bullBoard.enabled ? config.queues.bullBoard.path : null },
          queues: QUEUE_NAMES.map(emptyQueue)
        };
      }
    },
    async readJobs(limit = 25): Promise<QueueJobsSnapshot> {
      const safeLimit = Math.min(Math.max(Math.trunc(limit) || 25, 1), 50);
      try {
        const jobsByQueue = await Promise.all(queues.map(async (queue) => {
          const jobs = await timeout(queue.getJobs([...JOB_TYPES], 0, safeLimit - 1, true), 1500, 'BullMQ job list timed out');
          const summaries = await Promise.all(jobs.map(async (job): Promise<QueueJobSummary> => ({
            id: job.id ? String(job.id) : null,
            queue: queue.name as QueueName,
            name: job.name,
            state: normalizeJobState(await job.getState()),
            attemptsMade: job.attemptsMade,
            timestamp: isoFromMillis(job.timestamp),
            processedOn: isoFromMillis(job.processedOn),
            finishedOn: isoFromMillis(job.finishedOn),
            failedReason: truncate(job.failedReason),
            data: safeJobData(job.data)
          })));
          return summaries;
        }));
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: new Date().toISOString(),
          jobs: jobsByQueue.flat().sort((left, right) => (right.timestamp ?? '').localeCompare(left.timestamp ?? '')).slice(0, safeLimit)
        };
      } catch {
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: new Date().toISOString(),
          jobs: []
        };
      }
    },
    async close() {
      await Promise.allSettled(queues.map((queue) => queue.close()));
    }
  };

  if (config.queues.bullBoard.enabled) {
    const [{ createBullBoard }, { BullMQAdapter }, { FastifyAdapter }] = await Promise.all([
      import('@bull-board/api'),
      import('@bull-board/api/bullMQAdapter'),
      import('@bull-board/fastify')
    ]);
    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath(config.queues.bullBoard.path);
    createBullBoard({ queues: queues.map((queue) => new BullMQAdapter(queue)), serverAdapter });
    provider.bullBoard = { basePath: config.queues.bullBoard.path, plugin: serverAdapter.registerPlugin() };
  }

  return provider;
}
