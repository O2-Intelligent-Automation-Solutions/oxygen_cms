import { DEFAULT_APP_LABELS, DEFAULT_LOG_RETENTION_SETTINGS, type AppLabels, type AppSettingsRepository, type LogRetentionSettings } from './types.js';

export function createInMemoryAppSettingsRepository(): AppSettingsRepository {
  let labels: AppLabels = { ...DEFAULT_APP_LABELS };
  let logRetention: LogRetentionSettings = { ...DEFAULT_LOG_RETENTION_SETTINGS };
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
    }
  };
}
