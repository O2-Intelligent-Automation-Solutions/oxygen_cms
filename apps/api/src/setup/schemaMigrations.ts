export type SchemaMigration = {
  version: number;
  name: string;
  checksum: string;
  upSql: string;
};

export type AppliedSchemaVersion = string | number;

export type SchemaMigrationAdapter = {
  ensureVersionTable(): Promise<void>;
  getAppliedVersions(): Promise<AppliedSchemaVersion[]>;
  applyMigration(migration: SchemaMigration): Promise<void>;
  recordMigration(migration: SchemaMigration): Promise<void>;
};

export async function applySchemaMigrations(adapter: SchemaMigrationAdapter, migrations: SchemaMigration[]) {
  await adapter.ensureVersionTable();
  const applied = new Set((await adapter.getAppliedVersions()).map((version) => String(version)));
  const orderedMigrations = [...migrations].sort((left, right) => left.version - right.version);

  for (const migration of orderedMigrations) {
    if (applied.has(String(migration.version))) continue;
    await adapter.applyMigration(migration);
    await adapter.recordMigration(migration);
    applied.add(String(migration.version));
  }
}
