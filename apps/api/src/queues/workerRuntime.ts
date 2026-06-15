import type { Job, Worker } from 'bullmq';
import type { AppLogRepository } from '../appLogs/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';
import type { AppConfig } from '../config/loadConfig.js';
import type { InstanceRepository } from '../instances/types.js';
import { processDatabaseMaintenanceJob } from './databaseMaintenanceProcessor.js';
import { processInstanceCheckJob } from './instanceCheckProcessor.js';
import { QUEUE_NAMES, createQueueConnectionOptions, type QueueName } from './queueStatus.js';

export type QueueWorkerState = 'disabled' | 'running';

export type QueueWorkerRuntime = {
  state: QueueWorkerState;
  queueNames: QueueName[];
  close(): Promise<void>;
};

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

type WorkerConstructor = typeof Worker;

export type QueueJobProcessorOptions = {
  instanceRepository: InstanceRepository;
  appLogRepository?: AppLogRepository;
  appSettingsRepository?: AppSettingsRepository;
};

export type QueueWorkerRuntimeOptions = QueueJobProcessorOptions;

export function createQueueJobProcessor(options: QueueJobProcessorOptions) {
  return async (queueName: QueueName, data: unknown) => {
    if (queueName === 'instance-checks') {
      return processInstanceCheckJob({
        data: data as Parameters<typeof processInstanceCheckJob>[0]['data'],
        repository: options.instanceRepository,
        appLogRepository: options.appLogRepository
      });
    }

    if (queueName === 'database-maintenance') {
      return processDatabaseMaintenanceJob({
        data,
        appLogRepository: options.appLogRepository,
        appSettingsRepository: options.appSettingsRepository
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

  const { Worker: BullWorker } = await import('bullmq');
  if (!options) throw new Error('BullMQ worker dependencies are required when BULLMQ_ENABLED=true.');
  const processQueueJob = createQueueJobProcessor(options);
  const workers = QUEUE_NAMES.map((queueName) => new (BullWorker as WorkerConstructor)(
    queueName,
    async (job: Job) => processQueueJob(queueName, job.data),
    { connection }
  ));

  for (const worker of workers) {
    worker.on('ready', () => logger.info(`BullMQ worker ready for queue ${worker.name}`));
    worker.on('failed', (job, error) => logger.warn(`BullMQ job failed in ${worker.name}: ${job?.name ?? 'unknown'} ${error.message}`));
    worker.on('error', (error) => logger.error(`BullMQ worker error in ${worker.name}: ${error.message}`));
  }

  return {
    state: 'running',
    queueNames: [...QUEUE_NAMES],
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
    }
  };
}
