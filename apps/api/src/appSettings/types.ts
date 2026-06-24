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

export type SslCertificateWarningSettings = {
  daysBeforeExpiration: number;
};

export const DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS: SslCertificateWarningSettings = {
  daysBeforeExpiration: 30
};

export type LicenseExpirationWarningSettings = {
  daysBeforeExpiration: number;
};

export const DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS: LicenseExpirationWarningSettings = {
  daysBeforeExpiration: 30
};

export type QueueScheduleJobKey =
  | 'database-maintenance:purge-logs'
  | 'database-maintenance:prune-check-history'
  | 'system-maintenance:check-application-updates'
  | 'system-maintenance:prune-queue-history';

export type QueueScheduleJobSettings = {
  key: QueueScheduleJobKey;
  queue: 'database-maintenance' | 'system-maintenance';
  name: string;
  label: string;
  enabled: boolean;
  everySeconds: number;
};

export type QueueScheduleSettings = {
  jobs: QueueScheduleJobSettings[];
};

export type QueueScheduleJobUpdate = {
  key: QueueScheduleJobKey;
  enabled: boolean;
  everySeconds: number;
};

export type QueueScheduleSettingsUpdate = {
  jobs: QueueScheduleJobUpdate[];
};

export const DEFAULT_QUEUE_SCHEDULE_SETTINGS: QueueScheduleSettings = {
  jobs: [
    { key: 'database-maintenance:purge-logs', queue: 'database-maintenance', name: 'purge-logs', label: 'Purge Logs', enabled: true, everySeconds: 86400 },
    { key: 'database-maintenance:prune-check-history', queue: 'database-maintenance', name: 'prune-check-history', label: 'Prune Check History', enabled: true, everySeconds: 86400 },
    { key: 'system-maintenance:check-application-updates', queue: 'system-maintenance', name: 'check-application-updates', label: 'Check Application Updates', enabled: true, everySeconds: 86400 },
    { key: 'system-maintenance:prune-queue-history', queue: 'system-maintenance', name: 'prune-queue-history', label: 'Prune Queue History', enabled: true, everySeconds: 86400 }
  ]
};

export type AppSettingsRepository = {
  getLabels(): Promise<AppLabels>;
  saveLabels(labels: AppLabels): Promise<AppLabels>;
  getLogRetention(): Promise<LogRetentionSettings>;
  saveLogRetention(retention: LogRetentionSettings): Promise<LogRetentionSettings>;
  getSslCertificateWarning(): Promise<SslCertificateWarningSettings>;
  saveSslCertificateWarning(settings: SslCertificateWarningSettings): Promise<SslCertificateWarningSettings>;
  getLicenseExpirationWarning(): Promise<LicenseExpirationWarningSettings>;
  saveLicenseExpirationWarning(settings: LicenseExpirationWarningSettings): Promise<LicenseExpirationWarningSettings>;
  getQueueSchedules(): Promise<QueueScheduleSettings>;
  saveQueueSchedules(settings: QueueScheduleSettingsUpdate): Promise<QueueScheduleSettings>;
};
