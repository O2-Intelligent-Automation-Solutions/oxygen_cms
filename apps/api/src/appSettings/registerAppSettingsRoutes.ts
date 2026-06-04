import type { FastifyInstance } from 'fastify';
import type { AuthRepository } from '../auth/types.js';
import { requireAuth } from '../auth/registerAuthRoutes.js';
import { appLabelsSchema } from './schemas.js';
import type { AppSettingsRepository } from './types.js';

export async function registerAppSettingsRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: AppSettingsRepository) {
  const requireSignedIn = requireAuth(authRepository);

  app.get('/api/app-settings/labels', { preHandler: requireSignedIn }, async () => ({ labels: await repository.getLabels() }));

  app.put('/api/app-settings/labels', { preHandler: requireSignedIn }, async (request, reply) => {
    const parsed = appLabelsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid labels settings.' });
    return { labels: await repository.saveLabels(parsed.data) };
  });
}
