import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type DatabaseSettings = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type SetupSettingsStore = {
  getDatabaseSettings(): Promise<DatabaseSettings | null>;
  saveDatabaseSettings(settings: DatabaseSettings): Promise<void>;
  isSchemaCurrent(): Promise<boolean>;
  markSchemaCurrent(): Promise<void>;
};

type SetupSettingsFile = {
  database?: DatabaseSettings;
  schema?: {
    current: boolean;
    updatedAt: string;
  };
};

export function createFileSetupSettingsStore(path: string): SetupSettingsStore {
  async function readSettings(): Promise<SetupSettingsFile> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as SetupSettingsFile;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
      throw error;
    }
  }

  async function writeSettings(settings: SetupSettingsFile) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  }

  return {
    async getDatabaseSettings() {
      const settings = await readSettings();
      return settings.database ?? null;
    },
    async saveDatabaseSettings(database) {
      const settings = await readSettings();
      await writeSettings({ ...settings, database, schema: { current: false, updatedAt: new Date().toISOString() } });
    },
    async isSchemaCurrent() {
      const settings = await readSettings();
      return settings.schema?.current === true;
    },
    async markSchemaCurrent() {
      const settings = await readSettings();
      await writeSettings({ ...settings, schema: { current: true, updatedAt: new Date().toISOString() } });
    }
  };
}
