import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';
import { createDatabaseBackupRunner } from '../src/queues/databaseBackupRunner.js';
import type { DatabaseSettings } from '../src/setup/fileSetupSettingsStore.js';

const settings: DatabaseSettings = {
  host: 'mysql.internal',
  port: 3306,
  database: 'O2IAS_CMS',
  user: 'oxygen_cms',
  password: 'super-secret'
};

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempBackupDir() {
  const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-backups-'));
  tempDirs.push(dir);
  return dir;
}

function settingsProvider(current = true) {
  return {
    getDatabaseSettings: vi.fn(async () => settings),
    isSchemaCurrent: vi.fn(async () => current)
  };
}

describe('database backup runner', () => {
  it('requires the explicit backup jobs opt-in before writing artifacts', async () => {
    const directory = await tempBackupDir();
    const executor = vi.fn(async () => ({ bytes: 0 }));
    const runner = createDatabaseBackupRunner(loadConfig({ CMS_BACKUP_DIR: directory }), settingsProvider(), executor);

    await expect(runner.backupDatabase()).rejects.toThrow('CMS_BACKUP_JOBS_ENABLED=true');
    expect(executor).not.toHaveBeenCalled();
  });

  it('creates a timestamped dump artifact and non-secret manifest when enabled', async () => {
    const directory = await tempBackupDir();
    const executor = vi.fn(async (_settings: DatabaseSettings, targetPath: string) => {
      await writeFile(targetPath, 'compressed dump bytes', 'utf8');
      return { warnings: ['mysqldump warning'] };
    });
    const runner = createDatabaseBackupRunner(loadConfig({
      CMS_BACKUP_JOBS_ENABLED: 'true',
      CMS_BACKUP_DIR: directory,
      CMS_BACKUP_RETENTION_DAYS: '7',
      CMS_BACKUP_MAX_ARTIFACTS: '3',
      CMS_BACKUP_INCLUDE_APP_DATA: 'true'
    }), settingsProvider(), executor);

    const result = await runner.backupDatabase();
    expect(result.task).toBe('backup-database');
    expect(result.artifactDirectory.startsWith(directory)).toBe(true);
    expect(result.databaseDumpPath.endsWith('/mysql.sql.gz')).toBe(true);
    expect(result.dumpBytes).toBeGreaterThan(0);
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ database: 'O2IAS_CMS', password: 'super-secret' }), result.databaseDumpPath);

    const manifestText = await readFile(result.manifestPath, 'utf8');
    expect(manifestText).not.toContain('super-secret');
    const manifest = JSON.parse(manifestText) as { database: string; artifacts: { databaseDump: string; appData: null }; retention: { days: number; maxArtifacts: number }; warnings: string[] };
    expect(manifest).toMatchObject({
      database: 'O2IAS_CMS',
      artifacts: { databaseDump: 'mysql.sql.gz', appData: null },
      retention: { days: 7, maxArtifacts: 3 }
    });
    expect(manifest.warnings).toEqual(expect.arrayContaining(['mysqldump warning', expect.stringContaining('App-data artifact packaging')]));
  });

  it('requires current configured database settings', async () => {
    const directory = await tempBackupDir();
    const runner = createDatabaseBackupRunner(loadConfig({ CMS_BACKUP_JOBS_ENABLED: 'true', CMS_BACKUP_DIR: directory }), settingsProvider(false), vi.fn());

    await expect(runner.backupDatabase()).rejects.toThrow('configured current CMS database settings');
  });
});
