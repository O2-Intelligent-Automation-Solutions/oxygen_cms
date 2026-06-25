import type { Job, Queue, Worker } from 'bullmq';
import type { AppLogRepository } from '../appLogs/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';
import type { AppConfig } from '../config/loadConfig.js';
import type { InstanceRepository } from '../instances/types.js';
import { processDatabaseMaintenanceJob, type DatabaseMaintenanceRunner } from './databaseMaintenanceProcessor.js';
import { createInMemoryInstanceCheckRunGuard, processInstanceCheckJob, type InstanceCheckRunGuard } from './instanceCheckProcessor.js';
import { processSystemMaintenanceJob } from './systemMaintenanceProcessor.js';
import { QUEUE_NAMES, createQueueConnectionOptions, type QueueName } from './queueStatus.js';
import { classifyQueueFailure } from './retryPolicy.js';
import type { UpdateChecker } from '../system/updateInfo.js';

export type QueueWorkerState = 'disabled' | 'running';

export type QueueWorkerRuntime = {
  state: QueueWorkerState;
  queueNames: QueueName[];
  close(): Promise<void>;
};

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

type WorkerConstructor = typeof Worker;

type DatabaseMaintenanceJobSummary = {
  task?: unknown;
  tables?: unknown;
  warnings?: unknown;
};

function summarizeCompletedJob(queueName: string, jobName: string, returnValue: unknown) {
  if (queueName !== 'database-maintenance' || !returnValue || typeof returnValue !== 'object') return `BullMQ job completed in ${queueName}: ${jobName}`;
  const result = returnValue as DatabaseMaintenanceJobSummary;
  const tableCount = Array.isArray(result.tables) ? result.tables.length : 0;
  const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;
  const task = typeof result.task === 'string' ? result.task : jobName;
  return `BullMQ job completed in ${queueName}: ${task} [tables=${tableCount}; warnings=${warningCount}]`;
}

export type QueueJobProcessorOptions = {
  instanceRepository: InstanceRepository;
  appLogRepository?: AppLogRepository;
  appSettingsRepository?: AppSettingsRepository;
  updateChecker?: UpdateChecker;
  databaseMaintenanceRunner?: DatabaseMaintenanceRunner;
  queues?: Array<Queue<unknown, unknown, string>>;
  instanceCheckRunGuard?: InstanceCheckRunGuard;
};

export type QueueWorkerRuntimeOptions = QueueJobProcessorOptions;

export function createQueueJobProcessor(options: QueueJobProcessorOptions) {
  return async (queueName: QueueName, data: unknown) => {
    if (queueName === 'instance-checks') {
      return processInstanceCheckJob({
        data: data as Parameters<typeof processInstanceCheckJob>[0]['data'],
        repository: options.instanceRepository,
        appLogRepository: options.appLogRepository,
        runGuard: options.instanceCheckRunGuard
      });
    }

    if (queueName === 'database-maintenance') {
      return processDatabaseMaintenanceJob({
        data,
        appLogRepository: options.appLogRepository,
        appSettingsRepository: options.appSettingsRepository,
        databaseMaintenanceRunner: options.databaseMaintenanceRunner
      });
    }

    if (queueName === 'system-maintenance') {
      return processSystemMaintenanceJob({
        data,
        updateChecker: options.updateChecker,
        queues: options.queues
      });
    }

    throw new Error(`No processor registered for ${queueName}; job execution for this queue is not implemented yet.`);
  };
}

export async function createQueueWorkerRuntime(config: AppConfig, logger: Logger = console, options?: QueueWorkerRuntimeOptions): Promise<QueueWorkerRuntime> {
  const connection = createQueueConnectionOptions(config);
  if (!connection) {
    logger.info('BullMQ worker disabled; BULLMQ_ENABLED/REDIS_HOST/REDIS_PORT are not fully configured.');
    return {
      state: 'disabled',
      queueNames: [],
      async close() {}
    };
  }

  const { Worker: BullWorker, Queue: BullQueue } = await import('bullmq');
  if (!options) throw new Error('BullMQ worker dependencies are required when BULLMQ_ENABLED=true.');
  const maintenanceQueues = QUEUE_NAMES.map((queueName) => new BullQueue(queueName, { connection }) as Queue<unknown, unknown, string>);
  const processQueueJob = createQueueJobProcessor({ ...options, queues: options.queues ?? maintenanceQueues, instanceCheckRunGuard: options.instanceCheckRunGuard ?? createInMemoryInstanceCheckRunGuard() });
  const workers = QUEUE_NAMES.map((queueName) => new (BullWorker as WorkerConstructor)(
    queueName,
    async (job: Job) => processQueueJob(queueName, job.data),
    { connection }
  ));

  for (const worker of workers) {
    worker.on('ready', () => logger.info(`BullMQ worker ready for queue ${worker.name}`));
    worker.on('completed', (job) => logger.info(summarizeCompletedJob(worker.name, job.name ?? 'unknown', (job as Job).returnvalue)));
    worker.on('failed', (job, error) => {
      const policy = classifyQueueFailure(error);
      logger.warn(`BullMQ job failed in ${worker.name}: ${job?.name ?? 'unknown'} [${policy.failureClass}; retryable=${policy.retryable ? 'yes' : 'no'}] ${error.message}`);
    });
    worker.on('error', (error) => logger.error(`BullMQ worker error in ${worker.name}: ${error.message}`));
  }

  return {
    state: 'running',
    queueNames: [...QUEUE_NAMES],
    async close() {
      await Promise.all([...workers.map((worker) => worker.close()), ...maintenanceQueues.map((queue) => queue.close())]);
    }
  };
}
