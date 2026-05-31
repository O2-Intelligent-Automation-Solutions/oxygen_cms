import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { loadConfig } from './config/loadConfig.js';

export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);
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

  return app;
}
