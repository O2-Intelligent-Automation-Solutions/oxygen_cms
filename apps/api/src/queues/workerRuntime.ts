import type { Job, Worker } from 'bullmq';
import type { AppConfig } from '../config/loadConfig.js';
import { QUEUE_NAMES, createQueueConnectionOptions, type QueueName } from './queueStatus.js';

export type QueueWorkerState = 'disabled' | 'running';

export type QueueWorkerRuntime = {
  state: QueueWorkerState;
  queueNames: QueueName[];
  close(): Promise<void>;
};

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

type WorkerConstructor = typeof Worker;

export async function createQueueWorkerRuntime(config: AppConfig, logger: Logger = console): Promise<QueueWorkerRuntime> {
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
  const workers = QUEUE_NAMES.map((queueName) => new (BullWorker as WorkerConstructor)(
    queueName,
    async (job: Job) => {
      throw new Error(`No processor registered for ${queueName}/${job.name}; worker bootstrap is installed but job execution processors are not implemented yet.`);
    },
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
