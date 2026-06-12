import { randomUUID } from 'node:crypto';
import type { AppLogEntry, AppLogListResult, AppLogQuery, AppLogRepository, CreateAppLogEntry } from './types.js';

function matches(entry: AppLogEntry, query: AppLogQuery) {
  if (query.type?.length && !query.type.includes(entry.type)) return false;
  if (query.severity?.length && !query.severity.includes(entry.severity)) return false;
  if (query.source && entry.source !== query.source) return false;
  if (query.userName && entry.userName !== query.userName) return false;
  if (query.entityGuid && entry.entityGuid !== query.entityGuid) return false;
  if (query.tenantId && entry.tenantId !== query.tenantId) return false;
  if (query.search) {
    const needle = query.search.toLowerCase();
    const haystack = `${entry.message} ${entry.source} ${entry.userName ?? ''} ${entry.entityGuid ?? ''} ${entry.tenantId ?? ''} ${JSON.stringify(entry.details ?? '')}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export function createInMemoryAppLogRepository(): AppLogRepository {
  const logs: AppLogEntry[] = [];
  return {
    async append(entry: CreateAppLogEntry) {
      const saved: AppLogEntry = {
        id: randomUUID(),
        type: entry.type,
        severity: entry.severity,
        source: entry.source,
        userName: entry.userName ?? null,
        entityGuid: entry.entityGuid ?? (entry.details && typeof entry.details === 'object' && 'entityGuid' in entry.details ? String((entry.details as { entityGuid?: unknown }).entityGuid ?? '') || null : null),
        tenantId: entry.tenantId ?? (entry.details && typeof entry.details === 'object' && 'tenantId' in entry.details ? String((entry.details as { tenantId?: unknown }).tenantId ?? '') || null : null),
        message: entry.message,
        details: entry.details ?? null,
        createdAt: new Date().toISOString()
      };
      logs.unshift(saved);
      return saved;
    },
    async list(query: AppLogQuery = {}): Promise<AppLogListResult> {
      const offset = query.offset ?? 0;
      const limit = query.limit ?? 100;
      const filtered = logs.filter((entry) => matches(entry, query));
      return { logs: filtered.slice(offset, offset + limit), total: filtered.length };
    },
    async pruneOlderThan(days: number) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const originalLength = logs.length;
      for (let index = logs.length - 1; index >= 0; index -= 1) {
        if (Date.parse(logs[index].createdAt) < cutoff) logs.splice(index, 1);
      }
      const deleted = originalLength - logs.length;
      return { deleted, tables: [{ tableName: 'application_logs', deleted }] };
    },
    async clear() {
      const originalLength = logs.length;
      logs.splice(0, logs.length);
      return { deleted: originalLength, tables: [{ tableName: 'application_logs', deleted: originalLength }] };
    }
  };
}
