import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { basename, join } from 'node:path';
import { createInMemoryAppLogRepository } from './appLogs/inMemoryAppLogRepository.js';
import { createSetupAwareAppLogRepository } from './appLogs/mysqlAppLogRepository.js';
import { registerAppLogRoutes } from './appLogs/registerAppLogRoutes.js';
import type { AppLogRepository } from './appLogs/types.js';
import { createInMemoryAppSettingsRepository } from './appSettings/inMemoryAppSettingsRepository.js';
import { createSetupAwareAppSettingsRepository } from './appSettings/mysqlAppSettingsRepository.js';
import { registerAppSettingsRoutes } from './appSettings/registerAppSettingsRoutes.js';
import type { AppSettingsRepository } from './appSettings/types.js';
import { createInMemoryAuthRepository } from './auth/inMemoryAuthRepository.js';
import { createSetupAwareAuthRepository } from './auth/mysqlAuthRepository.js';
import { registerAuthRoutes } from './auth/registerAuthRoutes.js';
import type { AuthRepository } from './auth/types.js';
import { loadConfig } from './config/loadConfig.js';
import { registerDashboardRoutes } from './dashboard/registerDashboardRoutes.js';
import { createInMemoryGridPreferenceRepository } from './gridPreferences/inMemoryGridPreferenceRepository.js';
import { createSetupAwareGridPreferenceRepository } from './gridPreferences/mysqlGridPreferenceRepository.js';
import { registerGridPreferenceRoutes } from './gridPreferences/registerGridPreferenceRoutes.js';
import type { GridPreferenceRepository } from './gridPreferences/types.js';
import { createInMemoryInstanceRepository } from './instances/inMemoryInstanceRepository.js';
import { createInstancePoller, type InstancePoller } from './instances/instancePoller.js';
import { createSetupAwareInstanceRepository } from './instances/mysqlInstanceRepository.js';
import { registerInstanceRoutes } from './instances/registerInstanceRoutes.js';
import type { InstanceRepository } from './instances/types.js';
import { registerSetupRoutes } from './setup/registerSetupRoutes.js';
import { registerSystemRoutes } from './system/registerSystemRoutes.js';
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
  gridPreferenceRepository?: GridPreferenceRepository;
  appSettingsRepository?: AppSettingsRepository;
  appLogRepository?: AppLogRepository;
  instancePoller?: InstancePoller;
  enableBackgroundPolling?: boolean;
  backgroundPollingTickMs?: number;
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
const defaultGridPreferenceRepository = createInMemoryGridPreferenceRepository();
const defaultAppSettingsRepository = createInMemoryAppSettingsRepository();
const defaultAppLogRepository = createInMemoryAppLogRepository();

function classifyApplicationActivity(method: string, url: string): { type: 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI'; message: string } | null {
  if (method === 'GET' || url.startsWith('/api/logs') || url.startsWith('/api/health')) return null;
  if (url.startsWith('/api/auth/login')) return { type: 'Audit', message: 'User signed in' };
  if (url.startsWith('/api/auth/logout')) return { type: 'Audit', message: 'User signed out' };
  if (url.includes('/test-connectivity') || url.includes('/connectivity-test')) return { type: 'Connection', message: 'Manual connectivity check requested' };
  if (url.startsWith('/api/system/poller')) return { type: 'Service', message: `Background poller ${url.endsWith('/pause') ? 'pause' : 'resume'} requested` };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return { type: 'CRUD', message: `${method} ${url}` };
  return null;
}

async function resolveUserName(authRepository: AuthRepository, authorization?: string): Promise<string | null> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  if (!token) return null;
  const profile = await authRepository.getProfileByToken(token).catch(() => null);
  return profile?.user.email ?? null;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const {
    setupSettingsStore = defaultSetupSettingsStore,
    setupStatusProvider = defaultSetupStatusProvider,
    databaseProvisioner = defaultDatabaseProvisioner,
    deploymentConfig = defaultDeploymentConfig,
    instanceRepository: providedInstanceRepository,
    gridPreferenceRepository: providedGridPreferenceRepository,
    appSettingsRepository: providedAppSettingsRepository,
    appLogRepository: providedAppLogRepository,
    instancePoller: providedInstancePoller,
    enableBackgroundPolling,
    backgroundPollingTickMs,
    ...fastifyOptions
  } = options;
  const authRepository = options.authRepository ?? createSetupAwareAuthRepository(setupSettingsStore, defaultFallbackAuthRepository);
  const instanceRepository = providedInstanceRepository ?? createSetupAwareInstanceRepository(setupSettingsStore, defaultInstanceRepository);
  const gridPreferenceRepository = providedGridPreferenceRepository ?? createSetupAwareGridPreferenceRepository(setupSettingsStore, defaultGridPreferenceRepository);
  const appSettingsRepository = providedAppSettingsRepository ?? createSetupAwareAppSettingsRepository(setupSettingsStore, defaultAppSettingsRepository);
  const appLogRepository = providedAppLogRepository ?? createSetupAwareAppLogRepository(setupSettingsStore, defaultAppLogRepository);
  const app = Fastify(fastifyOptions);
  app.addHook('onResponse', async (request, reply) => {
    const activity = classifyApplicationActivity(request.method, request.url);
    if (!activity || reply.statusCode >= 500) return;
    const userName = await resolveUserName(authRepository, request.headers.authorization);
    await appLogRepository.append({
      type: activity.type,
      severity: reply.statusCode >= 400 ? 'Warning' : 'Logging',
      source: 'UI',
      userName: userName ?? (request.url.startsWith('/api/auth/login') ? 'anonymous' : null),
      message: activity.message,
      details: { method: request.method, url: request.url, statusCode: reply.statusCode }
    }).catch((error) => app.log.warn({ error }, 'Failed to persist application activity log'));
  });
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

  const instancePoller = providedInstancePoller ?? createInstancePoller({ repository: instanceRepository, tickIntervalMs: backgroundPollingTickMs, logger: app.log, appLogRepository });

  await registerDashboardRoutes(app, authRepository, instanceRepository, instancePoller);
  await registerGridPreferenceRoutes(app, authRepository, gridPreferenceRepository);
  await registerAppSettingsRoutes(app, authRepository, appSettingsRepository);
  await registerAppLogRoutes(app, authRepository, appLogRepository);
  await registerSystemRoutes(app, authRepository, instancePoller);

  if (enableBackgroundPolling ?? config.nodeEnv !== 'test') {
    instancePoller.start();
    app.addHook('onClose', async () => { instancePoller.stop(); });
  }

  return app;
}
