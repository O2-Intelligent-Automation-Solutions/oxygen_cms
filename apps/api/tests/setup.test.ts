import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createFileSetupSettingsStore } from '../src/setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider } from '../src/setup/setupStatus.js';
import type { DatabaseProvisioner } from '../src/setup/databaseProvisioner.js';
import { schemaMigrations } from '../src/db/migrations/index.js';

const tempDirs: string[] = [];

const fakeDatabaseProvisioner: DatabaseProvisioner = {
  async testConnection(settings) {
    return { ok: true, message: `Connected to ${settings.database}` };
  },
  async listDatabases() {
    return ['O2IAS_CMS'];
  },
  async provision(input) {
    return { settings: input.settings, createdDatabase: false, createdUser: false };
  },
  async applySchema() {
    return { targetSchemaVersion: '0.07', appliedVersions: ['0.03'] };
  }
};

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('first-run database setup API', () => {
  it('does not enforce unique instance names in current schema migrations', () => {
    const initialInstanceMigration = schemaMigrations.find((migration) => migration.version === '0.02');
    const duplicateNameMigration = schemaMigrations.find((migration) => migration.version === '0.12');

    expect(initialInstanceMigration?.upSql).not.toContain('uq_oxygen_instances_name');
    expect(duplicateNameMigration?.upSql).toContain('DROP INDEX uq_oxygen_instances_name');
    expect(duplicateNameMigration?.upSql).toContain('information_schema.statistics');
  });

  it('adds check-history indexes matching detail reads and retention pruning', () => {
    const historyDetailIndexMigration = schemaMigrations.find((migration) => migration.version === '0.13');
    const historyRetentionIndexMigration = schemaMigrations.find((migration) => migration.version === '0.14');

    expect(historyDetailIndexMigration?.name).toBe('instance check history detail index');
    expect(historyDetailIndexMigration?.upSql).toContain('idx_oxygen_instance_check_history_instance_started_id_type');
    expect(historyDetailIndexMigration?.upSql).toContain('instance_id, started_at, id, check_type');
    expect(historyRetentionIndexMigration?.name).toBe('instance check history retention index');
    expect(historyRetentionIndexMigration?.upSql).toContain('idx_oxygen_instance_check_history_started_at');
    expect(historyRetentionIndexMigration?.upSql).toContain('(started_at)');
  });

  it('reports database setup is required before first admin creation on a fresh install', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-setup-api-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));
    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner: fakeDatabaseProvisioner
    });

    const status = await app.inject({ method: 'GET', url: '/api/setup/status' });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      database: {
        configured: false,
        connected: false,
        schemaCurrent: false,
        defaultDatabaseName: 'O2IAS_CMS',
        targetSchemaVersion: '0.14'
      },
      admin: {
        exists: false
      },
      nextStep: 'database',
      requiresSetup: true
    });

    await app.close();
  });

  it('advances the setup wizard from database provisioning to schema and then admin creation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-setup-api-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));
    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner: fakeDatabaseProvisioner
    });

    const test = await app.inject({
      method: 'POST',
      url: '/api/setup/database/test-connection',
      payload: { mode: 'local-mysql', database: 'O2IAS_CMS', appUser: 'oxygen_cms', appPassword: 'StrongPassword!42' }
    });
    expect(test.statusCode).toBe(200);
    expect(test.json()).toMatchObject({ ok: true, database: 'O2IAS_CMS' });

    const provision = await app.inject({
      method: 'POST',
      url: '/api/setup/database/provision',
      payload: { mode: 'local-mysql', database: 'O2IAS_CMS', appUser: 'oxygen_cms', appPassword: 'StrongPassword!42' }
    });
    expect(provision.statusCode).toBe(200);
    expect(provision.json()).toMatchObject({ ok: true, nextStep: 'schema' });

    const schemaStatus = await app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(schemaStatus.json().nextStep).toBe('schema');
    expect(schemaStatus.json().database).toMatchObject({ configured: true, connected: true, schemaCurrent: false });

    const schema = await app.inject({ method: 'POST', url: '/api/setup/database/apply-schema' });
    expect(schema.statusCode).toBe(200);
    expect(schema.json()).toMatchObject({ ok: true, nextStep: 'admin' });

    const adminStatus = await app.inject({ method: 'GET', url: '/api/setup/status' });
    const applySchemaBody = schema.json();
    expect(applySchemaBody.targetSchemaVersion).toBe('0.07');
    expect(applySchemaBody.appliedVersions).toEqual(['0.03']);

    expect(adminStatus.json().nextStep).toBe('admin');
    expect(adminStatus.json().database).toMatchObject({ configured: true, connected: true, schemaCurrent: true });

    await app.close();
  });
});
