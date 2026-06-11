import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('static web asset serving', () => {
  it('serves the built SPA index for browser routes when web dist exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oxygen-cms-web-'));
    try {
      await mkdir(join(dir, 'assets'));
      await writeFile(join(dir, 'index.html'), '<div id="root">CMS shell</div>');
      await writeFile(join(dir, 'assets/app.js'), 'console.log("cms")');

      const app = await buildApp({ logger: false, webDistPath: dir, enableBackgroundPolling: false });

      const browserRoute = await app.inject({ method: 'GET', url: '/settings' });
      expect(browserRoute.statusCode).toBe(200);
      expect(browserRoute.headers['content-type']).toContain('text/html');
      expect(browserRoute.body).toContain('CMS shell');

      const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain('console.log');

      const apiMiss = await app.inject({ method: 'GET', url: '/api/not-real' });
      expect(apiMiss.statusCode).toBe(404);

      await app.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
