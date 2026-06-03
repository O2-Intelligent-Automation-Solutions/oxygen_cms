import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryInstanceRepository } from '../src/instances/inMemoryInstanceRepository.js';

async function bootstrap(app: Awaited<ReturnType<typeof buildApp>>, authRepository: ReturnType<typeof createInMemoryAuthRepository>) {
  await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
  const adminToken = login.json().token as string;
  const groupA = await authRepository.createGroup({ name: 'Customer Group A', description: null });
  const groupB = await authRepository.createGroup({ name: 'Customer Group B', description: null });
  await authRepository.createUser({ email: 'operator@example.com', displayName: 'Operator User', password: 'OperatorPassword!42', roleNames: ['Operator'], groupIds: [groupA.id] });
  const operatorLogin = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'operator@example.com', password: 'OperatorPassword!42' } });
  return { adminToken, operatorToken: operatorLogin.json().token as string, groupA, groupB };
}

describe('instance enrollment API', () => {
  it('allows SystemAdmin users to create, list, update, test, and delete OxyGen instances', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, groupA } = await bootstrap(app, authRepository);

    const created = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Acme Production',
        hostname: 'acme.example.com',
        username: 'admin',
        password: 'RemotePassword!42',
        groupId: groupA.id,
        pollingIntervalSeconds: 300
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().instance).toMatchObject({
      name: 'Acme Production',
      hostname: 'acme.example.com',
      baseUrl: 'https://acme.example.com',
      launchUrl: 'https://acme.example.com/OPTWS/OxyGen.aspx',
      username: 'admin',
      groupId: groupA.id,
      pollingIntervalSeconds: 300,
      isEnabled: true
    });
    expect(created.json().instance.password).toBeUndefined();

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().instances).toHaveLength(1);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/instances/${created.json().instance.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Acme Prod', hostname: 'https://acme.example.com/OPTWS', username: 'svc', groupId: groupA.id, pollingIntervalSeconds: 600, isEnabled: false }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().instance).toMatchObject({ name: 'Acme Prod', baseUrl: 'https://acme.example.com/OPTWS', launchUrl: 'https://acme.example.com/OPTWS/OxyGen.aspx', username: 'svc', isEnabled: false });

    const connectivity = await app.inject({ method: 'POST', url: `/api/instances/${created.json().instance.id}/test-connectivity`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(connectivity.statusCode).toBe(200);
    expect(connectivity.json()).toMatchObject({ ok: true, status: 'not-tested', message: 'Connectivity test scaffold is ready; live OxyGen checks will be wired in the monitoring slice.' });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/instances/${created.json().instance.id}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(deleted.statusCode).toBe(204);

    await app.close();
  });

  it('limits non-admin instance lists to the user groups assigned to the signed-in user', async () => {
    const authRepository = createInMemoryAuthRepository();
    const instanceRepository = createInMemoryInstanceRepository();
    const app = await buildApp({ logger: false, authRepository, instanceRepository });
    const { adminToken, operatorToken, groupA, groupB } = await bootstrap(app, authRepository);

    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Visible Instance', hostname: 'visible.example.com', username: 'admin', password: 'RemotePassword!42', groupId: groupA.id } });
    await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${adminToken}` }, payload: { name: 'Hidden Instance', hostname: 'hidden.example.com', username: 'admin', password: 'RemotePassword!42', groupId: groupB.id } });

    const listed = await app.inject({ method: 'GET', url: '/api/instances', headers: { authorization: `Bearer ${operatorToken}` } });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().instances.map((instance: { name: string }) => instance.name)).toEqual(['Visible Instance']);

    const createAttempt = await app.inject({ method: 'POST', url: '/api/instances', headers: { authorization: `Bearer ${operatorToken}` }, payload: { name: 'Blocked', hostname: 'blocked.example.com', username: 'admin', password: 'RemotePassword!42', groupId: groupA.id } });
    expect(createAttempt.statusCode).toBe(403);

    await app.close();
  });
});
