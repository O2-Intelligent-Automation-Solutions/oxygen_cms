import type { AuthRepository } from '../auth/types.js';
import { DEFAULT_CMS_DATABASE_NAME, type SetupDatabaseStatus, type SetupNextStep, type SetupStatus } from './types.js';

export type SetupStatusProvider = {
  getDatabaseStatus(): Promise<SetupDatabaseStatus>;
};

export function createDefaultSetupStatusProvider(): SetupStatusProvider {
  return {
    async getDatabaseStatus() {
      return {
        configured: false,
        connected: false,
        schemaCurrent: false,
        defaultDatabaseName: DEFAULT_CMS_DATABASE_NAME
      };
    }
  };
}

function determineNextStep(database: SetupDatabaseStatus, adminExists: boolean): SetupNextStep {
  if (!database.configured || !database.connected) return 'database';
  if (!database.schemaCurrent) return 'schema';
  if (!adminExists) return 'admin';
  return 'complete';
}

export async function getSetupStatus(authRepository: AuthRepository, setupStatusProvider: SetupStatusProvider): Promise<SetupStatus> {
  const [database, adminExists] = await Promise.all([
    setupStatusProvider.getDatabaseStatus(),
    authRepository.hasUsers()
  ]);
  const nextStep = determineNextStep(database, adminExists);
  return {
    database,
    admin: { exists: adminExists },
    nextStep,
    requiresSetup: nextStep !== 'complete'
  };
}
