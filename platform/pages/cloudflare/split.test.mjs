import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import router, { APP_DIRS, SHARD_DIRS, SITE_ORIGIN, WORKERS_DEV_HOST, appBinding, inShard } from './router.mjs';
import { split, workersDevHeaders, securityHeaders, SECURITY_HEADERS } from './split.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('wrangler.toml runs the router for exactly the shard and app directories', async () => {
  const toml = await fs.readFile(path.join(HERE, 'wrangler.toml'), 'utf8');
  const line = toml.split('\n').find((l) => l.startsWith('run_worker_first'));
  const patterns = JSON.parse(line.slice(line.indexOf('=') + 1));
  assert.deepEqual(patterns, [...SHARD_DIRS, ...Object.keys(APP_DIRS)].flatMap((d) => [`/${d}`, `/${d}/*`]));
  for (const binding of Object.values(APP_DIRS)) assert.match(toml, new RegExp(`binding = "${binding}"`));
});

test('the router hands app paths to their Worker unchanged', async () => {
  let seen = '';
  const env = {
    ASSETS: { fetch: async () => new Response('site') },
    SHARD: { fetch: async () => new Response('shard') },
    GRANTS: { fetch: async (req) => { seen = req.url; return new Response('grants'); } },
  };
  const get = async (p) => (await router.fetch(new Request(`https://marisstella.app${p}`), env)).text();
  assert.equal(await get('/grants/api/health?x=1'), 'grants');
  assert.equal(seen, 'https://marisstella.app/grants/api/health?x=1');
  assert.equal(await get('/grants'), 'grants');
  assert.equal(await get('/grant-deadline-tracker/'), 'site');
  assert.equal(appBinding('/grantsx/'), null);
  // Without the binding (a fork's deploy), the path falls back to the site's assets.
  delete env.GRANTS;
  assert.equal(await get('/grants/'), 'site');
});

test('the router sends shard paths to the shard and everything else to its own assets', async () => {
  const env = {
    ASSETS: { fetch: async () => new Response('site') },
    SHARD: { fetch: async () => new Response('shard') },
  };
  const get = async (p) => (await router.fetch(new Request(`https://x.dev${p}`), env)).text();
  assert.equal(await get('/research/'), 'shard');
  assert.equal(await get('/writing/a-post/'), 'shard');
  assert.equal(await get('/dev'), 'shard');
  assert.equal(await get('/'), 'site');
  assert.equal(await get('/research-notes-tool/'), 'site');
  assert.equal(inShard('/developer-tool/'), false);
});

test('split moves the shard directories, copies 404.html and counts both halves', async () => {
  const site = await fs.mkdtemp(path.join(os.tmpdir(), 'split-site-'));
  const shard = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'split-shard-')), 'out');
  await fs.mkdir(path.join(site, 'research', 'a'), { recursive: true });
  await fs.mkdir(path.join(site, 'roof-bid'));
  await fs.writeFile(path.join(site, 'research', 'a', 'index.html'), 'r');
  await fs.writeFile(path.join(site, 'roof-bid', 'index.html'), 't');
  await fs.writeFile(path.join(site, '404.html'), 'missing');
  await fs.writeFile(path.join(site, 'index.html'), 'hub');

  const r = await split(site, shard);
  assert.deepEqual(r, { site: 3, shard: 2, problems: [], packed: { cards: 0, packs: 0 } });
  assert.equal(await fs.readFile(path.join(shard, 'research', 'a', 'index.html'), 'utf8'), 'r');
  assert.equal(await fs.readFile(path.join(shard, '404.html'), 'utf8'), 'missing');
  assert.equal(await fs.stat(path.join(site, 'research')).catch(() => null), null);
});

test('the workers.dev address 301s to the domain, keeping path and query', async () => {
  const env = { ASSETS: { fetch: async () => new Response('site') }, SHARD: { fetch: async () => new Response('shard') } };
  const res = await router.fetch(new Request(`https://${WORKERS_DEV_HOST}/research/a/?q=1`), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), `${SITE_ORIGIN}/research/a/?q=1`);
  const own = await router.fetch(new Request('https://marisstella.app/research/'), env);
  assert.equal(await own.text(), 'shard');
});

test('wrangler.toml names the Worker whose workers.dev host the redirect matches', async () => {
  const toml = await fs.readFile(path.join(HERE, 'wrangler.toml'), 'utf8');
  const name = toml.match(/^name = "([^"]+)"/m)[1];
  assert.ok(WORKERS_DEV_HOST.startsWith(`${name}.`), `${WORKERS_DEV_HOST} is not ${name}'s workers.dev address`);
});

test('split writes a _headers rule that sends only the workers.dev host to the domain', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'split-headers-'));
  const site = path.join(root, 'site');
  await fs.mkdir(site);
  await fs.writeFile(path.join(site, '404.html'), '');
  await split(site, path.join(root, 'shard'));
  const h = await fs.readFile(path.join(site, '_headers'), 'utf8');
  assert.equal(h, workersDevHeaders() + securityHeaders());
  assert.match(h, new RegExp(`^https://${WORKERS_DEV_HOST.replace(/\./g, '\\.')}/\\*\n  Refresh: 0; url=${SITE_ORIGIN}/:splat\n`));
  for (const line of h.split('\n')) assert.ok(line.length <= 2000);
});

test('both Workers send the baseline security headers on every path, and nothing that blocks embedding', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'split-sec-'));
  const site = path.join(root, 'site');
  await fs.mkdir(site);
  await fs.writeFile(path.join(site, '404.html'), '');
  await split(site, path.join(root, 'shard'));
  for (const f of [path.join(site, '_headers'), path.join(root, 'shard', '_headers')]) {
    const h = await fs.readFile(f, 'utf8');
    assert.match(h, /^\/\*\n  Strict-Transport-Security: max-age=\d+\n/m, f);
    assert.match(h, /^  X-Content-Type-Options: nosniff$/m, f);
    assert.doesNotMatch(h, /X-Frame-Options|frame-ancestors|includeSubDomains|preload/i, f);
  }
  assert.ok(Number(SECURITY_HEADERS['Strict-Transport-Security'].match(/max-age=(\d+)/)[1]) >= 15552000);
});
