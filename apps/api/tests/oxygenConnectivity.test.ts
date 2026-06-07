import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo, createServer as createNetServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { testOxyGenConnectivity } from '../src/instances/oxygenConnectivity.js';

const servers: Array<ReturnType<typeof createServer>> = [];

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockOxyGenServer(options: { password: string; failAuth?: boolean; forbiddenAuth?: boolean; loginCookieWithoutAccess?: boolean; redirectAfterLogin?: boolean; license?: unknown; licenseDelayMs?: number }) {
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
      license: { status: 'valid', key: 'VALID-LICENSE-123', step: { ok: true, httpStatusCode: 200 } }
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.responseTimeMs).not.toBeNull();
    expect(result.durationMs - (result.responseTimeMs ?? 0)).toBeGreaterThanOrEqual(80);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License', 'GET /web-api/global/settings']);
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
    expect(mock.requests).toEqual(['POST /v2/Auth/Login', 'GET /web-api/BUS/License', 'GET /web-api/global/settings']);
  });

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
});
