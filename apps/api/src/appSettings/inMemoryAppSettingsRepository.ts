import { DEFAULT_APP_LABELS, type AppLabels, type AppSettingsRepository } from './types.js';

export function createInMemoryAppSettingsRepository(): AppSettingsRepository {
  let labels: AppLabels = { ...DEFAULT_APP_LABELS };
  return {
    async getLabels() {
      return { ...labels };
    },
    async saveLabels(nextLabels) {
      labels = { ...DEFAULT_APP_LABELS, tenant: nextLabels.tenant.trim() };
      return { ...labels };
    }
  };
}
