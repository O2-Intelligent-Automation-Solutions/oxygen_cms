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

type ProcessingActionPayload = {
  confirmed?: unknown;
  isParent?: unknown;
  triggerId?: unknown;
  action?: unknown;
};

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

function bodyRecord(request: FastifyRequest): ProcessingActionPayload {
  return (request.body && typeof request.body === 'object' ? request.body : {}) as ProcessingActionPayload;
}

function requireConfirmed(request: FastifyRequest) {
  if (bodyRecord(request).confirmed !== true) throw new Error('Processing action confirmation is required.');
}

function numericId(value: string | unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${label}.`);
  return parsed;
}

function booleanValue(value: unknown) {
  return value === true || value === 'true';
}

function cancelActionValue(value: unknown) {
  const action = numericId(value, 'cancel action');
  if (![1, 2, 3].includes(action)) throw new Error('Invalid cancel action.');
  return action;
}

function fileNameValue(value: string | unknown) {
  const fileName = String(value ?? '').trim();
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0') || fileName === '.' || fileName === '..') throw new Error('Invalid file name.');
  return fileName;
}

function contentDispositionFileName(fileName: string) {
  const fallback = fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'event-file';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function handleError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Processing Errors request failed.';
  if (message === 'Invalid service identifier.' || message.startsWith('Invalid ') || message.includes('confirmation is required')) return reply.code(400).send({ error: message });
  if (message.includes('credentials are not available')) return reply.code(503).send({ error: message });
  if (message.includes('authentication failed')) return reply.code(502).send({ error: message });
  return reply.code(502).send({ error: message });
}

export async function registerProcessingRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: ProcessingRepository, client = new OxygenProcessingClient()) {
  const viewPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.view')];
  const cancelTriggerPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.cancelTrigger')];
  const recoverWorkflowEventPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.recoverWorkflowEvent')];
  const cancelWorkflowEventPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.cancelWorkflowEvent')];
  const restoreServiceEventPreHandler = [requireAuth(authRepository), requirePermission('processing.errors.restoreServiceEvent')];
  const downloadServiceEventFilePreHandler = [requireAuth(authRepository), requirePermission('processing.errors.downloadServiceEventFile')];
  const viewServiceEventMessagePreHandler = [requireAuth(authRepository), requirePermission('processing.errors.viewServiceEventMessage')];

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

  async function withAction(request: FastifyRequest, reply: FastifyReply, handler: (access: ProcessingRemoteAccess) => Promise<unknown>) {
    return withInstance(request, reply, async (access) => {
      requireConfirmed(request);
      return { ok: true, result: await handler(access) };
    });
  }

  app.get('/api/instances/:instanceId/processing/triggers/schema', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getSchema(access, '/web-api/BUS/workflows/triggers/schema')));

  app.get('/api/instances/:instanceId/processing/triggers/grid', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getGrid(access, '/web-api/BUS/workflows/triggers/grid', parseProcessingDataSourceRequest(queryRecord(request)))));

  app.get('/api/instances/:instanceId/processing/triggers/:triggerId/children', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const triggerId = numericId(paramsRecord(request).triggerId, 'trigger id');
    return client.getGrid(access, '/web-api/BUS/workflows/triggers/grid', parseProcessingDataSourceRequest(queryRecord(request), { filter: `IsChild~eq~true~and~TriggerGroupId~eq~${triggerId}` }));
  }));

  app.post('/api/instances/:instanceId/processing/triggers/:triggerId/cancel', { preHandler: cancelTriggerPreHandler }, async (request, reply) => withAction(request, reply, (access) => {
    const triggerId = numericId(paramsRecord(request).triggerId, 'trigger id');
    const isParent = booleanValue(bodyRecord(request).isParent);
    return client.postAction(access, `/web-api/BUS/workflows/triggers/${encodeURIComponent(String(triggerId))}/cancel?isParent=${isParent}`);
  }));

  app.get('/api/instances/:instanceId/processing/workflow-events/schema', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getSchema(access, '/web-api/BUS/workflows/events/schema')));

  app.get('/api/instances/:instanceId/processing/workflow-events/grid', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => client.getGrid(access, '/web-api/BUS/workflows/events/grid', parseProcessingDataSourceRequest(queryRecord(request)))));

  app.post('/api/instances/:instanceId/processing/workflow-events/:eventId/recovery', { preHandler: recoverWorkflowEventPreHandler }, async (request, reply) => withAction(request, reply, (access) => {
    const eventId = numericId(paramsRecord(request).eventId, 'workflow event id');
    const triggerId = numericId(bodyRecord(request).triggerId, 'trigger id');
    return client.postAction(access, `/web-api/BUS/workflows/events/${encodeURIComponent(String(eventId))}/recovery?triggerId=${encodeURIComponent(String(triggerId))}`);
  }));

  app.post('/api/instances/:instanceId/processing/workflow-events/:eventId/cancel', { preHandler: cancelWorkflowEventPreHandler }, async (request, reply) => withAction(request, reply, (access) => {
    const eventId = numericId(paramsRecord(request).eventId, 'workflow event id');
    const action = cancelActionValue(bodyRecord(request).action);
    return client.postAction(access, `/web-api/BUS/workflows/events/${encodeURIComponent(String(eventId))}/cancel?action=${action}`);
  }));

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

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/message-schema', { preHandler: viewServiceEventMessagePreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getSchema(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Queue/Schema`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getDetail(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/${encodeURIComponent(String(numericId(eventId, 'service event id')))}`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/message', { preHandler: viewServiceEventMessagePreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getDetail(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Queue/${encodeURIComponent(String(numericId(eventId, 'queue entry id')))}`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/files/:fileName', { preHandler: downloadServiceEventFilePreHandler }, async (request, reply) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const instanceId = paramsRecord(request).instanceId;
    const instance = await visibleInstance(profile, instanceRepository, instanceId);
    if (!instance) return reply.code(404).send({ error: 'Instance not found.' });
    try {
      const access = await remoteAccess(instanceRepository, instance);
      const { serviceIdentifier, eventId, fileName } = paramsRecord(request);
      assertValidServiceIdentifier(serviceIdentifier);
      const safeEventId = numericId(eventId, 'service event id');
      const safeFileName = fileNameValue(fileName);
      const result = await client.downloadFile(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/${encodeURIComponent(String(safeEventId))}/${encodeURIComponent(safeFileName)}/File`);
      reply.header('content-type', Array.isArray(result.contentType) ? result.contentType[0] : result.contentType || 'application/octet-stream');
      if (result.contentLength && !Array.isArray(result.contentLength)) reply.header('content-length', result.contentLength);
      reply.header('content-disposition', contentDispositionFileName(safeFileName));
      return reply.code(200).send(result.body);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/restore', { preHandler: restoreServiceEventPreHandler }, async (request, reply) => withAction(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.postAction(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/events/queue/${encodeURIComponent(String(numericId(eventId, 'service event id')))}`);
  }));

  app.get('/api/instances/:instanceId/processing/service-events/:serviceIdentifier/:eventId/children', { preHandler: viewPreHandler }, async (request, reply) => withInstance(request, reply, (access) => {
    const { serviceIdentifier, eventId } = paramsRecord(request);
    assertValidServiceIdentifier(serviceIdentifier);
    return client.getGrid(access, `/web-api/${encodeURIComponent(serviceIdentifier)}/Events/Grid`, parseProcessingDataSourceRequest(queryRecord(request), { filter: `ParentId~eq~${numericId(eventId, 'service event id')}` }));
  }));
}
