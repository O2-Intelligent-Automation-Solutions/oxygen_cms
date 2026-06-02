import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  bootstrapSchema,
  createGroupSchema,
  createRoleSchema,
  createTenantSchema,
  createUserSchema,
  loginSchema,
  updateGroupSchema,
  updateRoleSchema,
  updateTenantSchema,
  updateUserSchema
} from './schemas.js';
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

function errorReply(reply: FastifyReply, error: unknown, fallback: string, notFoundMessage?: string) {
  const message = error instanceof Error ? error.message : fallback;
  return reply.code(notFoundMessage && message === notFoundMessage ? 404 : 400).send({ error: message });
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
  const adminPreHandler = [requireAuth(repository), requireRole('SystemAdmin')];

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

  app.get('/api/tenants', { preHandler: adminPreHandler }, async () => ({ tenants: await repository.listTenants() }));
  app.post('/api/tenants', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createTenantSchema.parse(request.body);
    try { return reply.code(201).send({ tenant: await repository.createTenant(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create tenant.'); }
  });
  app.patch('/api/tenants/:tenantId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const input = updateTenantSchema.parse(request.body);
    try { return reply.code(200).send({ tenant: await repository.updateTenant(tenantId, input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to update tenant.', 'Tenant not found.'); }
  });
  app.delete('/api/tenants/:tenantId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try { await repository.deleteTenant(tenantId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete tenant.', 'Tenant not found.'); }
  });

  app.get('/api/roles', { preHandler: adminPreHandler }, async () => ({ roles: await repository.listRoles() }));
  app.post('/api/roles', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createRoleSchema.parse(request.body);
    try { return reply.code(201).send({ role: await repository.createRole(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create role.'); }
  });
  app.patch('/api/roles/:roleId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    const input = updateRoleSchema.parse(request.body);
    try { return reply.code(200).send({ role: await repository.updateRole(roleId, input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to update role.', 'Role not found.'); }
  });
  app.delete('/api/roles/:roleId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    try { await repository.deleteRole(roleId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete role.', 'Role not found.'); }
  });

  app.get('/api/groups', { preHandler: adminPreHandler }, async () => ({ groups: await repository.listGroups() }));
  app.post('/api/groups', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createGroupSchema.parse(request.body);
    try { return reply.code(201).send({ group: await repository.createGroup(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create group.'); }
  });
  app.patch('/api/groups/:groupId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const input = updateGroupSchema.parse(request.body);
    try { return reply.code(200).send({ group: await repository.updateGroup(groupId, input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to update group.', 'Group not found.'); }
  });
  app.delete('/api/groups/:groupId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    try { await repository.deleteGroup(groupId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete group.', 'Group not found.'); }
  });

  app.get('/api/users', { preHandler: adminPreHandler }, async () => ({ users: await repository.listUsers() }));
  app.post('/api/users', { preHandler: adminPreHandler }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    try { return reply.code(201).send(await repository.createUser(input)); }
    catch (error) { return errorReply(reply, error, 'Unable to create user.'); }
  });
  app.patch('/api/users/:userId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const input = updateUserSchema.parse(request.body);
    try { return reply.code(200).send(await repository.updateUser(userId, input)); }
    catch (error) { return errorReply(reply, error, 'Unable to update user.', 'User not found.'); }
  });
  app.delete('/api/users/:userId', { preHandler: adminPreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    try { await repository.deleteUser(userId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete user.', 'User not found.'); }
  });
}
