export type AppLabels = {
  tenant: string;
};

export const DEFAULT_APP_LABELS: AppLabels = {
  tenant: 'Tenant'
};

export type AppSettingsRepository = {
  getLabels(): Promise<AppLabels>;
  saveLabels(labels: AppLabels): Promise<AppLabels>;
};
