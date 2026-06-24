import type { FastifyInstance } from 'fastify';
import type { AuthRepository } from '../auth/types.js';
import { requireAuth, requirePermission } from '../auth/registerAuthRoutes.js';
import type { QueueStatusProvider } from '../queues/queueStatus.js';
import { appLabelsSchema, logRetentionSchema, sslCertificateWarningSchema, licenseExpirationWarningSchema, queueSchedulesSchema } from './schemas.js';
import type { AppSettingsRepository } from './types.js';

export async function registerAppSettingsRoutes(app: FastifyInstance, authRepository: AuthRepository, repository: AppSettingsRepository, queueStatusProvider?: Pick<QueueStatusProvider, 'reconcileQueueSchedules'>) {
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

  app.get('/api/app-settings/ssl-certificate-warning', { preHandler: requireSignedIn }, async () => ({ sslCertificateWarning: await repository.getSslCertificateWarning() }));

  app.put('/api/app-settings/ssl-certificate-warning', { preHandler: requireSettingsManage }, async (request, reply) => {
    const parsed = sslCertificateWarningSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid SSL certificate warning settings.' });
    return { sslCertificateWarning: await repository.saveSslCertificateWarning(parsed.data) };
  });

  app.get('/api/app-settings/license-expiration-warning', { preHandler: requireSignedIn }, async () => ({ licenseExpirationWarning: await repository.getLicenseExpirationWarning() }));

  app.put('/api/app-settings/license-expiration-warning', { preHandler: requireSettingsManage }, async (request, reply) => {
    const parsed = licenseExpirationWarningSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid license expiration warning settings.' });
    return { licenseExpirationWarning: await repository.saveLicenseExpirationWarning(parsed.data) };
  });

  app.get('/api/app-settings/queue-schedules', { preHandler: requireSignedIn }, async () => ({ queueSchedules: await repository.getQueueSchedules() }));

  app.put('/api/app-settings/queue-schedules', { preHandler: requireSettingsManage }, async (request, reply) => {
    const parsed = queueSchedulesSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid queue schedule settings.' });
    const queueSchedules = await repository.saveQueueSchedules(parsed.data);
    await queueStatusProvider?.reconcileQueueSchedules?.(queueSchedules);
    return { queueSchedules };
  });
}
