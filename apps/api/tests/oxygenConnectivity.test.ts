import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo, createServer as createNetServer, type Server as NetServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { testOxyGenConnectivity } from '../src/instances/oxygenConnectivity.js';

const servers: Array<ReturnType<typeof createServer> | NetServer> = [];

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockOxyGenServer(options: { password: string; failAuth?: boolean; forbiddenAuth?: boolean; loginCookieWithoutAccess?: boolean; redirectAfterLogin?: boolean; license?: unknown; licenseDelayMs?: number; workflowError?: boolean; workflowTriggers?: Array<Record<string, unknown>> }) {
  const requests: string[] = [];
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    requests.push(`${request.method ?? 'GET'} ${request.url ?? '/'}`);

    if (request.method === 'POST' && request.url === '/v2/Auth/Login') {
      if (options.forbiddenAuth) {
        response.statusCode = 403;
        response.setHeader('content-type', 'text/html');
        response.end('<!DOCTYPE HTML><html><body><h1>Forbidden</h1></body></html>');
        return;
      }
      const body = await readBody(request);
      const form = new URLSearchParams(body);
      if (!options.failAuth && form.get('Username') === 'admin' && form.get('Password') === options.password) {
        response.statusCode = options.loginCookieWithoutAccess || options.redirectAfterLogin ? 302 : 200;
        if (options.redirectAfterLogin) response.setHeader('location', '/OPTWS/OxyGen.aspx');
        response.setHeader('set-cookie', options.loginCookieWithoutAccess
          ? ['OtherCookie=not-session; Path=/; HttpOnly']
          : ['ASP.NET_SessionId=mock-session; Path=/; HttpOnly', '.ASPXAUTH=mock-auth-ticket; Path=/; HttpOnly']);
        response.end(options.loginCookieWithoutAccess || options.redirectAfterLogin ? '' : 'OK');
        return;
      }
      response.statusCode = 401;
      response.end('Unauthorized');
      return;
    }

    if (request.method === 'GET' && request.url === '/web-api/global/settings') {
      if (request.headers.cookie?.includes('ASP.NET_SessionId=mock-session')) {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ siteName: 'Mock OxyGen', currentTime: '2026-06-04T00:00:00Z' }));
        return;
      }
      response.statusCode = 401;
      response.end('Missing session');
      return;
    }

    if (request.method === 'GET' && request.url === '/web-api/BUS/License') {
      if (request.headers.cookie?.includes('ASP.NET_SessionId=mock-session')) {
        if (options.licenseDelayMs) await new Promise((resolve) => setTimeout(resolve, options.licenseDelayMs));
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(options.license ?? { licenseKey: 'VALID-LICENSE-123', status: 'valid' }));
        return;
      }
      response.statusCode = 401;
      response.end('Missing session');
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/web-api/BUS/workflows/triggers/grid')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ Data: options.workflowTriggers ?? (options.workflowError ? [{ Id: 7001, WorkflowName: 'Daily Import', Status: 'Recovery', StatusInfo: 'SQL failed', HasErrors: true, TriggerDate: '2026-06-26T12:00:00Z' }] : []) }));
      return;
    }

    if (request.method === 'GET' && request.url?.startsWith('/web-api/BUS/workflows/events/grid')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ Data: [{ Id: 8001, Seq: 2, Status: 'Active', StatusInfo: 'In Recovery', LastError: 'Divide by zero', ServiceIdentifier: 'SQL', ServiceName: 'SQL Module', ServiceEventId: 9001, JobId: 44 }] }));
      return;
    }

    if (request.method === 'GET' && request.url === '/web-api/BUS/workflows/events/8001') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ Id: 8001, Seq: 2, Status: 'Active', StatusInfo: 'In Recovery', LastError: 'Divide by zero', ServiceIdentifier: 'SQL', ServiceName: 'SQL Module', ServiceEventId: 9001, JobId: 44, StackTrace: 'workflow stack' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/web-api/SQL/Events/9001') {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ Id: 9001, Seq: 2, Name: 'SQL Module', ErrorMessage: "Message: Exception: SQL Exception. Message: Divide by zero error encountered. SQL Query: SELECT Number = 1/0, Extra_Credit = '2926' SQL Query: SELECT Number = 1/0, Extra_Credit = '2926' Inner Exception Message: SQL Exception. Message: Divide by zero error encountered. SQL Query: SELECT Number = 1/0, Extra_Credit = '2926'", StackTrace: 'sql stack', ProcessingOutputs: '-1,0,2', MappedIndexData: { Outputs: [-1, 0, 2] }, Payload: 'raw payload should not be copied' }));
      return;
    }

    response.statusCode = 404;
    response.end('Not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, port, requests };
}

async function unusedTcpPort() {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startClosingTcpServer() {
  const server = createNetServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { port };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

describe('OxyGen connectivity checks', () => {
  it('authenticates and probes global settings through a session cookie', async () => {
    const mock = await startMockOxyGenServer({ password: 'RemotePassword!42', licenseDelayMs: 120 });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Local Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'RemotePassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'reachable',
      message: 'Connectivity test passed.',
      dns: { ok: true },
      ssl: { ok: true, valid: null },
      authentication: { ok: true, httpStatusCode: 200 },
      api: { ok: true, httpStatusCode: 200 },
      license: { status: 'valid', key: 'VALID-LICENSE-123', step: { ok: true, httpStatusCode: 200 } },
      workflows: { activeErrorCount: 0, triggerStatusCounts: {}, openTriggers: [], step: { ok: true, httpStatusCode: 200 } }
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.responseTimeMs).not.toBeNull();
    expect(result.durationMs - (result.responseTimeMs ?? 0)).toBeGreaterThanOrEqual(80);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License', 'GET /web-api/global/settings', expect.stringMatching(/^GET \/web-api\/BUS\/workflows\/triggers\/grid/)]);
  });

  it('correlates active trigger errors to workflow event and service event details', async () => {
    const mock = await startMockOxyGenServer({
      password: 'RemotePassword!42',
      workflowTriggers: [
        { Id: 6001, WorkflowName: 'Pending Import', Status: 'Pending', HasErrors: false, TriggerDate: '2026-06-26T11:00:00Z' },
        { Id: 6002, WorkflowName: 'Active Export', Status: 'Active', HasErrors: false, TriggerDate: '2026-06-26T11:30:00Z' },
        { Id: 7001, WorkflowName: 'Daily Import', Status: 'Active', StatusInfo: 'In Recovery', HasErrors: false, TriggerDate: '2026-06-26T12:00:00Z' }
      ]
    });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Workflow Error Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'RemotePassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'reachable',
      message: 'Connectivity test completed with trigger/workflow issue: 1 active trigger error(s) found.',
      workflows: {
        totalTriggers: 3,
        triggerStatusCounts: { Pending: 1, Active: 1, 'Active - In Recovery': 1 },
        openTriggers: [
          expect.objectContaining({ workflowTriggerId: '6001', workflowName: 'Pending Import', triggerStatus: 'Pending', hasErrors: false }),
          expect.objectContaining({ workflowTriggerId: '6002', workflowName: 'Active Export', triggerStatus: 'Active', hasErrors: false }),
          expect.objectContaining({ workflowTriggerId: '7001', workflowName: 'Daily Import', triggerStatus: 'Active - In Recovery', statusInfo: 'In Recovery', hasErrors: true })
        ],
        activeErrorCount: 1,
        activeErrors: [{
          workflowTriggerId: '7001',
          workflowName: 'Daily Import',
          triggerStatus: 'Active - In Recovery',
          workflowEventId: '8001',
          workflowEventStatus: 'Active - In Recovery',
          workflowEventSequence: 2,
          workflowEventLastError: 'Divide by zero',
          serviceIdentifier: 'SQL',
          serviceName: 'SQL Module',
          serviceEventId: '9001',
          serviceEventSequence: 2,
          serviceErrorMessage: "Message: Exception: SQL Exception. Message: Divide by zero error encountered. SQL Query: SELECT Number = 1/0, Extra_Credit = '2926' SQL Query: SELECT Number = 1/0, Extra_Credit = '2926' Inner Exception Message: SQL Exception. Message: Divide by zero error encountered. SQL Query: SELECT Number = 1/0, Extra_Credit = '2926'",
          processingOutputs: '-1,0,2',
          mappedIndexData: { Outputs: [-1, 0, 2] }
        }]
      }
    });
    expect(JSON.stringify(result.workflows)).not.toContain('raw payload');
    expect(mock.requests).toEqual([
      'POST /v2/Auth/Login',
      'GET /web-api/BUS/License',
      'GET /web-api/global/settings',
      expect.stringMatching(/^GET \/web-api\/BUS\/workflows\/triggers\/grid/),
      expect.stringMatching(/^GET \/web-api\/BUS\/workflows\/events\/grid/),
      'GET /web-api/BUS/workflows/events/8001',
      'GET /web-api/SQL/Events/9001'
    ]);
  });

  it('accepts OxyGen login redirects when a session cookie is returned', async () => {
    const mock = await startMockOxyGenServer({ password: 'RemotePassword!42', redirectAfterLogin: true });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Redirect Login Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'RemotePassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'reachable',
      authentication: { ok: true, httpStatusCode: 302 },
      license: { status: 'valid', step: { ok: true, httpStatusCode: 200 } },
      api: { ok: true, httpStatusCode: 200 }
    });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License', 'GET /web-api/global/settings', expect.stringMatching(/^GET \/web-api\/BUS\/workflows\/triggers\/grid/)]);
  });

  it('classifies OxyGen no-license payloads as missing license errors', async () => {
    const mock = await startMockOxyGenServer({
      password: 'RemotePassword!42',
      license: {
        LicenseKey: 'Missing License',
        LicenseStatus: 'No License',
        LicensingServerStatus: 'Offline',
        LastSync: 'Never'
      }
    });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Missing License Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin',
        checkLicense: true
      },
      password: 'RemotePassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'reachable',
      message: 'Connectivity test completed with license issue: License missing: No License.',
      license: {
        status: 'error',
        key: null,
        step: { ok: false, httpStatusCode: 200, message: 'License missing: No License.', errorCode: 'LICENSE_STATUS_ERROR' }
      },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because the license probe failed.' }
    });
    expect(result.license.payload).toMatchObject({ LicenseKey: 'Missing License', LicenseStatus: 'No License' });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License']);
  });

  it('waits long enough for slow OxyGen license responses before skipping settings', async () => {
    const mock = await startMockOxyGenServer({
      password: 'RemotePassword!42',
      licenseDelayMs: 5200,
      license: { LicenseKey: null, IsValid: false, IsExpired: false, Features: [{ Status: 'Unlicensed' }] }
    });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Slow Missing License Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin',
        checkLicense: true
      },
      password: 'RemotePassword!42'
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'reachable',
      message: 'Connectivity test completed with license issue: License missing.',
      license: {
        status: 'error',
        key: null,
        step: { ok: false, httpStatusCode: 200, message: 'License missing.', errorCode: 'LICENSE_STATUS_ERROR' }
      },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because the license probe failed.' }
    });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License']);
  }, 10000);

  it('marks attempted license timeouts as license errors and skips settings', async () => {
    const mock = await startMockOxyGenServer({ password: 'RemotePassword!42', licenseDelayMs: 150 });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'License Timeout Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin',
        checkLicense: true
      },
      password: 'RemotePassword!42',
      timeoutMs: 50
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'reachable',
      license: { status: 'error', step: { ok: false, errorCode: 'Error', message: 'Request timed out.' } },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because the license probe failed.' }
    });
    expect(result.message).toContain('license issue');
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License']);
  });

  it('returns auth-error when login fails and does not call the API probe', async () => {
    const mock = await startMockOxyGenServer({ password: 'CorrectPassword!42', failAuth: true });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Local Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'WrongPassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'auth-error',
      dns: { ok: true },
      authentication: { ok: false, httpStatusCode: 401 },
      api: { ok: false, skipped: true }
    });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login']);
  });

  it('returns auth-error and skips downstream probes when login does not return an OxyGen session cookie', async () => {
    const mock = await startMockOxyGenServer({ password: 'CorrectPassword!42', loginCookieWithoutAccess: true });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Invalid Cookie Login Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'CorrectPassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'auth-error',
      authentication: { ok: false, httpStatusCode: 302, errorCode: 'AUTH_NO_SESSION_COOKIE' },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because authentication failed.' },
      license: { status: 'unknown', step: { ok: false, skipped: true, message: 'License probe skipped because authentication failed.' } }
    });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login']);
  });

  it('returns auth-error and skips downstream probes when the login route is forbidden', async () => {
    const mock = await startMockOxyGenServer({ password: 'CorrectPassword!42', forbiddenAuth: true });

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Forbidden Login Mock',
        protocol: 'http',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: mock.baseUrl,
        username: 'admin'
      },
      password: 'RemotePassword!42',
      timeoutMs: 2000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'auth-error',
      authentication: { ok: false, httpStatusCode: 403, errorCode: 'AUTH_HTTP_ERROR' },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because authentication failed.' },
      license: { status: 'unknown', step: { ok: false, skipped: true, message: 'License probe skipped because authentication failed.' } }
    });
    expect(mock.requests).toEqual(['POST /v2/Auth/Login']);
  });

  it('maps refused HTTPS endpoints to unreachable connection failures and skips later probes', async () => {
    const port = await unusedTcpPort();

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'Refused HTTPS Mock',
        protocol: 'https',
        host: '127.0.0.1',
        port,
        apiBaseUrl: `https://127.0.0.1:${port}`,
        username: 'admin'
      },
      password: 'WrongPassword!42',
      timeoutMs: 1000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'unreachable',
      dns: { ok: true },
      connect: { ok: false, errorCode: 'ECONNREFUSED' },
      ssl: { ok: false, skipped: true, message: 'SSL validation skipped due to connection failure.' },
      authentication: { ok: false, skipped: true, message: 'Authentication skipped due to connection failure.' },
      api: { ok: false, skipped: true, message: 'Settings probe skipped due to connection failure.' },
      license: { status: 'unknown', step: { skipped: true, message: 'License probe skipped due to connection failure.' } }
    });
    expect(result.responseTimeMs).not.toBeNull();
  });
  it('maps TLS handshake resets to unreachable connection failures, not ignorable SSL warnings', async () => {
    const mock = await startClosingTcpServer();

    const result = await testOxyGenConnectivity({
      instance: {
        name: 'TLS Reset Mock',
        protocol: 'https',
        host: '127.0.0.1',
        port: mock.port,
        apiBaseUrl: `https://127.0.0.1:${mock.port}`,
        username: 'admin'
      },
      password: 'RemotePassword!42',
      timeoutMs: 1000
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'unreachable',
      connect: { ok: true },
      ssl: { ok: false, valid: false, expiresAt: null },
      authentication: { ok: false, skipped: true, message: 'Authentication skipped because TLS connection failed.' },
      api: { ok: false, skipped: true, message: 'Settings probe skipped because TLS connection failed.' },
      license: { status: 'unknown', step: { skipped: true, message: 'License probe skipped because TLS connection failed.' } }
    });
    expect(result.message).toMatch(/TLS connection failed/i);
  });

});
