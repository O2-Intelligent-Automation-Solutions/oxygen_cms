import { toDataSourceRequestString, type CompositeFilterDescriptor, type FilterDescriptor } from '@progress/kendo-data-query';
import type { ProcessingFilterPreset, ProcessingGridRecord, ProcessingGridResponse, ProcessingGridState, ProcessingSchema, ServiceEventGridQuery, TriggerGridQuery, WorkflowEventGridQuery } from './types';

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
  return [
    { field: 'Status', operator: 'neq', value: 'Completed' },
    { field: 'Status', operator: 'neq', value: 'Complete' },
    { field: 'Status', operator: 'neq', value: 'Success' }
  ];
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
    filter: mergeFilter([atomicFilter('IsChild', 'neq', true), ...presetFilters(preset)], state.filter, searchFilter(search, ['WorkflowId', 'WorkflowTriggerId', 'ServiceIdentifier', 'JobId', 'Status']))
  };
  return toDataSourceRequestString(safeState);
}

function buildWorkflowEventGridQuery({ state, workflowTriggerId, search }: WorkflowEventGridQuery) {
  const safeState = {
    skip: Math.max(0, Math.floor(state.skip || 0)),
    take: normalizeTake(state.take),
    sort: sortedState(state, [{ field: 'Id', dir: 'asc' }]),
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

export function recordValue(record: ProcessingGridRecord, field: string) {
  return record[field] ?? record[field.charAt(0).toLowerCase() + field.slice(1)] ?? null;
}
