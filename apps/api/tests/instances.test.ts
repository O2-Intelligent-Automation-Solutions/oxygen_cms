import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';
import type { InstanceCheckQueueScheduler } from '../src/queues/instanceCheckScheduler.js';

const mockOxyGenServers: Array<ReturnType<typeof createServer>> = [];

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockOxyGenServer(password: string, onRequest?: (request: IncomingMessage) => void) {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    onRequest?.(request);
    if (request.method === 'POST' && request.url === '/v2/Auth/Login') {
      const body = await readRequestBody(request);
      const form = new URLSearchParams(body);
      if (form.get('Username') === 'admin' && form.get('Password') === password) {
        response.statusCode = 200;
        response.setHeader('set-cookie', ['ASP.NET_SessionId=mock-session; Path=/; HttpOnly', '.ASPXAUTH=mock-auth-ticket; Path=/; HttpOnly']);
        response.end('OK');
        return;
      }
      response.statusCode = 401;
      response.end('Unauthorized');
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/global/settings' && request.headers.cookie?.includes('ASP.NET_SessionId=mock-session')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([
        {
          Id: 4,
          Group: 'Global',
          Title: 'BUS: Auto Purge',
          Hidden: false,
          Controls: [
            { Type: 'Switch', DataSource: 'BooleanValue', Properties: { Label: 'Enabled', Required: true }, VariableName: 'BUS_Auto_Purge_Enabled' },
            { Type: 'NumberInput', DataSource: 'IntegerValue', Properties: { Label: 'Retention Period (Days)', Required: true }, VariableName: 'BUS_Auto_Purge' }
          ],
          Editable: true,
          Variables: [
            { Type: 'Boolean', Value: true, Description: 'Enables or disables the running of the OxyGen auto purge process.', VariableName: 'BUS_Auto_Purge_Enabled' },
            { Type: 'Number', Value: 60, Description: 'Enables or disables the running of the OxyGen auto purge process.', VariableName: 'BUS_Auto_Purge' }
          ],
          Description: 'Enables or disables the running of the OxyGen auto purge process.',
          SettingName: 'BUS_Auto_Purge',
          StringValue: null,
          BooleanValue: true,
          IntegerValue: 60,
          DocumentationURL: null
        },
        { SettingName: 'OxyGen_Version', Title: 'Production Version Settings', Variables: [{ VariableName: 'OxyGen_Version', Type: 'String', Value: '5.4.3' }], Controls: [{ VariableName: 'OxyGen_Version', Properties: { Label: 'OxyGen Version' } }] },
        { SettingName: 'EMM_Delayed_Processing', Title: 'Email Processing', Variables: [{ VariableName: 'EMM_Processing_Enabled', Type: 'Boolean', Value: true }], Controls: [{ VariableName: 'EMM_Processing_Enabled', Properties: { Label: 'Email Processing' } }] },
        { SettingName: 'BUS_Trigger_Processing', Title: 'OxyGen Processing', Variables: [{ VariableName: 'BUS_Trigger_Processing_Enabled', Type: 'Boolean', Value: true }], Controls: [{ VariableName: 'BUS_Trigger_Processing_Enabled', Properties: { Label: 'OxyGen Processing' } }] },
        { SettingName: 'SMS_Delayed_Processing', Title: 'SMS Processing', Variables: [{ VariableName: 'SMS_Processing_Enabled', Type: 'Boolean', Value: false }], Controls: [{ VariableName: 'SMS_Processing_Enabled', Properties: { Label: 'SMS Processing' } }] },
        { SettingName: 'Hangfire_CheckIn', Title: 'Hangfire', Variables: [{ VariableName: 'Hangfire_Last_Check_In', Type: 'DateTime', Value: '2026-06-04T00:00:00Z' }], Controls: [{ VariableName: 'Hangfire_Last_Check_In', Properties: { Label: 'Last Check-In' } }] },
        { SettingName: 'ClientDomain', Title: 'Client Domain', Variables: [{ VariableName: 'ClientDomain', Type: 'String', Value: 'mock.example.com' }], Controls: [{ VariableName: 'ClientDomain', Properties: { Label: 'Client Domain' } }] }
      ]));
      return;
    }
    response.statusCode = 404;
    response.end('Not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  mockOxyGenServers.push(server);
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(mockOxyGenServers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

function createFakeInstanceCheckScheduler(existingSchedulers: Array<{ id: string }> = []): InstanceCheckQueueScheduler & { close: () => Promise<void> } {
  return {
    upsertJobScheduler: vi.fn(async () => undefined),
    removeJobScheduler: vi.fn(async () => undefined),
    getJobSchedulers: vi.fn(async () => existingSchedulers),
    add: vi.fn(async () => undefined),
    close: async () => undefined
  };
}

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>, authRepository: ReturnType<typeof createInMemoryAuthRepository>) {
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  const adminToken = login.json().token as string;
  const tenant = await authRepository.createTenant({ name: 'Acme Tenant', description: null });
  const groupA = await authRepository.createGroup({ name: 'Customer Group A', description: null, tenantId: tenant.id, instanceAccessMode: 'none', instanceIds: [] });
  const groupB = await authRepository.createGroup({ name: 'Customer Group B', description: null, instanceAccessMode: 'none', instanceIds: [] });
  await authRepository.createUser({ email: 'operator@example.com', displayName: 'Operator User', password: 'OperatorPassword!42', roleNames: ['Viewer'], groupIds: [groupA.id], tenantId: tenant.id, instanceAccessMode: 'inherit', instanceIds: [] });
  const operatorLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'operator@example.com', password: 'OperatorPassword!42' } });
  return { adminToken, operatorToken: operatorLogin.json().token as string, tenant, groupA, groupB };
}

describe('instance enrollment API', () => {
  it('reconciles instance-check schedules once during app startup when a scheduler is available', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const scheduler = createFakeInstanceCheckScheduler();
    await instanceRepository.createInstance({ name: 'Startup Scheduled', description: null, tenantId: null, host: 'startup.example.com', username: 'admin', password: 'RemotePassword!42' });

    const app = await buildApp({ logger: false, authRepository, instanceRepository, instanceCheckQueueScheduler: scheduler, enableBackgroundPolling: false });

    expect(scheduler.upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledWith(expect.stringMatching(/^instance-check:/), expect.objectContaining({ immediately: false }), expect.objectContaining({ data: expect.objectContaining({ source: 'scheduled' }) }));
    await app.close();
  });

  it('reconciles instance-check schedules after successful instance create, update, delete, and import mutations', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const scheduler = createFakeInstanceCheckScheduler();
    const app = await buildApp({ logger: false, authRepository, instanceRepository, instanceCheckQueueScheduler: scheduler, enableBackgroundPolling: false });
    const { adminToken, tenant } = await bootstrap(app, authRepository);
    vi.mocked(scheduler.upsertJobScheduler).mockClear();
    vi.mocked(scheduler.removeJobScheduler).mockClear();
    vi.mocked(scheduler.getJobSchedulers).mockClear();

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Scheduled Create', description: null, tenantId: tenant.id, host: 'scheduled-create.example.com', password: 'RemotePassword!42' }
    });
    expect(created.statusCode).toBe(201);
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledTimes(1);

    vi.mocked(scheduler.upsertJobScheduler).mockClear();
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/instances/${created.json().instance.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Scheduled Disabled', description: null, tenantId: tenant.id, host: 'scheduled-create.example.com', password: 'RemotePassword!42', isEnabled: false }
    });
    expect(updated.statusCode).toBe(200);
    expect(scheduler.upsertJobScheduler).not.toHaveBeenCalled();

    vi.mocked(scheduler.getJobSchedulers).mockResolvedValueOnce([{ id: `instance-check:${created.json().instance.id}` }]);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/instances/${created.json().instance.id}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(deleted.statusCode).toBe(204);
    expect(scheduler.removeJobScheduler).toHaveBeenCalledWith(`instance-check:${created.json().instance.id}`);

    vi.mocked(scheduler.upsertJobScheduler).mockClear();
    const imported = await app.inject({
      method: 'POST',
      url: '/api/instances/import',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { dryRun: false, csv: 'instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password\n,Imported Scheduled,,Acme Tenant,https,imported-scheduled.example.com,,admin,300,true,true,false,,,RemotePassword!42\n' }
    });
    expect(imported.statusCode).toBe(200);
    expect(scheduler.upsertJobScheduler).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('defaults new OxyGen instances to HTTPS, port 443, and admin username; HTTP defaults to port 80', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);

    const httpsDefault = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Default HTTPS', description: null, tenantId: null, host: 'secure.example.com', password: 'RemotePassword!42' }
    });
    expect(httpsDefault.statusCode).toBe(201);
    expect(httpsDefault.json().instance).toMatchObject({ protocol: 'https', host: 'secure.example.com', port: 443, hostname: 'secure.example.com:443', baseUrl: 'https://secure.example.com:443', launchUrl: 'https://secure.example.com:443/OPTWS/OxyGen.aspx', username: 'admin' });

    const httpDefault = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Default HTTP', description: null, tenantId: null, protocol: 'http', host: 'plain.example.com', password: 'RemotePassword!42' }
    });
    expect(httpDefault.statusCode).toBe(201);
    expect(httpDefault.json().instance).toMatchObject({ protocol: 'http', port: 80, hostname: 'plain.example.com:80', baseUrl: 'http://plain.example.com:80', launchUrl: 'http://plain.example.com:80/OPTWS/OxyGen.aspx', username: 'admin' });

    await app.close();
  });

  it('allows SystemAdmin users to create, list, update, test, and delete expanded OxyGen instances without assigning a user group on the instance', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Acme Production',
        description: 'Primary Acme production OxyGen deployment',
        tenantId: tenant.id,
        protocol: 'https',
        host: 'acme.example.com',
        port: 444,
        username: 'admin',
        password: 'RemotePassword!42',
        pollingIntervalSeconds: 300
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().instance).toMatchObject({
      name: 'Acme Production',
      description: 'Primary Acme production OxyGen deployment',
      tenantId: tenant.id,
      protocol: 'https',
      host: 'acme.example.com',
      port: 444,
      hostname: 'acme.example.com:444',
      baseUrl: 'https://acme.example.com:444',
      launchUrl: 'https://acme.example.com:444/OPTWS/OxyGen.aspx',
      username: 'admin',
      pollingIntervalSeconds: 300,
      isEnabled: true,
      sslValid: null,
      sslExpiresAt: null,
      processingStatus: 'unknown',
      emmQueueStatus: 'unknown',
      smsStatus: 'unknown',
      hangfireStatus: 'unknown',
      licenseKey: null,
      licenseStatus: 'unknown',
      licenseJson: null,
      settingsJson: null
    });
    expect(created.json().instance.groupId).toBeUndefined();
    expect(created.json().instance.password).toBeUndefined();

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().instances).toHaveLength(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/instances/${created.json().instance.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Acme Prod', description: 'Updated deployment', tenantId: tenant.id, protocol: 'https', host: 'acme.example.com', port: 443, username: 'svc', pollingIntervalSeconds: 600, isEnabled: false }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().instance).toMatchObject({ name: 'Acme Prod', description: 'Updated deployment', tenantId: tenant.id, protocol: 'https', host: 'acme.example.com', port: 443, baseUrl: 'https://acme.example.com:443', launchUrl: 'https://acme.example.com:443/OPTWS/OxyGen.aspx', username: 'svc', isEnabled: false });
    expect(updated.json().instance.groupId).toBeUndefined();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/instances/${created.json().instance.id}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(deleted.statusCode).toBe(204);

    await app.close();
  });


  it('persists instance import columns and hides archived instances unless requested', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Archived Metadata Instance',
        description: 'Short summary',
        tenantId: tenant.id,
        protocol: 'https',
        host: 'archived.example.com',
        username: 'admin',
        password: 'RemotePassword!42',
        checkLicense: false,
        archived: true,
        metadata: { region: 'us-east', tier: 'gold' },
        notes: '# Runbook\n\nUse the maintenance window.'
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().instance).toMatchObject({
      name: 'Archived Metadata Instance',
      checkLicense: false,
      archived: true,
      metadata: { region: 'us-east', tier: 'gold' },
      notes: '# Runbook\n\nUse the maintenance window.'
    });

    const defaultList = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(defaultList.statusCode).toBe(200);
    expect(defaultList.json().instances.map((instance: { name: string }) => instance.name)).not.toContain('Archived Metadata Instance');

    const archiveList = await app.inject({ method: 'GET', url: '/api/instances?includeArchived=true', headers: { authorization: `Bearer ${adminToken}` } });
    expect(archiveList.statusCode).toBe(200);
    expect(archiveList.json().instances).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.json().instance.id, archived: true, checkLicense: false, metadata: { region: 'us-east', tier: 'gold' } })
    ]));

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/instances/${created.json().instance.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Unarchived Metadata Instance',
        description: 'Short summary',
        tenantId: tenant.id,
        protocol: 'https',
        host: 'archived.example.com',
        username: 'admin',
        checkLicense: true,
        archived: false,
        metadata: { region: 'us-west' },
        notes: '<p>HTML notes</p>'
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().instance).toMatchObject({ archived: false, checkLicense: true, metadata: { region: 'us-west' }, notes: '<p>HTML notes</p>' });

    const visibleList = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(visibleList.json().instances.map((instance: { name: string }) => instance.name)).toContain('Unarchived Metadata Instance');

    await app.close();
  });

  it('excludes instances with license checks disabled from dashboard license issues', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'License Skipped', description: null, tenantId: null, protocol: 'https', host: 'license-skipped.example.com', password: 'RemotePassword!42', checkLicense: false }
    });
    expect(created.statusCode).toBe(201);

    const dashboard = await app.inject({ method: 'GET', url: '/api/dashboard', headers: { authorization: `Bearer ${adminToken}` } });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().dashboard.counts.licenseIssues).toBe(0);
    expect(dashboard.json().dashboard.instances[0]).toMatchObject({
      id: created.json().instance.id,
      checkLicense: false,
      hasIssue: false,
      issueCount: 0,
      primaryIssue: null
    });

    await app.close();
  });

  it('does not call the remote license API when checkLicense is false', async () => {
    const requestedUrls: string[] = [];
    const password = 'RemotePassword!42';
    const port = await startMockOxyGenServer(password, (request) => requestedUrls.push(`${request.method} ${request.url}`));
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'No License Probe', description: null, tenantId: null, protocol: 'http', host: '127.0.0.1', port, username: 'admin', password, checkLicense: false }
    });
    expect(created.statusCode).toBe(201);

    const checked = await app.inject({ method: 'POST', url: `/api/instances/${created.json().instance.id}/test-connectivity`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().license).toMatchObject({ status: 'unknown', step: { skipped: true } });
    expect(requestedUrls).toContain('POST /v2/Auth/Login');
    expect(requestedUrls).toContain('GET /web-api/global/settings');
    expect(requestedUrls.some((url) => url.includes('/web-api/BUS/License'))).toBe(false);

    await app.close();
  });

  it('returns a scoped instance detail dashboard payload for an enrolled OxyGen instance', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, operatorToken, tenant, groupA } = await bootstrap(app, authRepository);

    const visible = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Detail Visible', description: 'Detail dashboard target', tenantId: tenant.id, protocol: 'https', host: 'detail.example.com', port: 443, username: 'admin', password: 'RemotePassword!42', pollingIntervalSeconds: 300 } });
    const hidden = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Detail Hidden', description: null, tenantId: null, protocol: 'https', host: 'hidden-detail.example.com', username: 'admin', password: 'RemotePassword!42' } });
    await authRepository.updateGroup(groupA.id, { name: groupA.name, description: groupA.description, tenantId: groupA.tenantId, instanceAccessMode: 'specific', instanceIds: [visible.json().instance.id] });
    const originalGetInstance = instanceRepository.getInstance.bind(instanceRepository);
    instanceRepository.getInstance = vi.fn(async (instanceId) => {
      const found = await originalGetInstance(instanceId);
      return found && instanceId === visible.json().instance.id
        ? { ...found, licenseStatus: 'valid' as const, licenseKey: 'DETAIL-LICENSE', licenseJson: { IsValid: true, IsExpired: false, ExpiryDate: '2026-06-30T20:00:00.000Z' } }
        : found;
    });

    const adminDetail = await app.inject({ method: 'GET', url: `/api/instances/${visible.json().instance.id}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(adminDetail.statusCode).toBe(200);
    expect(adminDetail.json().instance).toMatchObject({
      id: visible.json().instance.id,
      name: 'Detail Visible',
      description: 'Detail dashboard target',
      tenantId: tenant.id,
      baseUrl: 'https://detail.example.com:443',
      launchUrl: 'https://detail.example.com:443/OPTWS/OxyGen.aspx',
      status: 'unknown',
      licenseStatus: 'valid',
      licenseJson: { IsValid: true, IsExpired: false, ExpiryDate: '2026-06-30T20:00:00.000Z' },
      workflowSummaryJson: null
    });
    expect(adminDetail.json().instance.password).toBeUndefined();
    expect(adminDetail.json().instance.passwordSecret).toBeUndefined();

    const operatorVisible = await app.inject({ method: 'GET', url: `/api/instances/${visible.json().instance.id}`, headers: { authorization: `Bearer ${operatorToken}` } });
    expect(operatorVisible.statusCode).toBe(200);
    expect(operatorVisible.json().instance.name).toBe('Detail Visible');

    const operatorHidden = await app.inject({ method: 'GET', url: `/api/instances/${hidden.json().instance.id}`, headers: { authorization: `Bearer ${operatorToken}` } });
    expect(operatorHidden.statusCode).toBe(404);

    await app.close();
  });

  it('runs a real connectivity test from unsaved modal connection values without creating an instance', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);
    const port = await startMockOxyGenServer('RemotePassword!42');

    const connectivity = await app.inject({
      method: 'POST',
      url: '/api/instances/test-connectivity',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42', checkLicense: false }
    });

    expect(connectivity.statusCode).toBe(200);
    expect(connectivity.json()).toMatchObject({
      ok: true,
      status: 'reachable',
      message: 'Connectivity test passed.',
      authentication: { ok: true, httpStatusCode: 200 },
      api: { ok: true, httpStatusCode: 200 }
    });
    expect(connectivity.json().password).toBeUndefined();
    expect(connectivity.json().passwordSecret).toBeUndefined();

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances).toEqual([]);

    await app.close();
  });

  it('runs a real on-demand connectivity test against an enrolled OxyGen endpoint', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);
    const port = await startMockOxyGenServer('RemotePassword!42');

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Local Mock OxyGen', description: null, tenantId: null, protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42', checkLicense: false }
    });
    expect(created.statusCode).toBe(201);

    const connectivity = await app.inject({ method: 'POST', url: `/api/instances/${created.json().instance.id}/test-connectivity`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(connectivity.statusCode).toBe(200);
    expect(connectivity.json()).toMatchObject({
      ok: true,
      status: 'reachable',
      message: 'Connectivity test passed.',
      dns: { ok: true },
      ssl: { ok: true, skipped: true, valid: null },
      authentication: { ok: true, httpStatusCode: 200 },
      api: { ok: true, httpStatusCode: 200 },
      settingsJson: [
        { SettingName: 'BUS_Auto_Purge' },
        { SettingName: 'OxyGen_Version' },
        { SettingName: 'EMM_Delayed_Processing' },
        { SettingName: 'BUS_Trigger_Processing' },
        { SettingName: 'SMS_Delayed_Processing' },
        { SettingName: 'Hangfire_CheckIn' },
        { SettingName: 'ClientDomain' }
      ]
    });
    expect(connectivity.json().durationMs).toBeGreaterThanOrEqual(0);
    expect(connectivity.json().password).toBeUndefined();
    expect(connectivity.json().passwordSecret).toBeUndefined();

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances[0]).toMatchObject({ status: 'up', lastError: null });
    expect(listed.json().instances[0].lastCheckedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const healthDetails = await app.inject({ method: 'GET', url: `/api/instances/${created.json().instance.id}/health-details`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(healthDetails.statusCode).toBe(200);
    expect(healthDetails.json().healthDetails).toMatchObject({
      instance: {
        id: created.json().instance.id,
        name: 'Local Mock OxyGen',
        status: 'up',
        settingsJson: [
          { SettingName: 'BUS_Auto_Purge' },
          { SettingName: 'OxyGen_Version' },
          { SettingName: 'EMM_Delayed_Processing' },
          { SettingName: 'BUS_Trigger_Processing' },
          { SettingName: 'SMS_Delayed_Processing' },
          { SettingName: 'Hangfire_CheckIn' },
          { SettingName: 'ClientDomain' }
        ]
      },
      availability: [{ checkType: 'connectivity', status: 'up' }],
      latestConnectivity: { checkType: 'connectivity', status: 'up' },
      licenseHistory: [{ checkType: 'license' }],
      workflowHistory: [{ checkType: 'workflow', status: 'ok' }],
      latestWorkflow: { checkType: 'workflow', status: 'ok' }
    });
    expect(healthDetails.json().healthDetails.latestConnectivity.detailsJson).toMatchObject({
      authentication: { ok: true, httpStatusCode: 200 },
      api: { ok: true, httpStatusCode: 200 }
    });

    await app.close();
  });

  it('exports global instance CSV with Tenant names and no passwords for global SystemAdmins', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);

    const globalInstance = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Global Exported', description: 'Global instance', tenantId: null, protocol: 'https', host: 'global.example.com', username: 'admin', password: 'GlobalPassword!42' } });
    const tenantInstance = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Tenant Exported', description: 'Tenant instance', tenantId: tenant.id, protocol: 'http', host: 'tenant.example.com', port: 8080, username: 'svc', password: 'TenantPassword!42' } });

    const exported = await app.inject({ method: 'GET', url: '/api/instances/export.csv', headers: { authorization: `Bearer ${adminToken}` } });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toContain('oxygen-instances-');
    const csv = exported.body;
    expect(csv.split(/\r?\n/)[0]).toBe('instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password');
    expect(csv).toContain(`${globalInstance.json().instance.id},Global Exported,Global instance,,https,global.example.com,443,admin,300,true,true,false,,,`);
    expect(csv).toContain(`${tenantInstance.json().instance.id},Tenant Exported,Tenant instance,Acme Tenant,http,tenant.example.com,8080,svc,300,true,true,false,,,`);
    expect(csv).not.toContain('GlobalPassword!42');
    expect(csv).not.toContain('TenantPassword!42');

    await app.close();
  });

  it('exports tenant-scoped CSV without Tenant column and only that Tenant instances', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);
    const tenantAdmin = await authRepository.createUser({ email: 'tenant-admin@example.com', displayName: 'Tenant Admin', password: 'TenantAdminPassword!42', roleNames: ['TenantAdmin'], groupIds: [], tenantId: tenant.id, instanceAccessMode: 'all', instanceIds: [] });
    const tenantAdminToken = await authRepository.createSession(tenantAdmin.user.id);

    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Visible Tenant Instance', tenantId: tenant.id, protocol: 'https', host: 'tenant-visible.example.com', username: 'admin', password: 'TenantPassword!42' } });
    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Hidden Global Instance', tenantId: null, protocol: 'https', host: 'global-hidden.example.com', username: 'admin', password: 'GlobalPassword!42' } });

    const exported = await app.inject({ method: 'GET', url: '/api/instances/export.csv', headers: { authorization: `Bearer ${tenantAdminToken}` } });

    expect(exported.statusCode).toBe(200);
    const csv = exported.body;
    expect(csv.split(/\r?\n/)[0]).toBe('instance_guid,name,description,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password');
    expect(csv).toContain('Visible Tenant Instance');
    expect(csv).not.toContain('Hidden Global Instance');
    expect(csv).not.toContain(',tenant,');

    await app.close();
  });

  it('imports global CSV using Tenant names and upserts by instance_guid', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);
    const existing = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Before Import', tenantId: tenant.id, protocol: 'https', host: 'before.example.com', username: 'admin', password: 'KeepPassword!42' } });

    const csv = [
      'instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password',
      `${existing.json().instance.id},After Import,Updated by CSV,Acme Tenant,http,after.example.com,8081,svc,600,false,false,false,"{ ""source"": ""csv"" }",Updated notes,`,
      '11111111-1111-4111-8111-111111111111,New Tenant Instance,Created by CSV,Acme Tenant,https,new-tenant.example.com,,admin,300,true,true,false,,,NewPassword!42',
      ',New Global Instance,Created globally,,https,new-global.example.com,,admin,300,true,true,true,,Archived global,GlobalPassword!42'
    ].join('\n');

    const imported = await app.inject({ method: 'POST', url: '/api/instances/import', headers: { authorization: `Bearer ${adminToken}` }, payload: { csv } });

    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ created: 2, updated: 1, failed: 0 });
    const listed = await app.inject({ method: 'GET', url: '/api/instances?includeArchived=true', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: existing.json().instance.id, name: 'After Import', tenantId: tenant.id, protocol: 'http', host: 'after.example.com', port: 8081, username: 'svc', pollingIntervalSeconds: 600, isEnabled: false, checkLicense: false, archived: false, metadata: { source: 'csv' }, notes: 'Updated notes' }),
      expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', name: 'New Tenant Instance', tenantId: tenant.id }),
      expect.objectContaining({ name: 'New Global Instance', tenantId: null, archived: true, notes: 'Archived global' })
    ]));

    await app.close();
  });

  it('imports spreadsheet CSV with trailing blank columns, password before check_license, and missing Tenant creation', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken } = await bootstrap(app, authRepository);

    const csv = [
      'instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,password,check_license,archived,metadata,notes,,,,',
      ',Spreadsheet Import,,10002,https,spreadsheet.example.com,443,admin,300,TRUE,SpreadsheetPassword!42,TRUE,FALSE,,OxyGen,,,,',
      ''
    ].join('\r\n');

    const imported = await app.inject({ method: 'POST', url: '/api/instances/import', headers: { authorization: `Bearer ${adminToken}` }, payload: { csv } });

    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ created: 1, updated: 0, failed: 0 });
    expect(imported.json().rows[0].warnings[0]).toContain('Tenant 10002 will be created.');
    const tenant = (await authRepository.listTenants()).find((entry) => entry.name === '10002');
    expect(tenant).toBeDefined();
    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Spreadsheet Import', tenantId: tenant?.id, host: 'spreadsheet.example.com', checkLicense: true, notes: 'OxyGen' })
    ]));

    await app.close();
  });

  it('imports tenant-scoped CSV into the signed-in user Tenant without accepting a Tenant column', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);
    const tenantAdmin = await authRepository.createUser({ email: 'tenant-import-admin@example.com', displayName: 'Tenant Import Admin', password: 'TenantAdminPassword!42', roleNames: ['TenantAdmin'], groupIds: [], tenantId: tenant.id, instanceAccessMode: 'all', instanceIds: [] });
    const tenantAdminToken = await authRepository.createSession(tenantAdmin.user.id);
    const existing = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Tenant Before Import', tenantId: tenant.id, protocol: 'https', host: 'tenant-before.example.com', username: 'admin', password: 'KeepPassword!42' } });

    const csv = [
      'instance_guid,name,description,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password',
      `${existing.json().instance.id},Tenant After Import,Updated by CSV,http,tenant-after.example.com,8082,svc,900,true,false,false,,,`,
      ',Tenant Created Import,Created by CSV,https,tenant-created.example.com,,admin,300,true,true,false,,,CreatedPassword!42'
    ].join('\n');

    const imported = await app.inject({ method: 'POST', url: '/api/instances/import', headers: { authorization: `Bearer ${tenantAdminToken}` }, payload: { csv } });

    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ created: 1, updated: 1, failed: 0 });
    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: existing.json().instance.id, name: 'Tenant After Import', tenantId: tenant.id }),
      expect.objectContaining({ name: 'Tenant Created Import', tenantId: tenant.id })
    ]));

    const rejected = await app.inject({ method: 'POST', url: '/api/instances/import', headers: { authorization: `Bearer ${tenantAdminToken}` }, payload: { csv: 'instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password\n,Blocked,,Other Tenant,https,blocked.example.com,,admin,300,true,true,false,,,Password!42' } });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().rows[0].errors[0]).toContain('Tenant-scoped imports must not include a tenant column.');

    await app.close();
  });

  it('rejects updates that would move existing instances to unknown Tenants', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant } = await bootstrap(app, authRepository);
    const existing = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Before Import', tenantId: tenant.id, protocol: 'https', host: 'before.example.com', username: 'admin', password: 'KeepPassword!42' } });

    const csv = [
      'instance_guid,name,description,tenant,protocol,host,port,username,polling_interval_seconds,is_enabled,check_license,archived,metadata,notes,password',
      `${existing.json().instance.id},Invalid Row,Unknown Tenant,Missing Tenant,https,invalid.example.com,,admin,300,true,true,false,,,`
    ].join('\n');

    const imported = await app.inject({ method: 'POST', url: '/api/instances/import', headers: { authorization: `Bearer ${adminToken}` }, payload: { csv } });

    expect(imported.statusCode).toBe(400);
    expect(imported.json()).toMatchObject({ created: 0, updated: 0, failed: 1 });
    expect(imported.json().rows[0].errors[0]).toContain('Unknown Tenant: Missing Tenant');
    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.json().instances).toEqual([expect.objectContaining({ id: existing.json().instance.id, name: 'Before Import', tenantId: tenant.id })]);

    await app.close();
  });

  it('limits non-admin instance lists using instance access granted from user groups', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, operatorToken, tenant, groupA } = await bootstrap(app, authRepository);

    const visible = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Visible Instance', description: null, tenantId: tenant.id, protocol: 'https', host: 'visible.example.com', username: 'admin', password: 'RemotePassword!42' } });
    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Hidden Instance', description: null, tenantId: null, protocol: 'https', host: 'hidden.example.com', username: 'admin', password: 'RemotePassword!42' } });

    await authRepository.updateGroup(groupA.id, { name: groupA.name, description: groupA.description, tenantId: groupA.tenantId, instanceAccessMode: 'specific', instanceIds: [visible.json().instance.id] });

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${operatorToken}` } });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().instances.map((instance: { name: string }) => instance.name)).toEqual(['Visible Instance']);

    const createAttempt = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${operatorToken}` }, payload: { name: 'Blocked', description: null, tenantId: tenant.id, protocol: 'https', host: 'blocked.example.com', username: 'admin', password: 'RemotePassword!42' } });
    expect(createAttempt.statusCode).toBe(403);

    await app.close();
  });

  it('allows direct user instance access to override group access with none or all', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, tenant, groupA } = await bootstrap(app, authRepository);

    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Instance A', description: null, tenantId: tenant.id, protocol: 'https', host: 'a.example.com', username: 'admin', password: 'RemotePassword!42' } });
    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Instance B', description: null, tenantId: tenant.id, protocol: 'https', host: 'b.example.com', username: 'admin', password: 'RemotePassword!42' } });
    await authRepository.updateGroup(groupA.id, { name: groupA.name, description: groupA.description, tenantId: groupA.tenantId, instanceAccessMode: 'all', instanceIds: [] });

    const noAccessUser = await authRepository.createUser({ email: 'noaccess@example.com', displayName: 'No Access', password: 'NoAccessPassword!42', roleNames: ['Operator'], groupIds: [groupA.id], tenantId: tenant.id, instanceAccessMode: 'none', instanceIds: [] });
    const noAccessToken = await authRepository.createSession(noAccessUser.user.id);
    const noneList = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${noAccessToken}` } });
    expect(noneList.json().instances).toEqual([]);

    const allAccessUser = await authRepository.createUser({ email: 'allaccess@example.com', displayName: 'All Access', password: 'AllAccessPassword!42', roleNames: ['Operator'], groupIds: [], tenantId: tenant.id, instanceAccessMode: 'all', instanceIds: [] });
    const allAccessToken = await authRepository.createSession(allAccessUser.user.id);
    const allList = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${allAccessToken}` } });
    expect(allList.json().instances.map((instance: { name: string }) => instance.name)).toEqual(['Instance A', 'Instance B']);

    await app.close();
  });
});
