import 'dotenv/config';
import { basename, join } from 'node:path';
import { createInMemoryAppLogRepository } from './appLogs/inMemoryAppLogRepository.js';
import { createSetupAwareAppLogRepository } from './appLogs/mysqlAppLogRepository.js';
import { createInMemoryAppSettingsRepository } from './appSettings/inMemoryAppSettingsRepository.js';
import { createSetupAwareAppSettingsRepository } from './appSettings/mysqlAppSettingsRepository.js';
import { loadConfig } from './config/loadConfig.js';
import { createInMemoryInstanceRepository } from './instances/inMemoryInstanceRepository.js';
import { createSetupAwareInstanceRepository } from './instances/mysqlInstanceRepository.js';
import { createQueueWorkerRuntime } from './queues/workerRuntime.js';
import { createSetupAwareDatabaseMaintenanceRunner } from './queues/databaseMaintenanceRunner.js';
import { createUpdateChecker } from './system/updateInfo.js';
import { createFileSetupSettingsStore } from './setup/fileSetupSettingsStore.js';

const settingsPath = basename(process.cwd()) === 'api'
  ? join(process.cwd(), 'data/settings.json')
  : join(process.cwd(), 'apps/api/data/settings.json');
const setupSettingsStore = createFileSetupSettingsStore(settingsPath);
const instanceRepository = createSetupAwareInstanceRepository(setupSettingsStore, createInMemoryInstanceRepository());
const appLogRepository = createSetupAwareAppLogRepository(setupSettingsStore, createInMemoryAppLogRepository());
const appSettingsRepository = createSetupAwareAppSettingsRepository(setupSettingsStore, createInMemoryAppSettingsRepository());
const databaseMaintenanceRunner = createSetupAwareDatabaseMaintenanceRunner(setupSettingsStore);

const config = loadConfig();
const updateChecker = createUpdateChecker();
const runtime = await createQueueWorkerRuntime(config, console, { instanceRepository, appLogRepository, appSettingsRepository, updateChecker, databaseMaintenanceRunner });

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
