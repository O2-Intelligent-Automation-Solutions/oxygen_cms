import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import type { AppConfig } from '../config/loadConfig.js';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { QueueJobGuardError } from './retryPolicy.js';

export type DatabaseBackupResult = {
  task: 'backup-database';
  artifactDirectory: string;
  databaseDumpPath: string;
  manifestPath: string;
  createdAt: string;
  database: string;
  dumpBytes: number;
  cleanup: {
    removed: string[];
    skipped: string[];
  };
  warnings: string[];
};

export type DatabaseBackupRunner = {
  backupDatabase(): Promise<DatabaseBackupResult>;
};

export type DatabaseDumpExecutor = (settings: DatabaseSettings, targetPath: string) => Promise<{ bytes?: number; warnings?: string[] }>;

function timestampForPath(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function resolveUnderBase(baseDirectory: string, childName: string) {
  const base = resolve(baseDirectory);
  const target = resolve(base, childName);
  const rel = relative(base, target);
  if (rel.startsWith('..') || rel === '' || rel.includes('..')) throw new QueueJobGuardError('Backup artifact path escaped configured backup directory.');
  return { base, target };
}

function isTimestampedBackupDirectory(name: string) {
  return /^\d{8}T\d{6}Z$/.test(name);
}

async function cleanupBackupArtifacts(baseDirectory: string, currentDirectory: string, retentionDays: number, maxArtifacts: number) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  const skipped: string[] = [];
  const entries = await readdir(baseDirectory, { withFileTypes: true }).catch(() => []);
  const directories = (await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => isTimestampedBackupDirectory(entry.name))
    .map(async (entry) => {
      const path = join(baseDirectory, entry.name);
      const info = await stat(path);
      return { name: entry.name, path, mtimeMs: info.mtimeMs };
    })))
    .sort((a, b) => b.name.localeCompare(a.name));
  const keep = new Set(directories.slice(0, maxArtifacts).map((entry) => entry.path));
  for (const entry of directories) {
    if (entry.path === currentDirectory) continue;
    if (entry.mtimeMs >= cutoff && keep.has(entry.path)) continue;
    try {
      await rm(entry.path, { recursive: true, force: true });
      removed.push(entry.name);
    } catch (error) {
      skipped.push(`${entry.name}: ${error instanceof Error ? error.message : 'cleanup failed'}`);
    }
  }
  return { removed, skipped };
}

async function defaultMysqlDumpExecutor(settings: DatabaseSettings, targetPath: string) {
  const args = [
    `--host=${settings.host}`,
    `--port=${settings.port}`,
    `--user=${settings.user}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    settings.database
  ];
  const child = spawn('mysqldump', args, {
    env: { ...process.env, MYSQL_PWD: settings.password },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitPromise = new Promise<void>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('close', (code) => {
      if (code === 0) resolveExit();
      else rejectExit(new Error(`mysqldump exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
  });
  await Promise.all([
    pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(targetPath)),
    exitPromise
  ]);
  const file = await stat(targetPath);
  return { bytes: file.size, warnings: stderr.trim() ? [stderr.trim()] : [] };
}

export function createDatabaseBackupRunner(config: AppConfig, settingsProvider: { getDatabaseSettings(): Promise<DatabaseSettings | null>; isSchemaCurrent(): Promise<boolean> }, dumpExecutor: DatabaseDumpExecutor = defaultMysqlDumpExecutor): DatabaseBackupRunner {
  return {
    async backupDatabase() {
      if (!config.backups.enabled) throw new QueueJobGuardError('Database backup jobs require CMS_BACKUP_JOBS_ENABLED=true.');
      const settings = await settingsProvider.getDatabaseSettings();
      const schemaCurrent = await settingsProvider.isSchemaCurrent();
      if (!settings || !schemaCurrent) throw new QueueJobGuardError('Database backup jobs require configured current CMS database settings.');

      const createdAt = new Date().toISOString();
      const stamp = timestampForPath(new Date(createdAt));
      const { base: backupRoot, target: artifactDirectory } = resolveUnderBase(config.backups.directory, stamp);
      await mkdir(artifactDirectory, { recursive: true, mode: 0o700 });

      const databaseDumpPath = join(artifactDirectory, 'mysql.sql.gz');
      const manifestPath = join(artifactDirectory, 'manifest.json');
      const dump = await dumpExecutor(settings, databaseDumpPath);
      const dumpStat = await stat(databaseDumpPath).catch(() => null);
      const warnings = [...(dump.warnings ?? [])];
      if (config.backups.includeAppData) warnings.push('App-data artifact packaging is not included in this first queued backup runner slice.');
      const dumpBytes = dump.bytes ?? dumpStat?.size ?? 0;
      const cleanup = await cleanupBackupArtifacts(backupRoot, artifactDirectory, config.backups.retentionDays, config.backups.maxArtifacts);
      const manifest = {
        createdAt,
        task: 'backup-database',
        database: settings.database,
        host: settings.host,
        port: settings.port,
        artifacts: {
          databaseDump: 'mysql.sql.gz',
          appData: null
        },
        retention: {
          days: config.backups.retentionDays,
          maxArtifacts: config.backups.maxArtifacts
        },
        cleanup,
        warnings
      };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      return { task: 'backup-database', artifactDirectory, databaseDumpPath, manifestPath, createdAt, database: settings.database, dumpBytes, cleanup, warnings };
    }
  };
}

export function createSetupAwareDatabaseBackupRunner(config: AppConfig, setupSettingsStore: SetupSettingsStore, dumpExecutor?: DatabaseDumpExecutor): DatabaseBackupRunner {
  return createDatabaseBackupRunner(config, setupSettingsStore, dumpExecutor);
}
