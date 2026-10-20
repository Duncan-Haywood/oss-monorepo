import test from 'node:test';
import assert from 'node:assert/strict';
import { composeArticle, plan, run, MAX_PER_RUN } from './devto.mjs';
import { toolUrl } from './bluesky.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence.">';

test('composeArticle sets canonical_url, links back, states the limits, tags <= 4', () => {
  const url = toolUrl('mileage-log');
  const a = composeArticle({ title: 'Mileage Log — Free Tracker', description: 'Free log.' }, url);
  assert.equal(a.canonical_url, url);
  assert.equal(a.title, 'Mileage Log');
  assert.ok(a.body_markdown.includes(url));
  assert.match(a.body_markdown, /not legal, tax or professional advice/);
  assert.ok(a.tags.length <= 4);
});

test('plan skips URLs already on the account and caps the run', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15', d: '2026-10-15' };
  const all = await plan({ launched, today: '2026-10-15', readPage: async () => page });
  assert.equal(all.length, MAX_PER_RUN);
  const out = await plan({ launched, today: '2026-10-15', seenUrls: new Set([toolUrl('a')]), readPage: async () => page, max: 1 });
  assert.deepEqual(out.map((p) => p.slug), ['b']);
});

test('without the enabling variable nothing is fetched or posted', async () => {
  const lines = [];
  const r = await run({ env: {}, fetchImpl: () => { throw new Error('network'); }, log: (s) => lines.push(s) });
  assert.equal(r.posted, 0);
  assert.match(lines[0], /DRY RUN/);
  const r2 = await run({ env: { DISTRIBUTE_DEVTO: 'true' }, fetchImpl: () => { throw new Error('network'); }, log() {} });
  assert.equal(r2.posted, 0);
});

test('live: drafts by default, publishes only with DEVTO_PUBLISH, skips existing canonicals', async () => {
  const { launched } = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../pages/launched.json', import.meta.url)));
  const now = new Date(Object.values(launched).sort().pop());
  const mk = (calls, existing = []) => async (url, init) => {
    const u = new URL(url);
    calls.push([init.method, u.pathname, init.body && JSON.parse(init.body)]);
    assert.equal(init.headers['api-key'], 'k');
    return { ok: true, json: async () => (init.method === 'GET' ? existing.map((c) => ({ canonical_url: c })) : { id: 1 }) };
  };
  let calls = [];
  const r = await run({ env: { DISTRIBUTE_DEVTO: 'true', DEVTO_API_KEY: 'k' }, fetchImpl: mk(calls), log() {}, now });
  const posts = calls.filter((c) => c[0] === 'POST');
  assert.equal(posts.length, r.posted);
  assert.ok(r.posted > 0);
  for (const p of posts) assert.equal(p[2].article.published, false);
  calls = [];
  const first = toolUrl(posts[0][2].article.canonical_url.split('/').filter(Boolean).pop());
  await run({ env: { DISTRIBUTE_DEVTO: 'true', DEVTO_API_KEY: 'k', DEVTO_PUBLISH: 'true' }, fetchImpl: mk(calls, [first]), log() {}, now });
  const p2 = calls.filter((c) => c[0] === 'POST');
  assert.ok(p2.every((p) => p[2].article.published === true));
  assert.ok(p2.every((p) => p[2].article.canonical_url !== first));
});
