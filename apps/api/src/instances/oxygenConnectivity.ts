import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { connect as tcpConnect } from 'node:net';
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
    checkLicense?: boolean;
  };
  password: string;
  timeoutMs?: number;
};

type ProbeResponse = {
  status: number;
  ok: boolean;
  setCookies: string[];
  redirectLocation: string | null;
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

function collectSetCookie(cookies: string[]) {
  return cookies
    .map((cookie) => cookie.split(';')[0]?.trim() ?? '')
    .filter(Boolean);
}

function cookieName(cookie: string) {
  return cookie.split('=')[0]?.trim().toLowerCase() ?? '';
}

function hasOxyGenSessionCookie(cookies: string[]) {
  return cookies.some((cookie) => {
    const name = cookieName(cookie);
    return name === 'asp.net_sessionid' || name.includes('session');
  });
}

function connectionResponseTime(dns: ConnectivityStepResult, connect: ConnectivityStepResult, ssl: ConnectivityStepResult, authentication: ConnectivityStepResult): number | null {
  const phases = [dns, connect, ssl, authentication].filter((step) => !step.skipped && typeof step.durationMs === 'number');
  if (!phases.length) return null;
  return phases.reduce((total, step) => total + (step.durationMs ?? 0), 0);
}

function endpointPort(instance: ConnectivityInput['instance']) {
  return instance.port ?? (instance.protocol === 'http' ? 80 : 443);
}

function connectionTarget(input: ConnectivityInput, dns: ConnectivityStepResult) {
  return { host: dns.address || input.instance.host, port: endpointPort(input.instance) };
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
        const location = response.headers.location;
        resolve({
          status,
          ok: status >= 200 && status < 400,
          setCookies: Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [],
          redirectLocation: Array.isArray(location) ? location[0] ?? null : location ?? null,
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
  const startedAt = Date.now();
  const ipVersion = isIP(host);
  if (ipVersion) {
    return { ok: true, skipped: true, address: host, family: ipVersion, durationMs: 0, message: `DNS resolution skipped because ${host} is already an IP address.` };
  }
  try {
    const result = await lookup(host);
    return { ok: true, address: result.address, family: result.family, durationMs: Date.now() - startedAt, message: `Successfully resolved "${host}" to "${result.address}".` };
  } catch (error) {
    return { ok: false, address: null, durationMs: Date.now() - startedAt, message: messageFromError(error), errorCode: codeFromError(error) };
  }
}

async function connectCheck(input: ConnectivityInput, dns: ConnectivityStepResult): Promise<ConnectivityStepResult> {
  const target = connectionTarget(input, dns);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = tcpConnect({ host: target.host, port: target.port, timeout: input.timeoutMs ?? 5000 });
    const finish = (step: ConnectivityStepResult) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ host: target.host, port: target.port, durationMs: Date.now() - startedAt, ...step });
    };
    socket.once('connect', () => finish({ ok: true, message: `Connected to ${target.host}:${target.port}.` }));
    socket.once('timeout', () => finish({ ok: false, message: `Connection timed out: ${target.host}:${target.port}`, errorCode: 'CONNECT_TIMEOUT' }));
    socket.once('error', (error) => finish({ ok: false, message: `Connection Failed: "${messageFromError(error)}"`, errorCode: codeFromError(error) }));
  });
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

function responseLooksAuthenticated(response: ProbeResponse) {
  if (response.status >= 300 && response.status < 400) {
    const location = response.redirectLocation?.trim();
    if (!location) return false;
    const normalized = location.toLowerCase();
    return !normalized.includes('/v2/auth/login') && !normalized.includes('/auth/login') && !normalized.includes('login.aspx');
  }
  if (response.status >= 200 && response.status < 300) {
    const body = response.body.toLowerCase();
    return !(
      body.includes('forbidden') ||
      body.includes('unauthorized') ||
      body.includes("don't have permission") ||
      (body.includes('<form') && (body.includes('password') || body.includes('login')))
    );
  }
  return false;
}

async function postLogin(input: ConnectivityInput): Promise<{ step: ConnectivityStepResult; cookieHeader: string; response: ProbeResponse | null }> {
  const startedAt = Date.now();
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
    const loginAccepted = response.status >= 200 && response.status < 400;
    const cookieHeader = cookies.join('; ');
    const missingCookie = loginAccepted && !cookieHeader;
    const missingSessionCookie = loginAccepted && Boolean(cookieHeader) && !hasOxyGenSessionCookie(cookies);
    if (!loginAccepted || missingCookie || missingSessionCookie) {
      return {
        step: {
          ok: false,
          httpStatusCode: response.status,
          durationMs: Date.now() - startedAt,
          message: missingCookie
            ? 'OxyGen authentication failed because no session cookie was returned.'
            : missingSessionCookie
              ? 'OxyGen authentication failed because the login response did not return an OxyGen session cookie.'
              : `OxyGen authentication failed with HTTP ${response.status}.`,
          errorCode: missingCookie ? 'AUTH_NO_SESSION_COOKIE' : missingSessionCookie ? 'AUTH_NO_SESSION_COOKIE' : 'AUTH_HTTP_ERROR'
        },
        cookieHeader: '',
        response
      };
    }

    const authenticated = responseLooksAuthenticated(response);
    return {
      step: {
        ok: authenticated,
        httpStatusCode: response.status,
        durationMs: Date.now() - startedAt,
        message: authenticated ? 'OxyGen authentication succeeded.' : 'OxyGen authentication failed because the login response did not confirm a successful application session.',
        errorCode: authenticated ? undefined : 'AUTH_LOGIN_NOT_CONFIRMED'
      },
      cookieHeader: authenticated ? cookieHeader : '',
      response
    };
  } catch (error) {
    return { step: { ok: false, durationMs: Date.now() - startedAt, message: messageFromError(error), errorCode: codeFromError(error) }, cookieHeader: '', response: null };
  }
}

async function probeGlobalSettings(input: ConnectivityInput, cookieHeader: string): Promise<{ step: ConnectivityStepResult; response: ProbeResponse | null; payload: unknown | null }> {
  if (!cookieHeader) return { step: { ok: false, skipped: true, message: 'Settings probe skipped because authentication did not return a session cookie.' }, response: null, payload: null };
  try {
    const response = await requestProbe(joinUrl(input.instance.apiBaseUrl, '/web-api/global/settings'), {
      method: 'GET',
      headers: { cookie: cookieHeader },
      timeoutMs: input.timeoutMs ?? 5000
    });
    const httpOk = response.status >= 200 && response.status < 400;
    const payload = httpOk ? parseJsonBody(response.body) : null;
    const hasSettingsPayload = payload !== null && typeof payload === 'object';
    const ok = httpOk && hasSettingsPayload;
    return {
      step: {
        ok,
        httpStatusCode: response.status,
        durationMs: response.connectionMs ?? undefined,
        message: !httpOk ? `Global settings probe failed with HTTP ${response.status}.` : hasSettingsPayload ? 'Global settings probe succeeded.' : 'Global settings probe did not return JSON settings data.',
        errorCode: ok ? undefined : httpOk ? 'SETTINGS_INVALID_RESPONSE' : 'SETTINGS_HTTP_ERROR'
      },
      response,
      payload
    };
  } catch (error) {
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, response: null, payload: null };
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
      return { step: { ok: false, httpStatusCode: response.status, durationMs: response.connectionMs ?? undefined, message: 'License API unavailable.', errorCode: 'LICENSE_API_UNAVAILABLE' }, status: 'error', key: null, payload };
    }
    const ok = response.status >= 200 && response.status < 400;
    if (!ok) {
      return { step: { ok: false, httpStatusCode: response.status, durationMs: response.connectionMs ?? undefined, message: `License API probe failed with HTTP ${response.status}.`, errorCode: 'LICENSE_HTTP_ERROR' }, status: 'error', key: null, payload };
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
    return { step: { ok: false, message: messageFromError(error), errorCode: codeFromError(error) }, status: 'error', key: null, payload: null };
  }
}

export async function testOxyGenConnectivity(input: ConnectivityInput): Promise<ConnectivityResult> {
  const startedAt = Date.now();
  const checkedAt = nowIso();

  const dns = await dnsCheck(input.instance.host);
  const dnsFailed = !dns.ok;
  if (dnsFailed) {
    const connect: ConnectivityStepResult = { ok: false, skipped: true, message: 'Connection skipped because DNS resolution failed.' };
    const ssl: ConnectivityStepResult = { ok: false, skipped: true, valid: null, expiresAt: null, message: 'SSL validation skipped because DNS resolution failed.' };
    const authentication: ConnectivityStepResult = { ok: false, skipped: true, message: 'Authentication skipped because DNS resolution failed.' };
    return {
      ok: false,
      status: 'unreachable',
      message: dns.message ?? 'DNS lookup failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      responseTimeMs: connectionResponseTime(dns, connect, ssl, authentication),
      httpStatusCode: null,
      dns,
      connect,
      ssl,
      authentication,
      api: { ok: false, skipped: true, message: 'Settings probe skipped because DNS resolution failed.' },
      settingsJson: null,
      license: skippedLicense('License probe skipped because DNS resolution failed.')
    };
  }

  const connect = await connectCheck(input, dns);
  if (!connect.ok) {
    const ssl: ConnectivityStepResult = { ok: false, skipped: true, valid: null, expiresAt: null, message: 'SSL validation skipped due to connection failure.' };
    const authentication: ConnectivityStepResult = { ok: false, skipped: true, message: 'Authentication skipped due to connection failure.' };
    return {
      ok: false,
      status: 'unreachable',
      message: connect.message ?? 'Connection failed.',
      checkedAt,
      durationMs: Date.now() - startedAt,
      responseTimeMs: connectionResponseTime(dns, connect, ssl, authentication),
      httpStatusCode: null,
      dns,
      connect,
      ssl,
      authentication,
      api: { ok: false, skipped: true, message: 'Settings probe skipped due to connection failure.' },
      settingsJson: null,
      license: skippedLicense('License probe skipped due to connection failure.')
    };
  }

  const ssl = await sslCheck(input);
  const tlsConnectionFailed = !ssl.ok && (ssl.errorCode === 'TLS_TIMEOUT' || ssl.expiresAt === null);
  if (tlsConnectionFailed) {
    const authentication: ConnectivityStepResult = { ok: false, skipped: true, message: 'Authentication skipped because TLS connection failed.' };
    return {
      ok: false,
      status: 'unreachable',
      message: `TLS connection failed: ${ssl.message ?? 'SSL check failed.'}`,
      checkedAt,
      durationMs: Date.now() - startedAt,
      responseTimeMs: connectionResponseTime(dns, connect, ssl, authentication),
      httpStatusCode: null,
      dns,
      connect,
      ssl,
      authentication,
      api: { ok: false, skipped: true, message: 'Settings probe skipped because TLS connection failed.' },
      settingsJson: null,
      license: skippedLicense('License probe skipped because TLS connection failed.')
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
      responseTimeMs: connectionResponseTime(dns, connect, ssl, authentication.step),
      httpStatusCode: authentication.step.httpStatusCode ?? null,
      dns,
      connect,
      ssl,
      authentication: authentication.step,
      api: { ok: false, skipped: true, message: 'Settings probe skipped because authentication failed.' },
      settingsJson: null,
      license: skippedLicense('License probe skipped because authentication failed.')
    };
  }

  const license = input.instance.checkLicense === false ? skippedLicense('License probe skipped because check_license is disabled for this instance.') : await probeLicense(input, authentication.cookieHeader);
  const api = license.step.ok || license.step.skipped
    ? await probeGlobalSettings(input, authentication.cookieHeader)
    : { step: { ok: false, skipped: true, message: 'Settings probe skipped because the license probe failed.' } as ConnectivityStepResult, response: null, payload: null };
  const blockedByLicense = !license.step.skipped && !license.step.ok;
  const ok = api.step.ok && (license.step.skipped || license.step.ok);
  return {
    ok,
    status: blockedByLicense ? 'reachable' : api.step.ok ? 'reachable' : 'unreachable',
    message: blockedByLicense ? `Connectivity test completed with license issue: ${license.step.message ?? 'License probe failed.'}` : ok ? 'Connectivity test passed.' : api.step.message ?? 'Settings probe failed.',
    checkedAt,
    durationMs: Date.now() - startedAt,
    responseTimeMs: connectionResponseTime(dns, connect, ssl, authentication.step),
    httpStatusCode: api.step.httpStatusCode ?? authentication.step.httpStatusCode ?? null,
    dns,
    connect,
    ssl,
    authentication: authentication.step,
    api: api.step,
    settingsJson: api.payload,
    license
  };
}
