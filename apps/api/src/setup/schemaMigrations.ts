export type SchemaVersion = string;

export type SchemaMigration = {
  version: SchemaVersion;
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

function compareSchemaVersions(left: SchemaVersion, right: SchemaVersion) {
  const leftParts = left.split('.').map((part) => Number(part));
  const rightParts = right.split('.').map((part) => Number(part));
  const maxLength = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.localeCompare(right);
}

export async function applySchemaMigrations(adapter: SchemaMigrationAdapter, migrations: SchemaMigration[]) {
  await adapter.ensureVersionTable();
  const applied = new Set((await adapter.getAppliedVersions()).map((version) => String(version)));
  const orderedMigrations = [...migrations].sort((left, right) => compareSchemaVersions(left.version, right.version));

  for (const migration of orderedMigrations) {
    if (applied.has(String(migration.version))) continue;
    await adapter.applyMigration(migration);
    await adapter.recordMigration(migration);
    applied.add(String(migration.version));
  }
}
