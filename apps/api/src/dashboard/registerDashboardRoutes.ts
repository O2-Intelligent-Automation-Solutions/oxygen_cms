import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository, TenantId } from '../auth/types.js';
import type { InstanceRepository, OxyGenInstance } from '../instances/types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

type DashboardScope = 'tenant' | 'global';

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

function componentIssue(status: string) {
  return status !== 'ok' && status !== 'unknown';
}

function instanceIssues(instance: OxyGenInstance) {
  const issues: string[] = [];
  if (!instance.isEnabled) issues.push('Polling disabled');
  if (instance.status !== 'up' && instance.status !== 'unknown') issues.push(`Availability ${instance.status}`);
  if (instance.sslValid === false || instance.status === 'ssl-error') issues.push('SSL issue');
  if (instance.licenseStatus === 'expired' || instance.licenseStatus === 'error') issues.push(`License ${instance.licenseStatus}`);
  if (componentIssue(instance.processingStatus)) issues.push(`Processing ${instance.processingStatus}`);
  if (componentIssue(instance.emmQueueStatus)) issues.push(`EMM Queue ${instance.emmQueueStatus}`);
  if (componentIssue(instance.smsStatus)) issues.push(`SMS ${instance.smsStatus}`);
  if (componentIssue(instance.hangfireStatus)) issues.push(`Hangfire ${instance.hangfireStatus}`);
  if (instance.lastError) issues.push(instance.lastError);
  return Array.from(new Set(issues));
}

export async function registerDashboardRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: InstanceRepository) {
  app.get('/api/dashboard', { preHandler: requireAuth(authRepository) }, async (request) => {
    const profile = (request as AuthenticatedRequest).authProfile;
    const scope: DashboardScope = profile.user.tenantId ? 'tenant' : 'global';
    const tenantId: TenantId = scope === 'tenant' ? profile.user.tenantId : null;
    const [tenants, groups, users, roles, scopedInstances] = await Promise.all([
      authRepository.listTenants(),
      authRepository.listGroups(),
      authRepository.listUsers(),
      authRepository.listRoles(),
      instanceRepository.listInstances(instanceScope(profile))
    ]);

    const scopedByTenant = <T extends { tenantId: TenantId }>(items: T[]) => scope === 'tenant'
      ? items.filter((item) => item.tenantId === tenantId)
      : items;
    const dashboardInstances = scope === 'tenant'
      ? scopedInstances.filter((instance) => instance.tenantId === tenantId)
      : scopedInstances;
    const dashboardRoles = scope === 'tenant'
      ? roles.filter((role) => role.tenantId === tenantId || role.tenantId === null)
      : roles;
    const tenant = tenantId ? tenants.find((entry) => entry.id === tenantId) ?? null : null;
    const instances = dashboardInstances.map((instance) => {
      const issues = instanceIssues(instance);
      return {
        ...instance,
        issues,
        issueCount: issues.length,
        hasIssue: issues.length > 0
      };
    });

    return {
      dashboard: {
        scope,
        tenant: tenant ? { id: tenant.id, name: tenant.name, description: tenant.description } : null,
        counts: {
          tenants: scope === 'tenant' ? 1 : tenants.length,
          groups: scopedByTenant(groups).length,
          users: scopedByTenant(users.map((entry) => entry.user)).length,
          roles: dashboardRoles.length,
          tenantRoles: scope === 'tenant' ? roles.filter((role) => role.tenantId === tenantId).length : roles.filter((role) => role.tenantId !== null).length,
          globalRoles: roles.filter((role) => role.tenantId === null).length,
          instances: instances.length,
          totalInstances: instances.length,
          instancesWithIssues: instances.filter((instance) => instance.hasIssue).length,
          upInstances: instances.filter((instance) => instance.status === 'up').length,
          downInstances: instances.filter((instance) => instance.status === 'down').length,
          sslIssues: instances.filter((instance) => instance.sslValid === false || instance.status === 'ssl-error').length,
          licenseIssues: instances.filter((instance) => instance.licenseStatus === 'expired' || instance.licenseStatus === 'error').length,
          disabledInstances: instances.filter((instance) => !instance.isEnabled).length
        },
        instances
      }
    };
  });
}
