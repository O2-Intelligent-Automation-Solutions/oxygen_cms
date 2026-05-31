import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.js';

describe('loadConfig', () => {
  it('loads safe defaults for local development', () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      database: {
        host: 'localhost',
        port: 3306,
        user: 'oxygen_cms',
        database: 'oxygen_cms'
      }
    });
  });

  it('parses numeric environment values', () => {
    const config = loadConfig({ API_PORT: '8080', MYSQL_PORT: '3307' });

    expect(config.port).toBe(8080);
    expect(config.database.port).toBe(3307);
  });
});
