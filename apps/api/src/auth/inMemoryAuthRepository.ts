import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import { ROLE_NAMES, toPublicUser, type AuthProfile, type AuthRepository, type CmsGroup, type CmsUser, type CreateGroupInput, type CreateUserInput, type RoleName } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertRoles(roleNames: RoleName[]) {
  for (const roleName of roleNames) {
    if (!ROLE_NAMES.includes(roleName)) {
      throw new Error(`Unknown role: ${roleName}`);
    }
  }
}

export function createInMemoryAuthRepository(): AuthRepository {
  const users = new Map<string, CmsUser>();
  const userRoles = new Map<string, Set<RoleName>>();
  const groups = new Map<string, CmsGroup>();
  const userGroups = new Map<string, Set<string>>();
  const sessions = new Map<string, string>();

  function findUserByEmail(email: string): CmsUser | undefined {
    const normalized = normalizeEmail(email);
    return Array.from(users.values()).find((user) => user.email === normalized);
  }

  function buildProfile(user: CmsUser): AuthProfile {
    const roles = Array.from(userRoles.get(user.id) ?? []) as RoleName[];
    const profileGroups = Array.from(userGroups.get(user.id) ?? [])
      .map((groupId) => groups.get(groupId))
      .filter((group): group is CmsGroup => Boolean(group))
      .map((group) => ({ id: group.id, name: group.name }));

    return {
      user: toPublicUser(user),
      roles,
      groups: profileGroups
    };
  }

  async function createUser(input: CreateUserInput): Promise<AuthProfile> {
    assertRoles(input.roleNames);
    const email = normalizeEmail(input.email);
    if (findUserByEmail(email)) {
      throw new Error('A user with this email already exists.');
    }
    for (const groupId of input.groupIds) {
      if (!groups.has(groupId)) throw new Error(`Unknown group: ${groupId}`);
    }
    const password = await hashPassword(input.password);
    const timestamp = nowIso();
    const user: CmsUser = {
      id: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash: password.passwordHash,
      passwordSalt: password.passwordSalt,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
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
      return createUser({ ...input, roleNames: ['SystemAdmin'], groupIds: [] });
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
    async createGroup(input: CreateGroupInput) {
      const timestamp = nowIso();
      const group: CmsGroup = {
        id: randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      groups.set(group.id, group);
      return group;
    },
    async listGroups() {
      return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    createUser,
    async listUsers() {
      return Array.from(users.values()).map(buildProfile).sort((a, b) => a.user.email.localeCompare(b.user.email));
    }
  };
}
