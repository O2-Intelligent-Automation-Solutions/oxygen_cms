import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import { requireAuth } from '../auth/registerAuthRoutes.js';
import { gridPreferenceInputSchema, gridPreferenceParamsSchema } from './schemas.js';
import type { GridPreferenceRepository } from './types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

export async function registerGridPreferenceRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: GridPreferenceRepository) {
  const requireSignedIn = requireAuth(authRepository);

  app.get('/api/grid-preferences/:gridKey', { preHandler: requireSignedIn }, async (request, reply) => {
    const params = gridPreferenceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid grid key.', details: params.error.flatten() });
    const userId = (request as AuthenticatedRequest).authProfile.user.id;
    const preference = await repository.getPreference(userId, params.data.gridKey);
    return { preference };
  });

  app.put('/api/grid-preferences/:gridKey', { preHandler: requireSignedIn }, async (request, reply) => {
    const params = gridPreferenceParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid grid key.', details: params.error.flatten() });
    const body = gridPreferenceInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid grid preference.', details: body.error.flatten() });
    const userId = (request as AuthenticatedRequest).authProfile.user.id;
    const preference = await repository.savePreference(userId, params.data.gridKey, { ...body.data, filter: body.data.filter ?? null });
    return { preference };
  });
}
