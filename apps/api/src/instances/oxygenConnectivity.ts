import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import type { ConnectivityResult, ConnectivityStepResult, InstanceProtocol, LicenseProbeResult, LicenseStatus } from './types.js';

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

type ProbeResponse = {
  status: number;
  ok: boolean;
  setCookies: string[];
  body: string;
  connectionMs: number | null;
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

function collectSetCookie(values: string[]) {
  return values
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie));
}

function connectionResponseTime(instance: ConnectivityInput['instance'], ssl: ConnectivityStepResult, authentication?: ProbeResponse | null): number | null {
  if (instance.protocol === 'https') return ssl.durationMs ?? null;
  return authentication?.connectionMs ?? null;
}

function requestProbe(url: string, options: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs: number }): Promise<ProbeResponse> {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let connectionMs: number | null = null;
    const request = client({
      method: options.method,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      headers: options.headers,
      rejectUnauthorized: false
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        const setCookie = response.headers['set-cookie'];
        resolve({
          status,
          ok: status >= 200 && status < 400,
          setCookies: Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [],
          body: Buffer.concat(chunks).toString('utf8'),
          connectionMs
        });
      });
    });
    request.on('socket', (socket) => {
      const markConnected = () => { if (connectionMs === null) connectionMs = Date.now() - startedAt; };
      if ('connecting' in socket && socket.connecting) {
        socket.once('connect', markConnected);
        socket.once('secureConnect', markConnected);
      } else {
        connectionMs = 0;
      }
    });
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error('Request timed out.'));
    });
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
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
    const startedAt = Date.now();
    const socket = tlsConnect({ host: input.instance.host, port, servername: input.instance.host, rejectUnauthorized: false, timeout: input.timeoutMs ?? 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorizationError = socket.authorizationError;
      const expiresAt = cert.valid_to ? new Date(cert.valid_to).toISOString() : null;
      socket.end();
      if (authorizationError) {
        resolve({ ok: false, valid: false, expiresAt, durationMs: Date.now() - startedAt, message: String(authorizationError), errorCode: String(authorizationError) });
      } else {
        resolve({ ok: true, valid: true, expiresAt, durationMs: Date.now() - startedAt, message: 'TLS certificate is valid.' });
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, valid: false, expiresAt: null, durationMs: Date.now() - startedAt, message: 'TLS connection timed out.', errorCode: 'TLS_TIMEOUT' });
    });
    socket.on('error', (error) => {
      resolve({ ok: false, valid: false, expiresAt: null, durationMs: Date.now() - startedAt, message: messageFromError(error), errorCode: codeFromError(error) });
    });
  });
}

async function postLogin(input: ConnectivityInput): Promise<{ step: ConnectivityStepResult; cookieHeader: string; response: ProbeResponse | null }> {
  try {
    const form = new URLSearchParams({
      Username: input.instance.username,
      Password: input.password,
      ReturnUrl: '',
      Fragment: '',
      IsPersistent: 'false'
    });
    const response = await requestProbe(joinUrl(input.instance.apiBaseUrl, '/v2/Auth/Login'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      timeoutMs: input.timeoutMs ?? 5000
    });
    const cookies = collectSetCookie(response.setCookies);
    const authenticated = response.status >= 200 && response.status < 400;
    return {
      step: {
        ok: authenticated,
        httpStatusCode: response.status,
        durationMs: response.connectionMs ?? undefined,
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

async function probeCurrentTime(input: ConnectivityInput, cookieHeader: string): Promise<{ step: ConnectivityStepResult; response: ProbeResponse | null }> {
  if (!cookieHeader) return { step: { ok: false, skipped: true, message: 'API probe skipped because authentication did not return a session cookie.' }, response: null };
  try {
    const response = await requestProbe(joinUrl(input.instance.apiBaseUrl, '/web-api/global/settings/currenttime'), {
      method: 'GET',
      headers: { cookie: cookieHeader },
      timeoutMs: input.timeoutMs ?? 5000
    });
    const ok = response.status >= 200 && response.status < 400;
    return {
      step: {
        ok,
        httpStatusCode: response.status,
        durationMs: response.connectionMs ?? undefined,
        message: ok ? 'Current-time API probe succeeded.' : `Current-time API probe failed with HTTP ${response.status}.`,
        errorCode: ok ? undefined : 'API_HTTP_ERROR'
      },
      response
    };
  } catch (error) {
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, response: null };
  }
}


function skippedLicense(message: string): LicenseProbeResult {
  return { step: { ok: false, skipped: true, message }, status: 'unknown', key: null, payload: null };
}

function parseJsonBody(body: string): unknown | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); }
  catch { return trimmed; }
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function findField(payload: unknown, names: string[]): unknown {
  if (!payload || typeof payload !== 'object') return undefined;
  const stack: unknown[] = [payload];
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  while (stack.length) {
    const current = stack.shift();
    if (!current || typeof current !== 'object') continue;
    if (Array.isArray(current)) { stack.push(...current); continue; }
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (normalizedNames.has(key.toLowerCase())) return value;
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return undefined;
}

function licenseKeyFromPayload(payload: unknown) {
  const value = findField(payload, ['licenseKey', 'license_key', 'key', 'activationKey', 'serialNumber', 'serial', 'registrationKey']);
  return normalizeText(value) || null;
}

function licenseStatusFromPayload(payload: unknown, key: string | null): LicenseStatus {
  const statusText = normalizeText(findField(payload, ['status', 'licenseStatus', 'license_status', 'state', 'result'])).toLowerCase();
  const expired = findField(payload, ['expired', 'isExpired']);
  const valid = findField(payload, ['valid', 'isValid']);
  if (expired === true || statusText.includes('expired')) return 'expired';
  if (valid === false || statusText.includes('invalid') || statusText.includes('error') || statusText.includes('fail')) return 'error';
  if (statusText.includes('warn')) return 'warning';
  if (valid === true || statusText.includes('valid') || statusText.includes('active') || statusText.includes('ok')) return key ? 'valid' : 'error';
  return key ? 'valid' : 'error';
}

async function probeLicense(input: ConnectivityInput, cookieHeader: string): Promise<LicenseProbeResult> {
  if (!cookieHeader) return skippedLicense('License probe skipped because authentication did not return a session cookie.');
  try {
    const response = await requestProbe(joinUrl(input.instance.apiBaseUrl, '/web-api/BUS/License'), {
      method: 'GET',
      headers: { cookie: cookieHeader },
      timeoutMs: input.timeoutMs ?? 5000
    });
    const payload = parseJsonBody(response.body);
    if (response.status === 404) {
      return { step: { ok: false, httpStatusCode: response.status, durationMs: response.connectionMs ?? undefined, message: 'License API unavailable.', errorCode: 'LICENSE_API_UNAVAILABLE' }, status: 'unknown', key: null, payload };
    }
    const ok = response.status >= 200 && response.status < 400;
    if (!ok) {
      return { step: { ok: false, httpStatusCode: response.status, durationMs: response.connectionMs ?? undefined, message: `License API probe failed with HTTP ${response.status}.`, errorCode: 'LICENSE_HTTP_ERROR' }, status: 'unknown', key: null, payload };
    }
    const key = licenseKeyFromPayload(payload);
    const status = licenseStatusFromPayload(payload, key);
    return {
      step: {
        ok: status === 'valid',
        httpStatusCode: response.status,
        durationMs: response.connectionMs ?? undefined,
        message: status === 'valid' ? 'License API probe succeeded.' : status === 'expired' ? 'License expired.' : status === 'warning' ? 'License warning.' : 'License invalid or blank.',
        errorCode: status === 'valid' ? undefined : 'LICENSE_STATUS_ERROR'
      },
      status,
      key,
      payload
    };
  } catch (error) {
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, status: 'unknown', key: null, payload: null };
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
      responseTimeMs: null,
      httpStatusCode: null,
      dns,
      ssl: { ok: false, skipped: true, valid: null, expiresAt: null, message: 'SSL check skipped because DNS failed.' },
      authentication: { ok: false, skipped: true, message: 'Authentication skipped because DNS failed.' },
      api: { ok: false, skipped: true, message: 'API probe skipped because DNS failed.' },
      license: skippedLicense('License probe skipped because DNS failed.')
    };
  }

  const ssl = await sslCheck(input);
  const sslConnectionFailed = !ssl.ok && (ssl.errorCode === 'TLS_TIMEOUT' || ssl.expiresAt === null);
  if (sslConnectionFailed) {
    const refused = ssl.errorCode === 'ECONNREFUSED';
    return {
      ok: false,
      status: refused ? 'auth-error' : 'ssl-error',
      message: refused ? 'Authentication failure' : ssl.message ?? 'SSL check failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      responseTimeMs: connectionResponseTime(input.instance, ssl),
      httpStatusCode: null,
      dns,
      ssl,
      authentication: { ok: false, skipped: true, message: refused ? 'Authentication failure' : 'Authentication skipped because SSL connection failed.', errorCode: refused ? 'AUTH_CONNECTION_REFUSED' : undefined },
      api: { ok: false, skipped: true, message: refused ? 'API probe skipped because authentication failed.' : 'API probe skipped because SSL connection failed.' },
      license: skippedLicense(refused ? 'License probe skipped because authentication failed.' : 'License probe skipped because SSL connection failed.')
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
      responseTimeMs: connectionResponseTime(input.instance, ssl, authentication.response),
      httpStatusCode: authentication.step.httpStatusCode ?? null,
      dns,
      ssl,
      authentication: authentication.step,
      api: { ok: false, skipped: true, message: 'API probe skipped because authentication failed.' },
      license: skippedLicense('License probe skipped because authentication failed.')
    };
  }

  const api = await probeCurrentTime(input, authentication.cookieHeader);
  const license = await probeLicense(input, authentication.cookieHeader);
  const ok = api.step.ok;
  return {
    ok,
    status: ok ? 'reachable' : 'unreachable',
    message: ok ? 'Connectivity test passed.' : api.step.message ?? 'API probe failed.',
    checkedAt,
    durationMs: Date.now() - startedAt,
    responseTimeMs: connectionResponseTime(input.instance, ssl, authentication.response),
    httpStatusCode: api.step.httpStatusCode ?? authentication.step.httpStatusCode ?? null,
    dns,
    ssl,
    authentication: authentication.step,
    api: api.step,
    license
  };
}
