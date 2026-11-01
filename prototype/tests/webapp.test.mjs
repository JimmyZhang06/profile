import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCloudApp } from '../server/cloud/app.mjs';
import { createLocalApp } from '../server/local.mjs';

const publicRoot = new URL('../public/', import.meta.url);
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifestHref = html.match(/<link rel="manifest" href="([^"]+)"/)[1];
const appleHref = html.match(/<link rel="apple-touch-icon" sizes="180x180" href="([^"]+)"/)[1];

// Exercise both real HTTP serving paths. A Vite preview alone would miss the
// production MIME type and SPA-fallback failures that hide launcher icons.
for (const [mode, createApp] of [['cloud', createCloudApp], ['local', createLocalApp]]) {
  test(`${mode} serves usable install metadata and real PNGs without authentication`, async t => {
    const app = await createApp({
      memory: true, production: true, staticRoot: fileURLToPath(publicRoot),
      origin: 'https://webapp.example.test', adminEmail: 'owner@example.test',
      authSecret: 'fictional-webapp-metadata-test-secret-longer-than-32',
      credentialKey: Buffer.alloc(32, 13).toString('base64'),
    });
    t.after(() => app.close());
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const response = await fetch(base + manifestHref);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/manifest\+json/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const manifest = await response.json();
    assert.equal(manifest.id, '/');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.short_name, '履历');
    assert.ok(manifest.icons.some(icon => icon.purpose === 'any' && icon.sizes === '192x192'));
    assert.ok(manifest.icons.some(icon => icon.purpose === 'any' && icon.sizes === '512x512'));
    assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable' && icon.sizes === '512x512'));
    for (const {src, sizes} of [{src:appleHref, sizes:'180x180'}, ...manifest.icons]) {
      const icon = await fetch(base + src);
      assert.equal(icon.status, 200, src);
      assert.equal(icon.headers.get('content-type'), 'image/png', src);
      const bytes = Buffer.from(await icon.arrayBuffer());
      assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, sizes);
      assert.deepEqual(bytes, await readFile(new URL(new URL(src, base).pathname.slice(1), publicRoot)));
    }
    for (const missing of ['/icons/missing.png', '/missing.webmanifest']) {
      const response = await fetch(base + missing);
      assert.equal(response.status, 404, missing);
      assert.doesNotMatch(response.headers.get('content-type'), /text\/html/);
      await response.body.cancel();
    }
  });
}
