import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppLogRepository } from '../appLogs/types.js';
import { requireAuth, requireRole } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import { exportInstancesToCsv } from './csv.js';
import { importInstancesFromCsv } from './importInstances.js';
import { normalizeOxyGenEndpoint } from './inMemoryInstanceRepository.js';
import { testOxyGenConnectivity } from './oxygenConnectivity.js';
import { createInstanceSchema, importInstancesSchema, testConnectivitySchema, updateInstanceSchema } from './schemas.js';
import type { ConnectivityResult, InstanceRepository } from './types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

function errorReply(reply: FastifyReply, error: unknown, fallback: string, notFoundMessage?: string) {
  const message = error instanceof Error ? error.message : fallback;
  return reply.code(notFoundMessage && message === notFoundMessage ? 404 : 400).send({ error: message });
}

function includeArchivedFromRequest(request: FastifyRequest) {
  const query = request.query as { includeArchived?: string | boolean } | undefined;
  return query?.includeArchived === true || query?.includeArchived === 'true';
}

function instanceScope(profile: AuthProfile, includeArchived = false) {
  if (profile.roles.includes('SystemAdmin') || profile.user.instanceAccessMode === 'all') return { includeAll: true, includeArchived };
  if (profile.user.instanceAccessMode === 'none') return { instanceIds: [], includeArchived };

  const instanceIds = new Set<string>();
  if (profile.user.instanceAccessMode === 'specific') {
    for (const instanceId of profile.user.instanceIds) instanceIds.add(instanceId);
  }

  for (const group of profile.groups) {
    if (group.instanceAccessMode === 'all') return { includeAll: true, includeArchived };
    if (group.instanceAccessMode === 'specific') {
      for (const instanceId of group.instanceIds) instanceIds.add(instanceId);
    }
  }

  return { instanceIds: Array.from(instanceIds), includeArchived };
}

function requireInstanceImportExportRole() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = request.authProfile;
    if (!profile) return reply.code(401).send({ error: 'Authentication required.' });
    if (!profile.roles.includes('SystemAdmin') && !profile.roles.includes('TenantAdmin')) return reply.code(403).send({ error: 'SystemAdmin or TenantAdmin role required.' });
  };
}

function csvFilename() {
  return `oxygen-instances-${new Date().toISOString().slice(0, 10)}.csv`;
}

async function testConnectivityFromInput(input: ReturnType<typeof testConnectivitySchema.parse>) {
  const normalized = normalizeOxyGenEndpoint(input);
  return testOxyGenConnectivity({
    instance: {
      name: 'Unsaved OxyGen instance',
      protocol: normalized.protocol,
      host: normalized.host,
      port: normalized.port,
      apiBaseUrl: normalized.apiBaseUrl,
      username: input.username.trim()
    },
    password: input.password
  });
}

function connectivitySeverity(result: ConnectivityResult) {
  if (result.ok) return 'Logging' as const;
  if (result.status === 'ssl-error') return 'Warning' as const;
  return 'Error' as const;
}

function connectivityMessage(result: ConnectivityResult) {
  if (result.ok) return 'Manual connectivity check passed.';
  if (result.status === 'ssl-error') return 'Manual connectivity check failed: SSL error.';
  if (result.status === 'auth-error') return 'Manual connectivity check failed: authentication error.';
  return 'Manual connectivity check failed: unreachable.';
}

function connectivityErrorCode(result: ConnectivityResult) {
  return result.dns.errorCode ?? result.ssl.errorCode ?? result.authentication.errorCode ?? result.api.errorCode ?? result.license.step.errorCode ?? null;
}

async function appendConnectivityLog(app: FastifyInstance, repository: AppLogRepository, request: FastifyRequest, result: ConnectivityResult, entityGuid: string | null, instanceName: string | null, tenantId: string | null) {
  const profile = (request as Partial<AuthenticatedRequest>).authProfile;
  await repository.append({
    type: 'Connection',
    severity: connectivitySeverity(result),
    source: profile?.user.email ?? 'UI',
    userName: profile?.user.email ?? null,
    entityGuid,
    tenantId,
    message: connectivityMessage(result),
    details: {
      apiCall: entityGuid ? 'POST /api/instances/{Entity_Guid}/test-connectivity' : 'POST /api/instances/test-connectivity',
      method: 'POST',
      url: entityGuid ? `/api/instances/${entityGuid}/test-connectivity` : '/api/instances/test-connectivity',
      responseCode: 200,
      statusCode: 200,
      entityGuid,
      tenantId,
      instanceName,
      connectivityStatus: result.status,
      ok: result.ok,
      message: result.message,
      error: result.ok ? null : result.message,
      errorCode: connectivityErrorCode(result),
      httpStatusCode: result.httpStatusCode,
      responseTimeMs: result.responseTimeMs,
      durationMs: result.durationMs,
      dns: result.dns,
      ssl: result.ssl,
      authentication: result.authentication,
      api: result.api,
      license: result.license.step
    }
  }).catch((error) => app.log.warn({ error }, 'Failed to persist manual connectivity log'));
}

export async function registerInstanceRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: InstanceRepository, appLogRepository?: AppLogRepository) {
  const requireSignedIn = requireAuth(authRepository);
  const adminPreHandler = [requireSignedIn, requireRole('SystemAdmin')];
  const importExportPreHandler = [requireSignedIn, requireInstanceImportExportRole()];

  app.get('/api/instances', { preHandler: requireSignedIn }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    return { instances: await instanceRepository.listInstances(instanceScope(profile, includeArchivedFromRequest(request))) };
  });

  app.get('/api/instances/export.csv', { preHandler: importExportPreHandler }, async (request, reply) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const [allInstances, tenants] = await Promise.all([
      instanceRepository.listInstances({ includeAll: true, includeArchived: includeArchivedFromRequest(request) }),
      authRepository.listTenants()
    ]);
    const instances = profile.user.tenantId ? allInstances.filter((instance) => instance.tenantId === profile.user.tenantId) : allInstances;
    const csv = exportInstancesToCsv(instances, tenants, profile.user.tenantId ? 'tenant' : 'global');
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${csvFilename()}"`)
      .send(csv);
  });

  app.post('/api/instances/import', { preHandler: importExportPreHandler }, async (request, reply) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const input = importInstancesSchema.parse(request.body);
    try {
      const result = await importInstancesFromCsv({ authRepository, instanceRepository, profile, csv: input.csv, dryRun: input.dryRun });
      return reply.code(result.failed > 0 && !result.dryRun ? 400 : 200).send(result);
    } catch (error) {
      return errorReply(reply, error, 'Unable to import instances.');
    }
  });

  app.post('/api/instances', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createInstanceSchema.parse(request.body);
    try { return reply.code(201).send({ instance: await instanceRepository.createInstance(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create instance.'); }
  });

  app.get('/api/instances/:instanceId', { preHandler: requireSignedIn }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const profile = (request as AuthenticatedRequest).authProfile;
    const instances = await instanceRepository.listInstances(instanceScope(profile, true));
    const instance = instances.find((entry) => entry.id === instanceId);
    if (!instance) return reply.code(404).send({ error: 'Instance not found.' });
    return { instance };
  });

  app.get('/api/instances/:instanceId/health-details', { preHandler: requireSignedIn }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const profile = (request as AuthenticatedRequest).authProfile;
    const instances = await instanceRepository.listInstances(instanceScope(profile, true));
    if (!instances.some((entry) => entry.id === instanceId)) return reply.code(404).send({ error: 'Instance not found.' });
    try { return reply.code(200).send({ healthDetails: await instanceRepository.getHealthDetails(instanceId) }); }
    catch (error) { return errorReply(reply, error, 'Unable to load instance health details.', 'Instance not found.'); }
  });

  app.patch('/api/instances/:instanceId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    const input = updateInstanceSchema.parse(request.body);
    try { return reply.code(200).send({ instance: await instanceRepository.updateInstance(instanceId, input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to update instance.', 'Instance not found.'); }
  });

  app.delete('/api/instances/:instanceId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    try { await instanceRepository.deleteInstance(instanceId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete instance.', 'Instance not found.'); }
  });

  app.post('/api/instances/test-connectivity', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = testConnectivitySchema.parse(request.body);
    try {
      const result = await testConnectivityFromInput(input);
      if (appLogRepository) await appendConnectivityLog(app, appLogRepository, request, result, input.instanceId ?? null, input.name ?? null, input.tenantId ?? null);
      return reply.code(200).send(result);
    }
    catch (error) { return errorReply(reply, error, 'Unable to test instance connectivity.'); }
  });

  app.post('/api/instances/:instanceId/test-connectivity', { preHandler: adminPreHandler }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    try {
      const instance = await instanceRepository.getInstance(instanceId);
      const result = await instanceRepository.testConnectivity(instanceId);
      if (appLogRepository) await appendConnectivityLog(app, appLogRepository, request, result, instanceId, instance?.name ?? null, instance?.tenantId ?? null);
      return reply.code(200).send(result);
    }
    catch (error) { return errorReply(reply, error, 'Unable to test instance connectivity.', 'Instance not found.'); }
  });
}
