export const DEFAULT_CMS_DATABASE_NAME = 'O2IAS_CMS';

export type SetupNextStep = 'database' | 'schema' | 'admin' | 'complete';

export type SetupDatabaseStatus = {
  configured: boolean;
  connected: boolean;
  schemaCurrent: boolean;
  defaultDatabaseName: string;
};

export type SetupAdminStatus = {
  exists: boolean;
};

export type SetupStatus = {
  database: SetupDatabaseStatus;
  admin: SetupAdminStatus;
  nextStep: SetupNextStep;
  requiresSetup: boolean;
};
