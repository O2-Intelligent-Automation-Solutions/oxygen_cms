import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { profileHasPermission } from '../auth/permissions.js';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import type { InstanceRepository, OxyGenInstance } from '../instances/types.js';
import { OxygenProcessingClient, assertValidServiceIdentifier } from './oxygenProcessingClient.js';
import { parseProcessingDataSourceRequest } from './processingDataSourceRequest.js';
import type { ProcessingRemoteAccess } from './types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };
type ProcessingRepository = InstanceRepository & { getRemoteAccess?(instanceId: string): Promise<ProcessingRemoteAccess | null> };

function instanceScope(profile: AuthProfile, includeArchived = true) {
  if (profile.user.instanceAccessMode === 'none') return { instanceIds: [], includeArchived };
  const instanceIds = new Set<string>();
  if (profile.user.instanceAccessMode === 'all') return { includeAll: true, includeArchived };
  if (profile.user.instanceAccessMode === 'specific') {
    for (const instanceId of profile.user.instanceIds) instanceIds.add(instanceId);
  }
  for (const group of profile.groups) {
    if (group.instanceAccessMode === 'all') return { includeAll: true, includeArchived };
    if (group.instanceAccessMode === 'specific') {
      for (const instanceId of group.instanceIds) instanceIds.add(instanceId);
    }
  }
  if (profile.roles.includes('TenantAdmin') && profile.user.tenantId) return { includeAll: true, includeArchived };
  return { instanceIds: Array.from(instanceIds), includeArchived };
}

function filterScopedInstances<T extends { tenantId: string | null }>(profile: AuthProfile, instances: T[]) {
  if (profileHasPermission(profile, 'tenants.manage')) return instances;
  return instances.filter((instance) => instance.tenantId === profile.user.tenantId);
}

async function visibleInstance(profile: AuthProfile, repository: InstanceRepository, instanceId: string): Promise<OxyGenInstance | null> {
  const instances = await repository.listInstances(instanceScope(profile, true));
  const scoped = filterScopedInstances(profile, instances).find((entry) => entry.id === instanceId);
  if (!scoped) return null;
  return repository.getInstance(instanceId);
}

async function remoteAccess(repository: ProcessingRepository, instance: OxyGenInstance): Promise<ProcessingRemoteAccess> {
  if (!repository.getRemoteAccess) throw new Error('Remote OxyGen credentials are not available for Processing Errors.');
  const access = await repository.getRemoteAccess(instance.id);
  if (!access) throw new Error('Instance not found.');
  return access;
}

function queryRecord(request: FastifyRequest) {
  return (request.query && typeof request.query === 'object' ? request.query : {}) as Record<string, unknown>;
}

function paramsRecord(request: FastifyRequest) {
  return request.params as Record<string, string>;
}

function handleError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Processing Errors request failed.';
  if (message === 'Invalid service identifier.') return reply.code(400).send({ error: message });
  if (message.includes('credentials are not available')) return reply.code(503).send({ error: message });
  if (message.includes('authentication failed')) return reply.code(502).send({ error: message });
  return reply.code(502).send({ error: message });
}

export async function registerProcessingRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: ProcessingRepository, client = new OxygenProcessingClient()) {
  const viewPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.view')];

  async function withInstance(request: FastifyRequest, reply: FastifyReply, handler: (access: ProcessingRemoteAccess) => Promise<unknown>) {
    const profile = (request as AuthenticatedRequest).authProfile;
    const instanceId = paramsRecord(request).instanceId;
    const instance = await visibleInstance(profile, instanceRepository, instanceId);
    if (!instance) return reply.code(404).send({ error: 'Instance not found.' });
    try {
      const access = await remoteAccess(instanceRepository, instance);
      const result = await handler(access);
      return reply.code(200).send(result);
    } catch (error) {
      return handleError(reply, error);
    }
  }

  app.get('/api/instances/:instanceId/processing/triggers/schema', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getSchema(access, '/web-api/BUS/workflows/triggers/schema')));

  app.get('/api/instances/:instanceId/processing/triggers/grid', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getGrid(access, '/web-api/BUS/workflows/triggers/grid', parseProcessingDataSourceRequest(queryRecord(request)))));

  app.get('/api/instances/:instanceId/processing/triggers/:triggerId/children', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const triggerId = paramsRecord(request).triggerId;
    return client.getGrid(access, '/web-api/BUS/workflows/triggers/grid', parseProcessingDataSourceRequest(queryRecord(request), { filter: `IsChild~eq~true~and~TriggerGroupId~eq~${triggerId}` }));
  }));

  app.get('/api/instances/:instanceId/processing/workflow-events/schema', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getSchema(access, '/web-api/BUS/workflows/events/schema')));

  app.get('/api/instances/:instanceId/processing/workflow-events/grid', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getGrid(access, '/web-api/BUS/workflows/events/grid', parseProcessingDataSourceRequest(queryRecord(request)))));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/schema', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const serviceIdentifier = paramsRecord(request).serviceIdentifier;
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getSchema(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/Schema`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/grid', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const serviceIdentifier = paramsRecord(request).serviceIdentifier;
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getGrid(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/Grid`, parseProcessingDataSourceRequest(queryRecord(request)));
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getDetail(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/${encodeURIComponent(eventId)}`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/children', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getGrid(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/Grid`, parseProcessingDataSourceRequest(queryRecord(request), { filter: `ParentId~eq~${eventId}` }));
  }));
}
