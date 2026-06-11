import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository, TenantId } from '../auth/types.js';
import type { InstancePoller } from '../instances/instancePoller.js';
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

type DashboardSeverity = 'ok' | 'warning' | 'failure' | 'unknown';
type DashboardIssue = { label: string; severity: Exclude<DashboardSeverity, 'ok' | 'unknown'> };

function componentFailure(status: string) {
  return status === 'error';
}

function componentWarning(status: string) {
  return status === 'warning';
}

function sslIssue(instance: OxyGenInstance) {
  return instance.protocol === 'https' && (instance.sslValid === false || instance.status === 'ssl-error');
}

function connectivityIssue(instance: OxyGenInstance) {
  return instance.status !== 'up' && instance.status !== 'unknown' && instance.status !== 'ssl-error';
}

function licenseEvaluationEligible(instance: OxyGenInstance) {
  return instance.checkLicense && instance.status === 'up';
}

function licenseFailure(instance: OxyGenInstance) {
  if (!licenseEvaluationEligible(instance)) return false;
  return instance.licenseStatus === 'expired' || instance.licenseStatus === 'error' || (!instance.licenseKey && instance.licenseStatus !== 'unknown' && instance.licenseStatus !== 'warning');
}

function licenseWarning(instance: OxyGenInstance) {
  if (!licenseEvaluationEligible(instance)) return false;
  return instance.licenseStatus === 'warning' || (!instance.licenseKey && instance.licenseStatus === 'unknown');
}

function licenseIssue(instance: OxyGenInstance) {
  return licenseFailure(instance) || licenseWarning(instance);
}

function processingFailure(instance: OxyGenInstance) {
  return componentFailure(instance.processingStatus) || componentFailure(instance.emmQueueStatus) || componentFailure(instance.smsStatus) || componentFailure(instance.hangfireStatus);
}

function processingWarning(instance: OxyGenInstance) {
  return componentWarning(instance.processingStatus) || componentWarning(instance.emmQueueStatus) || componentWarning(instance.smsStatus) || componentWarning(instance.hangfireStatus);
}

function processingIssue(instance: OxyGenInstance) {
  return processingFailure(instance) || processingWarning(instance);
}

function licenseIssueLabel(instance: OxyGenInstance) {
  if (!instance.licenseKey) return instance.licenseStatus === 'unknown' ? 'License API unavailable' : 'License blank';
  if (instance.licenseStatus === 'expired') return 'License expired';
  if (instance.licenseStatus === 'error') return 'License invalid';
  if (instance.licenseStatus === 'warning') return 'License warning';
  return `License ${instance.licenseStatus}`;
}

function normalizeIssueLabel(label: string) {
  const trimmed = label.trim();
  const networkMatch = trimmed.match(/\b(getaddrinfo\s+ENOTFOUND|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket\s+hang\s+up|fetch\s+failed)\b/i);
  if (networkMatch) return networkMatch[1].replace(/\s+/g, ' ').trim();
  const httpMatch = trimmed.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  return trimmed.replace(/\s+https?:\/\/\S+/gi, '').replace(/\s+[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\b/gi, '').replace(/\s+/g, ' ').trim();
}

function instanceIssueDetails(instance: OxyGenInstance): DashboardIssue[] {
  const issues: DashboardIssue[] = [];
  if (connectivityIssue(instance)) issues.push({ label: instance.status === 'auth-error' ? 'Authentication failure' : `Availability ${instance.status}`, severity: 'failure' });
  if (licenseFailure(instance)) issues.push({ label: licenseIssueLabel(instance), severity: 'failure' });
  if (processingFailure(instance)) issues.push({ label: 'Processing failure', severity: 'failure' });
  if (sslIssue(instance)) issues.push({ label: 'SSL warning', severity: 'warning' });
  if (licenseWarning(instance)) issues.push({ label: licenseIssueLabel(instance), severity: 'warning' });
  if (processingWarning(instance)) issues.push({ label: 'Processing warning', severity: 'warning' });
  if (componentWarning(instance.emmQueueStatus)) issues.push({ label: 'EMM disabled/warning', severity: 'warning' });
  if (componentWarning(instance.smsStatus)) issues.push({ label: 'SMS disabled/warning', severity: 'warning' });
  if (componentWarning(instance.hangfireStatus)) issues.push({ label: 'BUS disabled/warning', severity: 'warning' });
  if (instance.lastError && connectivityIssue(instance)) issues.push({ label: normalizeIssueLabel(instance.lastError), severity: 'failure' });

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function instanceSeverity(instance: OxyGenInstance, issues: DashboardIssue[]): DashboardSeverity {
  if (issues.some((issue) => issue.severity === 'failure')) return 'failure';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  if (instance.status === 'unknown') return 'unknown';
  return 'ok';
}

export async function registerDashboardRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: InstanceRepository, poller?: InstancePoller | null) {
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
    const enabledScopedInstances = scopedInstances.filter((instance) => instance.isEnabled);
    const dashboardInstances = scope === 'tenant'
      ? enabledScopedInstances.filter((instance) => instance.tenantId === tenantId)
      : enabledScopedInstances;
    const dashboardRoles = scope === 'tenant'
      ? roles.filter((role) => role.tenantId === tenantId || role.tenantId === null)
      : roles;
    const tenant = tenantId ? tenants.find((entry) => entry.id === tenantId) ?? null : null;
    const instances = dashboardInstances.map((instance) => {
      const issueDetails = instanceIssueDetails(instance);
      const severity = instanceSeverity(instance, issueDetails);
      const issues = issueDetails.map((issue) => issue.label);
      return {
        ...instance,
        issues,
        issueDetails,
        issueCount: issues.length,
        hasIssue: issues.length > 0,
        severity,
        primaryIssue: issues[0] ?? null
      };
    });

    return {
      dashboard: {
        scope,
        tenant: tenant ? { id: tenant.id, name: tenant.name, description: tenant.description } : null,
        poller: poller?.getStatus() ?? null,
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
          sslIssues: instances.filter(sslIssue).length,
          licenseIssues: instances.filter(licenseIssue).length,
          disabledInstances: scopedInstances.filter((instance) => !instance.isEnabled).length,
          connectivityIssues: instances.filter(connectivityIssue).length,
          processingIssues: instances.filter(processingIssue).length,
          unknownInstances: instances.filter((instance) => instance.status === 'unknown' || instance.sslValid === null || instance.licenseStatus === 'unknown' || instance.processingStatus === 'unknown' || instance.emmQueueStatus === 'unknown' || instance.smsStatus === 'unknown' || instance.hangfireStatus === 'unknown').length
        },
        instances
      }
    };
  });
}
