export type AppLogType = 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI';
export type AppLogSeverity = 'Critical' | 'Error' | 'Warning' | 'Logging' | 'Verbose';

export type AppLogEntry = {
  id: string;
  type: AppLogType;
  severity: AppLogSeverity;
  source: string;
  userName: string | null;
  entityGuid: string | null;
  tenantId: string | null;
  message: string;
  details: unknown | null;
  createdAt: string;
};

export type CreateAppLogEntry = {
  type: AppLogType;
  severity: AppLogSeverity;
  source: string;
  userName?: string | null;
  entityGuid?: string | null;
  tenantId?: string | null;
  message: string;
  details?: unknown | null;
};

export type AppLogQuery = {
  type?: AppLogType[];
  severity?: AppLogSeverity[];
  source?: string;
  userName?: string;
  entityGuid?: string;
  tenantId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type AppLogListResult = {
  logs: AppLogEntry[];
  total: number;
};

export type AppLogClearTableResult = {
  tableName: string;
  deleted: number;
};

export type AppLogClearResult = {
  deleted: number;
  tables: AppLogClearTableResult[];
};

export type AppLogRetentionRunResult = AppLogClearResult;

export type AppLogRepository = {
  append(entry: CreateAppLogEntry): Promise<AppLogEntry>;
  list(query?: AppLogQuery): Promise<AppLogListResult>;
  pruneOlderThan(days: number): Promise<AppLogRetentionRunResult>;
  clear(): Promise<AppLogClearResult>;
};
