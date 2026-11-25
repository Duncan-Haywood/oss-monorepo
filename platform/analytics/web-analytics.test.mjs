import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beaconTag, injectBeacon, injectDir, normaliseToken, resolveToken, BEACON_SRC } from './web-analytics.mjs';
import { matchSite, provision } from './provision.mjs';

// Built, not written out: a 32-hex literal reads as an API key to gitleaks.
const HEX = '0123456789abcdef';
const TOKEN = HEX + HEX.toUpperCase();
const PAGE = '<!doctype html><html><head></head><body><p>x</p></body></html>';

test('token must be 32 hex characters', () => {
  assert.equal(normaliseToken(''), '');
  assert.equal(normaliseToken(TOKEN), TOKEN.toLowerCase());
  assert.throws(() => normaliseToken('abc'));
  assert.throws(() => normaliseToken(`${TOKEN.slice(0, 31)}'`));
});

test('beacon goes before the last </body>, once', () => {
  const once = injectBeacon(PAGE, TOKEN);
  assert.ok(once.includes(`<p>x</p><script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${TOKEN.toLowerCase()}"}'></script>\n</body>`));
  assert.equal(injectBeacon(once, TOKEN), once);
});

test('no token, no change; non-documents are left alone', () => {
  assert.equal(injectBeacon(PAGE, ''), PAGE);
  assert.equal(beaconTag(''), '');
  assert.equal(injectBeacon('<p>fragment</p>', TOKEN), '<p>fragment</p>');
});

test('injectDir walks nested pages', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-'));
  await fs.mkdir(path.join(dir, 'a'));
  await fs.writeFile(path.join(dir, 'index.html'), PAGE);
  await fs.writeFile(path.join(dir, 'a', 'index.html'), PAGE);
  await fs.writeFile(path.join(dir, 'a', 'x.js'), 'x');
  assert.deepEqual(await injectDir(dir, TOKEN), { changed: 2, seen: 2 });
  assert.ok((await fs.readFile(path.join(dir, 'a', 'index.html'), 'utf8')).includes(BEACON_SRC));
  assert.deepEqual(await injectDir(dir, TOKEN), { changed: 0, seen: 2 });
});

test('resolveToken prefers an explicit value, then site.json', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-'));
  const siteFile = path.join(dir, 'site.json');
  await fs.writeFile(siteFile, JSON.stringify({ token: TOKEN }));
  assert.equal(await resolveToken({ siteFile }), TOKEN.toLowerCase());
  assert.equal(await resolveToken({ explicit: 'f'.repeat(32), siteFile }), 'f'.repeat(32));
  assert.equal(await resolveToken({ siteFile: path.join(dir, 'missing.json') }), '');
});

test('matchSite reads host or the ruleset zone name', () => {
  assert.equal(matchSite([{ host: 'other.app' }, { host: 'MarisStella.app', site_token: 'x' }], 'marisstella.app').site_token, 'x');
  assert.equal(matchSite([{ ruleset: { zone_name: 'marisstella.app' }, site_token: 'y' }], 'marisstella.app').site_token, 'y');
  assert.equal(matchSite(null, 'marisstella.app'), null);
});

const reply = (result, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => (ok ? { success: true, result } : { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }) });

test('provision finds an existing site', async () => {
  const calls = [];
  const token = await provision({
    host: 'marisstella.app', account: 'acc', tokens: ['t'], log: () => {},
    fetchImpl: async (url, init) => { calls.push(`${init.method} ${url}`); return reply([{ host: 'marisstella.app', site_token: TOKEN }]); },
  });
  assert.equal(token, TOKEN.toLowerCase());
  assert.equal(calls.length, 1);
});

test('provision creates a missing site, and falls through a token without permission', async () => {
  const seen = [];
  const token = await provision({
    host: 'marisstella.app', account: 'acc', tokens: ['weak', 'strong'], log: () => {},
    fetchImpl: async (url, init) => {
      const auth = init.headers.authorization;
      seen.push(`${auth} ${init.method}`);
      if (auth === 'Bearer weak') return reply(null, false);
      if (init.method === 'GET') return reply([]);
      assert.deepEqual(JSON.parse(init.body), { host: 'marisstella.app', auto_install: false });
      return reply({ site_token: TOKEN });
    },
  });
  assert.equal(token, TOKEN.toLowerCase());
  assert.deepEqual(seen, ['Bearer weak GET', 'Bearer strong GET', 'Bearer strong POST']);
});

test('provision returns no token when every attempt fails', async () => {
  const logs = [];
  const token = await provision({ host: 'h', account: 'a', tokens: ['x'], log: (m) => logs.push(m), fetchImpl: async () => reply(null, false) });
  assert.equal(token, '');
  assert.match(logs.join('\n'), /Authentication error/);
});
