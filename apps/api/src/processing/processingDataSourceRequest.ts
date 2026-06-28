import type { ProcessingDataSourceRequest } from './types.js';

export const DEFAULT_PROCESSING_TAKE = 50;
export const MAX_PROCESSING_TAKE = 250;

const forwardedQueryKeys = new Set(['skip', 'take', 'sort', 'filter', 'group', 'aggregate', 'search', 'page', 'pageSize']);

function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstValue(value[0]);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function nonNegativeInteger(value: unknown, fallback: number) {
  const raw = firstValue(value);
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function parseProcessingDataSourceRequest(query: Record<string, unknown>, overrides: Record<string, string | number | undefined> = {}): ProcessingDataSourceRequest {
  const skip = nonNegativeInteger(query.skip, 0);
  const requestedTake = nonNegativeInteger(query.take, DEFAULT_PROCESSING_TAKE);
  const request: ProcessingDataSourceRequest = {
    skip,
    take: Math.min(requestedTake || DEFAULT_PROCESSING_TAKE, MAX_PROCESSING_TAKE)
  };

  for (const [key, value] of Object.entries(query)) {
    if (!forwardedQueryKeys.has(key) || key === 'skip' || key === 'take') continue;
    const raw = firstValue(value);
    if (raw !== undefined && raw.trim() !== '') request[key] = raw;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) request[key] = value;
  }

  return request;
}

export function dataSourceRequestToSearchParams(request: ProcessingDataSourceRequest) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params;
}
