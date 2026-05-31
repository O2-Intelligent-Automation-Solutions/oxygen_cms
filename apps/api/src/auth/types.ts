export const ROLE_NAMES = ['SystemAdmin', 'PartnerAdmin', 'Operator', 'Viewer'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export type CmsUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CmsGroup = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthProfile = {
  user: PublicUser;
  roles: RoleName[];
  groups: Array<Pick<CmsGroup, 'id' | 'name'>>;
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  password: string;
  roleNames: RoleName[];
  groupIds: string[];
};

export type CreateGroupInput = {
  name: string;
  description?: string | null;
};

export type AuthRepository = {
  hasUsers(): Promise<boolean>;
  bootstrapAdmin(input: { email: string; displayName: string; password: string }): Promise<AuthProfile>;
  authenticate(email: string, password: string): Promise<AuthProfile | null>;
  createSession(userId: string): Promise<string>;
  getProfileByToken(token: string): Promise<AuthProfile | null>;
  createGroup(input: CreateGroupInput): Promise<CmsGroup>;
  listGroups(): Promise<CmsGroup[]>;
  createUser(input: CreateUserInput): Promise<AuthProfile>;
  listUsers(): Promise<AuthProfile[]>;
};

export function toPublicUser(user: CmsUser): PublicUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...publicUser } = user;
  return publicUser;
}
