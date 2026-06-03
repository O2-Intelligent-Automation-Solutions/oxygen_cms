import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthRepository } from '../auth/types.js';
import type { DatabaseProvisioner } from './databaseProvisioner.js';
import type { DeploymentConfig } from './deploymentConfig.js';
import { publicDeploymentConfig } from './deploymentConfig.js';
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
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes('ECONNREFUSED')) {
    return reply.code(400).send({ error: 'Unable to connect to MySQL. Confirm a MySQL server is running and listening on the selected host/port, then try again.' });
  }
  return reply.code(400).send({ error: message.replace(/'[^']{12,}'/g, "'[REDACTED]'") });
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

export async function registerSetupRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  setupStatusProvider: SetupStatusProvider,
  setupSettingsStore: SetupSettingsStore | undefined,
  databaseProvisioner: DatabaseProvisioner,
  deploymentConfig: DeploymentConfig
) {
  app.get('/api/setup/status', async () => {
    return getSetupStatus(authRepository, setupStatusProvider);
  });

  app.get('/api/setup/deployment', async () => publicDeploymentConfig(deploymentConfig));

  app.post('/api/setup/database/provision-managed', async (_request, reply) => {
    if (!setupSettingsStore) return reply.code(501).send({ error: 'Setup settings store is not configured.' });
    if (!deploymentConfig.managedMysql || !deploymentConfig.mysql) {
      return reply.code(400).send({ error: 'Managed self-contained MySQL is not available for this deployment.' });
    }
    if (!deploymentConfig.mysql.applicationPassword || !deploymentConfig.mysql.privilegedUser || !deploymentConfig.mysql.privilegedPassword) {
      return reply.code(400).send({ error: 'Managed MySQL deployment secrets are incomplete. Restart CMS with generated MySQL secrets before provisioning.' });
    }
    const settings = {
      host: deploymentConfig.mysql.host,
      port: deploymentConfig.mysql.port,
      database: deploymentConfig.mysql.database,
      user: deploymentConfig.mysql.applicationUser,
      password: deploymentConfig.mysql.applicationPassword
    };
    try {
      const provisioned = await databaseProvisioner.provision({
        mode: 'local-mysql',
        settings,
        adminUser: deploymentConfig.mysql.privilegedUser,
        adminPassword: deploymentConfig.mysql.privilegedPassword
      });
      await setupSettingsStore.saveDatabaseSettings(provisioned.settings);
      await setupSettingsStore.saveSchemaDatabaseSettings({
        ...provisioned.settings,
        user: deploymentConfig.mysql.privilegedUser,
        password: deploymentConfig.mysql.privilegedPassword
      });
      return reply.code(200).send({
        ok: true,
        mode: 'self-contained',
        database: provisioned.settings.database,
        createdDatabase: provisioned.createdDatabase,
        createdUser: provisioned.createdUser,
        nextStep: 'schema'
      });
    } catch (error) {
      return setupError(reply, error, 'Unable to provision managed database settings.');
    }
  });

  app.post('/api/setup/database/test-connection', async (request, reply) => {
    try {
      const input = databaseSetupSchema.parse(request.body);
      const result = await databaseProvisioner.testConnection(toDatabaseSettings(input));
      return reply.code(200).send({ ok: result.ok, mode: input.mode, database: input.database, message: result.message, serverVersion: result.serverVersion });
    } catch (error) {
      return setupError(reply, error, 'Unable to validate database settings.');
    }
  });

  app.post('/api/setup/database/list-databases', async (request, reply) => {
    try {
      const input = databaseSetupSchema.parse(request.body);
      const databases = await databaseProvisioner.listDatabases(toDatabaseSettings(input), input.adminUser, input.adminPassword);
      return reply.code(200).send({ databases, defaultDatabaseName: 'O2IAS_CMS' });
    } catch (error) {
      return setupError(reply, error, 'Unable to list databases.');
    }
  });

  app.post('/api/setup/database/provision', async (request, reply) => {
    if (!setupSettingsStore) return reply.code(501).send({ error: 'Setup settings store is not configured.' });
    try {
      const input = databaseSetupSchema.parse(request.body);
      const provisioned = await databaseProvisioner.provision({
        mode: input.mode,
        settings: toDatabaseSettings(input),
        adminUser: input.adminUser,
        adminPassword: input.adminPassword
      });
      await setupSettingsStore.saveDatabaseSettings(provisioned.settings);
      if (input.adminUser && input.adminPassword) {
        await setupSettingsStore.saveSchemaDatabaseSettings({ ...provisioned.settings, user: input.adminUser, password: input.adminPassword });
      }
      return reply.code(200).send({
        ok: true,
        mode: input.mode,
        database: input.database,
        createdDatabase: provisioned.createdDatabase,
        createdUser: provisioned.createdUser,
        nextStep: 'schema'
      });
    } catch (error) {
      return setupError(reply, error, 'Unable to provision database settings.');
    }
  });

  app.post('/api/setup/database/apply-schema', async (_request, reply) => {
    if (!setupSettingsStore) return reply.code(501).send({ error: 'Setup settings store is not configured.' });
    const database = await setupSettingsStore.getDatabaseSettings();
    const schemaDatabase = await setupSettingsStore.getSchemaDatabaseSettings();
    if (!database) return reply.code(400).send({ error: 'Database must be configured before applying schema.' });
    try {
      const schema = await databaseProvisioner.applySchema(schemaDatabase ?? database);
      await setupSettingsStore.markSchemaCurrent();
      await setupSettingsStore.clearSchemaDatabaseSettings();
      return reply.code(200).send({
        ok: true,
        database: database.database,
        targetSchemaVersion: schema.targetSchemaVersion || CURRENT_SCHEMA_VERSION,
        appliedVersions: schema.appliedVersions,
        nextStep: 'admin'
      });
    } catch (error) {
      return setupError(reply, error, 'Unable to apply database schema.');
    }
  });
}
