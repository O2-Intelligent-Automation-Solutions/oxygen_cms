import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import { DEFAULT_APP_LABELS, type AppLabels, type AppSettingsRepository } from './types.js';

const SETTINGS_KEY_LABELS = 'labels';

type SettingRow = RowDataPacket & {
  value_json: string | AppLabels;
};

function normalizeLabels(value: unknown): AppLabels {
  if (value && typeof value === 'object' && 'tenant' in value && typeof (value as { tenant: unknown }).tenant === 'string' && (value as { tenant: string }).tenant.trim()) {
    return { tenant: (value as { tenant: string }).tenant.trim() };
  }
  return { ...DEFAULT_APP_LABELS };
}

function parseSettingValue(value: string | AppLabels): unknown {
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
    }
  };
}
