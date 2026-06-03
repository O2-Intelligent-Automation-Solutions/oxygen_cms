import { randomUUID } from 'node:crypto';
import type { CreateInstanceInput, InstanceRepository, OxyGenInstance, UpdateInstanceInput } from './types.js';

function nowIso() {
  return new Date().toISOString();
}

export function normalizeOxyGenUrl(hostname: string) {
  const trimmed = hostname.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  const path = url.pathname.replace(/\/+$/, '');
  const basePath = path.toLowerCase().endsWith('/oxygen.aspx') ? path.slice(0, -'/OxyGen.aspx'.length) : path;
  const baseUrl = `${url.protocol}//${url.host}${basePath}`.replace(/\/+$/, '');
  const normalizedHostname = url.host;
  const launchSuffix = baseUrl.toLowerCase().endsWith('/optws') ? '/OxyGen.aspx' : '/OPTWS/OxyGen.aspx';
  return {
    hostname: normalizedHostname,
    baseUrl,
    launchUrl: `${baseUrl}${launchSuffix}`
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
      const normalized = normalizeOxyGenUrl(input.hostname);
      const instance: OxyGenInstance & { passwordSecret: string } = {
        id: randomUUID(),
        name: input.name.trim(),
        hostname: normalized.hostname,
        baseUrl: normalized.baseUrl,
        launchUrl: normalized.launchUrl,
        username: input.username.trim(),
        groupId: input.groupId,
        pollingIntervalSeconds: input.pollingIntervalSeconds ?? 300,
        isEnabled: input.isEnabled ?? true,
        status: 'unknown',
        lastCheckedAt: null,
        lastError: null,
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
      const normalized = normalizeOxyGenUrl(input.hostname);
      const updated: OxyGenInstance & { passwordSecret: string } = {
        ...existing,
        name: input.name.trim(),
        hostname: normalized.hostname,
        baseUrl: normalized.baseUrl,
        launchUrl: normalized.launchUrl,
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
