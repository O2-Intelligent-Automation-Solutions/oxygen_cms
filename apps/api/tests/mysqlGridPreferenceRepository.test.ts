import { describe, expect, it } from 'vitest';
import { createPool } from 'mysql2/promise';
import { createMysqlAuthRepository } from '../src/auth/mysqlAuthRepository.js';
import { createMysqlGridPreferenceRepository } from '../src/gridPreferences/mysqlGridPreferenceRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

describeMysql('MySQL grid preference repository', () => {
  it('persists per-user per-grid preferences across repository instances', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query("DELETE FROM grid_preferences WHERE user_id IN (SELECT id FROM users WHERE email = 'grid-pref-admin@example.com')");
      await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = 'grid-pref-admin@example.com')");
      await pool.query("DELETE FROM user_group_assignments WHERE user_id IN (SELECT id FROM users WHERE email = 'grid-pref-admin@example.com')");
      await pool.query("DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE email = 'grid-pref-admin@example.com')");
      await pool.query("DELETE FROM users WHERE email = 'grid-pref-admin@example.com'");

      const authRepository = createMysqlAuthRepository(pool);
      const admin = await authRepository.createUser({
        email: 'grid-pref-admin@example.com',
        displayName: 'Grid Pref Admin',
        password: 'AdminPassword!42',
        roleNames: ['SystemAdmin'],
        groupIds: [],
        instanceAccessMode: 'all'
      });

      const firstRepository = createMysqlGridPreferenceRepository(pool);
      const preference = await firstRepository.savePreference(admin.user.id, 'instances', {
        columns: [
          { key: 'host', title: 'Host', visible: true, order: 0, width: 340 },
          { key: 'tenant', title: 'Tenant', visible: false, order: 1 }
        ],
        sort: [{ field: 'host', dir: 'desc' }],
        group: [{ field: 'tenant' }],
        filter: null,
        filtersVisible: false
      });
      expect(preference).toMatchObject({ userId: admin.user.id, gridKey: 'instances', sort: [{ field: 'host', dir: 'desc' }] });

      const secondRepository = createMysqlGridPreferenceRepository(pool);
      await secondRepository.savePreference(admin.user.id, 'users', { columns: [], sort: [], group: [], filter: null, filtersVisible: true });
      expect(await secondRepository.getPreference(admin.user.id, 'instances')).toMatchObject({
        userId: admin.user.id,
        gridKey: 'instances',
        columns: [
          { key: 'host', title: 'Host', visible: true, order: 0, width: 340 },
          { key: 'tenant', title: 'Tenant', visible: false, order: 1 }
        ],
        sort: [{ field: 'host', dir: 'desc' }],
        group: [{ field: 'tenant' }],
        filter: null,
        filtersVisible: false
      });
      expect(await secondRepository.getPreference(admin.user.id, 'users')).toMatchObject({ gridKey: 'users', filtersVisible: true });
    } finally {
      await pool.end();
    }
  });
});
