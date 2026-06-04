export const DEFAULT_CMS_DATABASE_NAME = 'O2IAS_CMS';
export const CURRENT_SCHEMA_VERSION = '0.08';

export type SetupNextStep = 'database' | 'schema' | 'admin' | 'complete';

export type SetupDatabaseStatus = {
  configured: boolean;
  connected: boolean;
  schemaCurrent: boolean;
  defaultDatabaseName: string;
  targetSchemaVersion: string;
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
