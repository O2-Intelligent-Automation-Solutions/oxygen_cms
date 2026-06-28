import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository, TenantId } from '../auth/types.js';
import type { AppSettingsRepository, LicenseExpirationWarningSettings } from '../appSettings/types.js';
import type { InstancePoller } from '../instances/instancePoller.js';
import { licenseExpirationDisplayStatus, licenseExpirationIssueLabel, licensePayloadWasEvaluated } from '../instances/licenseExpirationStatus.js';
import { isTlsConnectionError, sslCertificateHasIssue, sslCertificateIssueLabel, type SslCertificateWarningSettings } from '../instances/sslCertificateStatus.js';
import type { InstanceCheckHistoryEntry, InstanceRepository, OxyGenInstance } from '../instances/types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

type DashboardScope = 'tenant' | 'global';

function instanceScope(profile: AuthProfile) {
  if (profile.roles.includes('SystemAdmin') || profile.roles.includes('TenantAdmin') || profile.user.instanceAccessMode === 'all') return { includeAll: true };
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


function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return null;
}

function parseDetailsJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function nestedBoolean(record: Record<string, unknown>, path: string[]) {
  let current: unknown = record;
  for (const part of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'boolean' ? current : null;
}

function latestLicenseWasEvaluated(latestLicense?: InstanceCheckHistoryEntry | null) {
  if (!latestLicense || latestLicense.status === 'skipped') return false;
  const statusCode = Number(latestLicense.httpStatusCode ?? 0);
  const details = parseDetailsJson(latestLicense.detailsJson);
  return statusCode >= 200 && statusCode < 400 && Boolean(details.payload && typeof details.payload === 'object' && !Array.isArray(details.payload));
}

function latestLicenseKeyPresent(latestLicense?: InstanceCheckHistoryEntry | null) {
  return nestedBoolean(parseDetailsJson(latestLicense?.detailsJson), ['keyPresent']) === true;
}

function latestLicensePayload(latestLicense?: InstanceCheckHistoryEntry | null) {
  const payload = parseDetailsJson(latestLicense?.detailsJson).payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function licenseInstanceForEvaluation(instance: OxyGenInstance, latestLicense?: InstanceCheckHistoryEntry | null): OxyGenInstance {
  const payload = latestLicensePayload(latestLicense);
  if (!payload) return instance;
  const keyFromPayload = recordValue(payload, ['LicenseKey', 'licenseKey', 'Key', 'key']);
  return {
    ...instance,
    licenseJson: payload,
    licenseKey: latestLicenseKeyPresent(latestLicense) ? (typeof keyFromPayload === 'string' && keyFromPayload ? keyFromPayload : instance.licenseKey) : null
  };
}

function connectivityIssue(instance: OxyGenInstance) {
  return instance.status !== 'up' && instance.status !== 'unknown' && instance.status !== 'ssl-error';
}

function sslIssue(instance: OxyGenInstance, settings: SslCertificateWarningSettings) {
  return sslCertificateHasIssue(instance, settings);
}

function licenseEvaluationEligible(instance: OxyGenInstance, latestLicense?: InstanceCheckHistoryEntry | null) {
  return instance.checkLicense && instance.status === 'up' && (latestLicenseWasEvaluated(latestLicense) || licensePayloadWasEvaluated(instance));
}

function licenseDisplay(instance: OxyGenInstance, settings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null) {
  return licenseExpirationDisplayStatus(licenseInstanceForEvaluation(instance, latestLicense), settings);
}

function licenseFailure(instance: OxyGenInstance, settings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null) {
  if (!licenseEvaluationEligible(instance, latestLicense)) return false;
  const status = licenseDisplay(instance, settings, latestLicense);
  return status === 'expired' || status === 'missing' || status === 'invalid';
}

function licenseWarning(instance: OxyGenInstance, settings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null) {
  if (!licenseEvaluationEligible(instance, latestLicense)) return false;
  const status = licenseDisplay(instance, settings, latestLicense);
  return status === 'warning' || status === 'expiring-soon';
}

function licenseIssue(instance: OxyGenInstance, settings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null) {
  return licenseFailure(instance, settings, latestLicense) || licenseWarning(instance, settings, latestLicense);
}

function licenseIssueLabel(instance: OxyGenInstance, settings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null) {
  return licenseExpirationIssueLabel(licenseInstanceForEvaluation(instance, latestLicense), settings);
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

function workflowSummaryRecord(instance: OxyGenInstance) {
  return parseDetailsJson(instance.workflowSummaryJson);
}

function workflowActiveErrorCount(instance: OxyGenInstance) {
  const value = workflowSummaryRecord(instance).activeErrorCount;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function workflowTriggerErrorIssue(instance: OxyGenInstance) {
  return workflowActiveErrorCount(instance) > 0;
}

function connectivityIssueLabel(instance: OxyGenInstance) {
  if (instance.status === 'auth-error') return 'Authentication failure';
  if (isTlsConnectionError(instance)) return 'TLS / Connection Error';
  return `Availability ${instance.status}`;
}

function normalizeIssueLabel(label: string) {
  const trimmed = label.trim();
  const networkMatch = trimmed.match(/\b(getaddrinfo\s+ENOTFOUND|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket\s+hang\s+up|fetch\s+failed)\b/i);
  if (networkMatch) return networkMatch[1].replace(/\s+/g, ' ').trim();
  const httpMatch = trimmed.match(/\bHTTP\s+(\d{3})\b/i);
  if (httpMatch) return `HTTP ${httpMatch[1]}`;
  return trimmed.replace(/\s+https?:\/\/\S+/gi, '').replace(/\s+[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?\b/gi, '').replace(/\s+/g, ' ').trim();
}

function instanceIssueDetails(instance: OxyGenInstance, sslWarningSettings: SslCertificateWarningSettings, licenseWarningSettings: LicenseExpirationWarningSettings, latestLicense?: InstanceCheckHistoryEntry | null): DashboardIssue[] {
  const issues: DashboardIssue[] = [];
  if (connectivityIssue(instance)) issues.push({ label: connectivityIssueLabel(instance), severity: 'failure' });
  if (licenseFailure(instance, licenseWarningSettings, latestLicense)) issues.push({ label: licenseIssueLabel(instance, licenseWarningSettings, latestLicense), severity: 'failure' });
  if (workflowTriggerErrorIssue(instance)) issues.push({ label: 'Trigger errors', severity: 'failure' });
  if (processingFailure(instance) && !workflowTriggerErrorIssue(instance)) issues.push({ label: 'Processing failure', severity: 'failure' });
  if (sslIssue(instance, sslWarningSettings)) issues.push({ label: sslCertificateIssueLabel(instance, sslWarningSettings), severity: 'warning' });
  if (licenseWarning(instance, licenseWarningSettings, latestLicense)) issues.push({ label: licenseIssueLabel(instance, licenseWarningSettings, latestLicense), severity: 'warning' });
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

export async function registerDashboardRoutes(app: FastifyInstance, authRepository: AuthRepository, instanceRepository: InstanceRepository, poller?: InstancePoller | null, appSettingsRepository?: AppSettingsRepository) {
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
    const [sslWarningSettings, licenseWarningSettings] = appSettingsRepository ? await Promise.all([appSettingsRepository.getSslCertificateWarning(), appSettingsRepository.getLicenseExpirationWarning()]) : [{ daysBeforeExpiration: 30 }, { daysBeforeExpiration: 30 }];

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
    const latestLicenseByInstance = new Map<string, InstanceCheckHistoryEntry | null>();
    await Promise.all(dashboardInstances.filter((instance) => instance.checkLicense && instance.status === 'up').map(async (instance) => {
      try {
        const details = await instanceRepository.getHealthDetails(instance.id);
        latestLicenseByInstance.set(instance.id, details.licenseHistory[0] ?? null);
      } catch {
        latestLicenseByInstance.set(instance.id, null);
      }
    }));
    const instances = dashboardInstances.map((instance) => {
      const latestLicense = latestLicenseByInstance.get(instance.id) ?? null;
      const issueDetails = instanceIssueDetails(instance, sslWarningSettings, licenseWarningSettings, latestLicense);
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
          sslIssues: instances.filter((instance) => sslIssue(instance, sslWarningSettings)).length,
          licenseIssues: instances.filter((instance) => instance.issueDetails.some((issue) => issue.label.toLowerCase().startsWith('license '))).length,
          triggerErrors: instances.filter(workflowTriggerErrorIssue).length,
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
