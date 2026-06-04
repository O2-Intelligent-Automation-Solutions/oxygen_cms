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
      await pool.query("DELETE FROM user_group_instance_access WHERE group_id IN (SELECT id FROM user_groups WHERE name = 'Tenant A Operators')");
      await pool.query("DELETE FROM user_instance_access WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@example.com', 'operator@example.com'))");
      await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@example.com', 'operator@example.com'))");
      await pool.query("DELETE FROM user_group_assignments WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@example.com', 'operator@example.com'))");
      await pool.query("DELETE FROM user_role_assignments WHERE user_id IN (SELECT id FROM users WHERE email IN ('admin@example.com', 'operator@example.com'))");
      await pool.query("DELETE FROM users WHERE email IN ('admin@example.com', 'operator@example.com')");
      await pool.query("DELETE FROM user_groups WHERE name = 'Tenant A Operators'");
      await pool.query("DELETE FROM roles WHERE protected = 0 AND name = 'WorkflowReviewer'");
      await pool.query("DELETE FROM tenants WHERE name = 'Tenant A'");

      const firstRepository = createMysqlAuthRepository(pool);
      expect(await firstRepository.hasUsers()).toBe(false);

      const admin = await firstRepository.bootstrapAdmin({
        email: 'Admin@Example.com',
        displayName: 'Admin User',
        password: 'AdminPassword!42'
      });
      expect(admin.user.email).toBe('admin@example.com');
      expect(admin.user.instanceAccessMode).toBe('all');
      expect(admin.roles).toEqual(['SystemAdmin']);

      const tenant = await firstRepository.createTenant({ name: 'Tenant A', description: 'Primary tenant' });
      const role = await firstRepository.createRole({ name: 'WorkflowReviewer', description: 'Review workflows', tenantId: tenant.id });
      const group = await firstRepository.createGroup({ name: 'Tenant A Operators', description: 'Scoped group', tenantId: tenant.id, instanceAccessMode: 'all' });
      const user = await firstRepository.createUser({
        email: 'operator@example.com',
        displayName: 'Operator User',
        password: 'OperatorPassword!42',
        roleNames: [role.name],
        groupIds: [group.id],
        tenantId: tenant.id,
        instanceAccessMode: 'inherit'
      });
      expect(user.user.instanceAccessMode).toBe('inherit');
      expect(user.groups).toEqual([{ id: group.id, name: group.name, tenantId: tenant.id, instanceAccessMode: 'all', instanceIds: [] }]);

      const token = await firstRepository.createSession(admin.user.id);

      const secondRepository = createMysqlAuthRepository(pool);
      expect(await secondRepository.hasUsers()).toBe(true);
      expect(await secondRepository.authenticate('admin@example.com', 'AdminPassword!42')).toMatchObject({
        user: { email: 'admin@example.com', displayName: 'Admin User' },
        roles: ['SystemAdmin']
      });
      expect(await secondRepository.getProfileByToken(token)).toMatchObject({ user: { id: admin.user.id } });
      expect(await secondRepository.listTenants()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: tenant.id, name: 'Tenant A' })
      ]));
      expect(await secondRepository.listUsers()).toEqual(expect.arrayContaining([
        expect.objectContaining({ user: expect.objectContaining({ email: 'operator@example.com', instanceAccessMode: 'inherit', instanceIds: [] }), roles: ['WorkflowReviewer'] })
      ]));
    } finally {
      await pool.end();
    }
  });
});
