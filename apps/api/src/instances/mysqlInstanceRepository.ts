import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { createCredentialCipherFromEnvironment, type CredentialCipher } from './credentialEncryption.js';
import { normalizeOxyGenEndpoint } from './inMemoryInstanceRepository.js';
import { testOxyGenConnectivity } from './oxygenConnectivity.js';
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

export function createMysqlInstanceRepository(pool: Pool, credentialCipher?: CredentialCipher): InstanceRepository {
  function encryptCredential(plaintext: string) {
    return (credentialCipher ?? createCredentialCipherFromEnvironment()).encrypt(plaintext);
  }

  function decryptCredential(secret: string) {
    try {
      return (credentialCipher ?? createCredentialCipherFromEnvironment()).decrypt(secret);
    } catch (error) {
      if (error instanceof Error && error.message === 'Unsupported credential secret format.') {
        throw new Error('Saved instance credential is from an older format. Re-enter the remote OxyGen password in the instance edit modal and save before testing connectivity from the grid.');
      }
      throw error;
    }
  }
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

  function availabilityFromConnectivity(result: ConnectivityResult): InstanceStatus {
    if (result.ok) return 'up';
    if (result.status === 'auth-error') return 'auth-error';
    if (result.status === 'ssl-error') return 'ssl-error';
    return 'down';
  }

  async function persistConnectivityResult(instanceId: string, result: ConnectivityResult) {
    const availability = availabilityFromConnectivity(result);
    const lastSuccessAt = result.ok ? result.checkedAt : null;
    const lastFailureAt = result.ok ? null : result.checkedAt;
    await pool.execute(
      `UPDATE oxygen_instance_status
       SET availability_status = ?, ssl_valid = ?, ssl_expires_at = ?, last_checked_at = ?,
           last_success_at = COALESCE(?, last_success_at), last_failure_at = COALESCE(?, last_failure_at),
           response_time_ms = ?, last_error = ?, license_key = ?, license_status = ?, license_json = ?
       WHERE instance_id = ?`,
      [
        availability,
        result.ssl.valid ?? null,
        result.ssl.expiresAt ? new Date(result.ssl.expiresAt) : null,
        new Date(result.checkedAt),
        lastSuccessAt ? new Date(lastSuccessAt) : null,
        lastFailureAt ? new Date(lastFailureAt) : null,
        result.responseTimeMs,
        result.ok ? null : result.message,
        result.license.key,
        result.license.status,
        result.license.payload === null ? null : JSON.stringify(result.license.payload),
        instanceId
      ]
    );
    await pool.execute(
      `INSERT INTO oxygen_instance_check_history
       (instance_id, check_type, status, started_at, finished_at, duration_ms, http_status_code, error_code, error_message, details_json)
       VALUES (?, 'connectivity', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instanceId,
        availability,
        new Date(Math.max(0, new Date(result.checkedAt).getTime() - result.durationMs)),
        new Date(result.checkedAt),
        result.durationMs,
        result.httpStatusCode,
        result.ok ? null : (result.authentication.errorCode ?? result.api.errorCode ?? result.ssl.errorCode ?? result.dns.errorCode ?? 'CONNECTIVITY_ERROR'),
        result.ok ? null : result.message,
        JSON.stringify({ dns: result.dns, ssl: result.ssl, authentication: result.authentication, api: result.api, license: result.license.step })
      ]
    );
    await pool.execute(
      `INSERT INTO oxygen_instance_check_history
       (instance_id, check_type, status, started_at, finished_at, duration_ms, http_status_code, error_code, error_message, details_json)
       VALUES (?, 'license', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instanceId,
        result.license.step.skipped ? 'unknown' : result.license.status === 'valid' ? 'ok' : result.license.status === 'warning' || result.license.status === 'unknown' ? 'warning' : 'error',
        new Date(Math.max(0, new Date(result.checkedAt).getTime() - result.durationMs)),
        new Date(result.checkedAt),
        result.durationMs,
        result.license.step.httpStatusCode ?? null,
        result.license.step.errorCode ?? null,
        result.license.step.ok ? null : (result.license.step.message ?? null),
        JSON.stringify({ step: result.license.step, status: result.license.status, keyPresent: Boolean(result.license.key), payload: result.license.payload })
      ]
    );
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
      await assertTenantExists(input.tenantId);
      const normalized = normalizeOxyGenEndpoint(input);
      const id = randomUUID();
      try {
        await pool.execute(
          `INSERT INTO oxygen_instances
           (id, name, description, tenant_id, protocol, host, port, hostname, base_url, launch_url, api_base_url, username, password_secret, polling_interval_seconds, is_enabled, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown')`,
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
            encryptCredential(input.password),
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
        input.pollingIntervalSeconds ?? existing.pollingIntervalSeconds,
        input.isEnabled ?? existing.isEnabled
      ];
      if (input.password) params.push(encryptCredential(input.password));
      params.push(instanceId);

      try {
        await pool.execute(
          `UPDATE oxygen_instances
           SET name = ?, description = ?, tenant_id = ?, protocol = ?, host = ?, port = ?, hostname = ?, base_url = ?, launch_url = ?, api_base_url = ?, username = ?, polling_interval_seconds = ?, is_enabled = ?${passwordSql}
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
      const instanceIds = scope?.instanceIds ?? [];
      if (instanceIds.length === 0) return [];
      const placeholders = instanceIds.map(() => '?').join(', ');
      return (await many<InstanceRow>(`${instanceSelectSql} WHERE i.id IN (${placeholders}) ORDER BY i.name ASC`, instanceIds)).map(mapInstance);
    },

    getInstance: findInstanceById,

    async testConnectivity(instanceId: string): Promise<ConnectivityResult> {
      const row = await one<InstanceRow>(`${instanceSelectSql} WHERE i.id = ? LIMIT 1`, [instanceId]);
      if (!row) throw new Error('Instance not found.');
      const instance = mapInstance(row);
      const result = await testOxyGenConnectivity({ instance, password: decryptCredential(row.password_secret) });
      await persistConnectivityResult(instanceId, result);
      return result;
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
