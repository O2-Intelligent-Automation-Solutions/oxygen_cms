import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health endpoint', () => {
  it('returns ok status and service metadata', async () => {
    const app = await buildApp({ logger: false });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'oxygen-cms-api'
    });

    await app.close();
  });
});
