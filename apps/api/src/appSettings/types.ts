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

export type QueueScheduleDefinition =
  | { type: 'interval'; everySeconds: number }
  | { type: 'cron'; expression: string; timezone: string; anchorLabel?: string };

export type QueueScheduleJobSettings = {
  key: QueueScheduleJobKey;
  queue: 'database-maintenance' | 'system-maintenance';
  name: string;
  label: string;
  enabled: boolean;
  everySeconds: number;
  schedule: QueueScheduleDefinition;
};

export type QueueScheduleSettings = {
  jobs: QueueScheduleJobSettings[];
};

export type QueueScheduleJobUpdate = {
  key: QueueScheduleJobKey;
  enabled: boolean;
  everySeconds?: number;
  schedule?: QueueScheduleDefinition;
};

export type QueueScheduleSettingsUpdate = {
  jobs: QueueScheduleJobUpdate[];
};

function intervalJob<T extends Omit<QueueScheduleJobSettings, 'schedule'>>(job: T): T & { schedule: { type: 'interval'; everySeconds: number } } {
  return { ...job, schedule: { type: 'interval', everySeconds: job.everySeconds } };
}

export const DEFAULT_QUEUE_SCHEDULE_SETTINGS: QueueScheduleSettings = {
  jobs: [
    intervalJob({ key: 'database-maintenance:purge-logs', queue: 'database-maintenance', name: 'purge-logs', label: 'Purge Logs', enabled: true, everySeconds: 86400 }),
    intervalJob({ key: 'database-maintenance:prune-check-history', queue: 'database-maintenance', name: 'prune-check-history', label: 'Prune Check History', enabled: true, everySeconds: 86400 }),
    intervalJob({ key: 'system-maintenance:check-application-updates', queue: 'system-maintenance', name: 'check-application-updates', label: 'Check Application Updates', enabled: true, everySeconds: 86400 }),
    intervalJob({ key: 'system-maintenance:prune-queue-history', queue: 'system-maintenance', name: 'prune-queue-history', label: 'Prune Queue History', enabled: true, everySeconds: 86400 })
  ]
};

export function normalizeQueueIntervalSeconds(value: unknown, fallback: number) {
  const seconds = Number(value ?? fallback);
  return Number.isFinite(seconds) ? Math.min(Math.max(Math.trunc(seconds), 86_400), 2_592_000) : fallback;
}

export function normalizeQueueScheduleDefinition(value: unknown, fallbackEverySeconds: number): QueueScheduleDefinition {
  if (value && typeof value === 'object' && !Array.isArray(value) && (value as { type?: unknown }).type === 'interval') {
    return { type: 'interval', everySeconds: normalizeQueueIntervalSeconds((value as { everySeconds?: unknown }).everySeconds, fallbackEverySeconds) };
  }
  return { type: 'interval', everySeconds: normalizeQueueIntervalSeconds(undefined, fallbackEverySeconds) };
}

export function normalizeQueueScheduleSettings(value: unknown): QueueScheduleSettings {
  const submittedJobs = value && typeof value === 'object' && !Array.isArray(value) && 'jobs' in value && Array.isArray((value as { jobs: unknown }).jobs)
    ? (value as { jobs: unknown[] }).jobs
    : [];
  return {
    jobs: DEFAULT_QUEUE_SCHEDULE_SETTINGS.jobs.map((defaultJob) => {
      const submitted = submittedJobs.find((job) => job && typeof job === 'object' && 'key' in job && (job as { key: unknown }).key === defaultJob.key) as { enabled?: unknown; everySeconds?: unknown; schedule?: unknown } | undefined;
      const schedule = normalizeQueueScheduleDefinition(submitted?.schedule ?? (submitted && 'everySeconds' in submitted ? { type: 'interval', everySeconds: submitted.everySeconds } : undefined), defaultJob.everySeconds);
      const everySeconds = schedule.type === 'interval' ? schedule.everySeconds : defaultJob.everySeconds;
      return {
        ...defaultJob,
        enabled: typeof submitted?.enabled === 'boolean' ? submitted.enabled : defaultJob.enabled,
        everySeconds,
        schedule
      };
    })
  };
}

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
