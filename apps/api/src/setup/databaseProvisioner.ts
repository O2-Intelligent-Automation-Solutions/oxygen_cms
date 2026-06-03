import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { schemaMigrations } from '../db/migrations/index.js';
import { applySchemaMigrations, type SchemaMigration, type SchemaMigrationAdapter } from './schemaMigrations.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';
import type { DatabaseSettings } from './fileSetupSettingsStore.js';

export type DatabaseProvisionInput = {
  mode: 'local-mysql' | 'existing-mysql';
  settings: DatabaseSettings;
  adminUser?: string;
  adminPassword?: string;
};

export type DatabaseTestResult = {
  ok: boolean;
  message: string;
  serverVersion?: string;
};

export type DatabaseProvisionResult = {
  settings: DatabaseSettings;
  createdDatabase: boolean;
  createdUser: boolean;
};

export type SchemaApplyResult = {
  targetSchemaVersion: string;
  appliedVersions: string[];
};

export type DatabaseProvisioner = {
  testConnection(settings: DatabaseSettings): Promise<DatabaseTestResult>;
  listDatabases(settings: DatabaseSettings, adminUser?: string, adminPassword?: string): Promise<string[]>;
  provision(input: DatabaseProvisionInput): Promise<DatabaseProvisionResult>;
  applySchema(settings: DatabaseSettings): Promise<SchemaApplyResult>;
};

function escapeIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, '``')}\``;
}

function escapeUserLiteral(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function createMySqlPool(settings: DatabaseSettings, options: { database?: string | null; user?: string; password?: string } = {}) {
  return createPool({
    host: settings.host,
    port: settings.port,
    user: options.user ?? settings.user,
    password: options.password ?? settings.password,
    database: options.database === undefined ? settings.database : options.database ?? undefined,
    waitForConnections: true,
    connectionLimit: 2,
    multipleStatements: true
  });
}

class MySqlSchemaMigrationAdapter implements SchemaMigrationAdapter {
  constructor(private readonly pool: Pool, private readonly appliedVersions: string[] = []) {}

  async ensureVersionTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cms_schema_versions (
        version VARCHAR(32) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(128) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getAppliedVersions() {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT version FROM cms_schema_versions ORDER BY version ASC');
    return rows.map((row) => String(row.version));
  }

  async applyMigration(migration: SchemaMigration) {
    await this.pool.query(migration.upSql);
    this.appliedVersions.push(migration.version);
  }

  async recordMigration(migration: SchemaMigration) {
    await this.pool.execute(
      'INSERT INTO cms_schema_versions (version, name, checksum) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), checksum = VALUES(checksum)',
      [migration.version, migration.name, migration.checksum]
    );
  }

  getAppliedDuringRun() {
    return [...this.appliedVersions];
  }
}

export function createMysqlDatabaseProvisioner(): DatabaseProvisioner {
  return {
    async testConnection(settings) {
      const pool = createMySqlPool(settings);
      try {
        const [rows] = await pool.query<RowDataPacket[]>('SELECT VERSION() AS version');
        return { ok: true, message: `Connected to MySQL database ${settings.database}.`, serverVersion: String(rows[0]?.version ?? '') };
      } finally {
        await pool.end();
      }
    },

    async listDatabases(settings, adminUser, adminPassword) {
      const pool = createMySqlPool(settings, {
        database: null,
        user: adminUser || settings.user,
        password: adminPassword || settings.password
      });
      try {
        const [rows] = await pool.query<RowDataPacket[]>('SHOW DATABASES');
        return rows.map((row) => String(row.Database)).filter((name) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(name));
      } finally {
        await pool.end();
      }
    },

    async provision(input) {
      const { settings, adminUser, adminPassword } = input;
      if (input.mode === 'existing-mysql') {
        await this.testConnection(settings);
        if (adminUser && adminPassword) {
          await this.testConnection({ ...settings, user: adminUser, password: adminPassword });
        }
        return { settings, createdDatabase: false, createdUser: false };
      }

      if (!adminUser || !adminPassword) {
        await this.testConnection(settings);
        return { settings, createdDatabase: false, createdUser: false };
      }

      const adminPool = createMySqlPool(settings, { database: null, user: adminUser, password: adminPassword });
      try {
        await adminPool.query(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(settings.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await adminPool.query(`CREATE USER IF NOT EXISTS '${escapeUserLiteral(settings.user)}'@'%' IDENTIFIED BY '${escapeUserLiteral(settings.password)}'`);
        await adminPool.query(`ALTER USER '${escapeUserLiteral(settings.user)}'@'%' IDENTIFIED BY '${escapeUserLiteral(settings.password)}'`);
        await adminPool.query(`GRANT ALL PRIVILEGES ON ${escapeIdentifier(settings.database)}.* TO '${escapeUserLiteral(settings.user)}'@'%'`);
        await adminPool.query('FLUSH PRIVILEGES');
      } finally {
        await adminPool.end();
      }

      await this.testConnection(settings);
      return { settings, createdDatabase: true, createdUser: true };
    },

    async applySchema(settings) {
      const pool = createMySqlPool(settings);
      const adapter = new MySqlSchemaMigrationAdapter(pool);
      try {
        await applySchemaMigrations(adapter, schemaMigrations);
        return { targetSchemaVersion: CURRENT_SCHEMA_VERSION, appliedVersions: adapter.getAppliedDuringRun() };
      } finally {
        await pool.end();
      }
    }
  };
}
