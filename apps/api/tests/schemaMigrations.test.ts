import { describe, expect, it } from 'vitest';
import { applySchemaMigrations, type SchemaMigration, type SchemaMigrationAdapter } from '../src/setup/schemaMigrations.js';

describe('schema migration runner', () => {
  it('creates the schema version table and applies pending migrations in order', async () => {
    const calls: string[] = [];
    const applied: string[] = [];
    const migrations: SchemaMigration[] = [
      { version: 1, name: 'create security tables', checksum: 'abc123', upSql: 'create table users (id varchar(36));' },
      { version: 2, name: 'add instances', checksum: 'def456', upSql: 'create table instances (id varchar(36));' }
    ];
    const adapter: SchemaMigrationAdapter = {
      async ensureVersionTable() { calls.push('ensureVersionTable'); },
      async getAppliedVersions() { return applied; },
      async applyMigration(migration) { calls.push(`apply:${migration.version}`); },
      async recordMigration(migration) { calls.push(`record:${migration.version}`); applied.push(String(migration.version)); }
    };

    await applySchemaMigrations(adapter, migrations);

    expect(calls).toEqual([
      'ensureVersionTable',
      'apply:1',
      'record:1',
      'apply:2',
      'record:2'
    ]);
  });
});
