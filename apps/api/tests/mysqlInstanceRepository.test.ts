import { describe, expect, it } from 'vitest';
import { createPool } from 'mysql2/promise';
import { createMysqlInstanceRepository } from '../src/instances/mysqlInstanceRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

describeMysql('MySQL instance repository', () => {
  it('persists instance CRUD operations and scoped lists across repository instances', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query("DELETE FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden') OR group_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')");
      await pool.query("DELETE FROM user_groups WHERE id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')");
      await pool.query(
        "INSERT INTO user_groups (id, name, description, tenant_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Group A', NULL, NULL), ('22222222-2222-4222-8222-222222222222', 'Group B', NULL, NULL)"
      );

      const firstRepository = createMysqlInstanceRepository(pool);
      const created = await firstRepository.createInstance({
        name: 'Acme Production',
        hostname: 'acme.example.com',
        username: 'admin',
        password: 'RemotePassword!42',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 300
      });

      expect(created).toMatchObject({
        name: 'Acme Production',
        hostname: 'acme.example.com',
        baseUrl: 'https://acme.example.com',
        launchUrl: 'https://acme.example.com/OPTWS/OxyGen.aspx',
        username: 'admin',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 300,
        isEnabled: true,
        status: 'unknown',
        lastCheckedAt: null,
        lastError: null
      });
      expect(created).not.toHaveProperty('password');

      await firstRepository.createInstance({
        name: 'Beta Hidden',
        hostname: 'https://beta.example.com/OPTWS/OxyGen.aspx',
        username: 'svc',
        password: 'RemotePassword!42',
        groupId: '22222222-2222-4222-8222-222222222222'
      });

      const secondRepository = createMysqlInstanceRepository(pool);
      expect((await secondRepository.listInstances({ groupIds: ['11111111-1111-4111-8111-111111111111'] })).map((instance) => instance.name)).toEqual(['Acme Production']);
      expect((await secondRepository.listInstances({ includeAll: true })).map((instance) => instance.name)).toEqual(['Acme Production', 'Beta Hidden']);

      const updated = await secondRepository.updateInstance(created.id, {
        name: 'Acme Prod',
        hostname: 'https://acme.example.com/OPTWS',
        username: 'svc-admin',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 600,
        isEnabled: false
      });

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Acme Prod',
        baseUrl: 'https://acme.example.com/OPTWS',
        launchUrl: 'https://acme.example.com/OPTWS/OxyGen.aspx',
        username: 'svc-admin',
        pollingIntervalSeconds: 600,
        isEnabled: false
      });

      await secondRepository.deleteInstance(created.id);
      expect(await secondRepository.getInstance(created.id)).toBeNull();
    } finally {
      await pool.end();
    }
  });
});
