import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { InstanceRepository, OxyGenInstance } from '../src/instances/types.js';

const now = '2026-01-01T00:00:00.000Z';

function instance(overrides: Partial<OxyGenInstance> & Pick<OxyGenInstance, 'id' | 'name' | 'tenantId'>): OxyGenInstance {
  const { id, name, tenantId, ...rest } = overrides;
  return {
    id,
    name,
    description: rest.description ?? null,
    tenantId,
    protocol: rest.protocol ?? 'https',
    host: `${id}.example.com`,
    port: 443,
    hostname: `${id}.example.com`,
    baseUrl: `https://${id}.example.com:443`,
    launchUrl: `https://${id}.example.com:443/optws/oxygen.aspx`,
    apiBaseUrl: `https://${id}.example.com:443/OPTWS`,
    username: 'admin',
    pollingIntervalSeconds: 300,
    isEnabled: true,
    checkLicense: true,
    archived: false,
    metadata: null,
    notes: null,
    status: 'up',
    sslValid: true,
    sslExpiresAt: now,
    lastCheckedAt: now,
    lastSuccessAt: now,
    lastFailureAt: null,
    uptimePercent24h: 99.9,
    uptimePercent7d: 99.5,
    responseTimeMs: 42,
    lastError: null,
    processingStatus: 'ok',
    emmQueueStatus: 'ok',
    smsStatus: 'ok',
    hangfireStatus: 'ok',
    licenseKey: 'VALID-LICENSE',
    licenseStatus: 'valid',
    licenseJson: null,
    settingsJson: null,
    workflowSummaryJson: null,
    createdAt: now,
    updatedAt: now,
    ...rest
  };
}

function createFakeInstanceRepository(instances: OxyGenInstance[]): InstanceRepository {
  return {
    async createInstance() { throw new Error('not used'); },
    async updateInstance() { throw new Error('not used'); },
    async deleteInstance() { throw new Error('not used'); },
    async getInstance(instanceId) { return instances.find((entry) => entry.id === instanceId) ?? null; },
    async getHealthDetails(instanceId) {
      const found = instances.find((entry) => entry.id === instanceId);
      if (!found) throw new Error('Instance not found.');
      return { instance: found, availability: [], latestConnectivity: null, licenseHistory: [] };
    },
    async testConnectivity() { throw new Error('not used'); },
    async listInstances(scope) {
      if (scope?.includeAll) return instances;
      if (scope?.instanceIds) return instances.filter((entry) => scope.instanceIds?.includes(entry.id));
      return instances;
    }
  };
}

describe('dashboard API', () => {
  it('returns tenant-scoped counts and instance issue rollups for tenant-tied users', async () => {
    const authRepository = createInMemoryAuthRepository();
    const tenant = await authRepository.createTenant({ name: 'Acme Tenant' });
    const otherTenant = await authRepository.createTenant({ name: 'Other Tenant' });
    await authRepository.createRole({ name: 'AcmeReviewer', tenantId: tenant.id });
    await authRepository.createRole({ name: 'OtherReviewer', tenantId: otherTenant.id });
    const group = await authRepository.createGroup({ name: 'Acme Operators', tenantId: tenant.id, instanceAccessMode: 'specific', instanceIds: ['acme-up', 'acme-down', 'acme-ssl', 'acme-authssl', 'acme-license', 'acme-processing', 'acme-disabled'] });
    await authRepository.createGroup({ name: 'Other Operators', tenantId: otherTenant.id, instanceAccessMode: 'all' });
    await authRepository.createUser({ email: 'acme-admin@example.com', displayName: 'Acme Admin', password: 'Password!23456', roleNames: ['TenantAdmin'], groupIds: [group.id], tenantId: tenant.id });
    await authRepository.createUser({ email: 'other-admin@example.com', displayName: 'Other Admin', password: 'Password!23456', roleNames: ['TenantAdmin'], groupIds: [], tenantId: otherTenant.id });
    const token = await authRepository.createSession((await authRepository.authenticate('acme-admin@example.com', 'Password!23456'))!.user.id);
    const app = await buildApp({
      authRepository,
      instanceRepository: createFakeInstanceRepository([
        instance({ id: 'acme-up', name: 'Acme Up', tenantId: tenant.id }),
        instance({ id: 'acme-down', name: 'Acme Down', tenantId: tenant.id, status: 'down', lastError: 'Offline', licenseKey: null, licenseStatus: 'unknown' }),
        instance({ id: 'acme-ssl', name: 'Acme SSL Warning', tenantId: tenant.id, status: 'ssl-error', sslValid: false }),
        instance({ id: 'acme-authssl', name: 'Acme SSL Auth Failure', tenantId: tenant.id, status: 'auth-error', sslValid: false, lastError: 'OxyGen authentication failed with HTTP 401.', licenseKey: null, licenseStatus: 'unknown' }),
        instance({ id: 'acme-license', name: 'Acme Missing License', tenantId: tenant.id, licenseKey: null, licenseStatus: 'unknown' }),
        instance({ id: 'acme-processing', name: 'Acme Processing', tenantId: tenant.id, processingStatus: 'error' }),
        instance({ id: 'acme-disabled', name: 'Acme Disabled', tenantId: tenant.id, isEnabled: false, status: 'down', lastError: 'Disabled host offline' }),
        instance({ id: 'other-down', name: 'Other Down', tenantId: otherTenant.id, status: 'down' })
      ])
    });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { Authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.dashboard.scope).toBe('tenant');
    expect(body.dashboard.tenant.id).toBe(tenant.id);
    expect(body.dashboard.counts).toMatchObject({ groups: 1, users: 1, tenantRoles: 1, instances: 6, instancesWithIssues: 5, connectivityIssues: 2, sslIssues: 2, licenseIssues: 1, processingIssues: 1 });
    expect(body.dashboard.instances.map((entry: { id: string }) => entry.id)).toEqual(['acme-up', 'acme-down', 'acme-ssl', 'acme-authssl', 'acme-license', 'acme-processing']);
    expect(body.dashboard.counts.disabledInstances).toBe(1);
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean }) => entry.id === 'acme-disabled')).toBeUndefined();
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean; severity: string; primaryIssue: string }) => entry.id === 'acme-down')).toMatchObject({ hasIssue: true, severity: 'failure', primaryIssue: 'Availability down' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-ssl')).toMatchObject({ severity: 'warning', primaryIssue: 'SSL warning' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-authssl')).toMatchObject({ severity: 'failure', primaryIssue: 'Authentication failure' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[] }) => entry.id === 'acme-down').issues).not.toContain('License API unavailable');
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[] }) => entry.id === 'acme-authssl').issues).not.toContain('License API unavailable');
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-license')).toMatchObject({ severity: 'warning', primaryIssue: 'License API unavailable' });
    await app.close();
  });
});
