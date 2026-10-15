import test from 'node:test';
import assert from 'node:assert/strict';
import { composeStatus, plan, run, MAX_CHARS } from './mastodon.mjs';
import { toolUrl } from './bluesky.mjs';

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
