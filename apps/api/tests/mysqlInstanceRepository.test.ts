import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createPool } from 'mysql2/promise';
import { createCredentialCipher } from '../src/instances/credentialEncryption.js';
import { createMysqlInstanceRepository } from '../src/instances/mysqlInstanceRepository.js';

const runMysqlIntegration = process.env.MYSQL_INTEGRATION_TESTS === 'true';
const describeMysql = runMysqlIntegration ? describe : describe.skip;

function testCredentialCipher() {
  return createCredentialCipher(randomBytes(32).toString('base64'));
}

describeMysql('MySQL instance repository', () => {
  it('persists expanded instance CRUD fields and scoped lists across repository instances without instance group ownership', async () => {
    const pool = createPool({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? 'O2IAS_CMS',
      user: process.env.MYSQL_USER ?? 'oxygen_cms',
      password: process.env.MYSQL_PASSWORD ?? 'oxygen_cms_dev_password',
      connectionLimit: 2
    });

    try {
      await pool.query("DELETE FROM oxygen_instance_check_history WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden'))");
      await pool.query("DELETE FROM oxygen_instance_status WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden'))");
      await pool.query("DELETE FROM user_group_instance_access WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden'))");
      await pool.query("DELETE FROM user_instance_access WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden'))");
      await pool.query("DELETE FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden')");
      await pool.query("DELETE FROM tenants WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'");
      await pool.query("INSERT INTO tenants (id, name, description) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Acme Tenant', NULL)");

      const credentialCipher = testCredentialCipher();
      const firstRepository = createMysqlInstanceRepository(pool, credentialCipher);
      const created = await firstRepository.createInstance({
        name: 'Acme Production',
        description: 'Primary Acme production OxyGen deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 444,
        username: 'admin',
        password: 'RemotePassword!42',
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
      expect(created).not.toHaveProperty('groupId');
      expect(created).not.toHaveProperty('password');
      expect(created).not.toHaveProperty('passwordSecret');

      const [credentialRowsAfterCreate] = await pool.query('SELECT password_secret FROM oxygen_instances WHERE id = ?', [created.id]);
      const passwordSecretAfterCreate = (credentialRowsAfterCreate as Array<{ password_secret: string }>)[0]?.password_secret;
      expect(passwordSecretAfterCreate).toMatch(/^o2cms:v1:/);
      expect(passwordSecretAfterCreate).not.toBe('RemotePassword!42');
      expect(passwordSecretAfterCreate).not.toContain('RemotePassword!42');

      const [statusRows] = await pool.query('SELECT instance_id, availability_status, processing_status, emm_queue_status, sms_status, hangfire_status, license_status FROM oxygen_instance_status WHERE instance_id = ?', [created.id]);
      expect(statusRows).toMatchObject([{ instance_id: created.id, availability_status: 'unknown', processing_status: 'unknown', emm_queue_status: 'unknown', sms_status: 'unknown', hangfire_status: 'unknown', license_status: 'unknown' }]);

      const hidden = await firstRepository.createInstance({
        name: 'Beta Hidden',
        description: null,
        tenantId: null,
        protocol: 'http',
        host: 'beta.example.com',
        port: 8080,
        username: 'svc',
        password: 'RemotePassword!42'
      });

      const secondRepository = createMysqlInstanceRepository(pool, credentialCipher);
      expect((await secondRepository.listInstances({ instanceIds: [created.id] })).map((instance) => instance.name)).toEqual(['Acme Production']);
      expect((await secondRepository.listInstances({ includeAll: true })).map((instance) => instance.name)).toEqual(['Acme Production', 'Beta Hidden']);
      expect((await secondRepository.listInstances({ instanceIds: [hidden.id] })).map((instance) => instance.name)).toEqual(['Beta Hidden']);

      const updated = await secondRepository.updateInstance(created.id, {
        name: 'Acme Prod',
        description: 'Updated production deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 443,
        username: 'svc-admin',
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
        hostname: 'acme.example.com:443',
        baseUrl: 'https://acme.example.com:443',
        launchUrl: 'https://acme.example.com:443/OPTWS/OxyGen.aspx',
        username: 'svc-admin',
        pollingIntervalSeconds: 600,
        isEnabled: false
      });

      const [credentialRowsAfterNoPasswordUpdate] = await pool.query('SELECT password_secret FROM oxygen_instances WHERE id = ?', [created.id]);
      expect((credentialRowsAfterNoPasswordUpdate as Array<{ password_secret: string }>)[0]?.password_secret).toBe(passwordSecretAfterCreate);

      await secondRepository.updateInstance(created.id, {
        name: 'Acme Prod',
        description: 'Updated production deployment',
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        protocol: 'https',
        host: 'acme.example.com',
        port: 443,
        username: 'svc-admin',
        password: 'ReplacementPassword!43',
        pollingIntervalSeconds: 600,
        isEnabled: false
      });
      const [credentialRowsAfterPasswordUpdate] = await pool.query('SELECT password_secret FROM oxygen_instances WHERE id = ?', [created.id]);
      const passwordSecretAfterPasswordUpdate = (credentialRowsAfterPasswordUpdate as Array<{ password_secret: string }>)[0]?.password_secret;
      expect(passwordSecretAfterPasswordUpdate).toMatch(/^o2cms:v1:/);
      expect(passwordSecretAfterPasswordUpdate).not.toBe(passwordSecretAfterCreate);
      expect(passwordSecretAfterPasswordUpdate).not.toContain('ReplacementPassword!43');

      await secondRepository.deleteInstance(created.id);
      expect(await secondRepository.getInstance(created.id)).toBeNull();
    } finally {
      await pool.end();
    }
  });
});
