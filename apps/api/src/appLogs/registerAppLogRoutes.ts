import type { FastifyInstance, FastifyRequest } from 'fastify';
import { profileHasPermission } from '../auth/permissions.js';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import type { AppSettingsRepository } from '../appSettings/types.js';
import { appLogQuerySchema } from './schemas.js';
import type { AppLogRepository } from './types.js';

export async function registerAppLogRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: AppLogRepository, appSettingsRepository?: AppSettingsRepository) {
  const requireSignedIn = requireAuth(authRepository);
  const preHandler = [requireSignedIn, requirePermission('logs.view')];
  const maintainPreHandler = [requireSignedIn, requirePermission('logs.maintain')];

  function scopedQuery(request: FastifyRequest, query: ReturnType<typeof appLogQuerySchema.parse>) {
    const profile = request.authProfile as AuthProfile | undefined;
    if (!profile) return { ok: false as const, status: 401, error: 'Authentication required.' };
    if (profileHasPermission(profile, 'tenants.manage')) return { ok: true as const, query };
    if (!profile.user.tenantId) return { ok: false as const, status: 403, error: 'Tenant assignment required to view logs.' };
    if (query.tenantId && query.tenantId !== profile.user.tenantId) return { ok: false as const, status: 403, error: 'Tenant log access denied.' };
    return { ok: true as const, query: { ...query, tenantId: profile.user.tenantId } };
  }

  async function enforceRetention() {
    if (!appSettingsRepository) return;
    const retention = await appSettingsRepository.getLogRetention();
    await repository.pruneOlderThan(retention.days);
  }

  app.get('/api/logs', { preHandler }, async (request, reply) => {
    const parsed = appLogQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid log filters.' });
    const scoped = scopedQuery(request, parsed.data);
    if (!scoped.ok) return reply.code(scoped.status).send({ error: scoped.error });
    await enforceRetention();
    return repository.list(scoped.query);
  });

  app.post('/api/logs/retention/run', { preHandler: maintainPreHandler }, async (_request, reply) => {
    if (!appSettingsRepository) return reply.code(500).send({ error: 'Log retention settings are unavailable.' });
    const retention = await appSettingsRepository.getLogRetention();
    const result = await repository.pruneOlderThan(retention.days);
    return { retention, ...result };
  });

  app.delete('/api/logs', { preHandler: maintainPreHandler }, async () => {
    return repository.clear();
  });
}
