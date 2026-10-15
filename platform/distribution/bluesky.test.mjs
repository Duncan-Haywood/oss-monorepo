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
