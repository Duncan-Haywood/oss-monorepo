// node --test platform/aws/site/deploy/emulate.test.mjs
//
// The deploy's own checks, verify-live.sh and check_site_fresh.py, pointed at
// the AWS serving path (publish.mjs layout + CloudFront Functions) instead of
// Cloudflare. Both take the base URL as an argument, so the CloudFront
// address (https://dXXXX.cloudfront.net/) works the same way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emulate } from './emulate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SHA = 'b'.repeat(40);

async function build({ builtAt = new Date().toISOString() } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aws-site-'));
  const tools = Array.from({ length: 25 }, (_, i) => ({ slug: `tool-${i}` }));
  const files = {
    'index.html': '<html>hub</html>',
    '404.html': '<html>not found</html>',
    'research/index.html': 'r',
    'writing/index.html': 'w',
    'sitemap.xml': '<sitemapindex></sitemapindex>',
    'sitemap-hub.xml': '<urlset></urlset>',
    'robots.txt': 'User-agent: *',
    'catalog.json': JSON.stringify({ tools }),
    'llms.txt': '# site\n- [Tool](https://marisstella.app/tool-0/)\n',
    'llms-full.txt': 'full',
    'feed.xml': '<feed><entry></entry></feed>',
    'tool-0/index.html': 'tool',
    'tool-0/how.html': 'how',
    'version.json': JSON.stringify({ sha: SHA, built_at: builtAt }),
  };
  for (const [rel, body] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), body);
  }
  return dir;
}

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    // No proxy variables: the emulator is on loopback.
    const p = spawn(cmd, args, { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

async function withServer(dir, fn) {
  const server = await emulate(dir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/`);
  } finally {
    server.close();
  }
}

test('verify-live.sh passes against the AWS serving path', async () => {
  const dir = await build();
  const r = await withServer(dir, (base) => run('bash', [path.join(root, 'platform/pages/verify-live.sh'), base], {
    GITHUB_SHA: SHA, VERIFY_SHA_TRIES: '1', VERIFY_SHA_DELAY: '0',
  }));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Published and verified/);
});

test('verify-live.sh fails when the AWS copy serves an older commit', async () => {
  const dir = await build();
  const r = await withServer(dir, (base) => run('bash', [path.join(root, 'platform/pages/verify-live.sh'), base], {
    GITHUB_SHA: 'c'.repeat(40), VERIFY_SHA_TRIES: '1', VERIFY_SHA_DELAY: '0',
  }));
  assert.notEqual(r.code, 0);
});

test('check_site_fresh.py reads version.json through the AWS serving path', async () => {
  const fresh = await build();
  const ok = await withServer(fresh, (base) => run('python3', [path.join(root, 'platform/ci/check_site_fresh.py'), '--url', base]));
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /fresh: built/);

  const stale = await build({ builtAt: '2020-01-01T00:00:00Z' });
  const bad = await withServer(stale, (base) => run('python3', [path.join(root, 'platform/ci/check_site_fresh.py'), '--url', base]));
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /STALE/);
});

test('served forms over HTTP: redirects, extensionless pages, 404 page', async () => {
  const dir = await build();
  await withServer(dir, async (base) => {
    const get = (p) => fetch(base + p.slice(1), { redirect: 'manual' });
    let r = await get('/tool-0');
    assert.equal(r.status, 307);
    assert.equal(r.headers.get('location'), '/tool-0/');
    r = await get('/tool-0/how');
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'how');
    assert.match(r.headers.get('content-type'), /text\/html/);
    r = await get('/tool-0/how.html?x=1');
    assert.equal(r.headers.get('location'), '/tool-0/how?x=1');
    r = await get('/nope/');
    assert.equal(r.status, 404);
    assert.match(await r.text(), /not found/);
  });
});
