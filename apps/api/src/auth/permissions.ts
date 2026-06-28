import type { AuthProfile, PermissionKey, RoleName, TenantId } from './types.js';

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  description: string;
  scope: 'global' | 'tenant' | 'self';
};

export const PERMISSIONS = [
  { key: 'dashboard.view', label: 'View dashboard', description: 'View dashboard summaries for accessible instances.', scope: 'tenant' },
  { key: 'instances.view', label: 'View instances', description: 'View accessible OxyGen instances and health details.', scope: 'tenant' },
  { key: 'instances.manage', label: 'Manage instances', description: 'Create, update, test, and delete scoped OxyGen instances.', scope: 'tenant' },
  { key: 'instances.importExport', label: 'Import/export instances', description: 'Import and export scoped OxyGen instance inventories.', scope: 'tenant' },
  { key: 'users.manage', label: 'Manage users', description: 'Create, update, and delete users within the authorized scope.', scope: 'tenant' },
  { key: 'groups.manage', label: 'Manage groups', description: 'Create, update, and delete groups within the authorized scope.', scope: 'tenant' },
  { key: 'roles.manage', label: 'Manage roles', description: 'Create, update, and delete non-system roles within the authorized scope.', scope: 'tenant' },
  { key: 'tenants.view', label: 'View tenants', description: 'View authorized Tenant records.', scope: 'tenant' },
  { key: 'tenants.manage', label: 'Manage tenants', description: 'Create, update, and delete Tenant records.', scope: 'global' },
  { key: 'logs.view', label: 'View logs', description: 'View activity history within the authorized scope.', scope: 'tenant' },
  { key: 'logs.maintain', label: 'Maintain logs', description: 'Clear or run retention maintenance for activity history.', scope: 'global' },
  { key: 'settings.manage', label: 'Manage settings', description: 'Update CMS-wide labels and application settings.', scope: 'global' },
  { key: 'settings.database.view', label: 'View database status', description: 'View database and schema status.', scope: 'global' },
  { key: 'settings.database.maintain', label: 'Maintain database', description: 'Run database maintenance and destructive operations.', scope: 'global' },
  { key: 'jobs.view', label: 'View jobs', description: 'View sanitized queue job, scheduler, and worker status details.', scope: 'global' },
  { key: 'jobs.manage', label: 'Manage jobs', description: 'Run, pause, resume, and administer queue jobs and recurring schedulers.', scope: 'global' },
  { key: 'system.poller.manage', label: 'Manage poller', description: 'Pause, resume, and run the background poller.', scope: 'global' },
  { key: 'system.version.view', label: 'View version', description: 'View CMS release and update information.', scope: 'tenant' },
  { key: 'issueTypes.view', label: 'View issue types', description: 'View issue classification catalog and affected instance summaries.', scope: 'tenant' },
  { key: 'processing.errors.view', label: 'View Processing Errors', description: 'View server-paged OxyGen Processing trigger, workflow event, and service event data for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.cancelTrigger', label: 'Cancel Processing Error triggers', description: 'Cancel individual OxyGen workflow triggers for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.recoverWorkflowEvent', label: 'Recover Processing Error workflow events', description: 'Resume individual OxyGen workflow events for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.cancelWorkflowEvent', label: 'Cancel Processing Error workflow events', description: 'Cancel individual OxyGen workflow events for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.restoreServiceEvent', label: 'Restore Processing Error service events', description: 'Restore individual OxyGen service events for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.downloadServiceEventFile', label: 'Download Processing Error service event files', description: 'Download individual OxyGen service event files for accessible instances.', scope: 'tenant' },
  { key: 'processing.errors.viewServiceEventMessage', label: 'View Processing Error service event messages', description: 'View individual OxyGen service event queue/message details for accessible instances.', scope: 'tenant' },
  { key: 'gridPreferences.manage', label: 'Manage own grid preferences', description: 'Save personal grid layout preferences.', scope: 'self' }
] as const satisfies readonly PermissionDefinition[];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SystemAdmin: [...ALL_PERMISSION_KEYS],
  TenantAdmin: [
    'dashboard.view',
    'instances.view',
    'instances.manage',
    'instances.importExport',
    'users.manage',
    'groups.manage',
    'roles.manage',
    'tenants.view',
    'logs.view',
    'system.version.view',
    'issueTypes.view',
    'processing.errors.view',
    'processing.errors.cancelTrigger',
    'processing.errors.recoverWorkflowEvent',
    'processing.errors.cancelWorkflowEvent',
    'processing.errors.restoreServiceEvent',
    'processing.errors.downloadServiceEventFile',
    'processing.errors.viewServiceEventMessage',
    'gridPreferences.manage'
  ],
  Operator: [
    'dashboard.view',
    'instances.view',
    'instances.manage',
    'logs.view',
    'system.version.view',
    'issueTypes.view',
    'processing.errors.view',
    'gridPreferences.manage'
  ],
  Viewer: [
    'dashboard.view',
    'instances.view',
    'system.version.view',
    'issueTypes.view',
    'processing.errors.view',
    'gridPreferences.manage'
  ]
};

export function defaultPermissionsForRole(roleName: RoleName): PermissionKey[] {
  return [...(DEFAULT_ROLE_PERMISSIONS[roleName] ?? [])];
}

export function normalizePermissionKeys(permissionKeys: readonly string[] | undefined): PermissionKey[] {
  const allowed = new Set<string>(ALL_PERMISSION_KEYS);
  const keys = Array.from(new Set((permissionKeys ?? []).map((key) => key.trim()).filter(Boolean)));
  const unknown = keys.find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Unknown permission: ${unknown}`);
  return keys as PermissionKey[];
}

export function profileHasPermission(profile: AuthProfile | undefined, permission: PermissionKey): boolean {
  return Boolean(profile?.permissions.includes(permission));
}

export function isGlobalProfile(profile: AuthProfile): boolean {
  return profile.user.tenantId === null && profileHasPermission(profile, 'tenants.manage');
}

export function canAccessTenant(profile: AuthProfile, tenantId: TenantId): boolean {
  if (isGlobalProfile(profile)) return true;
  return Boolean(profile.user.tenantId && tenantId === profile.user.tenantId);
}

export function requireScopedTenant(profile: AuthProfile, tenantId: TenantId, message = 'Tenant scope access denied.') {
  if (!canAccessTenant(profile, tenantId)) throw new Error(message);
}
