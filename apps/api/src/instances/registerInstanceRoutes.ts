import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth, requireRole } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import { normalizeOxyGenEndpoint } from './inMemoryInstanceRepository.js';
import { testOxyGenConnectivity } from './oxygenConnectivity.js';
import { createInstanceSchema, testConnectivitySchema, updateInstanceSchema } from './schemas.js';
import type { InstanceRepository } from './types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

function errorReply(reply: FastifyReply, error: unknown, fallback: string, notFoundMessage?: string) {
  const message = error instanceof Error ? error.message : fallback;
  return reply.code(notFoundMessage && message === notFoundMessage ? 404 : 400).send({ error: message });
}

function instanceScope(profile: AuthProfile) {
  if (profile.roles.includes('SystemAdmin') || profile.user.instanceAccessMode === 'all') return { includeAll: true };
  if (profile.user.instanceAccessMode === 'none') return { instanceIds: [] };

  const instanceIds = new Set<string>();
  if (profile.user.instanceAccessMode === 'specific') {
    for (const instanceId of profile.user.instanceIds) instanceIds.add(instanceId);
  }

  for (const group of profile.groups) {
    if (group.instanceAccessMode === 'all') return { includeAll: true };
    if (group.instanceAccessMode === 'specific') {
      for (const instanceId of group.instanceIds) instanceIds.add(instanceId);
    }
  }

  return { instanceIds: Array.from(instanceIds) };
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

export async function registerInstanceRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: InstanceRepository) {
  const requireSignedIn = requireAuth(authRepository);
  const adminPreHandler = [requireSignedIn, requireRole('SystemAdmin')];

  app.get('/api/instances', { preHandler: requireSignedIn }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    return { instances: await instanceRepository.listInstances(instanceScope(profile)) };
  });

  app.post('/api/instances', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createInstanceSchema.parse(request.body);
    try { return reply.code(201).send({ instance: await instanceRepository.createInstance(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create instance.'); }
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
    try { return reply.code(200).send(await testConnectivityFromInput(input)); }
    catch (error) { return errorReply(reply, error, 'Unable to test instance connectivity.'); }
  });

  app.post('/api/instances/:instanceId/test-connectivity', { preHandler: adminPreHandler }, async (request, reply) => {
    const { instanceId } = request.params as { instanceId: string };
    try { return reply.code(200).send(await instanceRepository.testConnectivity(instanceId)); }
    catch (error) { return errorReply(reply, error, 'Unable to test instance connectivity.', 'Instance not found.'); }
  });
}
