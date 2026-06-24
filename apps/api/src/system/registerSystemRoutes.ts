import type { FastifyInstance, FastifyRequest } from 'fastify';
import { profileHasPermission } from '../auth/permissions.js';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import type { AppSettingsRepository, QueueScheduleJobKey, QueueScheduleSettings } from '../appSettings/types.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import type { InstancePoller } from '../instances/instancePoller.js';
import type { InstanceRepository } from '../instances/types.js';
import type { QueueJobsSnapshot, QueueStatusProvider } from '../queues/queueStatus.js';
import type { DatabasePerformanceReader } from './databasePerformance.js';
import type { IssueCatalogReader, IssueCatalogSnapshot } from './issueCatalog.js';
import type { UpdateStatusProvider } from './updateStatus.js';
import type { UpdateChecker } from './updateInfo.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

function hasAllTenantInstances(profile: AuthProfile) {
  if (profileHasPermission(profile, 'tenants.manage')) return true;
  if (profile.roles.includes('TenantAdmin')) return true;
  if (profile.user.instanceAccessMode === 'all') return true;
  return profile.groups.some((group) => group.instanceAccessMode === 'all');
}

function visibleInstanceIds(profile: AuthProfile) {
  const ids = new Set<string>();
  if (profile.user.instanceAccessMode === 'specific') {
    for (const instanceId of profile.user.instanceIds) ids.add(instanceId);
  }
  for (const group of profile.groups) {
    if (group.instanceAccessMode === 'specific') {
      for (const instanceId of group.instanceIds) ids.add(instanceId);
    }
  }
  return ids;
}

function filterIssueCatalogForProfile(snapshot: IssueCatalogSnapshot, profile: AuthProfile): IssueCatalogSnapshot {
  if (profileHasPermission(profile, 'tenants.manage')) return snapshot;
  const tenantId = profile.user.tenantId;
  const canSeeTenantInstances = hasAllTenantInstances(profile);
  const scopedIds = visibleInstanceIds(profile);
  const issueTypes = snapshot.issueTypes.map((issueType) => {
    const affectedInstances = issueType.affectedInstances.filter((instance) => {
      if (tenantId && instance.tenantId !== tenantId) return false;
      if (!tenantId && instance.tenantId !== null) return false;
      return canSeeTenantInstances || scopedIds.has(instance.id);
    });
    return { ...issueType, affectedCount: affectedInstances.length, affectedInstances };
  });
  return { ...snapshot, issueTypes };
}

function enrichQueueJobsWithInstances(snapshot: QueueJobsSnapshot, instances: Array<{ id: string; name: string; tenantId: string | null }>, tenants: Array<{ id: string; name: string }>): QueueJobsSnapshot {
  const instancesById = new Map(instances.map((instance) => [instance.id, instance]));
  const tenantNamesById = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  return {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => {
      const instanceId = job.data.instanceId;
      const instance = instanceId ? instancesById.get(instanceId) : null;
      return instance ? { ...job, data: { ...job.data, instanceName: instance.name, tenantId: instance.tenantId, tenantName: instance.tenantId ? tenantNamesById.get(instance.tenantId) ?? null : null } } : job;
    })
  };
}

export async function registerSystemRoutes(app: FastifyInstance, authRepository: AuthRepository, poller: InstancePoller | null, instanceRepository: InstanceRepository, appSettingsRepository: AppSettingsRepository, databasePerformanceReader: DatabasePerformanceReader, issueCatalogReader: IssueCatalogReader, updateChecker: UpdateChecker, updateStatusProvider: UpdateStatusProvider, queueStatusProvider: QueueStatusProvider, onInstanceSchedulesChanged?: () => Promise<void>) {
  const requireSignedIn = requireAuth(authRepository);
  const pollerPreHandler = [requireSignedIn, requirePermission('system.poller.manage')];
  const databasePreHandler = [requireSignedIn, requirePermission('settings.database.view')];
  const issueTypesPreHandler = [requireSignedIn, requirePermission('issueTypes.view')];
  const versionPreHandler = [requireSignedIn, requirePermission('system.version.view')];
  const updateRunnerPreHandler = [requireSignedIn, requirePermission('settings.manage')];

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
  app.get('/api/system/queues', { preHandler: pollerPreHandler }, async () => ({ queues: await queueStatusProvider.readStatus() }));
  app.get('/api/system/queue-jobs', { preHandler: pollerPreHandler }, async (request) => {
    const query = request.query as { limit?: string | number };
    const limit = typeof query.limit === 'number' ? query.limit : Number(query.limit ?? 25);
    const queueJobs = queueStatusProvider.readJobs ? await queueStatusProvider.readJobs(limit) : { enabled: false, mode: 'disabled' as const, generatedAt: new Date().toISOString(), jobs: [] };
    const instances = await instanceRepository.listInstances({ includeAll: true, includeArchived: true });
    const tenants = await authRepository.listTenants();
    return { queueJobs: enrichQueueJobsWithInstances(queueJobs, instances, tenants) };
  });

  function decodeQueueJobKey(request: FastifyRequest) {
    const params = request.params as { key?: string };
    return decodeURIComponent(params.key ?? '') as QueueScheduleJobKey;
  }

  function updateQueueScheduleEnabled(settings: QueueScheduleSettings, key: QueueScheduleJobKey, enabled: boolean) {
    if (!settings.jobs.some((job) => job.key === key)) return null;
    return {
      jobs: settings.jobs.map((job) => ({ key: job.key, enabled: job.key === key ? enabled : job.enabled, everySeconds: job.everySeconds }))
    };
  }

  async function persistQueueScheduleEnabled(key: QueueScheduleJobKey | string, enabled: boolean) {
    if (key.startsWith('instance-check:')) {
      const instanceId = key.slice('instance-check:'.length);
      const instance = await instanceRepository.getInstance(instanceId);
      if (!instance) return null;
      await instanceRepository.updateInstance(instanceId, {
        name: instance.name,
        description: instance.description,
        tenantId: instance.tenantId,
        protocol: instance.protocol,
        host: instance.host,
        port: instance.port,
        hostname: instance.hostname,
        username: instance.username,
        pollingIntervalSeconds: instance.pollingIntervalSeconds,
        isEnabled: enabled,
        checkLicense: instance.checkLicense,
        archived: instance.archived,
        metadata: instance.metadata,
        notes: instance.notes
      });
      await onInstanceSchedulesChanged?.();
      return await appSettingsRepository.getQueueSchedules();
    }
    const current = await appSettingsRepository.getQueueSchedules();
    const maintenanceKey = key as QueueScheduleJobKey;
    const next = updateQueueScheduleEnabled(current, maintenanceKey, enabled);
    if (!next) return null;
    const queueSchedules = await appSettingsRepository.saveQueueSchedules(next);
    await queueStatusProvider.reconcileQueueSchedules?.(queueSchedules);
    return queueSchedules;
  }

  app.post('/api/system/queue-jobs/:key/pause', { preHandler: pollerPreHandler }, async (request, reply) => {
    const key = decodeQueueJobKey(request);
    const queueSchedules = await persistQueueScheduleEnabled(key, false);
    if (!queueSchedules) return reply.code(404).send({ error: 'Queue job schedule not found.' });
    return { queueSchedules };
  });

  app.post('/api/system/queue-jobs/:key/resume', { preHandler: pollerPreHandler }, async (request, reply) => {
    const key = decodeQueueJobKey(request);
    const queueSchedules = await persistQueueScheduleEnabled(key, true);
    if (!queueSchedules) return reply.code(404).send({ error: 'Queue job schedule not found.' });
    return { queueSchedules };
  });

  app.post('/api/system/queue-jobs/:key/run-now', { preHandler: pollerPreHandler }, async (request, reply) => {
    const key = decodeQueueJobKey(request);
    if (key.startsWith('instance-check:')) {
      const instance = await instanceRepository.getInstance(key.slice('instance-check:'.length));
      if (!instance) return reply.code(404).send({ error: 'Queue job schedule not found.' });
    } else if (!(await appSettingsRepository.getQueueSchedules()).jobs.some((job) => job.key === key)) return reply.code(404).send({ error: 'Queue job schedule not found.' });
    if (!queueStatusProvider.runScheduledJobNow) return reply.code(501).send({ error: 'Queue run-now is not available.' });
    const profile = (request as AuthenticatedRequest).authProfile;
    const result = await queueStatusProvider.runScheduledJobNow(key, profile.user.displayName || profile.user.email);
    return reply.code(202).send(result);
  });
  app.get('/api/system/database-performance', { preHandler: databasePreHandler }, async () => ({ databasePerformance: await databasePerformanceReader.readSnapshot() }));
  app.get('/api/system/issue-types', { preHandler: issueTypesPreHandler }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    return { issueCatalog: filterIssueCatalogForProfile(await issueCatalogReader.readSnapshot(), profile) };
  });
  app.get('/api/system/version', { preHandler: versionPreHandler }, async () => ({ version: await updateChecker.getVersionSnapshot() }));
  app.get('/api/system/update-status', { preHandler: versionPreHandler }, async () => ({ updateStatus: await updateStatusProvider.readStatus() }));
  app.post('/api/system/update-runner/dry-run', { preHandler: updateRunnerPreHandler }, async (request, reply) => {
    if (!updateStatusProvider.runUpdate) return reply.code(501).send({ error: 'Update runner is not available.' });
    try {
      const body = (request.body ?? {}) as { targetRef?: string | null };
      const updateStatus = await updateStatusProvider.runUpdate({ mode: 'dry-run', targetRef: body.targetRef ?? null });
      return reply.code(202).send({ updateStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start update dry run.';
      return reply.code(message.includes('already in progress') ? 409 : 400).send({ error: message });
    }
  });
  app.post('/api/system/update-runner/update', { preHandler: updateRunnerPreHandler }, async (request, reply) => {
    if (!updateStatusProvider.runUpdate) return reply.code(501).send({ error: 'Update runner is not available.' });
    try {
      const body = (request.body ?? {}) as { targetRef?: string | null; confirmed?: boolean; confirmation?: string | null };
      const confirmed = body.confirmed === true || body.confirmation === 'YES';
      const updateStatus = await updateStatusProvider.runUpdate({ mode: 'update', targetRef: body.targetRef ?? null, confirmed });
      return reply.code(202).send({ updateStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start update.';
      return reply.code(message.includes('already in progress') ? 409 : 400).send({ error: message });
    }
  });
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
