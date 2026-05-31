import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';

describe('auth and RBAC API', () => {
  it('bootstraps an admin, logs in, and returns the authenticated user profile', async () => {
    const authRepository = createInMemoryAuthRepository();
    const app = await buildApp({ logger: false, authRepository });

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' }
    });
    expect(bootstrap.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'AdminPassword!42' }
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().token;
    expect(token).toEqual(expect.any(String));

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { email: 'admin@example.com', displayName: 'Admin User' },
      roles: ['SystemAdmin']
    });

    await app.close();
  });

  it('allows a SystemAdmin to create groups and users with group access', async () => {
    const authRepository = createInMemoryAuthRepository();
    const app = await buildApp({ logger: false, authRepository });

    await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
    const token = login.json().token;

    const group = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Customer Group A', description: 'Initial customer folder' }
    });
    expect(group.statusCode).toBe(201);

    const user = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'operator@example.com',
        displayName: 'Operator User',
        password: 'OperatorPassword!42',
        roleNames: ['Operator'],
        groupIds: [group.json().group.id]
      }
    });
    expect(user.statusCode).toBe(201);
    expect(user.json().user).toMatchObject({ email: 'operator@example.com', displayName: 'Operator User' });
    expect(user.json().roles).toEqual(['Operator']);
    expect(user.json().groups).toEqual([{ id: group.json().group.id, name: 'Customer Group A' }]);

    await app.close();
  });

  it('rejects user administration without SystemAdmin role', async () => {
    const authRepository = createInMemoryAuthRepository();
    const app = await buildApp({ logger: false, authRepository });

    await authRepository.bootstrapAdmin({ email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' });
    const group = await authRepository.createGroup({ name: 'Operators', description: null });
    await authRepository.createUser({
      email: 'operator@example.com',
      displayName: 'Operator User',
      password: 'OperatorPassword!42',
      roleNames: ['Operator'],
      groupIds: [group.id]
    });

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'operator@example.com', password: 'OperatorPassword!42' } });
    const token = login.json().token;

    const response = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'blocked@example.com', displayName: 'Blocked', password: 'BlockedPassword!42', roleNames: ['Viewer'], groupIds: [] }
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
  it('reports bootstrap status before and after the first admin exists', async () => {
    const authRepository = createInMemoryAuthRepository();
    const app = await buildApp({ logger: false, authRepository });

    const before = await app.inject({ method: 'GET', url: '/api/auth/bootstrap-status' });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ requiresBootstrap: true });

    await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' }
    });

    const after = await app.inject({ method: 'GET', url: '/api/auth/bootstrap-status' });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual({ requiresBootstrap: false });

    await app.close();
  });

});
