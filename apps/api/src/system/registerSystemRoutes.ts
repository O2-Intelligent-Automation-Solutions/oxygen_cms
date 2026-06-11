import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/registerAuthRoutes.js';
import type { AuthRepository } from '../auth/types.js';
import type { InstancePoller } from '../instances/instancePoller.js';
import type { DatabasePerformanceReader } from './databasePerformance.js';
import type { UpdateChecker } from './updateInfo.js';

export async function registerSystemRoutes(app: FastifyInstance, authRepository: AuthRepository, poller: InstancePoller | null, databasePerformanceReader: DatabasePerformanceReader, updateChecker: UpdateChecker) {
  const preHandler = [requireAuth(authRepository), requireRole('SystemAdmin')];

  function status() {
    return poller?.getStatus() ?? {
      state: 'stopped' as const,
      isRunning: false,
      isPaused: false,
      tickIntervalMs: 0,
      inFlight: 0,
      lastRunAt: null,
      nextRunAt: null,
      lastSummary: null,
      lastError: null
    };
  }

  app.get('/api/system/poller', { preHandler }, async () => ({ poller: status() }));
  app.get('/api/system/database-performance', { preHandler }, async () => ({ databasePerformance: await databasePerformanceReader.readSnapshot() }));
  app.get('/api/system/version', { preHandler }, async () => ({ version: await updateChecker.getVersionSnapshot() }));
  app.post('/api/system/poller/pause', { preHandler }, async () => {
    poller?.pause();
    return { poller: status() };
  });
  app.post('/api/system/poller/resume', { preHandler }, async () => {
    poller?.resume();
    return { poller: status() };
  });
  app.post('/api/system/poller/run-now', { preHandler }, async () => {
    const summary = await poller?.runNow();
    return { poller: status(), summary: summary ?? null };
  });
}
