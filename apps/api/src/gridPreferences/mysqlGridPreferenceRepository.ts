import type { Pool, RowDataPacket } from 'mysql2/promise';
import { createPool } from 'mysql2/promise';
import type { DatabaseSettings, SetupSettingsStore } from '../setup/fileSetupSettingsStore.js';
import type { GridPreference, GridPreferenceInput, GridPreferenceRepository } from './types.js';

type GridPreferenceRow = RowDataPacket & {
  user_id: string;
  grid_key: string;
  columns_json: unknown;
  sort_json: unknown;
  group_json: unknown;
  filter_json: unknown | null;
  filters_visible: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z')).toISOString();
  return new Date().toISOString();
}

function parseJson<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return value as T;
}

function mapPreference(row: GridPreferenceRow): GridPreference {
  return {
    userId: row.user_id,
    gridKey: row.grid_key,
    columns: parseJson(row.columns_json),
    sort: parseJson(row.sort_json),
    group: parseJson(row.group_json),
    filter: row.filter_json === null || row.filter_json === undefined ? null : parseJson(row.filter_json),
    filtersVisible: Boolean(row.filters_visible),
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

export function createMysqlGridPreferenceRepository(pool: Pool): GridPreferenceRepository {
  async function findPreference(userId: string, gridKey: string) {
    const [rows] = await pool.execute<GridPreferenceRow[]>(
      'SELECT * FROM grid_preferences WHERE user_id = ? AND grid_key = ? LIMIT 1',
      [userId, gridKey]
    );
    return rows[0] ? mapPreference(rows[0]) : null;
  }

  return {
    getPreference: findPreference,

    async savePreference(userId, gridKey, input: GridPreferenceInput) {
      await pool.execute(
        `INSERT INTO grid_preferences
         (user_id, grid_key, columns_json, sort_json, group_json, filter_json, filters_visible)
         VALUES (?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?)
         ON DUPLICATE KEY UPDATE
           columns_json = VALUES(columns_json),
           sort_json = VALUES(sort_json),
           group_json = VALUES(group_json),
           filter_json = VALUES(filter_json),
           filters_visible = VALUES(filters_visible)`,
        [
          userId,
          gridKey,
          JSON.stringify(input.columns),
          JSON.stringify(input.sort),
          JSON.stringify(input.group),
          JSON.stringify(input.filter),
          input.filtersVisible
        ]
      );
      const preference = await findPreference(userId, gridKey);
      if (!preference) throw new Error('Grid preference not found.');
      return preference;
    }
  };
}

export function createSetupAwareGridPreferenceRepository(settingsStore: SetupSettingsStore, fallback: GridPreferenceRepository): GridPreferenceRepository {
  let cachedKey: string | null = null;
  let cachedRepository: GridPreferenceRepository | null = null;
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
    cachedRepository = createMysqlGridPreferenceRepository(cachedPool);
    cachedKey = key;
    return cachedRepository;
  }

  return new Proxy({} as GridPreferenceRepository, {
    get(_target, property: keyof GridPreferenceRepository) {
      return async (...args: never[]) => {
        const repository = await currentRepository();
        const method = repository[property] as (...methodArgs: never[]) => unknown;
        return method.apply(repository, args);
      };
    }
  });
}
