import { toDataSourceRequestString, type CompositeFilterDescriptor, type FilterDescriptor } from '@progress/kendo-data-query';
import type { ProcessingFilterPreset, ProcessingGridRecord, ProcessingGridResponse, ProcessingGridState, ProcessingQueueEntryDetail, ProcessingSchema, ServiceEventGridQuery, TriggerGridQuery, WorkflowEventGridQuery } from './types';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 250;

function authHeaders(token: string) {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function fetchJson<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: authHeaders(token), signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : `Processing Errors request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function postJson<T>(path: string, token: string, payload: Record<string, unknown>): Promise<T> {
  const headers = authHeaders(token);
  headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(payload) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : `Processing Errors action failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function normalizeTake(take: number) {
  if (!Number.isFinite(take) || take <= 0) return DEFAULT_TAKE;
  return Math.min(Math.floor(take), MAX_TAKE);
}

function literal(value: string | number | boolean) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function atomicFilter(field: string, operator: string, value: string | number | boolean): FilterDescriptor {
  return { field, operator, value };
}

function presetFilters(preset: string): FilterDescriptor[] {
  if (preset === 'recent') return [atomicFilter('TriggerDate', 'gte', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())];
  if (preset === 'all-visible') return [];
  return [{ logic: 'or', filters: [
    atomicFilter('Status', 'eq', 'Active'),
    atomicFilter('Status', 'eq', 'Failed'),
    atomicFilter('Status', 'eq', 'Recovery'),
    atomicFilter('Status', 'eq', 'Active - In Recovery'),
    atomicFilter('Status', 'contains', 'Recovery')
  ] } as unknown as FilterDescriptor];
}

function searchFilter(search: string | undefined, fields: string[]): CompositeFilterDescriptor | null {
  const trimmed = search?.trim();
  if (!trimmed) return null;
  const filters = fields.map((field) => ({ field, operator: 'contains', value: trimmed }));
  return { logic: 'or', filters };
}

function mergeFilter(base: FilterDescriptor[], current?: CompositeFilterDescriptor, search?: CompositeFilterDescriptor | null): CompositeFilterDescriptor {
  const filters: CompositeFilterDescriptor['filters'] = [...base];
  if (current?.filters?.length) filters.push(current);
  if (search) filters.push(search);
  return { logic: 'and', filters };
}

function sortedState(state: ProcessingGridState, fallbackSort: ProcessingGridState['sort'] = []) {
  return state.sort?.length ? state.sort : fallbackSort;
}

function buildGridQuery({ state, preset, search }: TriggerGridQuery) {
  const safeState = {
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: state.sort,
    group: state.group,
    filter: mergeFilter([atomicFilter('IsChild', 'neq', true), ...presetFilters(preset)], state.filter, searchFilter(search, ['WorkflowId', 'WorkflowTriggerId', 'ServiceIdentifier', 'JobId', 'Status']))
  };
  return toDataSourceRequestString(safeState);
}

function buildWorkflowEventGridQuery({ state, workflowTriggerId, search }: WorkflowEventGridQuery) {
  const safeState = {
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: sortedState(state, [{ field: 'Id', dir: 'asc' }]),
    group: state.group,
    filter: mergeFilter([atomicFilter('WorkflowTriggerId', 'eq', workflowTriggerId)], state.filter, searchFilter(search, ['WorkflowId', 'WorkflowTriggerId', 'ServiceIdentifier', 'Status']))
  };
  return toDataSourceRequestString(safeState);
}

function buildServiceEventGridQuery({ state, workflowEventId, search }: ServiceEventGridQuery) {
  const parentFilter: CompositeFilterDescriptor = {
    logic: 'or',
    filters: [
      { field: 'ParentId', operator: 'isnull', value: null },
      atomicFilter('ParentId', 'eq', 0)
    ]
  };
  const safeState = {
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: state.sort,
    group: state.group,
    filter: mergeFilter([atomicFilter('WorkflowEventId', 'eq', workflowEventId), parentFilter as unknown as FilterDescriptor], state.filter, searchFilter(search, ['WorkflowId', 'WorkflowTriggerId', 'WorkflowEventId', 'ServiceIdentifier', 'JobId', 'Status']))
  };
  return toDataSourceRequestString(safeState);
}

export function formatSimpleFilter(field: string, operator: string, value: string | number | boolean) {
  return `${field}~${operator}~${literal(value)}`;
}

export async function getTriggerSchema(instanceId: string, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingSchema>(`/api/instances/${encodeURIComponent(instanceId)}/processing/triggers/schema`, token, signal);
}

export async function getTriggerGrid(instanceId: string, token: string, query: TriggerGridQuery, signal?: AbortSignal) {
  const dataSourceQuery = buildGridQuery(query);
  return fetchJson<ProcessingGridResponse>(`/api/instances/${encodeURIComponent(instanceId)}/processing/triggers/grid?${dataSourceQuery}`, token, signal);
}

export async function getChildTriggerGrid(instanceId: string, triggerId: string | number, token: string, state: ProcessingGridState, signal?: AbortSignal) {
  const dataSourceQuery = toDataSourceRequestString({
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: state.sort,
    filter: state.filter
  });
  return fetchJson<ProcessingGridResponse>(`/api/instances/${encodeURIComponent(instanceId)}/processing/triggers/${encodeURIComponent(String(triggerId))}/children?${dataSourceQuery}`, token, signal);
}

export async function getWorkflowEventSchema(instanceId: string, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingSchema>(`/api/instances/${encodeURIComponent(instanceId)}/processing/workflow-events/schema`, token, signal);
}

export async function getWorkflowEventGrid(instanceId: string, token: string, query: WorkflowEventGridQuery, signal?: AbortSignal) {
  const dataSourceQuery = buildWorkflowEventGridQuery(query);
  return fetchJson<ProcessingGridResponse>(`/api/instances/${encodeURIComponent(instanceId)}/processing/workflow-events/grid?${dataSourceQuery}`, token, signal);
}

export async function getServiceEventSchema(instanceId: string, serviceIdentifier: string, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingSchema>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/schema`, token, signal);
}

export async function getServiceEventGrid(instanceId: string, token: string, query: ServiceEventGridQuery, signal?: AbortSignal) {
  const dataSourceQuery = buildServiceEventGridQuery(query);
  return fetchJson<ProcessingGridResponse>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(query.serviceIdentifier)}/grid?${dataSourceQuery}`, token, signal);
}

export async function getChildServiceEventGrid(instanceId: string, serviceIdentifier: string, eventId: string | number, token: string, state: ProcessingGridState, signal?: AbortSignal) {
  const dataSourceQuery = toDataSourceRequestString({
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: state.sort,
    filter: state.filter
  });
  return fetchJson<ProcessingGridResponse>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/${encodeURIComponent(String(eventId))}/children?${dataSourceQuery}`, token, signal);
}

export async function getServiceEventDetail(instanceId: string, serviceIdentifier: string, eventId: string | number, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingGridRecord>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/${encodeURIComponent(String(eventId))}`, token, signal);
}

export async function downloadServiceEventFile(instanceId: string, serviceIdentifier: string, eventId: string | number, fileName: string, token: string) {
  const response = await fetch(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/${encodeURIComponent(String(eventId))}/files/${encodeURIComponent(fileName)}`, { headers: authHeaders(token) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : `Processing Errors file download failed with status ${response.status}`;
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function getServiceEventMessageSchema(instanceId: string, serviceIdentifier: string, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingSchema>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/message-schema`, token, signal);
}

export async function getServiceEventMessage(instanceId: string, serviceIdentifier: string, eventId: string | number, token: string, signal?: AbortSignal) {
  return fetchJson<ProcessingQueueEntryDetail>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/${encodeURIComponent(String(eventId))}/message`, token, signal);
}

export function downloadBase64Attachment(fileName: string, content: string, contentType = 'application/octet-stream') {
  const link = document.createElement('a');
  link.href = `data:${contentType};base64,${content}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function cancelTrigger(instanceId: string, triggerId: string | number, token: string, isParent: boolean) {
  return postJson<{ ok: true; result: unknown }>(`/api/instances/${encodeURIComponent(instanceId)}/processing/triggers/${encodeURIComponent(String(triggerId))}/cancel`, token, { confirmed: true, isParent });
}

export async function recoverWorkflowEvent(instanceId: string, eventId: string | number, token: string, triggerId: string | number) {
  return postJson<{ ok: true; result: unknown }>(`/api/instances/${encodeURIComponent(instanceId)}/processing/workflow-events/${encodeURIComponent(String(eventId))}/recovery`, token, { confirmed: true, triggerId });
}

export async function cancelWorkflowEvent(instanceId: string, eventId: string | number, token: string, action: 1 | 2 | 3) {
  return postJson<{ ok: true; result: unknown }>(`/api/instances/${encodeURIComponent(instanceId)}/processing/workflow-events/${encodeURIComponent(String(eventId))}/cancel`, token, { confirmed: true, action });
}

export async function restoreServiceEvent(instanceId: string, serviceIdentifier: string, eventId: string | number, token: string) {
  return postJson<{ ok: true; result: unknown }>(`/api/instances/${encodeURIComponent(instanceId)}/processing/service-events/${encodeURIComponent(serviceIdentifier)}/${encodeURIComponent(String(eventId))}/restore`, token, { confirmed: true });
}

export function recordValue(record: ProcessingGridRecord, field: string) {
  return record[field] ?? record[field.charAt(0).toLowerCase() + field.slice(1)] ?? null;
}
