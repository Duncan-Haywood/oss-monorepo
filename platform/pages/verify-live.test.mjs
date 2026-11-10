// verify-live.sh is the deploy's only proof that the site serves. These tests
// run it against a local server standing in for the published site.
//   node --test platform/pages/verify-live.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-live.sh');
const SHA = 'a'.repeat(40);

function site(versionSha) {
  const tools = Array.from({ length: 25 }, (_, i) => ({ slug: `tool-${i}` }));
  const files = {
    '/': '<html>hub</html>',
    '/research/': 'r',
    '/writing/': 'w',
    '/sitemap.xml': '<sitemapindex></sitemapindex>',
    '/sitemap-hub.xml': '<urlset></urlset>',
    '/robots.txt': 'User-agent: *',
    '/catalog.json': JSON.stringify({ tools }),
    '/llms.txt': '# site\n- [Tool](https://x/tool-0/)\n',
    '/llms-full.txt': 'full',
    '/feed.xml': '<feed><entry></entry></feed>',
    '/tool-0/': 'tool',
  };
  if (versionSha) files['/version.json'] = JSON.stringify({ sha: versionSha });
  return http.createServer((req, res) => {
    const body = files[new URL(req.url, 'http://x').pathname];
    res.writeHead(body === undefined ? 404 : 200);
    res.end(body ?? 'missing');
  });
}

async function run(server, env) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    return await new Promise((resolve) => {
      const p = spawn('bash', [SCRIPT, base], {
        env: { PATH: process.env.PATH, VERIFY_SHA_TRIES: '2', VERIFY_SHA_DELAY: '0', ...env },
      });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { out += d; });
      p.on('close', (code) => resolve({ code, out }));
    });
  } finally {
    server.close();
  }
}

test('passes when the live version.json names this run’s commit', async () => {
  const r = await run(site(SHA), { GITHUB_SHA: SHA });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /names this run's commit/);
});

test('fails when the site still serves an older build', async () => {
  const r = await run(site('b'.repeat(40)), { GITHUB_SHA: SHA });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /did not publish this build/);
});

test('fails when version.json is missing', async () => {
  const r = await run(site(null), { GITHUB_SHA: SHA });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /names commit 'none'/);
});

test('outside Actions (no GITHUB_SHA) the commit check is skipped', async () => {
  const r = await run(site(null), {});
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Published and verified/);
});
