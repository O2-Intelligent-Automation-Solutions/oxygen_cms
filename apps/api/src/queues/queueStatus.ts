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
  queues: QueueStatusItem[];
};

export type QueueStatusProvider = {
  readStatus(): Promise<QueueStatusSnapshot>;
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

function emptyQueue(name: QueueName): QueueStatusItem {
  return { name, description: DESCRIPTIONS[name], waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
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
        queues: QUEUE_NAMES.map(emptyQueue)
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
          queues: QUEUE_NAMES.map(emptyQueue)
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
