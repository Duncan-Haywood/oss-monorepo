import test from 'node:test';
import assert from 'node:assert/strict';
import { composeStatus, plan, run, MAX_CHARS } from './mastodon.mjs';
import { toolUrl } from './bluesky.mjs';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence.">';

test('composeStatus fits 500 with links weighing 23, labels itself automated', () => {
  const url = toolUrl('a');
  const t = composeStatus({ title: 'Élan — x', description: 'Long. '.repeat(300).replace(/\. /g, '. ') }, url);
  assert.ok([...t].length - [...url].length + 23 <= MAX_CHARS);
  assert.match(t, /Automated post\.$/);
  assert.ok(t.includes(url));
});

test('plan skips already-posted URLs and caps the run', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15' };
  const out = await plan({ launched, today: '2026-10-15', seenText: toolUrl('a'), readPage: async () => page, max: 1 });
  assert.deepEqual(out.map((p) => p.slug), ['b']);
});

test('without the enabling variable nothing is fetched or posted', async () => {
  const lines = [];
  const r = await run({ env: {}, fetchImpl: () => { throw new Error('network'); }, log: (s) => lines.push(s) });
  assert.equal(r.posted, 0);
  assert.match(lines[0], /DRY RUN/);
});

test('live: refuses a non-bot account, otherwise posts once with an idempotency key', async () => {
  const env = { DISTRIBUTE_MASTODON: 'true', MASTODON_INSTANCE: 'https://m.example', MASTODON_TOKEN: 't' };
  const calls = [];
  const mk = (bot) => async (url, init) => {
    const u = new URL(url); calls.push([init.method, u.pathname, init.headers['idempotency-key']]);
    const json = u.pathname.endsWith('verify_credentials') ? { id: '1', bot }
      : init.method === 'GET' ? [] : { id: '9' };
    return { ok: true, json: async () => json };
  };
  await assert.rejects(run({ env, fetchImpl: mk(false), log() {}, now: new Date('2026-10-15') }), /not flagged as a bot/);
  calls.length = 0;
  const { launched } = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../pages/launched.json', import.meta.url)));
  const r = await run({ env, fetchImpl: mk(true), log() {}, now: new Date(Object.values(launched).sort().pop()) });
  const posts = calls.filter((c) => c[0] === 'POST');
  assert.equal(posts.length, r.posted);
  for (const p of posts) assert.match(p[2], /^launch-/);
  await assert.rejects(run({ env: { ...env, MASTODON_INSTANCE: 'http://x' }, fetchImpl: mk(true), log() {} }), /https/);
});

const lastLaunch = async () => {
  const { launched } = JSON.parse(await fs.readFile(new URL('../pages/launched.json', import.meta.url), 'utf8'));
  const [slug, date] = Object.entries(launched).sort((a, b) => a[1].localeCompare(b[1]) || b[0].localeCompare(a[0])).pop();
  return { slug, date };
};

test('composeStatus uses the whole budget but not a character more', () => {
  const url = toolUrl('a');
  const weight = (t) => [...t].length - [...url].length + 23;
  const long = composeStatus({ title: 'Tool', description: 'x'.repeat(900) }, url);
  assert.equal(weight(long), MAX_CHARS - 1);
  assert.match(long, /…\n\n/);
  const longTitle = composeStatus({ title: 'T'.repeat(900), description: 'Short.' }, url);
  assert.equal(weight(longTitle), MAX_CHARS);
  assert.match(longTitle, /…\n\n/);
});

test('plan treats the launch day as today (dry run plans the newest launch)', async () => {
  const { date } = await lastLaunch();
  const lines = [];
  const r = await run({ env: {}, log: (s) => lines.push(s), now: new Date(`${date}T12:00:00Z`) });
  assert.ok(r.planned > 0);
});

test('posting needs all three variables; any one missing stays a dry run', async () => {
  const boom = () => { throw new Error('network'); };
  const full = { DISTRIBUTE_MASTODON: 'true', MASTODON_INSTANCE: 'https://m.example', MASTODON_TOKEN: 't' };
  for (const k of Object.keys(full)) {
    const env = { ...full }; delete env[k];
    const r = await run({ env, fetchImpl: boom, log() {} });
    assert.equal(r.posted, 0, k);
  }
});

test('live: a launch already in the account\'s recent statuses (content or card) is not posted again', async () => {
  const { slug, date } = await lastLaunch();
  const env = { DISTRIBUTE_MASTODON: 'true', MASTODON_INSTANCE: 'https://m.example', MASTODON_TOKEN: 't' };
  for (const status of [{ content: `<p>see ${toolUrl(slug)}</p>` }, { content: '', card: { url: toolUrl(slug) } }, { content: `<a href="${toolUrl(slug)}">x</a>` }]) {
    const posted = [];
    const fetchImpl = async (url, init) => {
      const u = new URL(url);
      const json = u.pathname.endsWith('verify_credentials') ? { id: '1', bot: true }
        : init.method === 'GET' ? [status] : (posted.push(JSON.parse(init.body).status), { id: '9' });
      return { ok: true, json: async () => json };
    };
    await run({ env, fetchImpl, log() {}, now: new Date(`${date}T12:00:00Z`) });
    assert.ok(!posted.some((t) => t.includes(toolUrl(slug))), JSON.stringify(status));
  }
});

test('run directly from the command line it does a dry run', () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('./mastodon.mjs', import.meta.url))], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.match(out, /DRY RUN/);
});
