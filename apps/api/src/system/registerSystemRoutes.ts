import type { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import type { AuthRepository } from '../auth/types.js';
import type { InstancePoller } from '../instances/instancePoller.js';
import type { DatabasePerformanceReader } from './databasePerformance.js';
import type { IssueCatalogReader } from './issueCatalog.js';
import type { UpdateChecker } from './updateInfo.js';

export async function registerSystemRoutes(app: FastifyInstance, authRepository: AuthRepository, poller: InstancePoller | null, databasePerformanceReader: DatabasePerformanceReader, issueCatalogReader: IssueCatalogReader, updateChecker: UpdateChecker) {
  const requireSignedIn = requireAuth(authRepository);
  const pollerPreHandler = [requireSignedIn, requirePermission('system.poller.manage')];
  const databasePreHandler = [requireSignedIn, requirePermission('settings.database.view')];
  const issueTypesPreHandler = [requireSignedIn, requirePermission('issueTypes.view')];
  const versionPreHandler = [requireSignedIn, requirePermission('system.version.view')];

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

  app.get('/api/system/poller', { preHandler: pollerPreHandler }, async () => ({ poller: status() }));
  app.get('/api/system/database-performance', { preHandler: databasePreHandler }, async () => ({ databasePerformance: await databasePerformanceReader.readSnapshot() }));
  app.get('/api/system/issue-types', { preHandler: issueTypesPreHandler }, async () => ({ issueCatalog: await issueCatalogReader.readSnapshot() }));
  app.get('/api/system/version', { preHandler: versionPreHandler }, async () => ({ version: await updateChecker.getVersionSnapshot() }));
  app.post('/api/system/poller/pause', { preHandler: pollerPreHandler }, async () => {
    poller?.pause();
    return { poller: status() };
  });
  app.post('/api/system/poller/resume', { preHandler: pollerPreHandler }, async () => {
    poller?.resume();
    return { poller: status() };
  });
  app.post('/api/system/poller/run-now', { preHandler: pollerPreHandler }, async () => {
    const summary = await poller?.runNow();
    return { poller: status(), summary: summary ?? null };
  });
}
