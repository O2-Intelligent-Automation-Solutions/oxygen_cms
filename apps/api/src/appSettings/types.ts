export type AppLabels = {
  tenant: string;
};

export const DEFAULT_APP_LABELS: AppLabels = {
  tenant: 'Tenant'
};

export type LogRetentionSettings = {
  days: number;
};

export const DEFAULT_LOG_RETENTION_SETTINGS: LogRetentionSettings = {
  days: 90
};

export type AppSettingsRepository = {
  getLabels(): Promise<AppLabels>;
  saveLabels(labels: AppLabels): Promise<AppLabels>;
  getLogRetention(): Promise<LogRetentionSettings>;
  saveLogRetention(retention: LogRetentionSettings): Promise<LogRetentionSettings>;
};
