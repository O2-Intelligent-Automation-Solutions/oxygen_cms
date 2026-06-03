import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { normalizeOxyGenEndpoint } from './inMemoryInstanceRepository.js';
import type { ConnectivityResult, CreateInstanceInput, InstanceProtocol, InstanceRepository, InstanceStatus, OxyGenInstance, UpdateInstanceInput } from './types.js';

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

function parseJson(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function cleanNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

type InstanceRow = RowDataPacket & {
  id: string;
  name: string;
  description: string | null;
  tenant_id: string | null;
  protocol: InstanceProtocol;
  host: string;
  port: number | null;
  hostname: string;
  base_url: string;
  launch_url: string;
  api_base_url: string;
  username: string;
  password_secret: string;
  group_id: string;
  polling_interval_seconds: number;
  is_enabled: number | boolean;
  availability_status: InstanceStatus | null;
  ssl_valid: number | boolean | null;
  ssl_expires_at: Date | string | null;
  last_checked_at: Date | string | null;
  last_success_at: Date | string | null;
  last_failure_at: Date | string | null;
  uptime_percent_24h: string | number | null;
  uptime_percent_7d: string | number | null;
  response_time_ms: number | null;
  last_error: string | null;
  processing_status: OxyGenInstance['processingStatus'] | null;
  emm_queue_status: OxyGenInstance['emmQueueStatus'] | null;
  sms_status: OxyGenInstance['smsStatus'] | null;
  hangfire_status: OxyGenInstance['hangfireStatus'] | null;
  license_key: string | null;
  license_status: OxyGenInstance['licenseStatus'] | null;
  license_json: unknown | null;
  settings_json: unknown | null;
  workflow_summary_json: unknown | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapInstance(row: InstanceRow): OxyGenInstance {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tenantId: row.tenant_id,
    protocol: row.protocol,
    host: row.host,
    port: nullableNumber(row.port),
    hostname: row.hostname,
    baseUrl: row.base_url,
    launchUrl: row.launch_url,
    apiBaseUrl: row.api_base_url,
    username: row.username,
    groupId: row.group_id,
    pollingIntervalSeconds: Number(row.polling_interval_seconds),
    isEnabled: Boolean(row.is_enabled),
    status: row.availability_status ?? 'unknown',
    sslValid: row.ssl_valid === null || row.ssl_valid === undefined ? null : Boolean(row.ssl_valid),
    sslExpiresAt: nullableIso(row.ssl_expires_at),
    lastCheckedAt: nullableIso(row.last_checked_at),
    lastSuccessAt: nullableIso(row.last_success_at),
    lastFailureAt: nullableIso(row.last_failure_at),
    uptimePercent24h: nullableNumber(row.uptime_percent_24h),
    uptimePercent7d: nullableNumber(row.uptime_percent_7d),
    responseTimeMs: nullableNumber(row.response_time_ms),
    lastError: row.last_error,
    processingStatus: row.processing_status ?? 'unknown',
    emmQueueStatus: row.emm_queue_status ?? 'unknown',
    smsStatus: row.sms_status ?? 'unknown',
    hangfireStatus: row.hangfire_status ?? 'unknown',
    licenseKey: row.license_key,
    licenseStatus: row.license_status ?? 'unknown',
    licenseJson: parseJson(row.license_json),
    settingsJson: parseJson(row.settings_json),
    workflowSummaryJson: parseJson(row.workflow_summary_json),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

const instanceSelectSql = `
  SELECT
    i.*,
    s.availability_status,
    s.ssl_valid,
    s.ssl_expires_at,
    s.last_checked_at,
    s.last_success_at,
    s.last_failure_at,
    s.uptime_percent_24h,
    s.uptime_percent_7d,
    s.response_time_ms,
    s.last_error,
    s.processing_status,
    s.emm_queue_status,
    s.sms_status,
    s.hangfire_status,
    s.license_key,
    s.license_status,
    s.license_json,
    s.settings_json,
    s.workflow_summary_json
  FROM oxygen_instances i
  LEFT JOIN oxygen_instance_status s ON s.instance_id = i.id
`;

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
    const row = await one<InstanceRow>(`${instanceSelectSql} WHERE i.id = ? LIMIT 1`, [instanceId]);
    return row ? mapInstance(row) : null;
  }

  async function assertGroupExists(groupId: string) {
    const row = await one<RowDataPacket>('SELECT id FROM user_groups WHERE id = ? LIMIT 1', [groupId]);
    if (!row) throw new Error(`Unknown group: ${groupId}`);
  }

  async function assertTenantExists(tenantId: string | null | undefined) {
    if (!tenantId) return;
    const row = await one<RowDataPacket>('SELECT id FROM tenants WHERE id = ? LIMIT 1', [tenantId]);
    if (!row) throw new Error(`Unknown tenant: ${tenantId}`);
  }

  function duplicateInstanceNameError(error: unknown) {
    if (isDuplicateEntry(error)) return new Error('An instance with this name already exists.');
    return error;
  }

  return {
    async createInstance(input: CreateInstanceInput) {
      await assertGroupExists(input.groupId);
      await assertTenantExists(input.tenantId);
      const normalized = normalizeOxyGenEndpoint(input);
      const id = randomUUID();
      try {
        await pool.execute(
          `INSERT INTO oxygen_instances
           (id, name, description, tenant_id, protocol, host, port, hostname, base_url, launch_url, api_base_url, username, password_secret, group_id, polling_interval_seconds, is_enabled, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown')`,
          [
            id,
            input.name.trim(),
            cleanNullableText(input.description),
            input.tenantId ?? null,
            normalized.protocol,
            normalized.host,
            normalized.port,
            normalized.hostname,
            normalized.baseUrl,
            normalized.launchUrl,
            normalized.apiBaseUrl,
            input.username.trim(),
            input.password,
            input.groupId,
            input.pollingIntervalSeconds ?? 300,
            input.isEnabled ?? true
          ]
        );
        await pool.execute('INSERT INTO oxygen_instance_status (instance_id, availability_status) VALUES (?, ?)', [id, 'unknown']);
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
      await assertTenantExists(input.tenantId);
      const normalized = normalizeOxyGenEndpoint(input);
      const passwordSql = input.password ? ', password_secret = ?' : '';
      const params: unknown[] = [
        input.name.trim(),
        cleanNullableText(input.description),
        input.tenantId ?? null,
        normalized.protocol,
        normalized.host,
        normalized.port,
        normalized.hostname,
        normalized.baseUrl,
        normalized.launchUrl,
        normalized.apiBaseUrl,
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
           SET name = ?, description = ?, tenant_id = ?, protocol = ?, host = ?, port = ?, hostname = ?, base_url = ?, launch_url = ?, api_base_url = ?, username = ?, group_id = ?, polling_interval_seconds = ?, is_enabled = ?${passwordSql}
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
        return (await many<InstanceRow>(`${instanceSelectSql} ORDER BY i.name ASC`)).map(mapInstance);
      }
      const groupIds = scope?.groupIds ?? [];
      if (groupIds.length === 0) return [];
      const placeholders = groupIds.map(() => '?').join(', ');
      return (await many<InstanceRow>(`${instanceSelectSql} WHERE i.group_id IN (${placeholders}) ORDER BY i.name ASC`, groupIds)).map(mapInstance);
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
