import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, requireRole } from '../auth/registerAuthRoutes.js';
import type { AuthProfile, AuthRepository } from '../auth/types.js';
import { appLogQuerySchema } from './schemas.js';
import type { AppLogRepository } from './types.js';

type AuthenticatedRequest = FastifyRequest & { authProfile: AuthProfile };

export async function registerAppLogRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: AppLogRepository) {
  const preHandler = [requireAuth(authRepository), requireRole('SystemAdmin')];

  app.get('/api/logs', { preHandler }, async (request, reply) => {
    const parsed = appLogQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid log filters.' });
    return repository.list(parsed.data);
  });

  app.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url.startsWith('/api/logs')) return;
    if (request.method === 'GET' || request.method === 'OPTIONS' || request.method === 'HEAD') return;
    const profile = (request as AuthenticatedRequest).authProfile;
    const userName = profile?.user.email ?? null;
    const source = userName ?? 'OxyGen CMS';
    const type = request.url.includes('/auth/login') || request.url.includes('/auth/logout') ? 'Audit' : request.url.includes('/instances') ? (request.url.includes('connectivity') ? 'Connection' : 'CRUD') : 'UI';
    const severity = reply.statusCode >= 500 ? 'Error' : reply.statusCode >= 400 ? 'Warning' : 'Logging';
    await repository.append({ type, severity, source, userName, message: `${request.method} ${request.url} returned ${reply.statusCode}`, details: { method: request.method, url: request.url, statusCode: reply.statusCode } });
  });
}
