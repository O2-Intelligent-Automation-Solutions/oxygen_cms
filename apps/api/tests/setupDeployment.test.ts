import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createFileSetupStatusProvider } from '../src/setup/setupStatus.js';
import { createFileSetupSettingsStore } from '../src/setup/fileSetupSettingsStore.js';
import type { DatabaseProvisioner } from '../src/setup/databaseProvisioner.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('setup deployment capabilities', () => {
  it('reports managed self-contained MySQL capability without exposing credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-deployment-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));

    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      deploymentConfig: {
        mode: 'self-contained',
        managedMysql: true,
        mysql: {
          host: 'mysql',
          port: 3306,
          database: 'O2IAS_CMS',
          applicationUser: 'oxygen_cms',
          applicationPassword: 'AppPasswordShouldNotLeak!42',
          privilegedUser: 'root',
          privilegedPassword: 'RootPasswordShouldNotLeak!42'
        }
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/setup/deployment' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mode: 'self-contained',
      managedMysql: true,
      mysql: {
        host: 'mysql',
        port: 3306,
        database: 'O2IAS_CMS',
        applicationUser: 'oxygen_cms'
      }
    });
    expect(response.body).not.toContain('RootPasswordShouldNotLeak');
    expect(response.body).not.toContain('AppPasswordShouldNotLeak');

    await app.close();
  });

  it('provisions managed MySQL using deployment secrets and saves application credentials', async () => {
    const calls: string[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-managed-provision-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));
    const databaseProvisioner: DatabaseProvisioner = {
      async testConnection() { return { ok: true, message: 'ok' }; },
      async listDatabases() { return []; },
      async provision(input) {
        calls.push(`${input.mode}:${input.settings.host}:${input.settings.user}:${input.adminUser}`);
        return { settings: input.settings, createdDatabase: true, createdUser: true };
      },
      async applySchema(settings) {
        calls.push(`schema:${settings.user}`);
        return { appliedVersions: ['0.01'], targetSchemaVersion: '0.01' };
      }
    };

    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner,
      deploymentConfig: {
        mode: 'self-contained',
        managedMysql: true,
        mysql: {
          host: 'mysql',
          port: 3306,
          database: 'O2IAS_CMS',
          applicationUser: 'oxygen_cms',
          applicationPassword: 'ManagedAppPassword!42',
          privilegedUser: 'root',
          privilegedPassword: 'ManagedRootPassword!42'
        }
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/setup/database/provision-managed' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, mode: 'self-contained', database: 'O2IAS_CMS', nextStep: 'schema' });

    const saved = await setupSettingsStore.getDatabaseSettings();
    expect(saved).toMatchObject({ host: 'mysql', database: 'O2IAS_CMS', user: 'oxygen_cms' });
    expect(saved?.password).toBe('ManagedAppPassword!42');

    const schema = await app.inject({ method: 'POST', url: '/api/setup/database/apply-schema' });
    expect(schema.statusCode).toBe(200);
    expect(calls).toEqual(['local-mysql:mysql:oxygen_cms:root', 'schema:root']);

    await app.close();
  });

  it('applies schema from deployment database settings when setup settings are not saved', async () => {
    const calls: string[] = [];
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-managed-schema-fallback-'));
    tempDirs.push(dir);
    const setupSettingsStore = createFileSetupSettingsStore(join(dir, 'settings.json'));
    const databaseProvisioner: DatabaseProvisioner = {
      async testConnection() { return { ok: true, message: 'ok' }; },
      async listDatabases() { return []; },
      async provision(input) { return { settings: input.settings, createdDatabase: true, createdUser: true }; },
      async applySchema(settings) {
        calls.push(`schema:${settings.host}:${settings.database}:${settings.user}`);
        return { appliedVersions: ['0.19'], targetSchemaVersion: '0.19' };
      }
    };

    const app = await buildApp({
      logger: false,
      authRepository: createInMemoryAuthRepository(),
      setupSettingsStore,
      setupStatusProvider: createFileSetupStatusProvider(setupSettingsStore),
      databaseProvisioner,
      deploymentConfig: {
        mode: 'self-contained',
        managedMysql: true,
        mysql: {
          host: 'mysql',
          port: 3306,
          database: 'O2IAS_CMS',
          applicationUser: 'oxygen_cms',
          applicationPassword: 'ManagedAppPassword!42',
          privilegedUser: 'root',
          privilegedPassword: 'ManagedRootPassword!42'
        }
      }
    });

    const schema = await app.inject({ method: 'POST', url: '/api/setup/database/apply-schema' });
    expect(schema.statusCode).toBe(200);
    expect(schema.json()).toMatchObject({ ok: true, database: 'O2IAS_CMS', appliedVersions: ['0.19'] });
    expect(calls).toEqual(['schema:mysql:O2IAS_CMS:root']);

    await app.close();
  });
});
