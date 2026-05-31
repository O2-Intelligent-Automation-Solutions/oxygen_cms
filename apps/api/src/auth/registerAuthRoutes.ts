import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { bootstrapSchema, createGroupSchema, createUserSchema, loginSchema } from './schemas.js';
import type { AuthProfile, AuthRepository, RoleName } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    authProfile?: AuthProfile;
  }
}

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function requireAuth(repository: AuthRepository) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = getBearerToken(request);
    if (!token) return reply.code(401).send({ error: 'Authentication required.' });
    const profile = await repository.getProfileByToken(token);
    if (!profile) return reply.code(401).send({ error: 'Invalid or expired token.' });
    request.authProfile = profile;
  };
}

export function requireRole(role: RoleName) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = request.authProfile;
    if (!profile) return reply.code(401).send({ error: 'Authentication required.' });
    if (!profile.roles.includes(role)) return reply.code(403).send({ error: `${role} role required.` });
  };
}

export async function registerAuthRoutes(app: FastifyInstance, repository: AuthRepository) {
  app.get('/api/auth/bootstrap-status', async () => ({
    requiresBootstrap: !(await repository.hasUsers())
  }));

  app.post('/api/auth/bootstrap', async (request, reply) => {
    const input = bootstrapSchema.parse(request.body);
    try {
      const profile = await repository.bootstrapAdmin(input);
      return reply.code(201).send(profile);
    } catch (error) {
      return reply.code(409).send({ error: error instanceof Error ? error.message : 'Bootstrap failed.' });
    }
  });

  app.post('/api/auth/login', async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const profile = await repository.authenticate(input.email, input.password);
    if (!profile) return reply.code(401).send({ error: 'Invalid email or password.' });
    const token = await repository.createSession(profile.user.id);
    return { token, ...profile };
  });

  app.post('/api/auth/logout', async () => ({ ok: true }));

  app.get('/api/auth/me', { preHandler: requireAuth(repository) }, async (request) => {
    return (request as AuthenticatedRequest).authProfile;
  });

  app.get('/api/groups', { preHandler: [requireAuth(repository), requireRole('SystemAdmin')] }, async () => {
    return { groups: await repository.listGroups() };
  });

  app.post('/api/groups', { preHandler: [requireAuth(repository), requireRole('SystemAdmin')] }, async (request, reply) => {
    const input = createGroupSchema.parse(request.body);
    const group = await repository.createGroup(input);
    return reply.code(201).send({ group });
  });

  app.get('/api/users', { preHandler: [requireAuth(repository), requireRole('SystemAdmin')] }, async () => {
    return { users: await repository.listUsers() };
  });

  app.post('/api/users', { preHandler: [requireAuth(repository), requireRole('SystemAdmin')] }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    try {
      const profile = await repository.createUser(input);
      return reply.code(201).send(profile);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Unable to create user.' });
    }
  });
}
