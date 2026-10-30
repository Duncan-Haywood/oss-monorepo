import test from 'node:test';
import assert from 'node:assert/strict';
import { readMeta, composePost, recentLaunches, plan, run, MAX_GRAPHEMES, toolUrl } from './bluesky.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Free log. Second sentence &amp; more.">';

test('readMeta decodes entities and rejects pages without both fields', () => {
  assert.deepEqual(readMeta(page), { title: 'Mileage Log — Free Tracker', description: 'Free log. Second sentence & more.' });
  assert.equal(readMeta('<title>x</title>'), null);
});

test('composePost fits the limit, labels itself automated, and the facet covers the URL bytes', () => {
  const url = toolUrl('a');
  const { text, facets } = composePost({ title: 'Élan — x', description: 'Long. '.repeat(200) }, url);
  assert.ok([...new Intl.Segmenter().segment(text)].length <= MAX_GRAPHEMES);
  assert.match(text, /Automated post/);
  const { byteStart, byteEnd } = facets[0].index;
  assert.equal(Buffer.from(text).subarray(byteStart, byteEnd).toString(), url);
});

test('recentLaunches keeps only the window, newest first', () => {
  const l = { old: '2026-10-01', a: '2026-10-14', b: '2026-10-15', future: '2026-10-20' };
  assert.deepEqual(recentLaunches(l, '2026-10-15'), ['b', 'a']);
});

test('plan skips already-posted URLs, pages without metadata, and caps the run', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15', d: '2026-10-15', e: '2026-10-15' };
  const readPage = async (s) => (s === 'c' ? null : page);
  const out = await plan({ launched, today: '2026-10-15', seenText: `see ${toolUrl('a')}`, readPage, max: 2 });
  assert.deepEqual(out.map((p) => p.slug), ['b', 'd']);
});

test('without the enabling variable nothing is fetched or posted', async () => {
  const lines = [];
  const r = await run({ env: {}, fetchImpl: () => { throw new Error('network'); }, log: (s) => lines.push(s) });
  assert.equal(r.posted, 0);
  assert.match(lines[0], /DRY RUN/);
});

test('recentLaunches includes a tool launched exactly WINDOW_DAYS ago and drops the day before', () => {
  const l = { edge: '2026-10-12', past: '2026-10-11' };
  assert.deepEqual(recentLaunches(l, '2026-10-15'), ['edge']);
});

const grapheme = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].length;

test('a long unpunctuated description is clipped with an ellipsis and the post stays within the limit', () => {
  const { text } = composePost({ title: 'T', description: 'x'.repeat(500) }, toolUrl('a'));
  assert.ok(grapheme(text) <= MAX_GRAPHEMES);
  assert.equal(grapheme(text), MAX_GRAPHEMES - 1);
  assert.match(text, /x…\n\n/);
});

test('the description is dropped once fewer than 21 graphemes of room remain', () => {
  const url = toolUrl('a');
  const tail = `\n\n${url}\n\nFree and open source (MIT). Automated post.`;
  const titleLen = MAX_GRAPHEMES - grapheme('New free tool: ') - grapheme(tail) - 2 - 21;
  const withRoom = composePost({ title: 'T'.repeat(titleLen), description: 'Hello world.' }, url);
  assert.match(withRoom.text, /Hello world\./);
  const tight = composePost({ title: 'T'.repeat(titleLen + 1), description: 'Hello world.' }, url);
  assert.doesNotMatch(tight.text, /Hello world\./);
});

function fakeBluesky() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const name = new URL(url).pathname.split('/').pop().split('.').pop();
    calls.push(name);
    const body = name === 'createSession' ? { accessJwt: 'j', did: 'did:x' } : name === 'getAuthorFeed' ? { feed: [] } : {};
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl };
}

test('posting needs the enabling variable set to "true" plus both credentials', async () => {
  const full = { DISTRIBUTE_BLUESKY: 'true', BSKY_HANDLE: 'h', BSKY_APP_PASSWORD: 'p' };
  for (const env of [
    { ...full, DISTRIBUTE_BLUESKY: 'false' },
    { ...full, DISTRIBUTE_BLUESKY: undefined },
    { ...full, BSKY_HANDLE: undefined },
    { ...full, BSKY_APP_PASSWORD: undefined },
    { BSKY_HANDLE: 'h', BSKY_APP_PASSWORD: 'p' },
  ]) {
    const { calls, fetchImpl } = fakeBluesky();
    const r = await run({ env, fetchImpl, log: () => {} });
    assert.equal(r.posted, 0);
    assert.deepEqual(calls, [], JSON.stringify(env));
  }
  const { calls, fetchImpl } = fakeBluesky();
  await run({ env: full, fetchImpl, log: () => {} });
  assert.deepEqual(calls.slice(0, 2), ['createSession', 'getAuthorFeed']);
});
