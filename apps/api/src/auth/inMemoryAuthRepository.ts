import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import {
  DEFAULT_ROLE_NAMES,
  SYSTEM_ROLE_NAMES,
  toPublicUser,
  type AuthProfile,
  type AuthRepository,
  type CmsGroup,
  type CmsRole,
  type CmsTenant,
  type CmsUser,
  type CreateGroupInput,
  type CreateRoleInput,
  type CreateTenantInput,
  type CreateUserInput,
  type RoleName,
  type TenantId,
  type UpdateGroupInput,
  type UpdateRoleInput,
  type UpdateTenantInput,
  type UpdateUserInput
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTenantId(tenantId: TenantId | undefined): TenantId {
  return tenantId ?? null;
}

export function createInMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, CmsUser>();
  const userRoles = new Map<string, Set<RoleName>>();
  const tenants = new Map<string, CmsTenant>();
  const roles = new Map<string, CmsRole>();
  const groups = new Map<string, CmsGroup>();
  const userGroups = new Map<string, Set<string>>();
  const sessions = new Map<string, string>();

  const seedTimestamp = nowIso();
  for (const roleName of DEFAULT_ROLE_NAMES) {
    const role: CmsRole = {
      id: randomUUID(),
      name: roleName,
      description: `${roleName} role`,
      tenantId: null,
      isSystem: SYSTEM_ROLE_NAMES.includes(roleName as (typeof SYSTEM_ROLE_NAMES)[number]),
      createdAt: seedTimestamp,
      updatedAt: seedTimestamp
    };
    roles.set(role.id, role);
  }

  function findUserByEmail(email: string): CmsUser | undefined {
    const normalized = normalizeEmail(email);
    return Array.from(users.values()).find((user) => user.email === normalized);
  }

  function findRoleByName(name: string): CmsRole | undefined {
    return Array.from(roles.values()).find((role) => role.name === name.trim());
  }

  function assertTenantExists(tenantId: TenantId) {
    if (tenantId && !tenants.has(tenantId)) throw new Error(`Unknown tenant: ${tenantId}`);
  }

  function assertRoles(roleNames: RoleName[], tenantId: TenantId) {
    for (const roleName of roleNames) {
      const role = findRoleByName(roleName);
      if (!role) throw new Error(`Unknown role: ${roleName}`);
      if (role.tenantId && role.tenantId !== tenantId) {
        throw new Error(`Role ${roleName} is not available for this tenant.`);
      }
    }
  }

  function assertGroups(groupIds: string[], tenantId: TenantId) {
    for (const groupId of groupIds) {
      const group = groups.get(groupId);
      if (!group) throw new Error(`Unknown group: ${groupId}`);
      if (group.tenantId && group.tenantId !== tenantId) {
        throw new Error(`Group ${group.name} is not available for this tenant.`);
      }
    }
  }

  function assertTenantUnchanged(existing: { tenantId: TenantId }, nextTenantId: TenantId) {
    if (existing.tenantId !== nextTenantId) throw new Error('Tenant assignment cannot be changed after creation.');
  }

  function buildProfile(user: CmsUser): AuthProfile {
    const profileRoles = Array.from(userRoles.get(user.id) ?? []) as RoleName[];
    const profileGroups = Array.from(userGroups.get(user.id) ?? [])
      .map((groupId) => groups.get(groupId))
      .filter((group): group is CmsGroup => Boolean(group))
      .map((group) => ({ id: group.id, name: group.name, tenantId: group.tenantId }));

    return {
      user: toPublicUser(user),
      roles: profileRoles,
      groups: profileGroups
    };
  }

  async function createUser(input: CreateUserInput): Promise<AuthProfile> {
    const tenantId = normalizeTenantId(input.tenantId);
    assertTenantExists(tenantId);
    assertRoles(input.roleNames, tenantId);
    assertGroups(input.groupIds, tenantId);
    const email = normalizeEmail(input.email);
    if (findUserByEmail(email)) throw new Error('A user with this email already exists.');

    const password = await hashPassword(input.password);
    const timestamp = nowIso();
    const user: CmsUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash: password.passwordHash,
      passwordSalt: password.passwordSalt,
      tenantId,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    users.set(user.id, user);
    userRoles.set(user.id, new Set(input.roleNames));
    userGroups.set(user.id, new Set(input.groupIds));
    return buildProfile(user);
  }

  async function updateUser(userId: string, input: UpdateUserInput): Promise<AuthProfile> {
    const existing = users.get(userId);
    if (!existing) throw new Error('User not found.');
    const tenantId = normalizeTenantId(input.tenantId);
    assertTenantUnchanged(existing, tenantId);
    assertTenantExists(tenantId);
    assertRoles(input.roleNames, tenantId);
    assertGroups(input.groupIds, tenantId);

    const email = normalizeEmail(input.email);
    const duplicate = findUserByEmail(email);
    if (duplicate && duplicate.id !== userId) throw new Error('A user with this email already exists.');

    let passwordHash = existing.passwordHash;
    let passwordSalt = existing.passwordSalt;
    if (input.password) {
      const password = await hashPassword(input.password);
      passwordHash = password.passwordHash;
      passwordSalt = password.passwordSalt;
    }

    const user: CmsUser = {
      ...existing,
      email,
      displayName: input.displayName.trim(),
      passwordHash,
      passwordSalt,
      updatedAt: nowIso()
    };
    users.set(user.id, user);
    userRoles.set(user.id, new Set(input.roleNames));
    userGroups.set(user.id, new Set(input.groupIds));
    return buildProfile(user);
  }

  return {
    async hasUsers() {
      return users.size > 0;
    },
    async bootstrapAdmin(input) {
      if (users.size > 0) throw new Error('Admin bootstrap has already been completed.');
      return createUser({ ...input, roleNames: ['SystemAdmin'], groupIds: [], tenantId: null });
    },
    async authenticate(email, password) {
      const user = findUserByEmail(email);
      if (!user || !user.isActive) return null;
      const valid = await verifyPassword(password, { passwordHash: user.passwordHash, passwordSalt: user.passwordSalt });
      return valid ? buildProfile(user) : null;
    },
    async createSession(userId) {
      const token = randomUUID() + randomUUID().replace(/-/g, '');
      sessions.set(token, userId);
      return token;
    },
    async getProfileByToken(token) {
      const userId = sessions.get(token);
      if (!userId) return null;
      const user = users.get(userId);
      if (!user || !user.isActive) return null;
      return buildProfile(user);
    },
    async createTenant(input: CreateTenantInput) {
      const timestamp = nowIso();
      const tenant: CmsTenant = { id: randomUUID(), name: input.name.trim(), description: input.description?.trim() || null, createdAt: timestamp, updatedAt: timestamp };
      tenants.set(tenant.id, tenant);
      return tenant;
    },
    async updateTenant(tenantId: string, input: UpdateTenantInput) {
      const existing = tenants.get(tenantId);
      if (!existing) throw new Error('Tenant not found.');
      const tenant: CmsTenant = { ...existing, name: input.name.trim(), description: input.description?.trim() || null, updatedAt: nowIso() };
      tenants.set(tenant.id, tenant);
      return tenant;
    },
    async deleteTenant(tenantId: string) {
      if (!tenants.has(tenantId)) throw new Error('Tenant not found.');
      if (Array.from(users.values()).some((user) => user.tenantId === tenantId)) throw new Error('Tenant is assigned to one or more users.');
      if (Array.from(groups.values()).some((group) => group.tenantId === tenantId)) throw new Error('Tenant is assigned to one or more groups.');
      if (Array.from(roles.values()).some((role) => role.tenantId === tenantId)) throw new Error('Tenant is assigned to one or more roles.');
      tenants.delete(tenantId);
    },
    async listTenants() {
      return Array.from(tenants.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    async createRole(input: CreateRoleInput) {
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantExists(tenantId);
      if (findRoleByName(input.name)) throw new Error('A role with this name already exists.');
      if (SYSTEM_ROLE_NAMES.includes(input.name as (typeof SYSTEM_ROLE_NAMES)[number])) throw new Error('System role names are reserved.');
      const timestamp = nowIso();
      const role: CmsRole = { id: randomUUID(), name: input.name.trim(), description: input.description?.trim() || null, tenantId, isSystem: false, createdAt: timestamp, updatedAt: timestamp };
      roles.set(role.id, role);
      return role;
    },
    async updateRole(roleId: string, input: UpdateRoleInput) {
      const existing = roles.get(roleId);
      if (!existing) throw new Error('Role not found.');
      if (existing.isSystem) throw new Error('System roles cannot be modified.');
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantUnchanged(existing, tenantId);
      assertTenantExists(tenantId);
      const duplicate = findRoleByName(input.name);
      if (duplicate && duplicate.id !== roleId) throw new Error('A role with this name already exists.');
      if (SYSTEM_ROLE_NAMES.includes(input.name as (typeof SYSTEM_ROLE_NAMES)[number])) throw new Error('System role names are reserved.');
      const role: CmsRole = { ...existing, name: input.name.trim(), description: input.description?.trim() || null, updatedAt: nowIso() };
      roles.set(role.id, role);
      return role;
    },
    async deleteRole(roleId: string) {
      const role = roles.get(roleId);
      if (!role) throw new Error('Role not found.');
      if (role.isSystem) throw new Error('System roles cannot be deleted.');
      if (Array.from(userRoles.values()).some((assigned) => assigned.has(role.name))) throw new Error('Role is assigned to one or more users.');
      roles.delete(roleId);
    },
    async listRoles() {
      return Array.from(roles.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    async createGroup(input: CreateGroupInput) {
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantExists(tenantId);
      const timestamp = nowIso();
      const group: CmsGroup = { id: randomUUID(), name: input.name.trim(), description: input.description?.trim() || null, tenantId, createdAt: timestamp, updatedAt: timestamp };
      groups.set(group.id, group);
      return group;
    },
    async updateGroup(groupId: string, input: UpdateGroupInput) {
      const existing = groups.get(groupId);
      if (!existing) throw new Error('Group not found.');
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantUnchanged(existing, tenantId);
      assertTenantExists(tenantId);
      const group: CmsGroup = { ...existing, name: input.name.trim(), description: input.description?.trim() || null, updatedAt: nowIso() };
      groups.set(group.id, group);
      return group;
    },
    async deleteGroup(groupId: string) {
      if (!groups.has(groupId)) throw new Error('Group not found.');
      groups.delete(groupId);
      for (const assigned of Array.from(userGroups.values())) assigned.delete(groupId);
    },
    async listGroups() {
      return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    createUser,
    updateUser,
    async deleteUser(userId: string) {
      if (!users.has(userId)) throw new Error('User not found.');
      users.delete(userId);
      userRoles.delete(userId);
      userGroups.delete(userId);
      for (const [token, sessionUserId] of Array.from(sessions.entries())) if (sessionUserId === userId) sessions.delete(token);
    },
    async listUsers() {
      return Array.from(users.values()).map(buildProfile).sort((a, b) => a.user.email.localeCompare(b.user.email));
    }
  };
}
