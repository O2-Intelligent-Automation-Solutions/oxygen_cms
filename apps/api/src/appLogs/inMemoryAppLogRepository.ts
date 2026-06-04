import { randomUUID } from 'node:crypto';
import type { AppLogEntry, AppLogListResult, AppLogQuery, AppLogRepository, CreateAppLogEntry } from './types.js';

function matches(entry: AppLogEntry, query: AppLogQuery) {
  if (query.type && entry.type !== query.type) return false;
  if (query.severity && entry.severity !== query.severity) return false;
  if (query.source && entry.source !== query.source) return false;
  if (query.userName && entry.userName !== query.userName) return false;
  if (query.search) {
    const needle = query.search.toLowerCase();
    const haystack = `${entry.message} ${entry.source} ${entry.userName ?? ''} ${JSON.stringify(entry.details ?? '')}`.toLowerCase();
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
      return originalLength - logs.length;
    }
  };
}
