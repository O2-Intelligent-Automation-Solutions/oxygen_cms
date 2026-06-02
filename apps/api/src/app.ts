import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { basename, join } from 'node:path';
import { createInMemoryAuthRepository } from './auth/inMemoryAuthRepository.js';
import { registerAuthRoutes } from './auth/registerAuthRoutes.js';
import type { AuthRepository } from './auth/types.js';
import { loadConfig } from './config/loadConfig.js';
import { registerSetupRoutes } from './setup/registerSetupRoutes.js';
import { createFileSetupSettingsStore, type SetupSettingsStore } from './setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider, type SetupStatusProvider } from './setup/setupStatus.js';

type BuildAppOptions = FastifyServerOptions & {
  authRepository?: AuthRepository;
  setupStatusProvider?: SetupStatusProvider;
  setupSettingsStore?: SetupSettingsStore;
};

const defaultSettingsPath = basename(process.cwd()) === 'api'
  ? join(process.cwd(), 'data/settings.json')
  : join(process.cwd(), 'apps/api/data/settings.json');
const defaultAuthRepository = createInMemoryAuthRepository();
const defaultSetupSettingsStore = createFileSetupSettingsStore(defaultSettingsPath);
const defaultSetupStatusProvider = createFileSetupStatusProvider(defaultSetupSettingsStore);

export async function buildApp(options: BuildAppOptions = {}) {
  const { authRepository = defaultAuthRepository, setupSettingsStore = defaultSetupSettingsStore, setupStatusProvider = defaultSetupStatusProvider, ...fastifyOptions } = options;
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

  await registerSetupRoutes(app, authRepository, setupStatusProvider, setupSettingsStore);
  await registerAuthRoutes(app, authRepository);

  return app;
}
