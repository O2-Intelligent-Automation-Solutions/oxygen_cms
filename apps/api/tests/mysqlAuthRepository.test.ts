import { describe, expect, it } from 'vitest';
import { createPool } from 'mysql2/promise';
import { createMysqlAuthRepository } from '../src/auth/mysqlAuthRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

describeMysql('MySQL auth repository', () => {
  it('persists bootstrapped admins, sessions, tenants, roles, groups, and users across repository instances', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query('DELETE FROM sessions');
      await pool.query('DELETE FROM user_group_assignments');
      await pool.query('DELETE FROM user_role_assignments');
      await pool.query('DELETE FROM users');
      await pool.query('DELETE FROM user_groups');
      await pool.query('DELETE FROM roles WHERE protected = 0 AND name NOT IN (\'PartnerAdmin\', \'Operator\', \'Viewer\')');
      await pool.query('DELETE FROM tenants');

      const firstRepository = createMysqlAuthRepository(pool);
      expect(await firstRepository.hasUsers()).toBe(false);

      const admin = await firstRepository.bootstrapAdmin({
        email: 'Admin@Example.com',
        displayName: 'Admin User',
        password: 'AdminPassword!42'
      });
      expect(admin.user.email).toBe('admin@example.com');
      expect(admin.roles).toEqual(['SystemAdmin']);

      const tenant = await firstRepository.createTenant({ name: 'Partner A', description: 'Primary partner' });
      const role = await firstRepository.createRole({ name: 'WorkflowReviewer', description: 'Review workflows', tenantId: tenant.id });
      const group = await firstRepository.createGroup({ name: 'Partner A Operators', description: 'Scoped group', tenantId: tenant.id });
      const user = await firstRepository.createUser({
        email: 'operator@example.com',
        displayName: 'Operator User',
        password: 'OperatorPassword!42',
        roleNames: [role.name],
        groupIds: [group.id],
        tenantId: tenant.id
      });
      expect(user.groups).toEqual([{ id: group.id, name: group.name, tenantId: tenant.id }]);

      const token = await firstRepository.createSession(admin.user.id);

      const secondRepository = createMysqlAuthRepository(pool);
      expect(await secondRepository.hasUsers()).toBe(true);
      expect(await secondRepository.authenticate('admin@example.com', 'AdminPassword!42')).toMatchObject({
        user: { email: 'admin@example.com', displayName: 'Admin User' },
        roles: ['SystemAdmin']
      });
      expect(await secondRepository.getProfileByToken(token)).toMatchObject({ user: { id: admin.user.id } });
      expect(await secondRepository.listTenants()).toEqual([expect.objectContaining({ id: tenant.id, name: 'Partner A' })]);
      expect(await secondRepository.listUsers()).toEqual(expect.arrayContaining([
        expect.objectContaining({ user: expect.objectContaining({ email: 'operator@example.com' }), roles: ['WorkflowReviewer'] })
      ]));
    } finally {
      await pool.end();
    }
  });
});
