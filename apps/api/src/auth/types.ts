export const SYSTEM_ROLE_NAMES = ['SystemAdmin', 'TenantAdmin'] as const;
export const DEFAULT_ROLE_NAMES = ['SystemAdmin', 'TenantAdmin', 'Operator', 'Viewer'] as const;
export type RoleName = string;

export type TenantId = string | null;
export type GroupInstanceAccessMode = 'none' | 'all' | 'specific';
export type UserInstanceAccessMode = 'inherit' | 'none' | 'all' | 'specific';

export type CmsTenant = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CmsRole = {
  id: string;
  name: string;
  description: string | null;
  tenantId: TenantId;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CmsUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  tenantId: TenantId;
  instanceAccessMode: UserInstanceAccessMode;
  instanceIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CmsGroup = {
  id: string;
  name: string;
  description: string | null;
  tenantId: TenantId;
  instanceAccessMode: GroupInstanceAccessMode;
  instanceIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  tenantId: TenantId;
  instanceAccessMode: UserInstanceAccessMode;
  instanceIds: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthProfile = {
  user: PublicUser;
  roles: RoleName[];
  groups: Array<Pick<CmsGroup, 'id' | 'name' | 'tenantId' | 'instanceAccessMode' | 'instanceIds'>>;
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  password: string;
  roleNames: RoleName[];
  groupIds: string[];
  tenantId?: TenantId;
  instanceAccessMode?: UserInstanceAccessMode;
  instanceIds?: string[];
};

export type UpdateUserInput = {
  email: string;
  displayName: string;
  password?: string;
  roleNames: RoleName[];
  groupIds: string[];
  tenantId?: TenantId;
  instanceAccessMode?: UserInstanceAccessMode;
  instanceIds?: string[];
};

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  tenantId?: TenantId;
  instanceAccessMode?: GroupInstanceAccessMode;
  instanceIds?: string[];
};

export type UpdateGroupInput = CreateGroupInput;

export type CreateRoleInput = {
  name: string;
  description?: string | null;
  tenantId?: TenantId;
};

export type UpdateRoleInput = CreateRoleInput;

export type CreateTenantInput = {
  name: string;
  description?: string | null;
};

export type UpdateTenantInput = CreateTenantInput;

export type AuthRepository = {
  hasUsers(): Promise<boolean>;
  bootstrapAdmin(input: { email: string; displayName: string; password: string }): Promise<AuthProfile>;
  authenticate(email: string, password: string): Promise<AuthProfile | null>;
  createSession(userId: string): Promise<string>;
  getProfileByToken(token: string): Promise<AuthProfile | null>;
  createTenant(input: CreateTenantInput): Promise<CmsTenant>;
  updateTenant(tenantId: string, input: UpdateTenantInput): Promise<CmsTenant>;
  deleteTenant(tenantId: string): Promise<void>;
  listTenants(): Promise<CmsTenant[]>;
  createRole(input: CreateRoleInput): Promise<CmsRole>;
  updateRole(roleId: string, input: UpdateRoleInput): Promise<CmsRole>;
  deleteRole(roleId: string): Promise<void>;
  listRoles(): Promise<CmsRole[]>;
  createGroup(input: CreateGroupInput): Promise<CmsGroup>;
  updateGroup(groupId: string, input: UpdateGroupInput): Promise<CmsGroup>;
  deleteGroup(groupId: string): Promise<void>;
  listGroups(): Promise<CmsGroup[]>;
  createUser(input: CreateUserInput): Promise<AuthProfile>;
  updateUser(userId: string, input: UpdateUserInput): Promise<AuthProfile>;
  deleteUser(userId: string): Promise<void>;
  listUsers(): Promise<AuthProfile[]>;
};

export function toPublicUser(user: CmsUser): PublicUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...publicUser } = user;
  return publicUser;
}
