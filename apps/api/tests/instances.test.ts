import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';

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

async function startMockOxyGenServer(password: string) {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'POST' && request.url === '/v2/Auth/Login') {
      const body = await readRequestBody(request);
      const form = new URLSearchParams(body);
      if (form.get('Username') === 'admin' && form.get('Password') === password) {
        response.statusCode = 200;
        response.setHeader('set-cookie', 'ASP.NET_SessionId=mock-session; Path=/; HttpOnly');
        response.end('OK');
        return;
      }
      response.statusCode = 401;
      response.end('Unauthorized');
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/global/settings/currenttime' && request.headers.cookie?.includes('ASP.NET_SessionId=mock-session')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ currentTime: '2026-06-04T00:00:00Z' }));
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

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>, authRepository: ReturnType<typeof createInMemoryAuthRepository>) {
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  const adminToken = login.json().token as string;
  const tenant = await authRepository.createTenant({ name: 'Acme Tenant', description: null });
  const groupA = await authRepository.createGroup({ name: 'Customer Group A', description: null, tenantId: tenant.id, instanceAccessMode: 'none', instanceIds: [] });
  const groupB = await authRepository.createGroup({ name: 'Customer Group B', description: null, instanceAccessMode: 'none', instanceIds: [] });
  await authRepository.createUser({ email: 'operator@example.com', displayName: 'Operator User', password: 'OperatorPassword!42', roleNames: ['Operator'], groupIds: [groupA.id], tenantId: tenant.id, instanceAccessMode: 'inherit', instanceIds: [] });
  const operatorLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'operator@example.com', password: 'OperatorPassword!42' } });
  return { adminToken, operatorToken: operatorLogin.json().token as string, tenant, groupA, groupB };
}

describe('instance enrollment API', () => {
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


  it('returns a scoped instance detail dashboard payload for an enrolled OxyGen instance', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, operatorToken, tenant, groupA } = await bootstrap(app, authRepository);

    const visible = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Detail Visible', description: 'Detail dashboard target', tenantId: tenant.id, protocol: 'https', host: 'detail.example.com', port: 443, username: 'admin', password: 'RemotePassword!42', pollingIntervalSeconds: 300 } });
    const hidden = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Detail Hidden', description: null, tenantId: null, protocol: 'https', host: 'hidden-detail.example.com', username: 'admin', password: 'RemotePassword!42' } });
    await authRepository.updateGroup(groupA.id, { name: groupA.name, description: groupA.description, tenantId: groupA.tenantId, instanceAccessMode: 'specific', instanceIds: [visible.json().instance.id] });

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
      licenseStatus: 'unknown',
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
      payload: { protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42' }
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
      payload: { name: 'Local Mock OxyGen', description: null, tenantId: null, protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42' }
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
      api: { ok: true, httpStatusCode: 200 }
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
      instance: { id: created.json().instance.id, name: 'Local Mock OxyGen', status: 'up' },
      availability: [{ checkType: 'connectivity', status: 'up' }],
      latestConnectivity: { checkType: 'connectivity', status: 'up' },
      licenseHistory: [{ checkType: 'license' }]
    });
    expect(healthDetails.json().healthDetails.latestConnectivity.detailsJson).toMatchObject({
      authentication: { ok: true, httpStatusCode: 200 },
      api: { ok: true, httpStatusCode: 200 }
    });

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
