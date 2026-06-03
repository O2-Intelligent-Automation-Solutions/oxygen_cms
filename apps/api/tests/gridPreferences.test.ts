import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryAuthRepository } from '../src/auth/inMemoryAuthRepository.js';
import { createInMemoryGridPreferenceRepository } from '../src/gridPreferences/inMemoryGridPreferenceRepository.js';

describe('grid preferences API', () => {
  it('persists authenticated user display preferences separately per grid', async () => {
    const authRepository = createInMemoryAuthRepository();
    const gridPreferenceRepository = createInMemoryGridPreferenceRepository();
    const app = await buildApp({ logger: false, authRepository, gridPreferenceRepository });

    await app.inject({ method: 'POST', url: '/api/auth/bootstrap', payload: { email: 'admin@example.com', displayName: 'Admin User', password: 'AdminPassword!42' } });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'AdminPassword!42' } });
    const token = login.json().token;

    const instancePreference = {
      columns: [
        { key: 'name', title: 'Name', visible: true, order: 0, width: 240 },
        { key: 'tenant', title: 'Tenant', visible: false, order: 1 },
        { key: 'host', title: 'Host', visible: true, order: 2, width: 320 }
      ],
      sort: [{ field: 'host', dir: 'asc' }],
      group: [{ field: 'tenant' }],
      filter: { logic: 'and', filters: [{ field: 'enabled', operator: 'eq', value: 'Yes' }] },
      filtersVisible: true
    };

    const saveInstances = await app.inject({
      method: 'PUT',
      url: '/api/grid-preferences/instances',
      headers: { authorization: `Bearer ${token}` },
      payload: instancePreference
    });
    expect(saveInstances.statusCode).toBe(200);
    expect(saveInstances.json().preference).toMatchObject({ gridKey: 'instances', ...instancePreference });

    const saveUsers = await app.inject({
      method: 'PUT',
      url: '/api/grid-preferences/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { columns: [{ key: 'email', title: 'Email', visible: true, order: 0 }], sort: [], group: [], filter: null, filtersVisible: false }
    });
    expect(saveUsers.statusCode).toBe(200);

    const loadedInstances = await app.inject({ method: 'GET', url: '/api/grid-preferences/instances', headers: { authorization: `Bearer ${token}` } });
    expect(loadedInstances.statusCode).toBe(200);
    expect(loadedInstances.json().preference).toMatchObject({ gridKey: 'instances', ...instancePreference });

    const loadedUsers = await app.inject({ method: 'GET', url: '/api/grid-preferences/users', headers: { authorization: `Bearer ${token}` } });
    expect(loadedUsers.statusCode).toBe(200);
    expect(loadedUsers.json().preference).toMatchObject({ gridKey: 'users', filtersVisible: false, columns: [{ key: 'email', title: 'Email', visible: true, order: 0 }] });

    await app.close();
  });

  it('requires authentication to read or save preferences', async () => {
    const app = await buildApp({ logger: false, authRepository: createInMemoryAuthRepository(), gridPreferenceRepository: createInMemoryGridPreferenceRepository() });

    const read = await app.inject({ method: 'GET', url: '/api/grid-preferences/instances' });
    expect(read.statusCode).toBe(401);

    const write = await app.inject({ method: 'PUT', url: '/api/grid-preferences/instances', payload: { columns: [], sort: [], group: [], filter: null, filtersVisible: false } });
    expect(write.statusCode).toBe(401);

    await app.close();
  });
});
