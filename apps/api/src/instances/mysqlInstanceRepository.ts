import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { normalizeOxyGenUrl } from './inMemoryInstanceRepository.js';
import type { ConnectivityResult, CreateInstanceInput, InstanceRepository, InstanceStatus, OxyGenInstance, UpdateInstanceInput } from './types.js';

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')).toISOString();
  return nowIso();
}

function nullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

type InstanceRow = RowDataPacket & {
  id: string;
  name: string;
  hostname: string;
  base_url: string;
  launch_url: string;
  username: string;
  password_secret: string;
  group_id: string;
  polling_interval_seconds: number;
  is_enabled: number | boolean;
  status: InstanceStatus;
  last_checked_at: Date | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapInstance(row: InstanceRow): OxyGenInstance {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    baseUrl: row.base_url,
    launchUrl: row.launch_url,
    username: row.username,
    groupId: row.group_id,
    pollingIntervalSeconds: Number(row.polling_interval_seconds),
    isEnabled: Boolean(row.is_enabled),
    status: row.status,
    lastCheckedAt: nullableIso(row.last_checked_at),
    lastError: row.last_error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function createPoolFromDatabaseSettings(settings: DatabaseSettings): Pool {
  return createPool({
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    connectionLimit: 10
  });
}

function isDuplicateEntry(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

export function createMysqlInstanceRepository(pool: Pool): InstanceRepository {
  async function one<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | null> {
    const [rows] = await pool.execute<T[]>(sql, params as never[]);
    return rows[0] ?? null;
  }

  async function many<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await pool.execute<T[]>(sql, params as never[]);
    return rows;
  }

  async function findInstanceById(instanceId: string) {
    const row = await one<InstanceRow>('SELECT * FROM oxygen_instances WHERE id = ? LIMIT 1', [instanceId]);
    return row ? mapInstance(row) : null;
  }

  async function assertGroupExists(groupId: string) {
    const row = await one<RowDataPacket>('SELECT id FROM user_groups WHERE id = ? LIMIT 1', [groupId]);
    if (!row) throw new Error(`Unknown group: ${groupId}`);
  }

  function duplicateInstanceNameError(error: unknown) {
    if (isDuplicateEntry(error)) return new Error('An instance with this name already exists.');
    return error;
  }

  return {
    async createInstance(input: CreateInstanceInput) {
      await assertGroupExists(input.groupId);
      const normalized = normalizeOxyGenUrl(input.hostname);
      const id = randomUUID();
      try {
        await pool.execute(
          `INSERT INTO oxygen_instances
           (id, name, hostname, base_url, launch_url, username, password_secret, group_id, polling_interval_seconds, is_enabled, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown')`,
          [
            id,
            input.name.trim(),
            normalized.hostname,
            normalized.baseUrl,
            normalized.launchUrl,
            input.username.trim(),
            input.password,
            input.groupId,
            input.pollingIntervalSeconds ?? 300,
            input.isEnabled ?? true
          ]
        );
      } catch (error) {
        throw duplicateInstanceNameError(error);
      }
      const instance = await findInstanceById(id);
      if (!instance) throw new Error('Instance not found.');
      return instance;
    },

    async updateInstance(instanceId: string, input: UpdateInstanceInput) {
      const existing = await findInstanceById(instanceId);
      if (!existing) throw new Error('Instance not found.');
      await assertGroupExists(input.groupId);
      const normalized = normalizeOxyGenUrl(input.hostname);
      const passwordSql = input.password ? ', password_secret = ?' : '';
      const params: unknown[] = [
        input.name.trim(),
        normalized.hostname,
        normalized.baseUrl,
        normalized.launchUrl,
        input.username.trim(),
        input.groupId,
        input.pollingIntervalSeconds ?? existing.pollingIntervalSeconds,
        input.isEnabled ?? existing.isEnabled
      ];
      if (input.password) params.push(input.password);
      params.push(instanceId);

      try {
        await pool.execute(
          `UPDATE oxygen_instances
           SET name = ?, hostname = ?, base_url = ?, launch_url = ?, username = ?, group_id = ?, polling_interval_seconds = ?, is_enabled = ?${passwordSql}
           WHERE id = ?`,
          params as never[]
        );
      } catch (error) {
        throw duplicateInstanceNameError(error);
      }
      const instance = await findInstanceById(instanceId);
      if (!instance) throw new Error('Instance not found.');
      return instance;
    },

    async deleteInstance(instanceId: string) {
      const [result] = await pool.execute('DELETE FROM oxygen_instances WHERE id = ?', [instanceId]);
      if ('affectedRows' in result && result.affectedRows === 0) throw new Error('Instance not found.');
    },

    async listInstances(scope) {
      if (scope?.includeAll) {
        return (await many<InstanceRow>('SELECT * FROM oxygen_instances ORDER BY name ASC')).map(mapInstance);
      }
      const groupIds = scope?.groupIds ?? [];
      if (groupIds.length === 0) return [];
      const placeholders = groupIds.map(() => '?').join(', ');
      return (await many<InstanceRow>(`SELECT * FROM oxygen_instances WHERE group_id IN (${placeholders}) ORDER BY name ASC`, groupIds)).map(mapInstance);
    },

    getInstance: findInstanceById,

    async testConnectivity(instanceId: string): Promise<ConnectivityResult> {
      if (!(await findInstanceById(instanceId))) throw new Error('Instance not found.');
      return {
        ok: true,
        status: 'not-tested',
        message: 'Connectivity test scaffold is ready; live OxyGen checks will be wired in the monitoring slice.',
        checkedAt: nowIso()
      };
    }
  };
}

export function createSetupAwareInstanceRepository(settingsStore: SetupSettingsStore, fallback: InstanceRepository): InstanceRepository {
  let cachedKey: string | null = null;
  let cachedRepository: InstanceRepository | null = null;
  let cachedPool: Pool | null = null;

  async function currentRepository() {
    const [databaseSettings, schemaCurrent] = await Promise.all([
      settingsStore.getDatabaseSettings(),
      settingsStore.isSchemaCurrent()
    ]);
    if (!databaseSettings || !schemaCurrent) return fallback;
    const key = JSON.stringify(databaseSettings);
    if (cachedRepository && cachedKey === key) return cachedRepository;
    if (cachedPool) await cachedPool.end();
    cachedPool = createPoolFromDatabaseSettings(databaseSettings);
    cachedRepository = createMysqlInstanceRepository(cachedPool);
    cachedKey = key;
    return cachedRepository;
  }

  return new Proxy({} as InstanceRepository, {
    get(_target, property: keyof InstanceRepository) {
      return async (...args: never[]) => {
        const repository = await currentRepository();
        const method = repository[property] as (...methodArgs: never[]) => unknown;
        return method(...args);
      };
    }
  });
}
