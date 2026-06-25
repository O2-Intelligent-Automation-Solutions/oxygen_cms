import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
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

async function createExistingBackup(directory: string, name: string, ageDays = 0) {
  const path = join(directory, name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'mysql.sql.gz'), 'old backup', 'utf8');
  if (ageDays > 0) {
    const timestamp = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
    await utimes(path, timestamp, timestamp);
  }
  return path;
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
    const manifest = JSON.parse(manifestText) as { database: string; artifacts: { databaseDump: string; appData: string | null }; retention: { days: number; maxArtifacts: number }; cleanup: { removed: string[]; skipped: string[] }; warnings: string[] };
    expect(manifest).toMatchObject({
      database: 'O2IAS_CMS',
      artifacts: { databaseDump: 'mysql.sql.gz', appData: 'app-data.tar.gz' },
      retention: { days: 7, maxArtifacts: 3 },
      cleanup: { removed: [], skipped: [] }
    });
    expect(manifest.warnings).toEqual(expect.arrayContaining(['mysqldump warning', expect.stringContaining('App-data source directory was not configured')]));
  });

  it('packages app data when an app-data source directory is configured', async () => {
    const directory = await tempBackupDir();
    const appDataDirectory = await tempBackupDir();
    await writeFile(join(appDataDirectory, 'settings.json'), '{"ok":true}', 'utf8');
    const executor = vi.fn(async (_settings: DatabaseSettings, targetPath: string) => {
      await writeFile(targetPath, 'compressed dump bytes', 'utf8');
      return {};
    });
    const archiver = vi.fn(async (_sourceDirectory: string, targetPath: string) => {
      await writeFile(targetPath, 'compressed app data', 'utf8');
      return { warnings: ['app data warning'] };
    });
    const runner = createDatabaseBackupRunner(loadConfig({
      CMS_BACKUP_JOBS_ENABLED: 'true',
      CMS_BACKUP_DIR: directory,
      CMS_BACKUP_INCLUDE_APP_DATA: 'true'
    }), settingsProvider(), executor, { appDataDirectory, appDataArchiver: archiver });

    const result = await runner.backupDatabase();
    expect(result.appDataArchivePath?.endsWith('/app-data.tar.gz')).toBe(true);
    expect(result.appDataBytes).toBeGreaterThan(0);
    expect(archiver).toHaveBeenCalledWith(appDataDirectory, result.appDataArchivePath);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8')) as { artifacts: { appData: string | null }; warnings: string[] };
    expect(manifest.artifacts.appData).toBe('app-data.tar.gz');
    expect(manifest.warnings).toContain('app data warning');
  });

  it('cleans up old backup artifacts only after a successful backup', async () => {
    const directory = await tempBackupDir();
    await createExistingBackup(directory, '20240101T000000Z', 60);
    await createExistingBackup(directory, '20240102T000000Z', 59);
    await createExistingBackup(directory, '20240103T000000Z', 58);
    await createExistingBackup(directory, 'not-a-backup-directory', 90);
    const executor = vi.fn(async (_settings: DatabaseSettings, targetPath: string) => {
      await writeFile(targetPath, 'new dump', 'utf8');
      return {};
    });
    const runner = createDatabaseBackupRunner(loadConfig({
      CMS_BACKUP_JOBS_ENABLED: 'true',
      CMS_BACKUP_DIR: directory,
      CMS_BACKUP_RETENTION_DAYS: '30',
      CMS_BACKUP_MAX_ARTIFACTS: '2',
      CMS_BACKUP_INCLUDE_APP_DATA: 'false'
    }), settingsProvider(), executor);

    const result = await runner.backupDatabase();
    expect(result.cleanup.removed).toEqual(expect.arrayContaining(['20240101T000000Z', '20240102T000000Z']));
    expect(result.cleanup.removed).not.toContain(result.artifactDirectory);
    const remaining = await readdir(directory);
    expect(remaining).toContain('not-a-backup-directory');
    expect(remaining).not.toContain('20240101T000000Z');
    expect(remaining).not.toContain('20240102T000000Z');
    await expect(stat(result.artifactDirectory)).resolves.toBeTruthy();
  });

  it('does not clean up older artifacts when the dump fails', async () => {
    const directory = await tempBackupDir();
    await createExistingBackup(directory, '20240101T000000Z', 60);
    const runner = createDatabaseBackupRunner(loadConfig({
      CMS_BACKUP_JOBS_ENABLED: 'true',
      CMS_BACKUP_DIR: directory,
      CMS_BACKUP_RETENTION_DAYS: '30',
      CMS_BACKUP_MAX_ARTIFACTS: '1'
    }), settingsProvider(), vi.fn(async () => { throw new Error('dump failed'); }));

    await expect(runner.backupDatabase()).rejects.toThrow('dump failed');
    const remaining = await readdir(directory);
    expect(remaining).toContain('20240101T000000Z');
  });

  it('requires current configured database settings', async () => {
    const directory = await tempBackupDir();
    const runner = createDatabaseBackupRunner(loadConfig({ CMS_BACKUP_JOBS_ENABLED: 'true', CMS_BACKUP_DIR: directory }), settingsProvider(false), vi.fn());

    await expect(runner.backupDatabase()).rejects.toThrow('configured current CMS database settings');
  });
});
