import { DEFAULT_APP_LABELS, DEFAULT_LOG_RETENTION_SETTINGS, DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS, DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS, DEFAULT_QUEUE_SCHEDULE_SETTINGS, type AppLabels, type AppSettingsRepository, type LogRetentionSettings, type SslCertificateWarningSettings, type LicenseExpirationWarningSettings, type QueueScheduleSettings } from './types.js';

export function createInMemoryAppSettingsRepository(): AppSettingsRepository {
  let labels: AppLabels = { ...DEFAULT_APP_LABELS };
  let logRetention: LogRetentionSettings = { ...DEFAULT_LOG_RETENTION_SETTINGS };
  let sslCertificateWarning: SslCertificateWarningSettings = { ...DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS };
  let licenseExpirationWarning: LicenseExpirationWarningSettings = { ...DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS };
  let queueSchedules: QueueScheduleSettings = { jobs: DEFAULT_QUEUE_SCHEDULE_SETTINGS.jobs.map((job) => ({ ...job })) };
  return {
    async getLabels() {
      return { ...labels };
    },
    async saveLabels(nextLabels) {
      labels = { ...DEFAULT_APP_LABELS, tenant: nextLabels.tenant.trim() };
      return { ...labels };
    },
    async getLogRetention() {
      return { ...logRetention };
    },
    async saveLogRetention(nextRetention) {
      logRetention = { days: nextRetention.days };
      return { ...logRetention };
    },
    async getSslCertificateWarning() {
      return { ...sslCertificateWarning };
    },
    async saveSslCertificateWarning(nextSettings) {
      sslCertificateWarning = { daysBeforeExpiration: nextSettings.daysBeforeExpiration };
      return { ...sslCertificateWarning };
    },
    async getLicenseExpirationWarning() {
      return { ...licenseExpirationWarning };
    },
    async saveLicenseExpirationWarning(nextSettings) {
      licenseExpirationWarning = { daysBeforeExpiration: nextSettings.daysBeforeExpiration };
      return { ...licenseExpirationWarning };
    },
    async getQueueSchedules() {
      return { jobs: queueSchedules.jobs.map((job) => ({ ...job })) };
    },
    async saveQueueSchedules(nextSettings) {
      const merged = DEFAULT_QUEUE_SCHEDULE_SETTINGS.jobs.map((defaultJob) => {
        const override = nextSettings.jobs.find((job) => job.key === defaultJob.key);
        const everySeconds = override?.everySeconds ?? defaultJob.everySeconds;
        return { ...defaultJob, enabled: override?.enabled ?? defaultJob.enabled, everySeconds: Math.min(Math.max(Math.trunc(everySeconds), 86_400), 2_592_000) };
      });
      queueSchedules = { jobs: merged };
      return { jobs: queueSchedules.jobs.map((job) => ({ ...job })) };
    }
  };
}
