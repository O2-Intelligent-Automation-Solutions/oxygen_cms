import type { AppConfig } from '../config/loadConfig.js';
import type { InstanceRepository, OxyGenInstance } from '../instances/types.js';
import { createQueueConnectionOptions } from './queueStatus.js';

export const INSTANCE_CHECK_QUEUE_NAME = 'instance-checks';
export type InstanceCheckQueueScheduler = {
  upsertJobScheduler(id: string, repeatOptions: InstanceCheckRepeatOptions, jobTemplate: InstanceCheckJobTemplate): Promise<unknown>;
  removeJobScheduler(id: string): Promise<unknown>;
  getJobSchedulers(): Promise<Array<{ id?: string; key?: string; name?: string }>>;
  add(name: 'manual-instance-check', data: InstanceCheckManualJobData, opts: InstanceCheckManualJobOptions): Promise<unknown>;
};

export type InstanceCheckManualJobData = {
  instanceId: string;
  source: 'manual';
};

export type InstanceCheckManualJobOptions = {
  jobId: string;
  priority: number;
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
  removeOnComplete: number;
  removeOnFail: number;
};

export type InstanceCheckRepeatOptions = {
  every: number;
  immediately?: boolean;
  offset?: number;
};

export type InstanceCheckJobTemplate = {
  name: 'scheduled-instance-check';
  data: {
    instanceId: string;
    source: 'scheduled';
  };
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
    removeOnComplete: number;
    removeOnFail: number;
  };
};

export type ReconcileInstanceCheckSchedulesOptions = {
  repository: InstanceRepository;
  queue: InstanceCheckQueueScheduler;
  minimumIntervalSeconds?: number;
  jitterSeed?: string;
};

export type ReconcileInstanceCheckSchedulesResult = {
  upserted: number;
  removed: number;
  skipped: number;
};

const DEFAULT_MINIMUM_INTERVAL_SECONDS = 60;
const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_MS = 30_000;
const REMOVE_ON_COMPLETE = 100;
const REMOVE_ON_FAIL = 500;
const SCHEDULER_PREFIX = 'instance-check:';
const MANUAL_PRIORITY = 1;

export function instanceCheckSchedulerId(instanceId: string) {
  return `${SCHEDULER_PREFIX}${instanceId}`;
}

function schedulerRecordId(record: { id?: string; key?: string; name?: string }) {
  return record.id ?? record.key ?? record.name ?? null;
}

function isSchedulable(instance: OxyGenInstance) {
  return instance.isEnabled && !instance.archived;
}

function intervalMs(instance: OxyGenInstance, minimumIntervalSeconds: number) {
  return Math.max(minimumIntervalSeconds, instance.pollingIntervalSeconds) * 1000;
}

function compareInstancesForSchedule(left: OxyGenInstance, right: OxyGenInstance) {
  return (left.tenantId ?? '').localeCompare(right.tenantId ?? '') || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function instancesByInterval(instances: OxyGenInstance[], minimumIntervalSeconds: number) {
  return instances.reduce((groups, instance) => {
    const every = intervalMs(instance, minimumIntervalSeconds);
    const group = groups.get(every) ?? [];
    group.push(instance);
    groups.set(every, group);
    return groups;
  }, new Map<number, OxyGenInstance[]>());
}

function staggerOffsetsByInstance(instances: OxyGenInstance[], minimumIntervalSeconds: number) {
  const offsets = new Map<string, { every: number; offset: number }>();
  for (const [every, group] of Array.from(instancesByInterval(instances, minimumIntervalSeconds).entries())) {
    const orderedGroup = [...group].sort(compareInstancesForSchedule);
    const slotSize = every / Math.max(orderedGroup.length, 1);
    orderedGroup.forEach((instance, index) => {
      offsets.set(instance.id, { every, offset: Math.floor(index * slotSize) });
    });
  }
  return offsets;
}

function scheduledJobTemplate(instance: OxyGenInstance): InstanceCheckJobTemplate {
  return {
    name: 'scheduled-instance-check',
    data: {
      instanceId: instance.id,
      source: 'scheduled'
    },
    opts: {
      jobId: `${instanceCheckSchedulerId(instance.id)}:scheduled`,
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
      removeOnComplete: REMOVE_ON_COMPLETE,
      removeOnFail: REMOVE_ON_FAIL
    }
  };
}

export async function createInstanceCheckQueueScheduler(config: AppConfig): Promise<(InstanceCheckQueueScheduler & { close(): Promise<void> }) | null> {
  const connection = createQueueConnectionOptions(config);
  if (!connection) return null;
  const { Queue } = await import('bullmq');
  const queue = new Queue(INSTANCE_CHECK_QUEUE_NAME, { connection });
  return queue as InstanceCheckQueueScheduler & { close(): Promise<void> };
}

export async function enqueueImmediateInstanceCheck(queue: Pick<InstanceCheckQueueScheduler, 'add'>, instanceId: string, now: Date = new Date()) {
  return queue.add('manual-instance-check', { instanceId, source: 'manual' }, {
    jobId: `${instanceCheckSchedulerId(instanceId)}:manual:${now.toISOString()}`,
    priority: MANUAL_PRIORITY,
    attempts: JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: JOB_BACKOFF_MS },
    removeOnComplete: REMOVE_ON_COMPLETE,
    removeOnFail: REMOVE_ON_FAIL
  });
}

export async function reconcileInstanceCheckSchedules(options: ReconcileInstanceCheckSchedulesOptions): Promise<ReconcileInstanceCheckSchedulesResult> {
  const minimumIntervalSeconds = options.minimumIntervalSeconds ?? DEFAULT_MINIMUM_INTERVAL_SECONDS;
  const instances = await options.repository.listInstances({ includeAll: true, includeArchived: true });
  const activeInstances = instances.filter(isSchedulable);
  const staggeredSchedules = staggerOffsetsByInstance(activeInstances, minimumIntervalSeconds);
  const activeSchedulerIds = new Set(activeInstances.map((instance) => instanceCheckSchedulerId(instance.id)));
  const existingSchedulers = await options.queue.getJobSchedulers();
  const existingSchedulerIds = new Set(existingSchedulers.map(schedulerRecordId).filter((id): id is string => Boolean(id?.startsWith(SCHEDULER_PREFIX))));

  let upserted = 0;
  let removed = 0;

  for (const instance of activeInstances) {
    const schedule = staggeredSchedules.get(instance.id) ?? { every: intervalMs(instance, minimumIntervalSeconds), offset: 0 };
    await options.queue.upsertJobScheduler(instanceCheckSchedulerId(instance.id), { every: schedule.every, offset: schedule.offset, immediately: false }, scheduledJobTemplate(instance));
    upserted += 1;
  }

  const inactiveInstanceSchedulerIds = instances
    .filter((instance) => !isSchedulable(instance))
    .map((instance) => instanceCheckSchedulerId(instance.id));
  const staleSchedulerIds = Array.from(existingSchedulerIds).filter((id) => !activeSchedulerIds.has(id));
  const schedulerIdsToRemove = new Set([...inactiveInstanceSchedulerIds, ...staleSchedulerIds].filter((id) => existingSchedulerIds.has(id)));

  for (const schedulerId of Array.from(schedulerIdsToRemove)) {
    await options.queue.removeJobScheduler(schedulerId);
    removed += 1;
  }

  return { upserted, removed, skipped: instances.length - activeInstances.length };
}
