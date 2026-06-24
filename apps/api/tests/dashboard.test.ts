import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import type { InstanceRepository, OxyGenInstance } from '../src/instances/types.js';

const now = '2026-01-01T00:00:00.000Z';
const futureCert = '2030-01-01T00:00:00.000Z';

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
    sslExpiresAt: futureCert,
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
      const hasPayload = found.licenseJson && typeof found.licenseJson === 'object' && !Array.isArray(found.licenseJson);
      const licenseHistory = hasPayload ? [{
        checkType: 'license',
        status: found.licenseStatus === 'valid' ? 'ok' : 'error',
        startedAt: found.lastCheckedAt ?? now,
        finishedAt: found.lastCheckedAt ?? now,
        durationMs: 12,
        httpStatusCode: 200,
        errorCode: found.licenseStatus === 'valid' ? null : 'LICENSE_STATUS_ERROR',
        errorMessage: found.licenseStatus === 'valid' ? null : 'License issue.',
        detailsJson: { status: found.licenseStatus, keyPresent: Boolean(found.licenseKey), payload: found.licenseJson }
      }] : [];
      return { instance: found, availability: [], latestConnectivity: null, licenseHistory };
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
    const group = await authRepository.createGroup({ name: 'Acme Operators', tenantId: tenant.id, instanceAccessMode: 'specific', instanceIds: ['acme-up', 'acme-down', 'acme-tls', 'acme-ssl', 'acme-authssl', 'acme-license', 'acme-processing', 'acme-disabled'] });
    await authRepository.createGroup({ name: 'Other Operators', tenantId: otherTenant.id, instanceAccessMode: 'all' });
    await authRepository.createUser({ email: 'acme-admin@example.com', displayName: 'Acme Admin', password: 'Password!23456', roleNames: ['TenantAdmin'], groupIds: [group.id], tenantId: tenant.id });
    await authRepository.createUser({ email: 'other-admin@example.com', displayName: 'Other Admin', password: 'Password!23456', roleNames: ['TenantAdmin'], groupIds: [], tenantId: otherTenant.id });
    const token = await authRepository.createSession((await authRepository.authenticate('acme-admin@example.com', 'Password!23456'))!.user.id);
    const app = await buildApp({
      authRepository,
      instanceRepository: createFakeInstanceRepository([
        instance({ id: 'acme-up', name: 'Acme Up', tenantId: tenant.id }),
        instance({ id: 'acme-down', name: 'Acme Down', tenantId: tenant.id, status: 'down', lastError: 'Offline', licenseKey: null, licenseStatus: 'unknown' }),
        instance({ id: 'acme-tls', name: 'Acme TLS Reset', tenantId: tenant.id, status: 'down', lastError: 'TLS connection failed: Client network socket disconnected before secure TLS connection was established', licenseKey: null, licenseStatus: 'unknown', sslValid: false }),
        instance({ id: 'acme-ssl', name: 'Acme SSL Warning', tenantId: tenant.id, status: 'ssl-error', sslValid: false }),
        instance({ id: 'acme-authssl', name: 'Acme SSL Auth Failure', tenantId: tenant.id, status: 'auth-error', sslValid: false, lastError: 'OxyGen authentication failed with HTTP 401.', licenseKey: null, licenseStatus: 'unknown' }),
        instance({ id: 'acme-license', name: 'Acme Missing License', tenantId: tenant.id, licenseKey: null, licenseStatus: 'error', licenseJson: { IsValid: false, IsExpired: false, LicenseKey: null } }),
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
    expect(body.dashboard.counts).toMatchObject({ groups: 1, users: 1, tenantRoles: 1, instances: 7, instancesWithIssues: 6, connectivityIssues: 3, sslIssues: 2, licenseIssues: 1, processingIssues: 1 });
    expect(body.dashboard.instances.map((entry: { id: string }) => entry.id)).toEqual(['acme-up', 'acme-down', 'acme-tls', 'acme-ssl', 'acme-authssl', 'acme-license', 'acme-processing']);
    expect(body.dashboard.counts.disabledInstances).toBe(1);
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean }) => entry.id === 'acme-disabled')).toBeUndefined();
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean; severity: string; primaryIssue: string }) => entry.id === 'acme-down')).toMatchObject({ hasIssue: true, severity: 'failure', primaryIssue: 'Availability down' });
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean; severity: string; primaryIssue: string; issues: string[] }) => entry.id === 'acme-tls')).toMatchObject({ hasIssue: true, severity: 'failure', primaryIssue: 'TLS / Connection Error' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[] }) => entry.id === 'acme-tls').issues).not.toContain('SSL warning');
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-ssl')).toMatchObject({ severity: 'warning', primaryIssue: 'SSL warning' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-authssl')).toMatchObject({ severity: 'failure', primaryIssue: 'Authentication failure' });
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[] }) => entry.id === 'acme-down').issues).not.toContain('License API unavailable');
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[] }) => entry.id === 'acme-authssl').issues).not.toContain('License API unavailable');
    expect(body.dashboard.instances.find((entry: { id: string; issues: string[]; severity: string; primaryIssue: string }) => entry.id === 'acme-license')).toMatchObject({ severity: 'failure', primaryIssue: 'License missing' });
    await app.close();
  });

  it('classifies expired and expiring-soon HTTPS certificates from the global warning setting', async () => {
    const authRepository = createInMemoryAuthRepository();
    const appSettingsRepository = createInMemoryAppSettingsRepository();
    await appSettingsRepository.saveSslCertificateWarning({ daysBeforeExpiration: 45 });
    await authRepository.createUser({ email: 'admin@example.com', displayName: 'Admin User', password: 'Password!23456', roleNames: ['SystemAdmin'], groupIds: [] });
    const token = await authRepository.createSession((await authRepository.authenticate('admin@example.com', 'Password!23456'))!.user.id);
    const app = await buildApp({
      authRepository,
      appSettingsRepository,
      instanceRepository: createFakeInstanceRepository([
        instance({ id: 'expired-cert', name: 'Expired Cert', tenantId: null, sslValid: false, sslExpiresAt: '2025-12-01T00:00:00.000Z', status: 'ssl-error', lastError: 'CERT_HAS_EXPIRED' }),
        instance({ id: 'soon-cert', name: 'Soon Cert', tenantId: null, sslValid: true, sslExpiresAt: new Date(Date.now() + 20 * 86400000).toISOString() }),
        instance({ id: 'valid-cert', name: 'Valid Cert', tenantId: null, sslValid: true, sslExpiresAt: new Date(Date.now() + 120 * 86400000).toISOString() })
      ])
    });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { Authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.dashboard.counts.sslIssues).toBe(2);
    expect(body.dashboard.instances.find((entry: { id: string; primaryIssue: string }) => entry.id === 'expired-cert')).toMatchObject({ primaryIssue: 'SSL certificate expired' });
    expect(body.dashboard.instances.find((entry: { id: string; primaryIssue: string }) => entry.id === 'soon-cert')).toMatchObject({ primaryIssue: 'SSL certificate expiring soon' });
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean }) => entry.id === 'valid-cert')).toMatchObject({ hasIssue: false });
    await app.close();
  });

  it('classifies valid licenses inside the global threshold as warning issues', async () => {
    const authRepository = createInMemoryAuthRepository();
    const appSettingsRepository = createInMemoryAppSettingsRepository();
    await appSettingsRepository.saveLicenseExpirationWarning({ daysBeforeExpiration: 45 });
    await authRepository.createUser({ email: 'license-admin@example.com', displayName: 'License Admin', password: 'Password!23456', roleNames: ['SystemAdmin'], groupIds: [] });
    const token = await authRepository.createSession((await authRepository.authenticate('license-admin@example.com', 'Password!23456'))!.user.id);
    const app = await buildApp({
      authRepository,
      appSettingsRepository,
      instanceRepository: createFakeInstanceRepository([
        instance({ id: 'license-soon', name: 'License Expiring Soon', tenantId: null, licenseStatus: 'valid', licenseKey: 'SOON', licenseJson: { IsValid: true, IsExpired: false, ExpiryDate: new Date(Date.now() + 20 * 86400000).toISOString() } }),
        instance({ id: 'license-valid', name: 'License Valid', tenantId: null, licenseStatus: 'valid', licenseKey: 'VALID', licenseJson: { IsValid: true, IsExpired: false, ExpiryDate: new Date(Date.now() + 120 * 86400000).toISOString() } })
      ])
    });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { Authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.dashboard.counts.licenseIssues).toBe(1);
    expect(body.dashboard.instances.find((entry: { id: string; primaryIssue: string; severity: string }) => entry.id === 'license-soon')).toMatchObject({ primaryIssue: 'License expiring soon', severity: 'warning' });
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean }) => entry.id === 'license-valid')).toMatchObject({ hasIssue: false });
    await app.close();
  });

  it('does not count License API transport failures as license issues', async () => {
    const authRepository = createInMemoryAuthRepository();
    await authRepository.createUser({ email: 'transport-admin@example.com', displayName: 'Transport Admin', password: 'Password!23456', roleNames: ['SystemAdmin'], groupIds: [] });
    const token = await authRepository.createSession((await authRepository.authenticate('transport-admin@example.com', 'Password!23456'))!.user.id);
    const app = await buildApp({
      authRepository,
      instanceRepository: createFakeInstanceRepository([
        instance({ id: 'license-api-500', name: 'License API 500', tenantId: null, licenseStatus: 'error', licenseKey: null, licenseJson: { Message: 'An error has occurred.', StackTrace: 'remote exception' }, lastError: 'Connectivity test completed with license issue: License API probe failed with HTTP 500.' }),
        instance({ id: 'license-missing', name: 'License Missing', tenantId: null, licenseStatus: 'error', licenseKey: null, licenseJson: { IsValid: false, IsExpired: false, LicenseKey: null }, lastError: 'Connectivity test completed with license issue: License missing.' })
      ])
    });

    const response = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { Authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.dashboard.counts.licenseIssues).toBe(1);
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean; issues: string[] }) => entry.id === 'license-api-500')).toMatchObject({ hasIssue: false, issues: [] });
    expect(body.dashboard.instances.find((entry: { id: string; hasIssue: boolean; primaryIssue: string }) => entry.id === 'license-missing')).toMatchObject({ hasIssue: true, primaryIssue: 'License missing' });
    await app.close();
  });

});
