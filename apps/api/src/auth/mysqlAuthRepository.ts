import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import { hashPassword, verifyPassword } from './password.js';
import {
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
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTenantId(tenantId: TenantId | undefined): TenantId {
  return tenantId ?? null;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')).toISOString();
  return nowIso();
}

type TenantRow = RowDataPacket & { id: string; name: string; description: string | null; created_at: Date | string; updated_at: Date | string };
type RoleRow = RowDataPacket & { id: string; name: string; description: string | null; tenant_id: string | null; protected: number | boolean; created_at: Date | string; updated_at: Date | string };
type GroupRow = RowDataPacket & { id: string; name: string; description: string | null; tenant_id: string | null; created_at: Date | string; updated_at: Date | string };
type UserRow = RowDataPacket & { id: string; email: string; display_name: string; password_hash: string; password_salt: string; tenant_id: string | null; is_active: number | boolean; created_at: Date | string; updated_at: Date | string };

function mapTenant(row: TenantRow): CmsTenant {
  return { id: row.id, name: row.name, description: row.description, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

function mapRole(row: RoleRow): CmsRole {
  return { id: row.id, name: row.name, description: row.description, tenantId: row.tenant_id, isSystem: Boolean(row.protected), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

function mapGroup(row: GroupRow): CmsGroup {
  return { id: row.id, name: row.name, description: row.description, tenantId: row.tenant_id, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

function mapUser(row: UserRow): CmsUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    tenantId: row.tenant_id,
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function createPoolFromDatabaseSettings(settings: DatabaseSettings): Pool {
  return createPool({
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    connectionLimit: 10
  });
}

export function createMysqlAuthRepository(pool: Pool): AuthRepository {
  async function one<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
    const [rows] = await pool.execute<T[]>(sql, params as never[]);
    return rows[0] ?? null;
  }

  async function many<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await pool.execute<T[]>(sql, params as never[]);
    return rows;
  }

  async function findUserByEmail(email: string) {
    const row = await one<UserRow>('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizeEmail(email)]);
    return row ? mapUser(row) : null;
  }

  async function findUserById(userId: string) {
    const row = await one<UserRow>('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    return row ? mapUser(row) : null;
  }

  async function findRoleByName(name: string) {
    const row = await one<RoleRow>('SELECT * FROM roles WHERE name = ? ORDER BY tenant_id IS NOT NULL ASC LIMIT 1', [name.trim()]);
    return row ? mapRole(row) : null;
  }

  async function findGroupById(groupId: string) {
    const row = await one<GroupRow>('SELECT * FROM user_groups WHERE id = ? LIMIT 1', [groupId]);
    return row ? mapGroup(row) : null;
  }

  async function assertTenantExists(tenantId: TenantId) {
    if (!tenantId) return;
    const row = await one<TenantRow>('SELECT * FROM tenants WHERE id = ? LIMIT 1', [tenantId]);
    if (!row) throw new Error(`Unknown tenant: ${tenantId}`);
  }

  async function assertRoles(roleNames: RoleName[], tenantId: TenantId) {
    for (const roleName of roleNames) {
      const role = await findRoleByName(roleName);
      if (!role) throw new Error(`Unknown role: ${roleName}`);
      if (role.tenantId && role.tenantId !== tenantId) throw new Error(`Role ${roleName} is not available for this tenant.`);
    }
  }

  async function assertGroups(groupIds: string[], tenantId: TenantId) {
    for (const groupId of groupIds) {
      const group = await findGroupById(groupId);
      if (!group) throw new Error(`Unknown group: ${groupId}`);
      if (group.tenantId && group.tenantId !== tenantId) throw new Error(`Group ${group.name} is not available for this tenant.`);
    }
  }

  function assertTenantUnchanged(existing: { tenantId: TenantId }, nextTenantId: TenantId) {
    if (existing.tenantId !== nextTenantId) throw new Error('Tenant assignment cannot be changed after creation.');
  }

  async function buildProfile(user: CmsUser): Promise<AuthProfile> {
    const roleRows = await many<RoleRow>(
      `SELECT r.* FROM roles r
       INNER JOIN user_role_assignments ura ON ura.role_id = r.id
       WHERE ura.user_id = ?
       ORDER BY r.name ASC`,
      [user.id]
    );
    const groupRows = await many<GroupRow>(
      `SELECT g.* FROM user_groups g
       INNER JOIN user_group_assignments uga ON uga.group_id = g.id
       WHERE uga.user_id = ?
       ORDER BY g.name ASC`,
      [user.id]
    );

    return {
      user: toPublicUser(user),
      roles: roleRows.map((role) => role.name),
      groups: groupRows.map((group) => ({ id: group.id, name: group.name, tenantId: group.tenant_id }))
    };
  }

  async function replaceUserAssignments(userId: string, roleNames: RoleName[], groupIds: string[]) {
    await pool.execute('DELETE FROM user_role_assignments WHERE user_id = ?', [userId]);
    for (const roleName of roleNames) {
      const role = await findRoleByName(roleName);
      if (!role) throw new Error(`Unknown role: ${roleName}`);
      await pool.execute('INSERT INTO user_role_assignments (user_id, role_id) VALUES (?, ?)', [userId, role.id]);
    }

    await pool.execute('DELETE FROM user_group_assignments WHERE user_id = ?', [userId]);
    for (const groupId of groupIds) {
      await pool.execute('INSERT INTO user_group_assignments (user_id, group_id) VALUES (?, ?)', [userId, groupId]);
    }
  }

  async function createUser(input: CreateUserInput): Promise<AuthProfile> {
    const tenantId = normalizeTenantId(input.tenantId);
    await assertTenantExists(tenantId);
    await assertRoles(input.roleNames, tenantId);
    await assertGroups(input.groupIds, tenantId);
    const email = normalizeEmail(input.email);
    if (await findUserByEmail(email)) throw new Error('A user with this email already exists.');

    const password = await hashPassword(input.password);
    const id = randomUUID();
    await pool.execute(
      'INSERT INTO users (id, email, display_name, password_hash, password_salt, tenant_id, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, email, input.displayName.trim(), password.passwordHash, password.passwordSalt, tenantId]
    );
    await replaceUserAssignments(id, input.roleNames, input.groupIds);
    const user = await findUserById(id);
    if (!user) throw new Error('User not found.');
    return buildProfile(user);
  }

  async function updateUser(userId: string, input: UpdateUserInput): Promise<AuthProfile> {
    const existing = await findUserById(userId);
    if (!existing) throw new Error('User not found.');
    const tenantId = normalizeTenantId(input.tenantId);
    assertTenantUnchanged(existing, tenantId);
    await assertTenantExists(tenantId);
    await assertRoles(input.roleNames, tenantId);
    await assertGroups(input.groupIds, tenantId);
    const email = normalizeEmail(input.email);
    const duplicate = await findUserByEmail(email);
    if (duplicate && duplicate.id !== userId) throw new Error('A user with this email already exists.');

    if (input.password) {
      const password = await hashPassword(input.password);
      await pool.execute('UPDATE users SET email = ?, display_name = ?, password_hash = ?, password_salt = ? WHERE id = ?', [email, input.displayName.trim(), password.passwordHash, password.passwordSalt, userId]);
    } else {
      await pool.execute('UPDATE users SET email = ?, display_name = ? WHERE id = ?', [email, input.displayName.trim(), userId]);
    }
    await replaceUserAssignments(userId, input.roleNames, input.groupIds);
    const user = await findUserById(userId);
    if (!user) throw new Error('User not found.');
    return buildProfile(user);
  }

  return {
    async hasUsers() {
      const row = await one<RowDataPacket & { count: number }>('SELECT COUNT(*) AS count FROM users');
      return Number(row?.count ?? 0) > 0;
    },
    async bootstrapAdmin(input) {
      if (await this.hasUsers()) throw new Error('Admin bootstrap has already been completed.');
      return createUser({ ...input, roleNames: ['SystemAdmin'], groupIds: [], tenantId: null });
    },
    async authenticate(email, password) {
      const user = await findUserByEmail(email);
      if (!user || !user.isActive) return null;
      const valid = await verifyPassword(password, { passwordHash: user.passwordHash, passwordSalt: user.passwordSalt });
      return valid ? buildProfile(user) : null;
    },
    async createSession(userId) {
      const token = `${randomUUID()}${randomUUID().replace(/-/g, '')}`;
      await pool.execute('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, userId]);
      return token;
    },
    async getProfileByToken(token) {
      const row = await one<UserRow>(
        `SELECT u.* FROM users u
         INNER JOIN sessions s ON s.user_id = u.id
         WHERE s.token = ? AND u.is_active = 1 AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
         LIMIT 1`,
        [token]
      );
      return row ? buildProfile(mapUser(row)) : null;
    },
    async createTenant(input: CreateTenantInput) {
      const id = randomUUID();
      try {
        await pool.execute('INSERT INTO tenants (id, name, description) VALUES (?, ?, ?)', [id, input.name.trim(), input.description?.trim() || null]);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') throw new Error('A tenant with this name already exists.');
        throw error;
      }
      const row = await one<TenantRow>('SELECT * FROM tenants WHERE id = ?', [id]);
      if (!row) throw new Error('Tenant not found.');
      return mapTenant(row);
    },
    async updateTenant(tenantId: string, input: UpdateTenantInput) {
      const existing = await one<TenantRow>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
      if (!existing) throw new Error('Tenant not found.');
      await pool.execute('UPDATE tenants SET name = ?, description = ? WHERE id = ?', [input.name.trim(), input.description?.trim() || null, tenantId]);
      const row = await one<TenantRow>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
      if (!row) throw new Error('Tenant not found.');
      return mapTenant(row);
    },
    async deleteTenant(tenantId: string) {
      const existing = await one<TenantRow>('SELECT * FROM tenants WHERE id = ?', [tenantId]);
      if (!existing) throw new Error('Tenant not found.');
      if (await one<RowDataPacket>('SELECT id FROM users WHERE tenant_id = ? LIMIT 1', [tenantId])) throw new Error('Tenant is assigned to one or more users.');
      if (await one<RowDataPacket>('SELECT id FROM user_groups WHERE tenant_id = ? LIMIT 1', [tenantId])) throw new Error('Tenant is assigned to one or more groups.');
      if (await one<RowDataPacket>('SELECT id FROM roles WHERE tenant_id = ? LIMIT 1', [tenantId])) throw new Error('Tenant is assigned to one or more roles.');
      await pool.execute('DELETE FROM tenants WHERE id = ?', [tenantId]);
    },
    async listTenants() {
      return (await many<TenantRow>('SELECT * FROM tenants ORDER BY name ASC')).map(mapTenant);
    },
    async createRole(input: CreateRoleInput) {
      const tenantId = normalizeTenantId(input.tenantId);
      await assertTenantExists(tenantId);
      if (await findRoleByName(input.name)) throw new Error('A role with this name already exists.');
      if (SYSTEM_ROLE_NAMES.includes(input.name as (typeof SYSTEM_ROLE_NAMES)[number])) throw new Error('System role names are reserved.');
      const id = randomUUID();
      await pool.execute('INSERT INTO roles (id, name, description, tenant_id, protected) VALUES (?, ?, ?, ?, 0)', [id, input.name.trim(), input.description?.trim() || null, tenantId]);
      const row = await one<RoleRow>('SELECT * FROM roles WHERE id = ?', [id]);
      if (!row) throw new Error('Role not found.');
      return mapRole(row);
    },
    async updateRole(roleId: string, input: UpdateRoleInput) {
      const existingRow = await one<RoleRow>('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!existingRow) throw new Error('Role not found.');
      const existing = mapRole(existingRow);
      if (existing.isSystem) throw new Error('System roles cannot be modified.');
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantUnchanged(existing, tenantId);
      await assertTenantExists(tenantId);
      const duplicate = await findRoleByName(input.name);
      if (duplicate && duplicate.id !== roleId) throw new Error('A role with this name already exists.');
      if (SYSTEM_ROLE_NAMES.includes(input.name as (typeof SYSTEM_ROLE_NAMES)[number])) throw new Error('System role names are reserved.');
      await pool.execute('UPDATE roles SET name = ?, description = ? WHERE id = ?', [input.name.trim(), input.description?.trim() || null, roleId]);
      const row = await one<RoleRow>('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!row) throw new Error('Role not found.');
      return mapRole(row);
    },
    async deleteRole(roleId: string) {
      const role = await one<RoleRow>('SELECT * FROM roles WHERE id = ?', [roleId]);
      if (!role) throw new Error('Role not found.');
      if (Boolean(role.protected)) throw new Error('System roles cannot be deleted.');
      if (await one<RowDataPacket>('SELECT user_id FROM user_role_assignments WHERE role_id = ? LIMIT 1', [roleId])) throw new Error('Role is assigned to one or more users.');
      await pool.execute('DELETE FROM roles WHERE id = ?', [roleId]);
    },
    async listRoles() {
      return (await many<RoleRow>('SELECT * FROM roles ORDER BY name ASC')).map(mapRole);
    },
    async createGroup(input: CreateGroupInput) {
      const tenantId = normalizeTenantId(input.tenantId);
      await assertTenantExists(tenantId);
      const existing = await many<GroupRow>('SELECT * FROM user_groups WHERE name = ?', [input.name.trim()]);
      if (existing.some((group) => group.tenant_id === tenantId)) throw new Error('A group with this name already exists.');
      const id = randomUUID();
      await pool.execute('INSERT INTO user_groups (id, name, description, tenant_id) VALUES (?, ?, ?, ?)', [id, input.name.trim(), input.description?.trim() || null, tenantId]);
      const row = await one<GroupRow>('SELECT * FROM user_groups WHERE id = ?', [id]);
      if (!row) throw new Error('Group not found.');
      return mapGroup(row);
    },
    async updateGroup(groupId: string, input: UpdateGroupInput) {
      const existingRow = await one<GroupRow>('SELECT * FROM user_groups WHERE id = ?', [groupId]);
      if (!existingRow) throw new Error('Group not found.');
      const existing = mapGroup(existingRow);
      const tenantId = normalizeTenantId(input.tenantId);
      assertTenantUnchanged(existing, tenantId);
      await assertTenantExists(tenantId);
      await pool.execute('UPDATE user_groups SET name = ?, description = ? WHERE id = ?', [input.name.trim(), input.description?.trim() || null, groupId]);
      const row = await one<GroupRow>('SELECT * FROM user_groups WHERE id = ?', [groupId]);
      if (!row) throw new Error('Group not found.');
      return mapGroup(row);
    },
    async deleteGroup(groupId: string) {
      if (!(await one<GroupRow>('SELECT * FROM user_groups WHERE id = ?', [groupId]))) throw new Error('Group not found.');
      await pool.execute('DELETE FROM user_groups WHERE id = ?', [groupId]);
    },
    async listGroups() {
      return (await many<GroupRow>('SELECT * FROM user_groups ORDER BY name ASC')).map(mapGroup);
    },
    createUser,
    updateUser,
    async deleteUser(userId: string) {
      if (!(await findUserById(userId))) throw new Error('User not found.');
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    },
    async listUsers() {
      const rows = await many<UserRow>('SELECT * FROM users ORDER BY email ASC');
      return Promise.all(rows.map((row) => buildProfile(mapUser(row))));
    }
  };
}

export function createSetupAwareAuthRepository(settingsStore: SetupSettingsStore, fallback: AuthRepository): AuthRepository {
  let cachedKey: string | null = null;
  let cachedRepository: AuthRepository | null = null;
  let cachedPool: Pool | null = null;

  async function currentRepository() {
    const [databaseSettings, schemaCurrent] = await Promise.all([
      settingsStore.getDatabaseSettings(),
      settingsStore.isSchemaCurrent()
    ]);
    if (!databaseSettings || !schemaCurrent) return fallback;
    const key = JSON.stringify(databaseSettings);
    if (cachedRepository && cachedKey === key) return cachedRepository;
    if (cachedPool) await cachedPool.end();
    cachedPool = createPoolFromDatabaseSettings(databaseSettings);
    cachedRepository = createMysqlAuthRepository(cachedPool);
    cachedKey = key;
    return cachedRepository;
  }

  return new Proxy({} as AuthRepository, {
    get(_target, property: keyof AuthRepository) {
      return async (...args: never[]) => {
        const repository = await currentRepository();
        const method = repository[property] as (...methodArgs: never[]) => unknown;
        return method(...args);
      };
    }
  });
}
