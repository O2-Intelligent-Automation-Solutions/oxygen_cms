import { randomUUID } from 'node:crypto';
import { testOxyGenConnectivity } from './oxygenConnectivity.js';
import type { ConnectivityResult, CreateInstanceInput, InstanceCheckHistoryEntry, InstanceProtocol, InstanceRepository, OxyGenInstance, UpdateInstanceInput } from './types.js';

function nowIso() {
  return new Date().toISOString();
}

function cleanNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function statusDefaults() {
  return {
    status: 'unknown' as const,
    sslValid: null,
    sslExpiresAt: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    uptimePercent24h: null,
    uptimePercent7d: null,
    responseTimeMs: null,
    lastError: null,
    processingStatus: 'unknown' as const,
    emmQueueStatus: 'unknown' as const,
    smsStatus: 'unknown' as const,
    hangfireStatus: 'unknown' as const,
    licenseKey: null,
    licenseStatus: 'unknown' as const,
    licenseJson: null,
    settingsJson: null,
    workflowSummaryJson: null
  };
}

export function normalizeOxyGenEndpoint(input: { protocol?: InstanceProtocol; host?: string; port?: number | null; hostname?: string }) {
  const source = (input.host || input.hostname || '').trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(source) ? source : `${input.protocol ?? 'https'}://${source}`;
  const url = new URL(withScheme);
  if (input.protocol && url.protocol !== `${input.protocol}:`) url.protocol = `${input.protocol}:`;
  const protocol = url.protocol.replace(':', '') as InstanceProtocol;
  const requestedPort = input.port !== undefined && input.port !== null ? Number(input.port) : null;
  const effectivePort = requestedPort ?? (url.port ? Number(url.port) : protocol === 'http' ? 80 : 443);
  url.port = String(effectivePort);

  const path = url.pathname.replace(/\/+$/, '');
  const basePath = path.toLowerCase().endsWith('/oxygen.aspx') ? path.slice(0, -'/OxyGen.aspx'.length) : path;
  const port = effectivePort;
  const host = url.hostname;
  const includePortInUrl = `:${effectivePort}`;
  const hostname = `${host}${includePortInUrl}`;
  const baseUrl = `${protocol}://${hostname}${basePath}`.replace(/\/+$/, '');
  const launchSuffix = baseUrl.toLowerCase().endsWith('/optws') ? '/OxyGen.aspx' : '/OPTWS/OxyGen.aspx';
  return {
    protocol,
    host,
    port,
    hostname,
    baseUrl,
    apiBaseUrl: baseUrl,
    launchUrl: `${baseUrl}${launchSuffix}`
  };
}

export function normalizeOxyGenUrl(hostname: string) {
  const normalized = normalizeOxyGenEndpoint({ hostname });
  return {
    hostname: normalized.hostname,
    baseUrl: normalized.baseUrl,
    launchUrl: normalized.launchUrl
  };
}

export function createInMemoryInstanceRepository(): InstanceRepository {
  const instances = new Map<string, OxyGenInstance & { passwordSecret: string }>();
  const history = new Map<string, InstanceCheckHistoryEntry[]>();

  function publicInstance(instance: OxyGenInstance & { passwordSecret: string }): OxyGenInstance {
    const { passwordSecret: _passwordSecret, ...safe } = instance;
    return safe;
  }

  function workflowIssueKey(issue: { workflowTriggerId?: string | null; workflowEventId?: string | null; serviceEventId?: string | null }) {
    return [issue.workflowTriggerId, issue.workflowEventId, issue.serviceEventId].map((part) => part || 'none').join(':');
  }

  function activeWorkflowKeys(summary: unknown) {
    if (!summary || typeof summary !== 'object') return new Set<string>();
    const activeErrors = (summary as { activeErrors?: unknown }).activeErrors;
    if (!Array.isArray(activeErrors)) return new Set<string>();
    return new Set(activeErrors.filter((entry): entry is { workflowTriggerId?: string | null; workflowEventId?: string | null; serviceEventId?: string | null } => Boolean(entry && typeof entry === 'object')).map(workflowIssueKey));
  }

  function appendConnectivityHistory(instanceId: string, result: ConnectivityResult) {
    const checkedAt = new Date(result.checkedAt);
    const startedAt = new Date(Math.max(0, checkedAt.getTime() - result.durationMs)).toISOString();
    const availability = result.status === 'reachable' ? 'up' : result.status === 'auth-error' ? 'auth-error' : result.status === 'ssl-error' ? 'ssl-error' : 'down';
    const entries = history.get(instanceId) ?? [];
    const currentWorkflowKeys = activeWorkflowKeys(result.workflows);
    const previousWorkflow = instances.get(instanceId)?.workflowSummaryJson ?? null;
    const recoveredErrorKeys = Array.from(activeWorkflowKeys(previousWorkflow)).filter((key) => !currentWorkflowKeys.has(key));
    const workflowResult = recoveredErrorKeys.length > 0 ? { ...result.workflows, recoveredErrorKeys } : result.workflows;
    entries.unshift({
      checkType: 'connectivity',
      status: availability,
      startedAt,
      finishedAt: result.checkedAt,
      durationMs: result.durationMs,
      httpStatusCode: result.httpStatusCode,
      errorCode: result.ok ? null : (result.authentication.errorCode ?? result.api.errorCode ?? result.ssl.errorCode ?? result.connect.errorCode ?? result.dns.errorCode ?? 'CONNECTIVITY_ERROR'),
      errorMessage: result.ok ? null : result.message,
      detailsJson: { dns: result.dns, connect: result.connect, ssl: result.ssl, authentication: result.authentication, api: result.api, license: result.license.step, workflows: result.workflows.step }
    });
    entries.unshift({
      checkType: 'workflow',
      status: workflowResult.step.skipped ? 'unknown' : workflowResult.activeErrorCount > 0 ? 'error' : 'ok',
      startedAt,
      finishedAt: result.checkedAt,
      durationMs: workflowResult.step.durationMs ?? result.durationMs,
      httpStatusCode: workflowResult.step.httpStatusCode ?? null,
      errorCode: workflowResult.step.errorCode ?? null,
      errorMessage: workflowResult.step.ok ? null : (workflowResult.step.message ?? null),
      detailsJson: workflowResult
    });
    entries.unshift({
      checkType: 'license',
      status: result.license.step.skipped ? 'unknown' : result.license.status === 'valid' ? 'ok' : result.license.status === 'warning' || result.license.status === 'unknown' ? 'warning' : 'error',
      startedAt,
      finishedAt: result.checkedAt,
      durationMs: result.durationMs,
      httpStatusCode: result.license.step.httpStatusCode ?? null,
      errorCode: result.license.step.errorCode ?? null,
      errorMessage: result.license.step.ok ? null : (result.license.step.message ?? null),
      detailsJson: { step: result.license.step, status: result.license.status, keyPresent: Boolean(result.license.key), payload: result.license.payload }
    });
    history.set(instanceId, entries.slice(0, 50));
    return workflowResult;
  }

  return {
    async createInstance(input: CreateInstanceInput) {
      const timestamp = nowIso();
      const normalized = normalizeOxyGenEndpoint(input);
      const instance: OxyGenInstance & { passwordSecret: string } = {
        id: input.id ?? randomUUID(),
        name: input.name.trim(),
        description: cleanNullableText(input.description),
        tenantId: input.tenantId ?? null,
        protocol: normalized.protocol,
        host: normalized.host,
        port: normalized.port,
        hostname: normalized.hostname,
        baseUrl: normalized.baseUrl,
        launchUrl: normalized.launchUrl,
        apiBaseUrl: normalized.apiBaseUrl,
        username: input.username.trim(),
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? 300,
        isEnabled: input.isEnabled ?? true,
        checkLicense: input.checkLicense ?? true,
        archived: input.archived ?? false,
        metadata: input.metadata ?? null,
        notes: cleanNullableText(input.notes),
        ...statusDefaults(),
        createdAt: timestamp,
        updatedAt: timestamp,
        passwordSecret: input.password
      };
      instances.set(instance.id, instance);
      return publicInstance(instance);
    },
    async updateInstance(instanceId: string, input: UpdateInstanceInput) {
      const existing = instances.get(instanceId);
      if (!existing) throw new Error('Instance not found.');
      const normalized = normalizeOxyGenEndpoint(input);
      const updated: OxyGenInstance & { passwordSecret: string } = {
        ...existing,
        name: input.name.trim(),
        description: cleanNullableText(input.description),
        tenantId: input.tenantId ?? null,
        protocol: normalized.protocol,
        host: normalized.host,
        port: normalized.port,
        hostname: normalized.hostname,
        baseUrl: normalized.baseUrl,
        launchUrl: normalized.launchUrl,
        apiBaseUrl: normalized.apiBaseUrl,
        username: input.username.trim(),
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? existing.pollingIntervalSeconds,
        isEnabled: input.isEnabled ?? existing.isEnabled,
        checkLicense: input.checkLicense ?? existing.checkLicense,
        archived: input.archived ?? existing.archived,
        metadata: input.metadata ?? null,
        notes: cleanNullableText(input.notes),
        updatedAt: nowIso(),
        passwordSecret: input.password ?? existing.passwordSecret
      };
      instances.set(instanceId, updated);
      return publicInstance(updated);
    },
    async deleteInstance(instanceId: string) {
      if (!instances.delete(instanceId)) throw new Error('Instance not found.');
    },
    async listInstances(scope) {
      const instanceIds = scope?.includeAll ? null : new Set(scope?.instanceIds ?? []);
      return Array.from(instances.values())
        .filter((instance) => (scope?.includeArchived || !instance.archived) && (!instanceIds || instanceIds.has(instance.id)))
        .map(publicInstance)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async getInstance(instanceId: string) {
      const instance = instances.get(instanceId);
      return instance ? publicInstance(instance) : null;
    },
    async getHealthDetails(instanceId: string) {
      const instance = instances.get(instanceId);
      if (!instance) throw new Error('Instance not found.');
      const entries = history.get(instanceId) ?? [];
      const availability = entries.filter((entry) => entry.checkType === 'connectivity').slice(0, 24);
      const workflowHistory = entries.filter((entry) => entry.checkType === 'workflow').slice(0, 10);
      return {
        instance: publicInstance(instance),
        availability,
        latestConnectivity: availability[0] ?? null,
        licenseHistory: entries.filter((entry) => entry.checkType === 'license').slice(0, 10),
        workflowHistory,
        latestWorkflow: workflowHistory[0] ?? null
      };
    },
    async testConnectivity(instanceId: string) {
      const instance = instances.get(instanceId);
      if (!instance) throw new Error('Instance not found.');
      const result = await testOxyGenConnectivity({ instance, password: instance.passwordSecret });
      const workflowResult = appendConnectivityHistory(instanceId, result);
      instance.status = result.status === 'reachable' ? 'up' : result.status === 'auth-error' ? 'auth-error' : result.status === 'ssl-error' ? 'ssl-error' : 'down';
      instance.lastCheckedAt = result.checkedAt;
      instance.responseTimeMs = result.responseTimeMs;
      instance.sslValid = result.ssl.valid ?? null;
      instance.sslExpiresAt = result.ssl.expiresAt ?? null;
      instance.lastError = result.ok ? null : result.message;
      if (!result.license.step.skipped) {
        instance.licenseKey = result.license.key;
        instance.licenseStatus = result.license.status;
        instance.licenseJson = result.license.payload;
      }
      instance.settingsJson = result.settingsJson;
      instance.workflowSummaryJson = workflowResult;
      instance.processingStatus = workflowResult.step.skipped ? 'unknown' : workflowResult.activeErrorCount > 0 ? 'error' : 'ok';
      if (instance.status === 'up') instance.lastSuccessAt = result.checkedAt;
      else instance.lastFailureAt = result.checkedAt;
      instance.updatedAt = nowIso();
      return result;
    }
  };
}
