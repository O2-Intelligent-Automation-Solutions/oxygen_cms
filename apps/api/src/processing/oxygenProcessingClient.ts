import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { ProcessingDataSourceRequest, ProcessingGridResponse, ProcessingRemoteAccess } from './types.js';
import { dataSourceRequestToSearchParams } from './processingDataSourceRequest.js';

export const SERVICE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

type RemoteResponse = {
  status: number;
  setCookies: string[];
  body: string;
};

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function requestRemote(url: string, options: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number }): Promise<RemoteResponse> {
  const parsed = new URL(url);
  const client = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = client({
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
        const setCookie = response.headers['set-cookie'];
        resolve({
          status: response.statusCode ?? 0,
          setCookies: Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [],
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.setTimeout(options.timeoutMs ?? 5000, () => req.destroy(new Error('Request timed out.')));
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function collectCookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(';')[0]?.trim() ?? '').filter(Boolean).join('; ');
}

function hasSessionCookie(cookieHeader: string) {
  return cookieHeader.split(';').some((cookie) => cookie.trim().toLowerCase().startsWith('asp.net_sessionid=') || cookie.trim().toLowerCase().includes('session'));
}

function parseJson(body: string): unknown {
  if (!body.trim()) return null;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}

function recordsFromGrid(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'Data', 'items', 'Items', 'results', 'Results']) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

function totalFromGrid(payload: unknown, data: unknown[]) {
  if (!payload || typeof payload !== 'object') return data.length;
  const record = payload as Record<string, unknown>;
  for (const key of ['total', 'Total', 'count', 'Count']) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return data.length;
}

export function assertValidServiceIdentifier(serviceIdentifier: string) {
  if (!SERVICE_IDENTIFIER_PATTERN.test(serviceIdentifier)) throw new Error('Invalid service identifier.');
}

export class OxygenProcessingClient {
  constructor(private readonly timeoutMs = 5000) {}

  private async session(access: ProcessingRemoteAccess) {
    const body = new URLSearchParams({
      Username: access.instance.username,
      Password: access.password,
      ReturnUrl: '',
      Fragment: '',
      IsPersistent: 'false'
    }).toString();
    const response = await requestRemote(joinUrl(access.instance.apiBaseUrl, '/v2/Auth/Login'), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, timeoutMs: this.timeoutMs });
    const cookieHeader = collectCookieHeader(response.setCookies);
    if (response.status < 200 || response.status >= 400 || !cookieHeader || !hasSessionCookie(cookieHeader)) throw new Error('OxyGen authentication failed.');
    return cookieHeader;
  }

  private async get(access: ProcessingRemoteAccess, path: string) {
    const cookie = await this.session(access);
    const response = await requestRemote(joinUrl(access.instance.apiBaseUrl, path), { method: 'GET', headers: { cookie }, timeoutMs: this.timeoutMs });
    if (response.status < 200 || response.status >= 400) throw new Error(`OxyGen request failed with HTTP ${response.status}.`);
    return parseJson(response.body);
  }

  async getSchema(access: ProcessingRemoteAccess, path: string) {
    return this.get(access, path);
  }

  async getGrid(access: ProcessingRemoteAccess, path: string, request: ProcessingDataSourceRequest): Promise<ProcessingGridResponse> {
    const query = dataSourceRequestToSearchParams(request).toString();
    const payload = await this.get(access, `${path}?${query}`);
    const data = recordsFromGrid(payload);
    return { data, total: totalFromGrid(payload, data), raw: payload };
  }

  async getDetail(access: ProcessingRemoteAccess, path: string) {
    return this.get(access, path);
  }
}
