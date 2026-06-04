import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
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

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function startMockOxyGenServer(password: string) {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'POST' && request.url === '/v2/Auth/Login') {
      const body = await readRequestBody(request);
      const form = new URLSearchParams(body);
      if (form.get('Username') === 'admin' && form.get('Password') === password) {
        response.statusCode = 200;
        response.setHeader('set-cookie', 'ASP.NET_SessionId=mock-session; Path=/; HttpOnly');
        response.end('OK');
        return;
      }
      response.statusCode = 401;
      response.end('Unauthorized');
      return;
    }
    if (request.method === 'GET' && request.url === '/web-api/global/settings/currenttime' && request.headers.cookie?.includes('ASP.NET_SessionId=mock-session')) {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ currentTime: '2026-06-04T00:00:00Z' }));
      return;
    }
    response.statusCode = 404;
    response.end('Not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port };
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
      await pool.query("DELETE FROM oxygen_instance_check_history WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden', 'Local Mock OxyGen'))");
      await pool.query("DELETE FROM oxygen_instance_status WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden', 'Local Mock OxyGen'))");
      await pool.query("DELETE FROM user_group_instance_access WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden', 'Local Mock OxyGen'))");
      await pool.query("DELETE FROM user_instance_access WHERE instance_id IN (SELECT id FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden', 'Local Mock OxyGen'))");
      await pool.query("DELETE FROM oxygen_instances WHERE name IN ('Acme Production', 'Acme Prod', 'Beta Hidden', 'Local Mock OxyGen')");
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

      const mockOxyGen = await startMockOxyGenServer('RemotePassword!42');
      try {
        const mockInstance = await secondRepository.createInstance({
          name: 'Local Mock OxyGen',
          description: 'Local mock endpoint for connectivity integration test',
          tenantId: null,
          protocol: 'http',
          host: '127.0.0.1',
          port: mockOxyGen.port,
          username: 'admin',
          password: 'RemotePassword!42'
        });
        const connectivity = await secondRepository.testConnectivity(mockInstance.id);
        expect(connectivity).toMatchObject({
          ok: true,
          status: 'reachable',
          message: 'Connectivity test passed.',
          authentication: { ok: true, httpStatusCode: 200 },
          api: { ok: true, httpStatusCode: 200 }
        });
        expect(connectivity).not.toHaveProperty('password');
        expect(connectivity).not.toHaveProperty('passwordSecret');

        const [mockStatusRows] = await pool.query('SELECT availability_status, last_checked_at, last_success_at, last_failure_at, response_time_ms, last_error FROM oxygen_instance_status WHERE instance_id = ?', [mockInstance.id]);
        expect(mockStatusRows).toMatchObject([{ availability_status: 'up', last_failure_at: null, last_error: null }]);
        expect((mockStatusRows as Array<{ last_checked_at: Date | null; last_success_at: Date | null; response_time_ms: number | null }>)[0]?.last_checked_at).toBeInstanceOf(Date);
        expect((mockStatusRows as Array<{ last_checked_at: Date | null; last_success_at: Date | null; response_time_ms: number | null }>)[0]?.last_success_at).toBeInstanceOf(Date);
        expect((mockStatusRows as Array<{ last_checked_at: Date | null; last_success_at: Date | null; response_time_ms: number | null }>)[0]?.response_time_ms).toBeGreaterThanOrEqual(0);

        const [historyRows] = await pool.query('SELECT check_type, status, http_status_code, error_code, error_message, details_json FROM oxygen_instance_check_history WHERE instance_id = ? ORDER BY id DESC LIMIT 1', [mockInstance.id]);
        expect(historyRows).toMatchObject([{ check_type: 'connectivity', status: 'up', http_status_code: 200, error_code: null, error_message: null }]);
        expect((historyRows as Array<{ details_json: unknown }>)[0]?.details_json).toBeTruthy();
      } finally {
        await new Promise<void>((resolve, reject) => mockOxyGen.server.close((error) => error ? reject(error) : resolve()));
      }

      await secondRepository.deleteInstance(created.id);
      expect(await secondRepository.getInstance(created.id)).toBeNull();
    } finally {
      await pool.end();
    }
  });
});
