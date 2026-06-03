import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { basename, join } from 'node:path';
import { createInMemoryAuthRepository } from './auth/inMemoryAuthRepository.js';
import { createSetupAwareAuthRepository } from './auth/mysqlAuthRepository.js';
import { registerAuthRoutes } from './auth/registerAuthRoutes.js';
import type { AuthRepository } from './auth/types.js';
import { loadConfig } from './config/loadConfig.js';
import { createInMemoryInstanceRepository } from './instances/inMemoryInstanceRepository.js';
import { createSetupAwareInstanceRepository } from './instances/mysqlInstanceRepository.js';
import { registerInstanceRoutes } from './instances/registerInstanceRoutes.js';
import type { InstanceRepository } from './instances/types.js';
import { registerSetupRoutes } from './setup/registerSetupRoutes.js';
import { createMysqlDatabaseProvisioner, type DatabaseProvisioner } from './setup/databaseProvisioner.js';
import { createDefaultDeploymentConfig, type DeploymentConfig } from './setup/deploymentConfig.js';
import { createFileSetupSettingsStore, type SetupSettingsStore } from './setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider, type SetupStatusProvider } from './setup/setupStatus.js';

type BuildAppOptions = FastifyServerOptions & {
  authRepository?: AuthRepository;
  setupStatusProvider?: SetupStatusProvider;
  setupSettingsStore?: SetupSettingsStore;
  databaseProvisioner?: DatabaseProvisioner;
  deploymentConfig?: DeploymentConfig;
  instanceRepository?: InstanceRepository;
};

const defaultSettingsPath = basename(process.cwd()) === 'api'
  ? join(process.cwd(), 'data/settings.json')
  : join(process.cwd(), 'apps/api/data/settings.json');
const defaultFallbackAuthRepository = createInMemoryAuthRepository();
const defaultSetupSettingsStore = createFileSetupSettingsStore(defaultSettingsPath);
const defaultSetupStatusProvider = createFileSetupStatusProvider(defaultSetupSettingsStore);
const defaultDatabaseProvisioner = createMysqlDatabaseProvisioner();
const defaultDeploymentConfig = createDefaultDeploymentConfig();
const defaultInstanceRepository = createInMemoryInstanceRepository();

export async function buildApp(options: BuildAppOptions = {}) {
  const {
    setupSettingsStore = defaultSetupSettingsStore,
    setupStatusProvider = defaultSetupStatusProvider,
    databaseProvisioner = defaultDatabaseProvisioner,
    deploymentConfig = defaultDeploymentConfig,
    instanceRepository: providedInstanceRepository,
    ...fastifyOptions
  } = options;
  const authRepository = options.authRepository ?? createSetupAwareAuthRepository(setupSettingsStore, defaultFallbackAuthRepository);
  const instanceRepository = providedInstanceRepository ?? createSetupAwareInstanceRepository(setupSettingsStore, defaultInstanceRepository);
  const app = Fastify(fastifyOptions);
  const config = loadConfig();

  await app.register(helmet);
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  app.get('/api/health', async () => ({
    status: 'ok' as const,
    service: 'oxygen-cms-api' as const,
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  }));

  await registerSetupRoutes(app, authRepository, setupStatusProvider, setupSettingsStore, databaseProvisioner, deploymentConfig);
  await registerAuthRoutes(app, authRepository);
  await registerInstanceRoutes(app, authRepository, instanceRepository);

  return app;
}
