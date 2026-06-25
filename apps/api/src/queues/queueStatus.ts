import type { AppConfig } from '../config/loadConfig.js';
import type { QueueScheduleJobKey, QueueScheduleSettings, QueueScheduleJobSettings } from '../appSettings/types.js';

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

export type QueueJobState = 'scheduled' | 'waiting' | 'active' | 'delayed' | 'failed' | 'completed' | 'unknown';

export type QueueJobSummary = {
  id: string | null;
  queue: QueueName;
  name: string;
  state: QueueJobState;
  attemptsMade: number;
  queueSequence: number;
  nextProcessAt: string | null;
  timestamp: string | null;
  processedOn: string | null;
  finishedOn: string | null;
  failedReason: string | null;
  everySeconds?: number;
  iterationCount?: number;
  resource?: {
    phase: 'scheduled' | 'live' | 'retained' | 'unknown';
    ageSeconds: number | null;
    waitSeconds: number | null;
    durationMs: number | null;
    attemptCost: number;
  };
  result?: {
    task: string | null;
    tableCount: number | null;
    warningCount: number | null;
    artifactCount: number | null;
    summary: string | null;
  };
  data: {
    task?: string;
    source?: string;
    instanceId?: string;
    instanceName?: string;
    tenantId?: string | null;
    tenantName?: string | null;
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
  reconcileQueueSchedules?(settings: QueueScheduleSettings): Promise<void>;
  runScheduledJobNow?(key: QueueScheduleJobKey | string, requestedBy?: string): Promise<{ queued: true; key: QueueScheduleJobKey | string; jobId: string | null }>;
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

type BullMqJobSchedulerRecord = {
  key?: string;
  id?: string;
  name?: string;
  next?: number;
  every?: number;
  iterationCount?: number;
  template?: {
    data?: unknown;
  };
};

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

export function summarizeSafeQueueJobResult(queue: QueueName, jobName: string, value: unknown): QueueJobSummary['result'] | undefined {
  if (queue !== 'database-maintenance' || !value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  const task = typeof result.task === 'string' ? result.task : jobName;
  const tables = Array.isArray(result.tables) ? result.tables : null;
  const warnings = Array.isArray(result.warnings) ? result.warnings : null;
  const artifacts = result.artifacts && typeof result.artifacts === 'object' && !Array.isArray(result.artifacts) ? result.artifacts as Record<string, unknown> : null;
  const artifactCount = artifacts
    ? Object.values(artifacts).filter((artifact) => typeof artifact === 'string' && artifact.trim()).length
    : ['databaseDumpPath', 'appDataArchivePath', 'manifestPath'].filter((key) => typeof result[key] === 'string' && String(result[key]).trim()).length || null;
  const dumpBytes = typeof result.dumpBytes === 'number' && Number.isFinite(result.dumpBytes) ? result.dumpBytes : null;
  const appDataBytes = typeof result.appDataBytes === 'number' && Number.isFinite(result.appDataBytes) ? result.appDataBytes : null;
  const parts = [
    tables ? `${tables.length} table${tables.length === 1 ? '' : 's'}` : null,
    warnings ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : null,
    artifactCount !== null ? `${artifactCount} artifact${artifactCount === 1 ? '' : 's'}` : null,
    dumpBytes !== null ? `dump ${dumpBytes} bytes` : null,
    appDataBytes !== null ? `app data ${appDataBytes} bytes` : null
  ].filter(Boolean);
  return {
    task,
    tableCount: tables ? tables.length : null,
    warningCount: warnings ? warnings.length : null,
    artifactCount,
    summary: parts.length ? parts.join(' · ') : null
  };
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

function queueStateRank(state: QueueJobState): number {
  if (state === 'active') return 0;
  if (state === 'scheduled') return 1;
  if (state === 'waiting') return 2;
  if (state === 'delayed') return 3;
  if (state === 'failed') return 4;
  if (state === 'completed') return 5;
  return 6;
}

function nextProcessMillis(job: { state: QueueJobState; timestamp: number | undefined; processedOn?: number; finishedOn?: number; delay?: number }): number | null {
  if (job.state === 'active') return job.processedOn ?? job.timestamp ?? Date.now();
  if (job.state === 'waiting') return job.timestamp ?? null;
  if (job.state === 'delayed') return typeof job.timestamp === 'number' ? job.timestamp + (typeof job.delay === 'number' ? job.delay : 0) : null;
  return job.finishedOn ?? job.processedOn ?? job.timestamp ?? null;
}

function queueJobPhase(state: QueueJobState): NonNullable<QueueJobSummary['resource']>['phase'] {
  if (state === 'scheduled') return 'scheduled';
  if (state === 'active' || state === 'waiting' || state === 'delayed') return 'live';
  if (state === 'failed' || state === 'completed') return 'retained';
  return 'unknown';
}

function secondsBetween(later: number | null | undefined, earlier: number | null | undefined): number | null {
  if (typeof later !== 'number' || typeof earlier !== 'number') return null;
  if (!Number.isFinite(later) || !Number.isFinite(earlier) || later < earlier) return null;
  return Math.round((later - earlier) / 1000);
}

function durationMs(processedOn: number | undefined, finishedOn: number | undefined): number | null {
  if (typeof processedOn !== 'number' || typeof finishedOn !== 'number') return null;
  if (!Number.isFinite(processedOn) || !Number.isFinite(finishedOn) || finishedOn < processedOn) return null;
  return finishedOn - processedOn;
}

function resourceMetrics(input: { state: QueueJobState; timestamp?: number; processedOn?: number; finishedOn?: number; nextProcessAt?: number | null; attemptsMade?: number }, now = Date.now()): NonNullable<QueueJobSummary['resource']> {
  const state = input.state;
  const ageBase = input.timestamp ?? input.processedOn ?? input.finishedOn ?? null;
  const waitUntil = state === 'scheduled' || state === 'delayed' ? input.nextProcessAt ?? null : null;
  return {
    phase: queueJobPhase(state),
    ageSeconds: secondsBetween(now, ageBase),
    waitSeconds: waitUntil ? secondsBetween(waitUntil, now) : null,
    durationMs: durationMs(input.processedOn, input.finishedOn),
    attemptCost: Math.max(0, Math.trunc(input.attemptsMade ?? 0))
  };
}

function compareQueueJobs(left: QueueJobSummary, right: QueueJobSummary): number {
  const rank = queueStateRank(left.state) - queueStateRank(right.state);
  if (rank !== 0) return rank;
  const leftNext = left.nextProcessAt ? Date.parse(left.nextProcessAt) : Number.POSITIVE_INFINITY;
  const rightNext = right.nextProcessAt ? Date.parse(right.nextProcessAt) : Number.POSITIVE_INFINITY;
  if (leftNext !== rightNext) return leftNext - rightNext;
  return (left.timestamp ?? '').localeCompare(right.timestamp ?? '');
}

function applyQueueSequence(jobs: QueueJobSummary[]): QueueJobSummary[] {
  return [...jobs].sort(compareQueueJobs).map((job, index) => ({ ...job, queueSequence: index + 1 }));
}

function schedulerIdForSchedule(job: Pick<QueueScheduleJobSettings, 'key'>) {
  return `scheduled:${job.key}`;
}

function queueForScheduleKey(key: QueueScheduleJobKey | string): QueueName {
  if (key.startsWith('instance-check:')) return 'instance-checks';
  return key.split(':')[0] as QueueName;
}

function nameForScheduleKey(key: QueueScheduleJobKey | string) {
  if (key.startsWith('instance-check:')) return 'manual-instance-check';
  return key.split(':')[1] ?? key;
}

function payloadForScheduleJob(job: QueueScheduleJobSettings, source: 'scheduled' | 'manual', requestedBy?: string) {
  return {
    task: job.name,
    source,
    requestedBy
  };
}

function schedulerToQueueJob(queue: QueueName, scheduler: BullMqJobSchedulerRecord): QueueJobSummary {
  const data = safeJobData(scheduler.template?.data);
  const everyMs = typeof scheduler.every === 'number' && Number.isFinite(scheduler.every) ? scheduler.every : null;
  const iterationCount = typeof scheduler.iterationCount === 'number' && Number.isFinite(scheduler.iterationCount) ? scheduler.iterationCount : null;
  const next = typeof scheduler.next === 'number' && Number.isFinite(scheduler.next) ? scheduler.next : null;
  return {
    id: scheduler.key ?? scheduler.id ?? null,
    queue,
    name: scheduler.name ?? 'scheduled-instance-check',
    state: 'scheduled',
    attemptsMade: 0,
    queueSequence: 0,
    nextProcessAt: isoFromMillis(next ?? undefined),
    timestamp: null,
    processedOn: null,
    finishedOn: null,
    failedReason: null,
    ...(everyMs ? { everySeconds: Math.round(everyMs / 1000) } : {}),
    ...(iterationCount !== null ? { iterationCount } : {}),
    resource: resourceMetrics({ state: 'scheduled', nextProcessAt: next, attemptsMade: 0 }),
    data: {
      ...data,
      requestedBy: data.requestedBy
    }
  };
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
  const queueByName = new Map(queues.map((queue) => [queue.name as QueueName, queue]));

  async function removeScheduler(queueName: QueueName, schedulerId: string) {
    const queue = queueByName.get(queueName);
    if (!queue) return;
    if (typeof queue.removeJobScheduler === 'function') await queue.removeJobScheduler(schedulerId);
  }

  async function upsertScheduler(job: QueueScheduleJobSettings) {
    const queue = queueByName.get(job.queue);
    if (!queue) return;
    await queue.upsertJobScheduler(schedulerIdForSchedule(job), { every: job.everySeconds * 1000, immediately: false }, {
      name: job.name,
      data: payloadForScheduleJob(job, 'scheduled'),
      opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 50 }
    });
  }

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
    async readJobs(limit = 500): Promise<QueueJobsSnapshot> {
      const safeLimit = Math.min(Math.max(Math.trunc(limit) || 500, 1), 1000);
      try {
        const scheduledJobsByQueue = await Promise.all(queues.map(async (queue) => {
          if (typeof queue.getJobSchedulers !== 'function') return [] as QueueJobSummary[];
          const schedulers = await timeout(queue.getJobSchedulers(0, safeLimit - 1, true), 1500, 'BullMQ scheduler list timed out') as BullMqJobSchedulerRecord[];
          return schedulers.map((scheduler) => schedulerToQueueJob(queue.name as QueueName, scheduler));
        }));
        const activeJobsByQueue = await Promise.all(queues.map(async (queue) => {
          const jobs = await timeout(queue.getJobs(['active'], 0, safeLimit - 1, true), 1500, 'BullMQ active job list timed out');
          const summaries = await Promise.all(jobs.map(async (job): Promise<QueueJobSummary> => {
            const state = normalizeJobState(await job.getState());
            return {
              id: job.id ? String(job.id) : null,
              queue: queue.name as QueueName,
              name: job.name,
              state,
              attemptsMade: job.attemptsMade,
              queueSequence: 0,
              nextProcessAt: null,
              timestamp: isoFromMillis(job.timestamp),
              processedOn: isoFromMillis(job.processedOn),
              finishedOn: isoFromMillis(job.finishedOn),
              failedReason: truncate(job.failedReason),
              resource: resourceMetrics({ state, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, nextProcessAt: nextProcessMillis({ state, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, delay: job.delay }), attemptsMade: job.attemptsMade }),
              result: summarizeSafeQueueJobResult(queue.name as QueueName, job.name, job.returnvalue),
              data: safeJobData(job.data)
            };
          }));
          return summaries;
        }));
        const scheduledJobs = scheduledJobsByQueue.flat();
        const activeJobs = activeJobsByQueue.flat();
        if (scheduledJobs.length > 0 || activeJobs.length > 0) {
          return {
            enabled: true,
            mode: 'bullmq',
            generatedAt: new Date().toISOString(),
            jobs: applyQueueSequence([...activeJobs, ...scheduledJobs]).slice(0, safeLimit)
          };
        }

        const jobsByQueue = await Promise.all(queues.map(async (queue) => {
          const jobs = await timeout(queue.getJobs([...JOB_TYPES], 0, safeLimit - 1, true), 1500, 'BullMQ job list timed out');
          const summaries = await Promise.all(jobs.map(async (job): Promise<QueueJobSummary> => {
            const state = normalizeJobState(await job.getState());
            return {
              id: job.id ? String(job.id) : null,
              queue: queue.name as QueueName,
              name: job.name,
              state,
              attemptsMade: job.attemptsMade,
              queueSequence: 0,
              nextProcessAt: isoFromMillis(nextProcessMillis({ state, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, delay: job.delay }) ?? undefined),
              timestamp: isoFromMillis(job.timestamp),
              processedOn: isoFromMillis(job.processedOn),
              finishedOn: isoFromMillis(job.finishedOn),
              failedReason: truncate(job.failedReason),
              resource: resourceMetrics({ state, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, nextProcessAt: nextProcessMillis({ state, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn, delay: job.delay }), attemptsMade: job.attemptsMade }),
              result: summarizeSafeQueueJobResult(queue.name as QueueName, job.name, job.returnvalue),
              data: safeJobData(job.data)
            };
          }));
          return summaries;
        }));
        return {
          enabled: true,
          mode: 'bullmq',
          generatedAt: new Date().toISOString(),
          jobs: applyQueueSequence(jobsByQueue.flat()).slice(0, safeLimit)
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
    async reconcileQueueSchedules(settings: QueueScheduleSettings) {
      await Promise.all(settings.jobs.map(async (job) => {
        const schedulerId = schedulerIdForSchedule(job);
        if (job.enabled) await upsertScheduler(job);
        else await removeScheduler(job.queue, schedulerId);
      }));
    },
    async runScheduledJobNow(key: QueueScheduleJobKey, requestedBy?: string) {
      const queueName = queueForScheduleKey(key);
      const queue = queueByName.get(queueName);
      if (!queue) throw new Error(`Queue ${queueName} is not available.`);
      const jobName = nameForScheduleKey(key);
      const jobId = `manual:${key}:${Date.now()}`;
      const data = key.startsWith('instance-check:') ? { instanceId: key.slice('instance-check:'.length), source: 'manual' } : { task: jobName, source: 'manual', requestedBy };
      const job = await queue.add(jobName, data, { jobId, priority: 1, attempts: 1, removeOnComplete: 100, removeOnFail: 50, lifo: false });
      return { queued: true as const, key, jobId: job.id ? String(job.id) : null };
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
