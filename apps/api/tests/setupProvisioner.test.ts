import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createFileSetupSettingsStore, type DatabaseSettings } from '../src/setup/fileSetupSettingsStore.js';
import { createFileSetupStatusProvider } from '../src/setup/setupStatus.js';
import type { DatabaseProvisioner } from '../src/setup/databaseProvisioner.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('setup database provisioner integration', () => {
  it('provisions local create settings before requiring the application user to connect', async () => {
    const calls: string[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-create-provisioner-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));

    const databaseProvisioner: DatabaseProvisioner = {
      async testConnection(settings) {
        calls.push(`test:${settings.user}`);
        throw new Error('application user should not be tested before local provisioning');
      },
      async listDatabases() { return []; },
      async provision(input) {
        calls.push(`provision:${input.mode}:${input.adminUser ?? 'no-admin'}:${input.settings.user}`);
        return { settings: input.settings, createdDatabase: true, createdUser: true };
      },
      async applySchema() { return { appliedVersions: ['0.01'], targetSchemaVersion: '0.01' }; }
    };

    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/setup/database/provision',
      payload: {
        mode: 'local-mysql',
        port: 3306,
        database: 'O2IAS_CMS',
        adminUser: 'root',
        adminPassword: 'LocalRootPassword!42',
        appUser: 'oxygen_cms',
        appPassword: 'StrongPassword!42'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual(['provision:local-mysql:root:oxygen_cms']);

    await app.close();
  });

  it('uses the database provisioner for test, provision, list, and apply-schema actions', async () => {
    const calls: string[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-provisioner-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));

    const databaseProvisioner: DatabaseProvisioner = {
      async testConnection(settings) {
        calls.push(`test:${settings.database}:${settings.user}`);
        return { ok: true, message: `Connected to ${settings.database}` };
      },
      async listDatabases(settings) {
        calls.push(`list:${settings.host}:${settings.port}`);
        return ['O2IAS_CMS', 'OtherDb'];
      },
      async provision(input) {
        calls.push(`provision:${input.mode}:${input.settings.database}:${input.adminUser ?? 'no-admin'}`);
        return { settings: input.settings, createdDatabase: true, createdUser: true };
      },
      async applySchema(settings) {
        calls.push(`schema:${settings.database}:${settings.user}`);
        return { appliedVersions: ['0.01'], targetSchemaVersion: '0.01' };
      }
    };

    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner
    });

    const payload = {
      mode: 'existing-mysql',
      host: 'db.example.test',
      port: 3307,
      database: 'O2IAS_CMS',
      adminUser: 'root',
      adminPassword: 'ExistingServerPrivilegedPassword!42',
      appUser: 'oxygen_cms',
      appPassword: 'StrongPassword!42'
    };

    const test = await app.inject({ method: 'POST', url: '/api/setup/database/test-connection', payload });
    expect(test.statusCode).toBe(200);
    expect(test.json()).toMatchObject({ ok: true, message: 'Connected to O2IAS_CMS' });

    const list = await app.inject({ method: 'POST', url: '/api/setup/database/list-databases', payload });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ databases: ['O2IAS_CMS', 'OtherDb'] });

    const provision = await app.inject({ method: 'POST', url: '/api/setup/database/provision', payload });
    expect(provision.statusCode).toBe(200);
    expect(provision.json()).toMatchObject({ ok: true, createdDatabase: true, createdUser: true, nextStep: 'schema' });

    const saved = await setupSettingsStore.getDatabaseSettings() as DatabaseSettings;
    expect(saved).toMatchObject({ host: 'db.example.test', port: 3307, database: 'O2IAS_CMS', user: 'oxygen_cms' });

    const schema = await app.inject({ method: 'POST', url: '/api/setup/database/apply-schema' });
    expect(schema.statusCode).toBe(200);
    expect(schema.json()).toMatchObject({ ok: true, appliedVersions: ['0.01'], targetSchemaVersion: '0.01', nextStep: 'admin' });

    expect(calls).toEqual([
      'test:O2IAS_CMS:oxygen_cms',
      'list:db.example.test:3307',
      'provision:existing-mysql:O2IAS_CMS:root',
      'schema:O2IAS_CMS:root'
    ]);

    expect(await setupSettingsStore.getSchemaDatabaseSettings()).toBeNull();

    await app.close();
  });
});
