import { lookup } from 'node:dns/promises';
import { connect as tlsConnect } from 'node:tls';
import type { ConnectivityResult, ConnectivityStepResult, InstanceProtocol } from './types.js';

type ConnectivityInput = {
  instance: {
    name: string;
    protocol: InstanceProtocol;
    host: string;
    port: number | null;
    apiBaseUrl: string;
    username: string;
  };
  password: string;
  timeoutMs?: number;
};

type FetchResponse = {
  status: number;
  ok: boolean;
  headers: Headers;
};

function nowIso() {
  return new Date().toISOString();
}

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown connectivity error.';
}

function codeFromError(error: unknown) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code;
  if (error instanceof Error && error.name) return error.name;
  return 'CONNECTIVITY_ERROR';
}

function timeoutSignal(timeoutMs: number) {
  return AbortSignal.timeout(timeoutMs);
}

function joinUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}${path}`;
}

function collectSetCookie(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === 'function' ? getSetCookie.call(headers) : [];
  const fallback = headers.get('set-cookie');
  const values = cookies.length > 0 ? cookies : fallback ? [fallback] : [];
  return values
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie));
}

async function dnsCheck(host: string): Promise<ConnectivityStepResult> {
  try {
    const result = await lookup(host);
    return { ok: true, message: `Resolved ${host} to ${result.address}.` };
  } catch (error) {
    return { ok: false, message: messageFromError(error), errorCode: codeFromError(error) };
  }
}

async function sslCheck(input: ConnectivityInput): Promise<ConnectivityStepResult> {
  if (input.instance.protocol !== 'https') {
    return { ok: true, skipped: true, valid: null, expiresAt: null, message: 'SSL check skipped for HTTP instance.' };
  }

  const port = input.instance.port ?? 443;
  return new Promise((resolve) => {
    const socket = tlsConnect({ host: input.instance.host, port, servername: input.instance.host, rejectUnauthorized: false, timeout: input.timeoutMs ?? 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorizationError = socket.authorizationError;
      const expiresAt = cert.valid_to ? new Date(cert.valid_to).toISOString() : null;
      socket.end();
      if (authorizationError) {
        resolve({ ok: false, valid: false, expiresAt, message: String(authorizationError), errorCode: String(authorizationError) });
      } else {
        resolve({ ok: true, valid: true, expiresAt, message: 'TLS certificate is valid.' });
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, valid: false, expiresAt: null, message: 'TLS connection timed out.', errorCode: 'TLS_TIMEOUT' });
    });
    socket.on('error', (error) => {
      resolve({ ok: false, valid: false, expiresAt: null, message: messageFromError(error), errorCode: codeFromError(error) });
    });
  });
}

async function postLogin(input: ConnectivityInput): Promise<{ step: ConnectivityStepResult; cookieHeader: string; response: FetchResponse | null }> {
  try {
    const form = new URLSearchParams({
      Username: input.instance.username,
      Password: input.password,
      ReturnUrl: '',
      Fragment: '',
      IsPersistent: 'false'
    });
    const response = await fetch(joinUrl(input.instance.apiBaseUrl, '/v2/Auth/Login'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'manual',
      signal: timeoutSignal(input.timeoutMs ?? 5000)
    });
    const cookies = collectSetCookie(response.headers);
    const authenticated = response.status >= 200 && response.status < 400;
    return {
      step: {
        ok: authenticated,
        httpStatusCode: response.status,
        message: authenticated ? 'OxyGen authentication succeeded.' : `OxyGen authentication failed with HTTP ${response.status}.`,
        errorCode: authenticated ? undefined : 'AUTH_HTTP_ERROR'
      },
      cookieHeader: cookies.join('; '),
      response
    };
  } catch (error) {
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, cookieHeader: '', response: null };
  }
}

async function probeCurrentTime(input: ConnectivityInput, cookieHeader: string): Promise<{ step: ConnectivityStepResult; response: FetchResponse | null }> {
  if (!cookieHeader) return { step: { ok: false, skipped: true, message: 'API probe skipped because authentication did not return a session cookie.' }, response: null };
  try {
    const response = await fetch(joinUrl(input.instance.apiBaseUrl, '/web-api/global/settings/currenttime'), {
      method: 'GET',
      headers: { cookie: cookieHeader },
      signal: timeoutSignal(input.timeoutMs ?? 5000)
    });
    const ok = response.status >= 200 && response.status < 400;
    return {
      step: {
        ok,
        httpStatusCode: response.status,
        message: ok ? 'Current-time API probe succeeded.' : `Current-time API probe failed with HTTP ${response.status}.`,
        errorCode: ok ? undefined : 'API_HTTP_ERROR'
      },
      response
    };
  } catch (error) {
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, response: null };
  }
}

export async function testOxyGenConnectivity(input: ConnectivityInput): Promise<ConnectivityResult> {
  const startedAt = Date.now();
  const checkedAt = nowIso();

  const dns = await dnsCheck(input.instance.host);
  if (!dns.ok) {
    return {
      ok: false,
      status: 'unreachable',
      message: dns.message ?? 'DNS lookup failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      httpStatusCode: null,
      dns,
      ssl: { ok: false, skipped: true, valid: null, expiresAt: null, message: 'SSL check skipped because DNS failed.' },
      authentication: { ok: false, skipped: true, message: 'Authentication skipped because DNS failed.' },
      api: { ok: false, skipped: true, message: 'API probe skipped because DNS failed.' }
    };
  }

  const ssl = await sslCheck(input);
  if (!ssl.ok) {
    return {
      ok: false,
      status: 'ssl-error',
      message: ssl.message ?? 'SSL check failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      httpStatusCode: null,
      dns,
      ssl,
      authentication: { ok: false, skipped: true, message: 'Authentication skipped because SSL check failed.' },
      api: { ok: false, skipped: true, message: 'API probe skipped because SSL check failed.' }
    };
  }

  const authentication = await postLogin(input);
  if (!authentication.step.ok) {
    return {
      ok: false,
      status: 'auth-error',
      message: authentication.step.message ?? 'Authentication failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      httpStatusCode: authentication.step.httpStatusCode ?? null,
      dns,
      ssl,
      authentication: authentication.step,
      api: { ok: false, skipped: true, message: 'API probe skipped because authentication failed.' }
    };
  }

  const api = await probeCurrentTime(input, authentication.cookieHeader);
  const ok = api.step.ok;
  return {
    ok,
    status: ok ? 'reachable' : 'unreachable',
    message: ok ? 'Connectivity test passed.' : api.step.message ?? 'API probe failed.',
    checkedAt,
    durationMs: Date.now() - startedAt,
    httpStatusCode: api.step.httpStatusCode ?? authentication.step.httpStatusCode ?? null,
    dns,
    ssl,
    authentication: authentication.step,
    api: api.step
  };
}
