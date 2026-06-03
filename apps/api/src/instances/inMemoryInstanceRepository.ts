import { randomUUID } from 'node:crypto';
import type { CreateInstanceInput, InstanceProtocol, InstanceRepository, OxyGenInstance, UpdateInstanceInput } from './types.js';

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
  if (input.port !== undefined && input.port !== null) url.port = String(input.port);

  const path = url.pathname.replace(/\/+$/, '');
  const basePath = path.toLowerCase().endsWith('/oxygen.aspx') ? path.slice(0, -'/OxyGen.aspx'.length) : path;
  const protocol = url.protocol.replace(':', '') as InstanceProtocol;
  const requestedPort = input.port !== undefined && input.port !== null ? Number(input.port) : null;
  const port = requestedPort ?? (url.port ? Number(url.port) : null);
  const host = url.hostname;
  const includePortInUrl = url.port ? `:${url.port}` : '';
  const hostname = includePortInUrl ? `${host}${includePortInUrl}` : host;
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

  function publicInstance(instance: OxyGenInstance & { passwordSecret: string }): OxyGenInstance {
    const { passwordSecret: _passwordSecret, ...safe } = instance;
    return safe;
  }

  return {
    async createInstance(input: CreateInstanceInput) {
      const timestamp = nowIso();
      const normalized = normalizeOxyGenEndpoint(input);
      const instance: OxyGenInstance & { passwordSecret: string } = {
        id: randomUUID(),
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
        groupId: input.groupId,
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? 300,
        isEnabled: input.isEnabled ?? true,
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
        groupId: input.groupId,
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? existing.pollingIntervalSeconds,
        isEnabled: input.isEnabled ?? existing.isEnabled,
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
      const groupIds = scope?.includeAll ? null : new Set(scope?.groupIds ?? []);
      return Array.from(instances.values())
        .filter((instance) => !groupIds || groupIds.has(instance.groupId))
        .map(publicInstance)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async getInstance(instanceId: string) {
      const instance = instances.get(instanceId);
      return instance ? publicInstance(instance) : null;
    },
    async testConnectivity(instanceId: string) {
      if (!instances.has(instanceId)) throw new Error('Instance not found.');
      return {
        ok: true,
        status: 'not-tested',
        message: 'Connectivity test scaffold is ready; live OxyGen checks will be wired in the monitoring slice.',
        checkedAt: nowIso()
      };
    }
  };
}
