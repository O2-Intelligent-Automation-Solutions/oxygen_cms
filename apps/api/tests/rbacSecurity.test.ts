import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAppLogRepository } from '../src/appLogs/inMemoryAppLogRepository.js';
import { createInMemoryAppSettingsRepository } from '../src/appSettings/inMemoryAppSettingsRepository.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';
import type { DatabasePerformanceReader, DatabasePerformanceSnapshot } from '../src/system/databasePerformance.js';
import type { IssueCatalogReader, IssueCatalogSnapshot } from '../src/system/issueCatalog.js';

function fakeDatabaseSnapshot(): DatabasePerformanceSnapshot {
  return {
    configured: true,
    connected: true,
    database: 'O2IAS_CMS',
    generatedAt: '2026-06-14T12:00:00.000Z',
    error: null,
    schema: { currentVersion: '0.16', targetVersion: '0.16', current: true, upgradeAvailable: false },
    queryDigestStatus: { available: true, state: 'empty', reason: null },
    summary: { tableCount: 0, estimatedRows: 0, dataSizeBytes: 0, indexSizeBytes: 0, freeBytes: 0, totalSizeBytes: 0 },
    server: { version: null, uptimeSeconds: null, maxConnections: null, threadsConnected: null, maxUsedConnections: null, slowQueries: null, longQueryTimeSeconds: null, questions: null, abortedConnects: null, bufferPoolReadHitPercent: null },
    topTables: [],
    queryDigests: []
  };
}

function fakeIssueCatalog(affectedInstances: IssueCatalogSnapshot['issueTypes'][number]['affectedInstances'] = [{ id: 'instance-1', name: 'Acme Prod', tenantId: null, tenantName: null, status: 'ssl-error', lastCheckedAt: null, lastError: 'CERT_HAS_EXPIRED', evidence: 'CERT_HAS_EXPIRED' }]): IssueCatalogSnapshot {
  return {
    configured: true,
    connected: true,
    generatedAt: '2026-06-14T12:00:00.000Z',
    error: null,
    categories: [{ id: 'ssl', code: 'ssl', name: 'SSL', sortOrder: 20 }],
    severities: [{ id: 'warning', code: 'warning', name: 'Warning', rank: 30, sortOrder: 30 }],
    issueTypes: [{
      id: 'ssl-expired',
      code: 'CERT_HAS_EXPIRED',
      label: 'SSL certificate expired',
      description: 'Remote HTTPS certificate is expired.',
      matchKind: 'last-error-contains',
      matchValue: 'CERT_HAS_EXPIRED',
      enabled: true,
      sortOrder: 100,
      category: { id: 'ssl', code: 'ssl', name: 'SSL', sortOrder: 20 },
      severity: { id: 'warning', code: 'warning', name: 'Warning', rank: 30, sortOrder: 30 },
      affectedCount: affectedInstances.length,
      affectedInstances
    }]
  };
}

async function seedSecurityFixture() {
  const authRepository = createInMemoryAuthRepository();
  const instanceRepository = createInMemoryInstanceRepository();
  const appLogRepository = createInMemoryAppLogRepository();
  const appSettingsRepository = createInMemoryAppSettingsRepository();
  const databasePerformanceReader: DatabasePerformanceReader = { readSnapshot: vi.fn(async () => fakeDatabaseSnapshot()) };
  let currentIssueCatalog = fakeIssueCatalog();
  const issueCatalogReader: IssueCatalogReader = { readSnapshot: vi.fn(async () => currentIssueCatalog) };
  const app = await buildApp({ logger: false, authRepository, instanceRepository, appLogRepository, appSettingsRepository, databasePerformanceReader, issueCatalogReader, enableBackgroundPolling: false });

  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  const adminToken = adminLogin.json().token as string;

  const tenantA = await authRepository.createTenant({ name: 'Tenant A', description: null });
  const tenantB = await authRepository.createTenant({ name: 'Tenant B', description: null });
  const groupA = await authRepository.createGroup({ name: 'Tenant A Group', description: null, tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  const groupB = await authRepository.createGroup({ name: 'Tenant B Group', description: null, tenantId: tenantB.id, instanceAccessMode: 'all', instanceIds: [] });
  await authRepository.createRole({ name: 'Tenant A Reviewer', description: 'Tenant scoped custom role', tenantId: tenantA.id, permissionKeys: ['dashboard.view', 'instances.view', 'logs.view'] });

  await authRepository.createUser({ email: 'tenant-admin-a@example.com', displayName: 'Tenant Admin A', password: 'TenantAdminPassword!42', roleNames: ['TenantAdmin'], groupIds: [groupA.id], tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  await authRepository.createUser({ email: 'tenant-admin-inherit-a@example.com', displayName: 'Tenant Admin Inherit A', password: 'TenantAdminPassword!42', roleNames: ['TenantAdmin'], groupIds: [], tenantId: tenantA.id, instanceAccessMode: 'inherit', instanceIds: [] });
  await authRepository.createUser({ email: 'operator-a@example.com', displayName: 'Operator A', password: 'OperatorPassword!42', roleNames: ['Operator'], groupIds: [groupA.id], tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  await authRepository.createUser({ email: 'viewer-a@example.com', displayName: 'Viewer A', password: 'ViewerPassword!42', roleNames: ['Viewer'], groupIds: [groupA.id], tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  await authRepository.createUser({ email: 'operator-b@example.com', displayName: 'Operator B', password: 'OperatorPassword!42', roleNames: ['Operator'], groupIds: [groupB.id], tenantId: tenantB.id, instanceAccessMode: 'all', instanceIds: [] });

  const tenantAdminLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'tenant-admin-a@example.com', password: 'TenantAdminPassword!42' } });
  const tenantAdminInheritLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'tenant-admin-inherit-a@example.com', password: 'TenantAdminPassword!42' } });
  const operatorLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'operator-a@example.com', password: 'OperatorPassword!42' } });
  const viewerLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'viewer-a@example.com', password: 'ViewerPassword!42' } });

  const instanceA = await instanceRepository.createInstance({ name: 'Tenant A Instance', description: null, tenantId: tenantA.id, host: 'tenant-a.example.com', username: 'admin', password: 'RemotePassword!42' });
  const instanceB = await instanceRepository.createInstance({ name: 'Tenant B Instance', description: null, tenantId: tenantB.id, host: 'tenant-b.example.com', username: 'admin', password: 'RemotePassword!42' });
  const globalInstance = await instanceRepository.createInstance({ name: 'Global Instance', description: null, tenantId: null, host: 'global.example.com', username: 'admin', password: 'RemotePassword!42' });
  currentIssueCatalog = fakeIssueCatalog([
    { id: instanceA.id, name: instanceA.name, tenantId: tenantA.id, tenantName: tenantA.name, status: 'ssl-error', lastCheckedAt: null, lastError: 'CERT_HAS_EXPIRED', evidence: 'CERT_HAS_EXPIRED' },
    { id: instanceB.id, name: instanceB.name, tenantId: tenantB.id, tenantName: tenantB.name, status: 'ssl-error', lastCheckedAt: null, lastError: 'CERT_HAS_EXPIRED', evidence: 'CERT_HAS_EXPIRED' },
    { id: globalInstance.id, name: globalInstance.name, tenantId: null, tenantName: null, status: 'ssl-error', lastCheckedAt: null, lastError: 'CERT_HAS_EXPIRED', evidence: 'CERT_HAS_EXPIRED' }
  ]);

  return {
    app,
    authRepository,
    instanceRepository,
    appLogRepository,
    tokens: { admin: adminToken, tenantAdmin: tenantAdminLogin.json().token as string, tenantAdminInherit: tenantAdminInheritLogin.json().token as string, operator: operatorLogin.json().token as string, viewer: viewerLogin.json().token as string },
    tenantA,
    tenantB,
    groupA,
    groupB,
    instanceA,
    instanceB,
    globalInstance
  };
}

describe('Phase 1 RBAC security controls', () => {
  it('returns effective permission keys on auth profiles', async () => {
    const fixture = await seedSecurityFixture();

    const tenantAdminMe = await fixture.app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(tenantAdminMe.statusCode).toBe(200);
    expect(tenantAdminMe.json().permissions).toEqual(expect.arrayContaining(['users.manage', 'groups.manage', 'roles.manage', 'instances.manage', 'instances.importExport', 'logs.view']));
    expect(tenantAdminMe.json().permissions).not.toContain('tenants.manage');
    expect(tenantAdminMe.json().permissions).not.toContain('settings.database.maintain');

    const viewerMe = await fixture.app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${fixture.tokens.viewer}` } });
    expect(viewerMe.statusCode).toBe(200);
    expect(viewerMe.json().permissions).toEqual(expect.arrayContaining(['dashboard.view', 'instances.view', 'issueTypes.view']));
    expect(viewerMe.json().permissions).not.toContain('instances.manage');

    await fixture.app.close();
  });

  it('allows TenantAdmin to manage only same-Tenant security and instance resources', async () => {
    const fixture = await seedSecurityFixture();

    const users = await fixture.app.inject({ method: 'GET', url: '/api/users', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(users.statusCode).toBe(200);
    expect(users.json().users.map((entry: { user: { email: string } }) => entry.user.email)).toEqual(expect.arrayContaining(['tenant-admin-a@example.com', 'operator-a@example.com', 'viewer-a@example.com']));
    expect(users.json().users.map((entry: { user: { email: string } }) => entry.user.email)).not.toContain('admin@example.com');
    expect(users.json().users.map((entry: { user: { email: string } }) => entry.user.email)).not.toContain('operator-b@example.com');

    const createSameTenantUser = await fixture.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { email: 'new-tenant-user@example.com', displayName: 'New Tenant User', password: 'NewTenantPassword!42', roleNames: ['Viewer'], groupIds: [fixture.groupA.id], tenantId: fixture.tenantA.id, instanceAccessMode: 'all', instanceIds: [] }
    });
    expect(createSameTenantUser.statusCode).toBe(201);

    const createGlobalUser = await fixture.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { email: 'blocked-global@example.com', displayName: 'Blocked Global', password: 'BlockedPassword!42', roleNames: ['Viewer'], groupIds: [], tenantId: null }
    });
    expect(createGlobalUser.statusCode).toBe(403);

    const createCrossTenantUser = await fixture.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { email: 'blocked-cross@example.com', displayName: 'Blocked Cross', password: 'BlockedPassword!42', roleNames: ['Viewer'], groupIds: [fixture.groupB.id], tenantId: fixture.tenantB.id }
    });
    expect(createCrossTenantUser.statusCode).toBe(403);

    const createSameTenantInstance = await fixture.app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { name: 'Tenant A Managed', description: null, tenantId: fixture.tenantA.id, host: 'managed-a.example.com', password: 'RemotePassword!42' }
    });
    expect(createSameTenantInstance.statusCode).toBe(201);

    const inheritedTenantAdminInstances = await fixture.app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${fixture.tokens.tenantAdminInherit}` } });
    expect(inheritedTenantAdminInstances.statusCode).toBe(200);
    expect(inheritedTenantAdminInstances.json().instances.map((entry: { name: string }) => entry.name)).toEqual(expect.arrayContaining(['Tenant A Instance', 'Tenant A Managed']));
    expect(inheritedTenantAdminInstances.json().instances.map((entry: { name: string }) => entry.name)).not.toContain('Tenant B Instance');
    expect(inheritedTenantAdminInstances.json().instances.map((entry: { name: string }) => entry.name)).not.toContain('Global Instance');

    const inheritedTenantAdminDashboard = await fixture.app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${fixture.tokens.tenantAdminInherit}` } });
    expect(inheritedTenantAdminDashboard.statusCode).toBe(200);
    expect(inheritedTenantAdminDashboard.json().dashboard.instances.map((entry: { name: string }) => entry.name)).toEqual(expect.arrayContaining(['Tenant A Instance', 'Tenant A Managed']));
    expect(inheritedTenantAdminDashboard.json().dashboard.instances.map((entry: { name: string }) => entry.name)).not.toContain('Tenant B Instance');

    const updateCrossTenantInstance = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/instances/${fixture.instanceB.id}`,
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { name: 'Tenant B Stolen', description: null, tenantId: fixture.tenantB.id, host: 'tenant-b.example.com', username: 'admin' }
    });
    expect(updateCrossTenantInstance.statusCode).toBe(404);

    const createGlobalInstance = await fixture.app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` },
      payload: { name: 'Tenant Admin Global', description: null, tenantId: null, host: 'tenant-admin-global.example.com', password: 'RemotePassword!42' }
    });
    expect(createGlobalInstance.statusCode).toBe(403);

    await fixture.app.close();
  });

  it('keeps global Tenant, settings, database, poller, and log purge actions SystemAdmin-only', async () => {
    const fixture = await seedSecurityFixture();

    const tenants = await fixture.app.inject({ method: 'GET', url: '/api/tenants', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(tenants.statusCode).toBe(200);
    expect(tenants.json().tenants).toEqual([{ ...fixture.tenantA }]);

    const createTenant = await fixture.app.inject({ method: 'POST', url: '/api/tenants', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` }, payload: { name: 'Blocked Tenant', description: null } });
    expect(createTenant.statusCode).toBe(403);

    const saveLabels = await fixture.app.inject({ method: 'PUT', url: '/api/app-settings/labels', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` }, payload: { tenant: 'Tenant' } });
    expect(saveLabels.statusCode).toBe(403);

    const database = await fixture.app.inject({ method: 'GET', url: '/api/system/database-performance', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(database.statusCode).toBe(403);

    const poller = await fixture.app.inject({ method: 'POST', url: '/api/system/poller/pause', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(poller.statusCode).toBe(403);

    const clearLogs = await fixture.app.inject({ method: 'DELETE', url: '/api/logs', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(clearLogs.statusCode).toBe(403);

    await fixture.app.close();
  });

  it('allows read-only issue catalog access while keeping database and poller controls privileged', async () => {
    const fixture = await seedSecurityFixture();

    const issueTypes = await fixture.app.inject({ method: 'GET', url: '/api/system/issue-types', headers: { authorization: `Bearer ${fixture.tokens.viewer}` } });
    expect(issueTypes.statusCode).toBe(200);
    expect(issueTypes.json().issueCatalog.issueTypes[0]).toMatchObject({ code: 'CERT_HAS_EXPIRED', affectedCount: 1 });
    expect(issueTypes.json().issueCatalog.issueTypes[0].affectedInstances.map((entry: { name: string }) => entry.name)).toEqual(['Tenant A Instance']);
    expect(issueTypes.json().issueCatalog.issueTypes[0].affectedInstances.map((entry: { name: string }) => entry.name)).not.toContain('Tenant B Instance');
    expect(issueTypes.json().issueCatalog.issueTypes[0].affectedInstances.map((entry: { name: string }) => entry.name)).not.toContain('Global Instance');

    const adminIssueTypes = await fixture.app.inject({ method: 'GET', url: '/api/system/issue-types', headers: { authorization: `Bearer ${fixture.tokens.admin}` } });
    expect(adminIssueTypes.statusCode).toBe(200);
    expect(adminIssueTypes.json().issueCatalog.issueTypes[0]).toMatchObject({ affectedCount: 3 });

    const database = await fixture.app.inject({ method: 'GET', url: '/api/system/database-performance', headers: { authorization: `Bearer ${fixture.tokens.viewer}` } });
    expect(database.statusCode).toBe(403);

    await fixture.app.close();
  });

  it('logs denied privileged attempts as security activity with the authenticated user', async () => {
    const fixture = await seedSecurityFixture();

    const denied = await fixture.app.inject({ method: 'POST', url: '/api/system/poller/run-now', headers: { authorization: `Bearer ${fixture.tokens.tenantAdmin}` } });
    expect(denied.statusCode).toBe(403);

    const logs = await fixture.app.inject({ method: 'GET', url: '/api/logs', headers: { authorization: `Bearer ${fixture.tokens.admin}` }, query: { type: 'Security' } });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'Security',
        severity: 'Error',
        userName: 'tenant-admin-a@example.com',
        message: expect.stringContaining('Access denied')
      })
    ]));

    await fixture.app.close();
  });
});
