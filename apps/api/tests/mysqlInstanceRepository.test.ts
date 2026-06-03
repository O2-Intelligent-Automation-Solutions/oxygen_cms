import { describe, expect, it } from 'vitest';
import { createPool } from 'mysql2/promise';
import { createMysqlInstanceRepository } from '../src/instances/mysqlInstanceRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

describeMysql('MySQL instance repository', () => {
  it('persists expanded instance CRUD fields and scoped lists across repository instances', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query("DELETE FROM oxygen_instance_check_history WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden') OR group_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'))");
      await pool.query("DELETE FROM oxygen_instance_status WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden') OR group_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'))");
      await pool.query("DELETE FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden') OR group_id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')");
      await pool.query("DELETE FROM user_groups WHERE id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')");
      await pool.query("DELETE FROM tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");
      await pool.query("INSERT INTO tenants (id, name, description) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Tenant', NULL)");
      await pool.query(
        "INSERT INTO user_groups (id, name, description, tenant_id) VALUES ('11111111-1111-4111-8111-111111111111', 'Group A', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('22222222-2222-4222-8222-222222222222', 'Group B', NULL, NULL)"
      );

      const firstRepository = createMysqlInstanceRepository(pool);
      const created = await firstRepository.createInstance({
        name: 'Acme Production',
        description: 'Primary Acme production OxyGen deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 444,
        username: 'admin',
        password: 'RemotePassword!42',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 300
      });

      expect(created).toMatchObject({
        name: 'Acme Production',
        description: 'Primary Acme production OxyGen deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 444,
        hostname: 'acme.example.com:444',
        baseUrl: 'https://acme.example.com:444',
        launchUrl: 'https://acme.example.com:444/OPTWS/OxyGen.aspx',
        username: 'admin',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 300,
        isEnabled: true,
        status: 'unknown',
        sslValid: null,
        sslExpiresAt: null,
        uptimePercent24h: null,
        processingStatus: 'unknown',
        emmQueueStatus: 'unknown',
        smsStatus: 'unknown',
        hangfireStatus: 'unknown',
        licenseKey: null,
        licenseStatus: 'unknown',
        licenseJson: null,
        settingsJson: null,
        lastCheckedAt: null,
        lastError: null
      });
      expect(created).not.toHaveProperty('password');

      const [statusRows] = await pool.query("SELECT instance_id, availability_status, processing_status, emm_queue_status, sms_status, hangfire_status, license_status FROM oxygen_instance_status WHERE instance_id = ?", [created.id]);
      expect(statusRows).toMatchObject([{ instance_id: created.id, availability_status: 'unknown', processing_status: 'unknown', emm_queue_status: 'unknown', sms_status: 'unknown', hangfire_status: 'unknown', license_status: 'unknown' }]);

      await firstRepository.createInstance({
        name: 'Beta Hidden',
        description: null,
        tenantId: null,
        protocol: 'http',
        host: 'beta.example.com',
        port: 8080,
        username: 'svc',
        password: 'RemotePassword!42',
        groupId: '22222222-2222-4222-8222-222222222222'
      });

      const secondRepository = createMysqlInstanceRepository(pool);
      expect((await secondRepository.listInstances({ groupIds: ['11111111-1111-4111-8111-111111111111'] })).map((instance) => instance.name)).toEqual(['Acme Production']);
      expect((await secondRepository.listInstances({ includeAll: true })).map((instance) => instance.name)).toEqual(['Acme Production', 'Beta Hidden']);

      const updated = await secondRepository.updateInstance(created.id, {
        name: 'Acme Prod',
        description: 'Updated production deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 443,
        username: 'svc-admin',
        groupId: '11111111-1111-4111-8111-111111111111',
        pollingIntervalSeconds: 600,
        isEnabled: false
      });

      expect(updated).toMatchObject({
        id: created.id,
        name: 'Acme Prod',
        description: 'Updated production deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 443,
        hostname: 'acme.example.com',
        baseUrl: 'https://acme.example.com',
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
