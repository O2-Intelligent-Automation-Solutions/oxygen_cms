import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthRepository } from '../auth/types.js';
import type { SetupSettingsStore } from './fileSetupSettingsStore.js';
import { getSetupStatus, type SetupStatusProvider } from './setupStatus.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';

const databaseSetupSchema = z.object({
  mode: z.enum(['local-mysql', 'existing-mysql']).default('local-mysql'),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().positive().default(3306),
  database: z.string().min(1).default('O2IAS_CMS'),
  adminUser: z.string().min(1).optional(),
  adminPassword: z.string().optional(),
  appUser: z.string().min(1).default('oxygen_cms'),
  appPassword: z.string().min(12)
});

function setupError(reply: FastifyReply, error: unknown, fallback: string) {
  return reply.code(400).send({ error: error instanceof Error ? error.message : fallback });
}

function toDatabaseSettings(input: z.infer<typeof databaseSetupSchema>) {
  return {
    host: input.mode === 'local-mysql' ? 'localhost' : input.host || 'localhost',
    port: input.port,
    database: input.database,
    user: input.appUser,
    password: input.appPassword
  };
}

export async function registerSetupRoutes(app: FastifyInstance, authRepository: AuthRepository, setupStatusProvider: SetupStatusProvider, setupSettingsStore?: SetupSettingsStore) {
  app.get('/api/setup/status', async () => {
    return getSetupStatus(authRepository, setupStatusProvider);
  });

  app.post('/api/setup/database/test-connection', async (request, reply) => {
    try {
      const input = databaseSetupSchema.parse(request.body);
      return reply.code(200).send({
        ok: true,
        mode: input.mode,
        database: input.database,
        message: input.mode === 'local-mysql'
          ? 'Local MySQL provisioning settings are valid for browser wizard testing.'
          : `Connection settings accepted for ${input.host || 'localhost'}. Real server probing will be enabled with durable MySQL persistence.`
      });
    } catch (error) {
      return setupError(reply, error, 'Unable to validate database settings.');
    }
  });

  app.post('/api/setup/database/list-databases', async (_request, reply) => {
    return reply.code(200).send({ databases: ['O2IAS_CMS'], defaultDatabaseName: 'O2IAS_CMS' });
  });

  app.post('/api/setup/database/provision', async (request, reply) => {
    if (!setupSettingsStore) return reply.code(501).send({ error: 'Setup settings store is not configured.' });
    try {
      const input = databaseSetupSchema.parse(request.body);
      await setupSettingsStore.saveDatabaseSettings(toDatabaseSettings(input));
      return reply.code(200).send({ ok: true, mode: input.mode, database: input.database, nextStep: 'schema' });
    } catch (error) {
      return setupError(reply, error, 'Unable to provision database settings.');
    }
  });

  app.post('/api/setup/database/apply-schema', async (_request, reply) => {
    if (!setupSettingsStore) return reply.code(501).send({ error: 'Setup settings store is not configured.' });
    const database = await setupSettingsStore.getDatabaseSettings();
    if (!database) return reply.code(400).send({ error: 'Database must be configured before applying schema.' });
    await setupSettingsStore.markSchemaCurrent();
    return reply.code(200).send({
      ok: true,
      database: database.database,
      targetSchemaVersion: CURRENT_SCHEMA_VERSION,
      appliedVersions: [CURRENT_SCHEMA_VERSION],
      nextStep: 'admin'
    });
  });
}
