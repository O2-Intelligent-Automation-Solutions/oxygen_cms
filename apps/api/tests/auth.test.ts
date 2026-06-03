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
    expect(user.json().groups).toEqual([{ id: group.json().group.id, name: 'Customer Group A', tenantId: null, instanceAccessMode: 'none', instanceIds: [] }]);

    await app.close();
  });

  it('allows a SystemAdmin to update an existing user without recreating the user', async () => {
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

    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'operator@example.com',
        displayName: 'Operator User',
        password: 'OperatorPassword!42',
        roleNames: ['Operator'],
        groupIds: []
      }
    });
    expect(created.statusCode).toBe(201);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/users/${created.json().user.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'operator@example.com',
        displayName: 'Updated Operator',
        roleNames: ['Viewer'],
        groupIds: [group.json().group.id]
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().user).toMatchObject({ email: 'operator@example.com', displayName: 'Updated Operator' });
    expect(updated.json().roles).toEqual(['Viewer']);
    expect(updated.json().groups).toEqual([{ id: group.json().group.id, name: 'Customer Group A', tenantId: null, instanceAccessMode: 'none', instanceIds: [] }]);

    const users = await app.inject({ method: 'GET', url: '/api/users', headers: { authorization: `Bearer ${token}` } });
    expect(users.json().users).toHaveLength(2);

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

  it('manages tenants, roles, scoped assignments, protected roles, and deletes users/groups', async () => {
    const authRepository = createInMemoryAuthRepository();
    const app = await buildApp({ logger: false, authRepository });

    await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
    const token = login.json().token;

    const initialRoles = await app.inject({ method: 'GET', url: '/api/roles', headers: { authorization: `Bearer ${token}` } });
    expect(initialRoles.statusCode).toBe(200);
    expect(initialRoles.json().roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'SystemAdmin', tenantId: null, isSystem: true }),
      expect.objectContaining({ name: 'TenantAdmin', tenantId: null, isSystem: true })
    ]));

    const protectedRole = initialRoles.json().roles.find((role: { name: string }) => role.name === 'SystemAdmin');
    const protectedUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/roles/${protectedRole.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'RootAdmin', description: 'Nope' }
    });
    expect(protectedUpdate.statusCode).toBe(400);

    const tenant = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Partner A', description: 'Primary partner' }
    });
    expect(tenant.statusCode).toBe(201);
    const tenantId = tenant.json().tenant.id;

    const role = await app.inject({
      method: 'POST',
      url: '/api/roles',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'WorkflowReviewer', description: 'Review workflows', tenantId }
    });
    expect(role.statusCode).toBe(201);
    expect(role.json().role).toMatchObject({ name: 'WorkflowReviewer', tenantId, isSystem: false });

    const group = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Partner A Operators', description: 'Scoped group', tenantId }
    });
    expect(group.statusCode).toBe(201);
    expect(group.json().group).toMatchObject({ tenantId });

    const user = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'scoped@example.com',
        displayName: 'Scoped User',
        password: 'ScopedPassword!42',
        roleNames: ['WorkflowReviewer'],
        groupIds: [group.json().group.id],
        tenantId
      }
    });
    expect(user.statusCode).toBe(201);
    expect(user.json().user).toMatchObject({ tenantId });
    expect(user.json().groups).toEqual([{ id: group.json().group.id, name: 'Partner A Operators', tenantId, instanceAccessMode: 'none', instanceIds: [] }]);

    const secondTenant = await app.inject({
      method: 'POST',
      url: '/api/tenants',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Partner B', description: null }
    });
    const changedTenant = await app.inject({
      method: 'PATCH',
      url: `/api/users/${user.json().user.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        email: 'scoped@example.com',
        displayName: 'Scoped User Updated',
        roleNames: ['WorkflowReviewer'],
        groupIds: [group.json().group.id],
        tenantId: secondTenant.json().tenant.id
      }
    });
    expect(changedTenant.statusCode).toBe(400);

    const deletedUser = await app.inject({ method: 'DELETE', url: `/api/users/${user.json().user.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(deletedUser.statusCode).toBe(204);
    const deletedGroup = await app.inject({ method: 'DELETE', url: `/api/groups/${group.json().group.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(deletedGroup.statusCode).toBe(204);
    const deletedRole = await app.inject({ method: 'DELETE', url: `/api/roles/${role.json().role.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(deletedRole.statusCode).toBe(204);
    const deletedTenant = await app.inject({ method: 'DELETE', url: `/api/tenants/${tenantId}`, headers: { authorization: `Bearer ${token}` } });
    expect(deletedTenant.statusCode).toBe(204);

    await app.close();
  });

});
