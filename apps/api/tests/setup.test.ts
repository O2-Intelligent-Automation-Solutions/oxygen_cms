import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createFileSetupSettingsStore } from '../src/setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider } from '../src/setup/setupStatus.js';
import type { DatabaseProvisioner } from '../src/setup/databaseProvisioner.js';

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
        targetSchemaVersion: '0.08'
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
