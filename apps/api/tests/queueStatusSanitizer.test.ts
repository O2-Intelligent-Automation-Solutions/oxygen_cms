import { describe, expect, it } from 'vitest';
import { summarizeSafeQueueJobResult } from '../src/queues/queueStatus.js';

describe('queue job result sanitizer', () => {
  it('summarizes database table-maintenance results without exposing raw rows', () => {
    const summary = summarizeSafeQueueJobResult('database-maintenance', 'analyze-tables', {
      task: 'analyze-tables',
      tables: ['application_logs', 'application_settings'],
      results: [
        { tableName: 'application_logs', message: 'raw result should not be surfaced' }
      ],
      warnings: ['application_settings: warning'],
      password: 'NeverExposeMe!'
    });

    expect(summary).toEqual({
      task: 'analyze-tables',
      tableCount: 2,
      warningCount: 1,
      artifactCount: null,
      summary: '2 tables · 1 warning'
    });
    expect(JSON.stringify(summary)).not.toMatch(/NeverExposeMe|raw result|application_logs/);
  });

  it('summarizes backup artifacts by count and size without exposing paths', () => {
    const summary = summarizeSafeQueueJobResult('database-maintenance', 'backup-database', {
      task: 'backup-database',
      databaseDumpPath: '/srv/oxygen/deploy/backups/20260625T120000Z/mysql.sql.gz',
      appDataArchivePath: '/srv/oxygen/deploy/backups/20260625T120000Z/app-data.tar.gz',
      manifestPath: '/srv/oxygen/deploy/backups/20260625T120000Z/manifest.json',
      artifactDirectory: '/srv/oxygen/deploy/backups/20260625T120000Z',
      dumpBytes: 2048,
      appDataBytes: 4096,
      warnings: [],
      password: 'NeverExposeMe!'
    });

    expect(summary).toEqual({
      task: 'backup-database',
      tableCount: null,
      warningCount: 0,
      artifactCount: 3,
      summary: '0 warnings · 3 artifacts · dump 2048 bytes · app data 4096 bytes'
    });
    expect(JSON.stringify(summary)).not.toMatch(/\/srv\/oxygen|20260625T120000Z|NeverExposeMe|artifactDirectory/);
  });

  it('ignores non-database-maintenance return values', () => {
    expect(summarizeSafeQueueJobResult('instance-checks', 'manual-instance-check', { task: 'manual-instance-check' })).toBeUndefined();
  });
});
