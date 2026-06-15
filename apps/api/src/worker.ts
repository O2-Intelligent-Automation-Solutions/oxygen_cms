import 'dotenv/config';
import { loadConfig } from './config/loadConfig.js';
import { createQueueWorkerRuntime } from './queues/workerRuntime.js';

const config = loadConfig();
const runtime = await createQueueWorkerRuntime(config);

if (runtime.state === 'disabled') {
  process.exit(0);
}

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; stopping BullMQ workers...`);
  try {
    await runtime.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to stop BullMQ workers cleanly', error);
    process.exit(1);
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
console.info(`BullMQ workers running for queues: ${runtime.queueNames.join(', ')}`);
