import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { DEFAULT_APP_LABELS, DEFAULT_LOG_RETENTION_SETTINGS, DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS, DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS, normalizeQueueScheduleSettings, type AppLabels, type AppSettingsRepository, type LogRetentionSettings, type SslCertificateWarningSettings, type LicenseExpirationWarningSettings, type QueueScheduleSettings } from './types.js';

const SETTINGS_KEY_LABELS = 'labels';
const SETTINGS_KEY_LOG_RETENTION = 'logRetention';
const SETTINGS_KEY_SSL_CERTIFICATE_WARNING = 'sslCertificateWarning';
const SETTINGS_KEY_LICENSE_EXPIRATION_WARNING = 'licenseExpirationWarning';
const SETTINGS_KEY_QUEUE_SCHEDULES = 'queueSchedules';

type SettingRow = RowDataPacket & {
  value_json: string | AppLabels | LogRetentionSettings | SslCertificateWarningSettings | LicenseExpirationWarningSettings | QueueScheduleSettings;
};

function normalizeLabels(value: unknown): AppLabels {
  if (value && typeof value === 'object' && 'tenant' in value && typeof (value as { tenant: unknown }).tenant === 'string' && (value as { tenant: string }).tenant.trim()) {
    return { tenant: (value as { tenant: string }).tenant.trim() };
  }
  return { ...DEFAULT_APP_LABELS };
}

function normalizeLogRetention(value: unknown): LogRetentionSettings {
  if (value && typeof value === 'object' && 'days' in value && Number.isFinite(Number((value as { days: unknown }).days))) {
    return { days: Math.min(Math.max(Math.trunc(Number((value as { days: unknown }).days)), 1), 3650) };
  }
  return { ...DEFAULT_LOG_RETENTION_SETTINGS };
}

function normalizeSslCertificateWarning(value: unknown): SslCertificateWarningSettings {
  if (value && typeof value === 'object' && 'daysBeforeExpiration' in value && Number.isFinite(Number((value as { daysBeforeExpiration: unknown }).daysBeforeExpiration))) {
    return { daysBeforeExpiration: Math.min(Math.max(Math.trunc(Number((value as { daysBeforeExpiration: unknown }).daysBeforeExpiration)), 0), 3650) };
  }
  return { ...DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS };
}


function normalizeLicenseExpirationWarning(value: unknown): LicenseExpirationWarningSettings {
  if (value && typeof value === 'object' && 'daysBeforeExpiration' in value && Number.isFinite(Number((value as { daysBeforeExpiration: unknown }).daysBeforeExpiration))) {
    return { daysBeforeExpiration: Math.min(Math.max(Math.trunc(Number((value as { daysBeforeExpiration: unknown }).daysBeforeExpiration)), 0), 3650) };
  }
  return { ...DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS };
}


function parseSettingValue(value: SettingRow['value_json']): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function createMysqlAppSettingsRepository(pool: Pool): AppSettingsRepository {
  return {
    async getLabels() {
      const [rows] = await pool.query<SettingRow[]>('SELECT value_json FROM application_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY_LABELS]);
      if (!rows[0]) return { ...DEFAULT_APP_LABELS };
      return normalizeLabels(parseSettingValue(rows[0].value_json));
    },
    async saveLabels(labels) {
      const normalized = normalizeLabels(labels);
      await pool.query(
        `INSERT INTO application_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
        [SETTINGS_KEY_LABELS, JSON.stringify(normalized)]
      );
      return normalized;
    },
    async getLogRetention() {
      const [rows] = await pool.query<SettingRow[]>('SELECT value_json FROM application_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY_LOG_RETENTION]);
      if (!rows[0]) return { ...DEFAULT_LOG_RETENTION_SETTINGS };
      return normalizeLogRetention(parseSettingValue(rows[0].value_json));
    },
    async saveLogRetention(retention) {
      const normalized = normalizeLogRetention(retention);
      await pool.query(
        `INSERT INTO application_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
        [SETTINGS_KEY_LOG_RETENTION, JSON.stringify(normalized)]
      );
      return normalized;
    },
    async getSslCertificateWarning() {
      const [rows] = await pool.query<SettingRow[]>('SELECT value_json FROM application_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY_SSL_CERTIFICATE_WARNING]);
      if (!rows[0]) return { ...DEFAULT_SSL_CERTIFICATE_WARNING_SETTINGS };
      return normalizeSslCertificateWarning(parseSettingValue(rows[0].value_json));
    },
    async saveSslCertificateWarning(settings) {
      const normalized = normalizeSslCertificateWarning(settings);
      await pool.query(
        `INSERT INTO application_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
        [SETTINGS_KEY_SSL_CERTIFICATE_WARNING, JSON.stringify(normalized)]
      );
      return normalized;
    },
    async getLicenseExpirationWarning() {
      const [rows] = await pool.query<SettingRow[]>('SELECT value_json FROM application_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY_LICENSE_EXPIRATION_WARNING]);
      if (!rows[0]) return { ...DEFAULT_LICENSE_EXPIRATION_WARNING_SETTINGS };
      return normalizeLicenseExpirationWarning(parseSettingValue(rows[0].value_json));
    },
    async saveLicenseExpirationWarning(settings) {
      const normalized = normalizeLicenseExpirationWarning(settings);
      await pool.query(
        `INSERT INTO application_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
        [SETTINGS_KEY_LICENSE_EXPIRATION_WARNING, JSON.stringify(normalized)]
      );
      return normalized;
    },
    async getQueueSchedules() {
      const [rows] = await pool.query<SettingRow[]>('SELECT value_json FROM application_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY_QUEUE_SCHEDULES]);
      if (!rows[0]) return normalizeQueueScheduleSettings(null);
      return normalizeQueueScheduleSettings(parseSettingValue(rows[0].value_json));
    },
    async saveQueueSchedules(settings) {
      const normalized = normalizeQueueScheduleSettings(settings);
      await pool.query(
        `INSERT INTO application_settings (setting_key, value_json)
         VALUES (?, CAST(? AS JSON))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
        [SETTINGS_KEY_QUEUE_SCHEDULES, JSON.stringify(normalized)]
      );
      return normalized;
    }
  };
}

function databaseKey(settings: DatabaseSettings) {
  return `${settings.host}:${settings.port}:${settings.database}:${settings.user}`;
}

export function createSetupAwareAppSettingsRepository(setupSettingsStore: SetupSettingsStore, fallbackRepository: AppSettingsRepository): AppSettingsRepository {
  let pool: Pool | null = null;
  let repository: AppSettingsRepository | null = null;
  let activeKey = '';

  async function currentRepository() {
    const settings = await setupSettingsStore.getDatabaseSettings();
    const schemaCurrent = await setupSettingsStore.isSchemaCurrent();
    if (!settings || !schemaCurrent) return fallbackRepository;
    const key = databaseKey(settings);
    if (!pool || !repository || key !== activeKey) {
      if (pool) await pool.end();
      pool = createPool({ host: settings.host, port: settings.port, database: settings.database, user: settings.user, password: settings.password, connectionLimit: 5 });
      repository = createMysqlAppSettingsRepository(pool);
      activeKey = key;
    }
    return repository;
  }

  return {
    async getLabels() {
      return (await currentRepository()).getLabels();
    },
    async saveLabels(labels) {
      return (await currentRepository()).saveLabels(labels);
    },
    async getLogRetention() {
      return (await currentRepository()).getLogRetention();
    },
    async saveLogRetention(retention) {
      return (await currentRepository()).saveLogRetention(retention);
    },
    async getSslCertificateWarning() {
      return (await currentRepository()).getSslCertificateWarning();
    },
    async saveSslCertificateWarning(settings) {
      return (await currentRepository()).saveSslCertificateWarning(settings);
    },
    async getLicenseExpirationWarning() {
      return (await currentRepository()).getLicenseExpirationWarning();
    },
    async saveLicenseExpirationWarning(settings) {
      return (await currentRepository()).saveLicenseExpirationWarning(settings);
    },
    async getQueueSchedules() {
      return (await currentRepository()).getQueueSchedules();
    },
    async saveQueueSchedules(settings) {
      return (await currentRepository()).saveQueueSchedules(settings);
    }
  };
}
