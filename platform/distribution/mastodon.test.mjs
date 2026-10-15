import test from 'node:test';
import assert from 'node:assert/strict';
import { composePost, plan, run, MAX_CHARS, toolUrl } from './mastodon.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence.">';
const cost = (t, url) => [...t].length - [...url].length + 23;

test('composePost fits the Mastodon-counted limit and labels itself automated', () => {
  const url = toolUrl('a');
  const { text } = composePost({ title: 'Élan — x', description: 'Long. '.repeat(200) }, url);
  assert.ok(cost(text, url) <= MAX_CHARS);
  assert.match(text, /Automated post/);
  assert.ok(text.includes(url));
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

const env = { DISTRIBUTE_MASTODON: 'true', MASTODON_INSTANCE: 'https://m.example', MASTODON_TOKEN: 't' };
const fakeFetch = (me, calls) => async (url, init) => {
  calls.push({ path: new URL(url).pathname, init });
  const p = new URL(url).pathname;
  const body = p.endsWith('verify_credentials') ? me : p.endsWith('/statuses') && init.method === 'GET' ? [] : {};
  return { ok: true, status: 200, json: async () => body };
};

test('live run refuses an account not flagged as a bot', async () => {
  const calls = [];
  await assert.rejects(run({ env, fetchImpl: fakeFetch({ id: '1', bot: false }, calls), log() {} }), /not flagged as a bot/);
  assert.ok(!calls.some((c) => c.init.method === 'POST'));
});

test('live run posts unlisted with an idempotency key', async () => {
  const calls = [];
  const r = await run({ env, fetchImpl: fakeFetch({ id: '1', bot: true }, calls), log() {}, now: new Date('2026-10-15T12:00:00Z') });
  const posts = calls.filter((c) => c.init.method === 'POST');
  assert.equal(posts.length, r.posted);
  for (const p of posts) {
    assert.equal(JSON.parse(p.init.body).visibility, 'unlisted');
    assert.match(p.init.headers['idempotency-key'], /^launch-/);
  }
});

test('http instances are rejected', async () => {
  await assert.rejects(run({ env: { ...env, MASTODON_INSTANCE: 'http://m.example' }, fetchImpl: () => {}, log() {} }), /https/);
});
