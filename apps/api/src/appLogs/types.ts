export type AppLogType = 'Audit' | 'Service' | 'CRUD' | 'Connection' | 'Security' | 'UI';
export type AppLogSeverity = 'Critical' | 'Error' | 'Warning' | 'Logging' | 'Verbose';

export type AppLogEntry = {
  id: string;
  type: AppLogType;
  severity: AppLogSeverity;
  source: string;
  userName: string | null;
  message: string;
  details: unknown | null;
  createdAt: string;
};

export type CreateAppLogEntry = {
  type: AppLogType;
  severity: AppLogSeverity;
  source: string;
  userName?: string | null;
  message: string;
  details?: unknown | null;
};

export type AppLogQuery = {
  type?: AppLogType;
  severity?: AppLogSeverity;
  source?: string;
  userName?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type AppLogListResult = {
  logs: AppLogEntry[];
  total: number;
};

export type AppLogRepository = {
  append(entry: CreateAppLogEntry): Promise<AppLogEntry>;
  list(query?: AppLogQuery): Promise<AppLogListResult>;
  pruneOlderThan(days: number): Promise<number>;
};
