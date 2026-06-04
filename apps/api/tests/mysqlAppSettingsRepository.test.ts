import { describe, expect, it } from 'vitest';
import { createPool } from 'mysql2/promise';
import { createMysqlAppSettingsRepository } from '../src/appSettings/mysqlAppSettingsRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

describeMysql('MySQL application settings repository', () => {
  it('persists labels across repository instances', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query("DELETE FROM application_settings WHERE setting_key = 'labels'");
      const firstRepository = createMysqlAppSettingsRepository(pool);
      expect(await firstRepository.getLabels()).toEqual({ tenant: 'Tenant' });
      await firstRepository.saveLabels({ tenant: 'Partner' });

      const secondRepository = createMysqlAppSettingsRepository(pool);
      expect(await secondRepository.getLabels()).toEqual({ tenant: 'Partner' });
    } finally {
      await pool.end();
    }
  });
});
