import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileSetupSettingsStore } from '../src/setup/fileSetupSettingsStore.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('file setup settings store', () => {
  it('persists database connection settings for the setup wizard', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-settings-'));
    tempDirs.push(dir);
    const store = createFileSetupSettingsStore(join(dir, 'settings.json'));

    await store.saveDatabaseSettings({
      host: 'db.example.com',
      port: 3306,
      database: 'O2IAS_CMS',
      user: 'oxygen_cms_app',
      password: 'StrongPassword!42'
    });

    await expect(store.getDatabaseSettings()).resolves.toEqual({
      host: 'db.example.com',
      port: 3306,
      database: 'O2IAS_CMS',
      user: 'oxygen_cms_app',
      password: 'StrongPassword!42'
    });
  });
});
