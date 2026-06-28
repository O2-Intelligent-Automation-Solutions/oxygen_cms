import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';

const servers: Array<ReturnType<typeof createServer>> = [];
const seenRequests: Array<{ method: string | undefined; url: string | undefined; cookie: string | undefined; body?: string }> = [];

function authHeader(token: string) {
  return `Bearer ${token}`;
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockOxyGen() {
  seenRequests.length = 0;
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestBody = request.method === 'POST' ? await readBody(request) : undefined;
    seenRequests.push({ method: request.method, url: request.url, cookie: request.headers.cookie, body: requestBody });
    if (request.method === 'POST' && request.url === '/v2/Auth/Login') {
      const body = new URLSearchParams(requestBody ?? '');
      if (body.get('Username') === 'admin' && body.get('Password') === 'RemotePassword!42') {
        response.statusCode = 200;
        response.setHeader('set-cookie', 'ASP.NET_SessionId=processing-session; Path=/; HttpOnly');
        response.end('OK');
        return;
      }
      response.statusCode = 401;
      response.end('Unauthorized');
      return;
    }
    if (!request.headers.cookie?.includes('ASP.NET_SessionId=processing-session')) {
      response.statusCode = 401;
      response.end('Missing session');
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && request.url?.startsWith('/web-api/BUS/workflows/triggers/grid')) {
      response.end(JSON.stringify({ data: [{ Id: 100, Status: 'Errored' }], total: 1 }));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/BUS/workflows/triggers/schema') {
      response.end(JSON.stringify([{ field: 'Id' }, { field: 'Status' }]));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/web-api/BUS/workflows/events/grid')) {
      response.end(JSON.stringify({ Data: [{ Id: 200, WorkflowTriggerId: 100 }], Total: 1 }));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/BUS/workflows/events/schema') {
      response.end(JSON.stringify([{ field: 'Id' }]));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/WHE/Events/Schema') {
      response.end(JSON.stringify([{ field: 'Id' }, { field: 'ParentId' }]));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/web-api/WHE/Events/Grid')) {
      response.end(JSON.stringify({ data: [{ Id: 300, ParentId: null }], total: 1 }));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/WHE/Events/300') {
      response.end(JSON.stringify({ Id: 300, MappedIndexData: { safe: true }, Files: [{ FileName: 'payload.json', IsExists: true, Location: 1 }] }));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/WHE/Events/300/payload.json/File') {
      response.setHeader('content-type', 'application/json');
      response.end('{"downloaded":true}');
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/EMM/Queue/Schema') {
      response.end(JSON.stringify({ Fields: [{ Key: 'Id', Label: 'Id' }], Groups: { Workflow: ['WorkflowId'] } }));
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/EMM/Queue/300') {
      response.end(JSON.stringify({ Id: 300, Status: 'Active', Message: { Subject: 'Hello', Body: 'Message body', IsPlainText: true, To: [{ Address: 'ops@example.com' }], Attachments: [{ FileName: 'notice.txt', ContentType: 'text/plain', Content: 'SGVsbG8=' }] }, OriginalMessage: null }));
      return;
    }
    if (request.method === 'POST' && request.url === '/web-api/BUS/workflows/triggers/100/cancel?isParent=false') {
      response.end(JSON.stringify('Successfully canceled.'));
      return;
    }
    if (request.method === 'POST' && request.url === '/web-api/BUS/workflows/events/200/recovery?triggerId=100') {
      response.end(JSON.stringify('Recovery requested.'));
      return;
    }
    if (request.method === 'POST' && request.url === '/web-api/BUS/workflows/events/200/cancel?action=2') {
      response.end(JSON.stringify('Event canceled.'));
      return;
    }
    if (request.method === 'POST' && request.url === '/web-api/WHE/events/queue/300') {
      response.end(JSON.stringify('Restore queued.'));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Unexpected path' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

async function seedFixture() {
  const authRepository = createInMemoryAuthRepository();
  const instanceRepository = createInMemoryInstanceRepository();
  const app = await buildApp({ logger: false, authRepository, instanceRepository, enableBackgroundPolling: false });
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const adminLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  const tenantA = await authRepository.createTenant({ name: 'Tenant A', description: null });
  const tenantB = await authRepository.createTenant({ name: 'Tenant B', description: null });
  const groupA = await authRepository.createGroup({ name: 'Tenant A Group', description: null, tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  await authRepository.createUser({ email: 'viewer-a@example.com', displayName: 'Viewer A', password: 'ViewerPassword!42', roleNames: ['Viewer'], groupIds: [groupA.id], tenantId: tenantA.id, instanceAccessMode: 'all', instanceIds: [] });
  const viewerLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'viewer-a@example.com', password: 'ViewerPassword!42' } });
  const port = await startMockOxyGen();
  const instanceA = await instanceRepository.createInstance({ name: 'Tenant A OxyGen', description: null, tenantId: tenantA.id, protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42' });
  const instanceB = await instanceRepository.createInstance({ name: 'Tenant B OxyGen', description: null, tenantId: tenantB.id, protocol: 'http', host: '127.0.0.1', port, username: 'admin', password: 'RemotePassword!42' });
  return { app, tokens: { admin: adminLogin.json().token as string, viewer: viewerLogin.json().token as string }, instanceA, instanceB };
}

describe('Processing Errors typed read-only routes', () => {
  it('authenticates server-side and forwards only typed trigger grid paths with clamped DataSourceRequest paging', async () => {
    const fixture = await seedFixture();

    const response = await fixture.app.inject({
      method: 'GET',
      url: `/api/instances/${fixture.instanceA.id}/processing/triggers/grid`,
      headers: { authorization: authHeader(fixture.tokens.admin) },
      query: { skip: '25', take: '9999', sort: 'Id-asc', filter: "Status~eq~'Errored'" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ Id: 100, Status: 'Errored' }], total: 1 });
    expect(seenRequests.map((entry) => entry.url)).toContain('/v2/Auth/Login');
    const forwarded = seenRequests.find((entry) => entry.url?.startsWith('/web-api/BUS/workflows/triggers/grid'));
    expect(forwarded?.cookie).toContain('ASP.NET_SessionId=processing-session');
    expect(forwarded?.url).toContain('skip=25');
    expect(forwarded?.url).toContain('take=250');
    expect(forwarded?.url).toContain('sort=Id-asc');
    expect(forwarded?.url).toContain('filter=Status%7Eeq%7E%27Errored%27');
    await fixture.app.close();
  });

  it('defaults take to a safe bounded page size and supports typed schema/detail/children routes', async () => {
    const fixture = await seedFixture();

    const schema = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/schema`, headers: { authorization: authHeader(fixture.tokens.admin) } });
    const detail = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300`, headers: { authorization: authHeader(fixture.tokens.admin) } });
    const children = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300/children`, headers: { authorization: authHeader(fixture.tokens.admin) } });

    expect(schema.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(children.statusCode).toBe(200);
    const childrenPath = [...seenRequests].reverse().find((entry) => entry.url?.startsWith('/web-api/WHE/Events/Grid'))?.url;
    expect(childrenPath).toContain('take=50');
    expect(childrenPath).toContain('filter=ParentId%7Eeq%7E300');
    await fixture.app.close();
  });

  it('denies invisible instances before making a remote OxyGen call', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const response = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceB.id}/processing/triggers/schema`, headers: { authorization: authHeader(fixture.tokens.viewer) } });

    expect(response.statusCode).toBe(404);
    expect(seenRequests).toEqual([]);
    await fixture.app.close();
  });

  it('rejects invalid service identifiers and generic proxy-shaped paths without remote calls', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const invalidService = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE!/schema`, headers: { authorization: authHeader(fixture.tokens.admin) } });
    const proxyAttempt = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/proxy?path=/web-api/BUS/workflows/triggers/grid`, headers: { authorization: authHeader(fixture.tokens.admin) } });

    expect(invalidService.statusCode).toBe(400);
    expect(proxyAttempt.statusCode).toBe(404);
    expect(seenRequests).toEqual([]);
    await fixture.app.close();
  });

  it('requires granular action permissions and confirmation before forwarding row actions server-side', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const denied = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/triggers/100/cancel`, headers: { authorization: authHeader(fixture.tokens.viewer) }, payload: { confirmed: true, isParent: false } });
    const unconfirmed = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/triggers/100/cancel`, headers: { authorization: authHeader(fixture.tokens.admin) }, payload: { isParent: false } });
    const forwarded = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/triggers/100/cancel`, headers: { authorization: authHeader(fixture.tokens.admin) }, payload: { confirmed: true, isParent: false } });

    expect(denied.statusCode).toBe(403);
    expect(unconfirmed.statusCode).toBe(400);
    expect(forwarded.statusCode).toBe(200);
    expect(forwarded.json()).toEqual({ ok: true, result: 'Successfully canceled.' });
    const remoteActions = seenRequests.filter((entry) => entry.url?.includes('/cancel'));
    expect(remoteActions).toHaveLength(1);
    expect(remoteActions[0]).toMatchObject({ method: 'POST', url: '/web-api/BUS/workflows/triggers/100/cancel?isParent=false' });
    expect(remoteActions[0].cookie).toContain('ASP.NET_SessionId=processing-session');
    expect(remoteActions[0].body).toBe('');
    await fixture.app.close();
  });

  it('forwards confirmed workflow and service row actions through typed endpoints only', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const recovery = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/workflow-events/200/recovery`, headers: { authorization: authHeader(fixture.tokens.admin) }, payload: { confirmed: true, triggerId: 100 } });
    const cancel = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/workflow-events/200/cancel`, headers: { authorization: authHeader(fixture.tokens.admin) }, payload: { confirmed: true, action: 2 } });
    const restore = await fixture.app.inject({ method: 'POST', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300/restore`, headers: { authorization: authHeader(fixture.tokens.admin) }, payload: { confirmed: true } });

    expect(recovery.statusCode).toBe(200);
    expect(cancel.statusCode).toBe(200);
    expect(restore.statusCode).toBe(200);
    expect(seenRequests.map((entry) => `${entry.method} ${entry.url}`)).toEqual(expect.arrayContaining([
      'POST /web-api/BUS/workflows/events/200/recovery?triggerId=100',
      'POST /web-api/BUS/workflows/events/200/cancel?action=2',
      'POST /web-api/WHE/events/queue/300'
    ]));
    await fixture.app.close();
  });

  it('downloads event files through typed CMS route with permission and safe filename checks', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const denied = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300/files/payload.json`, headers: { authorization: authHeader(fixture.tokens.viewer) } });
    const invalid = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300/files/%00bad`, headers: { authorization: authHeader(fixture.tokens.admin) } });
    const downloaded = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/WHE/300/files/payload.json`, headers: { authorization: authHeader(fixture.tokens.admin) } });

    expect(denied.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.body).toBe('{"downloaded":true}');
    expect(downloaded.headers['content-disposition']).toContain('payload.json');
    expect(seenRequests.map((entry) => `${entry.method} ${entry.url}`)).toContain('GET /web-api/WHE/Events/300/payload.json/File');
    const forwarded = seenRequests.find((entry) => entry.url === '/web-api/WHE/Events/300/payload.json/File');
    expect(forwarded?.cookie).toContain('ASP.NET_SessionId=processing-session');
    await fixture.app.close();
  });

  it('views EMM queue message schema and details through typed CMS routes', async () => {
    const fixture = await seedFixture();
    seenRequests.length = 0;

    const denied = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/EMM/300/message`, headers: { authorization: authHeader(fixture.tokens.viewer) } });
    const schema = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/EMM/message-schema`, headers: { authorization: authHeader(fixture.tokens.admin) } });
    const message = await fixture.app.inject({ method: 'GET', url: `/api/instances/${fixture.instanceA.id}/processing/service-events/EMM/300/message`, headers: { authorization: authHeader(fixture.tokens.admin) } });

    expect(denied.statusCode).toBe(403);
    expect(schema.statusCode).toBe(200);
    expect(message.statusCode).toBe(200);
    expect(message.json()).toMatchObject({ Id: 300, Message: { Subject: 'Hello', Attachments: [{ FileName: 'notice.txt' }] } });
    expect(seenRequests.map((entry) => `${entry.method} ${entry.url}`)).toEqual(expect.arrayContaining([
      'GET /web-api/EMM/Queue/Schema',
      'GET /web-api/EMM/Queue/300'
    ]));
    const forwarded = seenRequests.find((entry) => entry.url === '/web-api/EMM/Queue/300');
    expect(forwarded?.cookie).toContain('ASP.NET_SessionId=processing-session');
    await fixture.app.close();
  });
});
