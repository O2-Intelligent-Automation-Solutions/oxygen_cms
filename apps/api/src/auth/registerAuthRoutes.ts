import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { canAccessTenant, profileHasPermission, requireScopedTenant } from './permissions.js';
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
import type { AuthProfile, AuthRepository, PermissionKey, RoleName, TenantId } from './types.js';

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
  return reply.code(notFoundMessage && message === notFoundMessage ? 404 : message.includes('access denied') || message.includes('Access denied') || message.includes('Tenant assignment required') ? 403 : 400).send({ error: message });
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

export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = request.authProfile;
    if (!profile) return reply.code(401).send({ error: 'Authentication required.' });
    if (!profileHasPermission(profile, permission)) return reply.code(403).send({ error: `Permission required: ${permission}.` });
  };
}

function scopedTenantId(profile: AuthProfile): string | null {
  return profileHasPermission(profile, 'tenants.manage') ? null : profile.user.tenantId;
}

function filterTenantScoped<T extends { tenantId: TenantId }>(profile: AuthProfile, rows: T[]) {
  if (profileHasPermission(profile, 'tenants.manage')) return rows;
  return rows.filter((row) => row.tenantId === profile.user.tenantId);
}

function assertInputTenantScope(profile: AuthProfile, tenantId: TenantId) {
  if (profileHasPermission(profile, 'tenants.manage')) return;
  if (!profile.user.tenantId) throw new Error('Tenant assignment required.');
  requireScopedTenant(profile, tenantId, 'Tenant scope access denied.');
}

function tenantForScopedWrite(profile: AuthProfile, requestedTenantId: TenantId) {
  assertInputTenantScope(profile, requestedTenantId);
  return scopedTenantId(profile) ?? requestedTenantId;
}

async function resolveUserTenant(repository: AuthRepository, userId: string) {
  return (await repository.listUsers()).find((entry) => entry.user.id === userId)?.user.tenantId;
}

export async function registerAuthRoutes(app: FastifyInstance, repository: AuthRepository) {
  const requireSignedIn = requireAuth(repository);
  const tenantViewPreHandler = [requireSignedIn, requirePermission('tenants.view')];
  const tenantManagePreHandler = [requireSignedIn, requirePermission('tenants.manage')];
  const roleManagePreHandler = [requireSignedIn, requirePermission('roles.manage')];
  const groupManagePreHandler = [requireSignedIn, requirePermission('groups.manage')];
  const userManagePreHandler = [requireSignedIn, requirePermission('users.manage')];

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

  app.get('/api/auth/me', { preHandler: requireSignedIn }, async (request) => {
    return (request as AuthenticatedRequest).authProfile;
  });

  app.get('/api/tenants', { preHandler: tenantViewPreHandler }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const tenants = await repository.listTenants();
    return { tenants: profileHasPermission(profile, 'tenants.manage') ? tenants : tenants.filter((tenant) => tenant.id === profile.user.tenantId) };
  });
  app.post('/api/tenants', { preHandler: tenantManagePreHandler }, async (request, reply) => {
    const input = createTenantSchema.parse(request.body);
    try { return reply.code(201).send({ tenant: await repository.createTenant(input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to create tenant.'); }
  });
  app.patch('/api/tenants/:tenantId', { preHandler: tenantManagePreHandler }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const input = updateTenantSchema.parse(request.body);
    try { return reply.code(200).send({ tenant: await repository.updateTenant(tenantId, input) }); }
    catch (error) { return errorReply(reply, error, 'Unable to update tenant.', 'Tenant not found.'); }
  });
  app.delete('/api/tenants/:tenantId', { preHandler: tenantManagePreHandler }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    try { await repository.deleteTenant(tenantId); return reply.code(204).send(); }
    catch (error) { return errorReply(reply, error, 'Unable to delete tenant.', 'Tenant not found.'); }
  });

  app.get('/api/roles', { preHandler: roleManagePreHandler }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    return { roles: filterTenantScoped(profile, await repository.listRoles()) };
  });
  app.post('/api/roles', { preHandler: roleManagePreHandler }, async (request, reply) => {
    const input = createRoleSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      return reply.code(201).send({ role: await repository.createRole({ ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }) });
    }
    catch (error) { return errorReply(reply, error, 'Unable to create role.'); }
  });
  app.patch('/api/roles/:roleId', { preHandler: roleManagePreHandler }, async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    const input = updateRoleSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existing = (await repository.listRoles()).find((role) => role.id === roleId);
      if (!existing) throw new Error('Role not found.');
      if (!canAccessTenant(profile, existing.tenantId)) return reply.code(404).send({ error: 'Role not found.' });
      return reply.code(200).send({ role: await repository.updateRole(roleId, { ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }) });
    }
    catch (error) { return errorReply(reply, error, 'Unable to update role.', 'Role not found.'); }
  });
  app.delete('/api/roles/:roleId', { preHandler: roleManagePreHandler }, async (request, reply) => {
    const { roleId } = request.params as { roleId: string };
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existing = (await repository.listRoles()).find((role) => role.id === roleId);
      if (!existing) throw new Error('Role not found.');
      if (!canAccessTenant(profile, existing.tenantId)) return reply.code(404).send({ error: 'Role not found.' });
      await repository.deleteRole(roleId); return reply.code(204).send();
    }
    catch (error) { return errorReply(reply, error, 'Unable to delete role.', 'Role not found.'); }
  });

  app.get('/api/groups', { preHandler: groupManagePreHandler }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    return { groups: filterTenantScoped(profile, await repository.listGroups()) };
  });
  app.post('/api/groups', { preHandler: groupManagePreHandler }, async (request, reply) => {
    const input = createGroupSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      return reply.code(201).send({ group: await repository.createGroup({ ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }) });
    }
    catch (error) { return errorReply(reply, error, 'Unable to create group.'); }
  });
  app.patch('/api/groups/:groupId', { preHandler: groupManagePreHandler }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    const input = updateGroupSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existing = (await repository.listGroups()).find((group) => group.id === groupId);
      if (!existing) throw new Error('Group not found.');
      if (!canAccessTenant(profile, existing.tenantId)) return reply.code(404).send({ error: 'Group not found.' });
      return reply.code(200).send({ group: await repository.updateGroup(groupId, { ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }) });
    }
    catch (error) { return errorReply(reply, error, 'Unable to update group.', 'Group not found.'); }
  });
  app.delete('/api/groups/:groupId', { preHandler: groupManagePreHandler }, async (request, reply) => {
    const { groupId } = request.params as { groupId: string };
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existing = (await repository.listGroups()).find((group) => group.id === groupId);
      if (!existing) throw new Error('Group not found.');
      if (!canAccessTenant(profile, existing.tenantId)) return reply.code(404).send({ error: 'Group not found.' });
      await repository.deleteGroup(groupId); return reply.code(204).send();
    }
    catch (error) { return errorReply(reply, error, 'Unable to delete group.', 'Group not found.'); }
  });

  app.get('/api/users', { preHandler: userManagePreHandler }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const users = await repository.listUsers();
    return { users: profileHasPermission(profile, 'tenants.manage') ? users : users.filter((entry) => entry.user.tenantId === profile.user.tenantId) };
  });
  app.post('/api/users', { preHandler: userManagePreHandler }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      return reply.code(201).send(await repository.createUser({ ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }));
    }
    catch (error) { return errorReply(reply, error, 'Unable to create user.'); }
  });
  app.patch('/api/users/:userId', { preHandler: userManagePreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const input = updateUserSchema.parse(request.body);
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existingTenantId = await resolveUserTenant(repository, userId);
      if (existingTenantId === undefined) throw new Error('User not found.');
      if (!canAccessTenant(profile, existingTenantId)) return reply.code(404).send({ error: 'User not found.' });
      return reply.code(200).send(await repository.updateUser(userId, { ...input, tenantId: tenantForScopedWrite(profile, input.tenantId) }));
    }
    catch (error) { return errorReply(reply, error, 'Unable to update user.', 'User not found.'); }
  });
  app.delete('/api/users/:userId', { preHandler: userManagePreHandler }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    try {
      const profile = (request as AuthenticatedRequest).authProfile;
      const existingTenantId = await resolveUserTenant(repository, userId);
      if (existingTenantId === undefined) throw new Error('User not found.');
      if (!canAccessTenant(profile, existingTenantId)) return reply.code(404).send({ error: 'User not found.' });
      await repository.deleteUser(userId); return reply.code(204).send();
    }
    catch (error) { return errorReply(reply, error, 'Unable to delete user.', 'User not found.'); }
  });
}
