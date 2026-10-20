import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { composeArticle, plan, run, MAX_PER_RUN } from './hashnode.mjs';
import { toolUrl } from './bluesky.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence.">';

test('composeArticle sets the canonical URL, links back and states the limits', () => {
  const url = toolUrl('mileage-log');
  const a = composeArticle({ title: 'Mileage Log — Free Tracker', description: 'Free log.' }, url);
  assert.equal(a.originalArticleURL, url);
  assert.equal(a.title, 'Mileage Log');
  assert.ok(a.contentMarkdown.includes(url));
  assert.match(a.contentMarkdown, /not legal, tax or professional advice/);
  assert.match(a.contentMarkdown, /free and open source \(MIT\)/);
});

test('plan skips URLs already on the publication and caps the run', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15', d: '2026-10-15' };
  const all = await plan({ launched, today: '2026-10-15', readPage: async () => page });
  assert.equal(all.length, MAX_PER_RUN);
  const out = await plan({ launched, today: '2026-10-15', seenUrls: new Set([toolUrl('a')]), readPage: async () => page, max: 1 });
  assert.deepEqual(out.map((p) => p.slug), ['b']);
});

test('without the enabling variable, token and publication id nothing is fetched or posted', async () => {
  const lines = [];
  const r = await run({ env: {}, fetchImpl: () => { throw new Error('network'); }, log: (s) => lines.push(s) });
  assert.equal(r.posted, 0);
  assert.match(lines[0], /DRY RUN/);
  for (const env of [{ DISTRIBUTE_HASHNODE: 'true' }, { DISTRIBUTE_HASHNODE: 'true', HASHNODE_TOKEN: 't' }]) {
    const r2 = await run({ env, fetchImpl: () => { throw new Error('network'); }, log() {} });
    assert.equal(r2.posted, 0);
  }
});

test('live: drafts by default, publishes only with HASHNODE_PUBLISH, skips existing canonicals', async () => {
  const { launched } = JSON.parse(await fs.readFile(new URL('../pages/launched.json', import.meta.url)));
  const now = new Date(Object.values(launched).sort().pop());
  const mk = (calls, existing = []) => async (url, init) => {
    assert.equal(url, 'https://gql.hashnode.com/');
    assert.equal(init.headers.authorization, 'tok');
    const b = JSON.parse(init.body);
    calls.push(b);
    const edges = existing.map((c) => ({ node: { canonicalUrl: c } }));
    return { ok: true, json: async () => ({ data: b.query.includes('publication(') ? { publication: { posts: { edges }, drafts: { edges: [] } } } : {} }) };
  };
  const env = { DISTRIBUTE_HASHNODE: 'true', HASHNODE_TOKEN: 'tok', HASHNODE_PUBLICATION_ID: 'pub1' };
  let calls = [];
  const r = await run({ env, fetchImpl: mk(calls), log() {}, now });
  const muts = calls.filter((c) => c.query.startsWith('mutation'));
  assert.ok(r.posted > 0 && muts.length === r.posted);
  for (const m of muts) {
    assert.match(m.query, /createDraft/);
    assert.equal(m.variables.input.publicationId, 'pub1');
  }
  const first = muts[0].variables.input.originalArticleURL;
  calls = [];
  await run({ env: { ...env, HASHNODE_PUBLISH: 'true' }, fetchImpl: mk(calls, [first]), log() {}, now });
  const m2 = calls.filter((c) => c.query.startsWith('mutation'));
  assert.ok(m2.every((m) => /publishPost/.test(m.query)));
  assert.ok(m2.every((m) => m.variables.input.originalArticleURL !== first));
});

test('GraphQL errors surface instead of being swallowed', async () => {
  const env = { DISTRIBUTE_HASHNODE: 'true', HASHNODE_TOKEN: 'tok', HASHNODE_PUBLICATION_ID: 'pub1' };
  await assert.rejects(run({ env, fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'UNAUTHENTICATED' }] }) }), log() {} }), /UNAUTHENTICATED/);
});
