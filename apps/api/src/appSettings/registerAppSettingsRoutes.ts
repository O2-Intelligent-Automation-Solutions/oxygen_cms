import type { FastifyInstance } from 'fastify';
import type { AuthRepository } from '../auth/types.js';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import { appLabelsSchema, logRetentionSchema } from './schemas.js';
import type { AppSettingsRepository } from './types.js';

export async function registerAppSettingsRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: AppSettingsRepository) {
  const requireSignedIn = requireAuth(authRepository);
  const requireSettingsManage = [requireSignedIn, requirePermission('settings.manage')];

  app.get('/api/app-settings/labels', { preHandler: requireSignedIn }, async () => ({ labels: await repository.getLabels() }));

  app.put('/api/app-settings/labels', { preHandler: requireSettingsManage }, async (request, reply) => {
    const parsed = appLabelsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid labels settings.' });
    return { labels: await repository.saveLabels(parsed.data) };
  });

  app.get('/api/app-settings/log-retention', { preHandler: requireSignedIn }, async () => ({ retention: await repository.getLogRetention() }));

  app.put('/api/app-settings/log-retention', { preHandler: requireSettingsManage }, async (request, reply) => {
    const parsed = logRetentionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid log retention settings.' });
    return { retention: await repository.saveLogRetention(parsed.data) };
  });
}
