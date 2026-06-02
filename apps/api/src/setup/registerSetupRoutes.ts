import type { FastifyInstance } from 'fastify';
import type { AuthRepository } from '../auth/types.js';
import { getSetupStatus, type SetupStatusProvider } from './setupStatus.js';

export async function registerSetupRoutes(app: FastifyInstance, authRepository: AuthRepository, setupStatusProvider: SetupStatusProvider) {
  app.get('/api/setup/status', async () => {
    return getSetupStatus(authRepository, setupStatusProvider);
  });
}
