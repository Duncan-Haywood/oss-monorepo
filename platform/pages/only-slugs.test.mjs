// The filter that lets a pull request run the browser checks against one
// venture. Every assertion here is about the same worry: a filter is a way to
// verify less, and the failure mode that matters is a run that verifies
// nothing and reports green.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  onlySlugs, keepSlug, keepPagePath, describeFilter, requireNonEmpty,
} from './only-slugs.mjs';

test('no filter asked for reads as null, not an empty set', () => {
  // The distinction the whole module rests on: null means "check everything",
  // an empty set would mean "check nothing". A CI input that is not supplied
  // expands to the empty string, and that must mean a full run.
  assert.equal(onlySlugs({}, []), null);
  assert.equal(onlySlugs({ ONLY_SLUGS: '' }, []), null);
  assert.equal(onlySlugs({ ONLY_SLUGS: '   ' }, []), null);
  assert.equal(onlySlugs({ ONLY_SLUGS: ',, ,' }, []), null);
});

test('ONLY_SLUGS parses a comma list, trimming and dropping blanks', () => {
  const only = onlySlugs({ ONLY_SLUGS: 'ebay-fee-calculator, shopify-fee-calculator ,' }, []);
  assert.deepEqual([...only].sort(), ['ebay-fee-calculator', 'shopify-fee-calculator']);
});

test('argv wins over the environment, so the pre-existing CLI form is unchanged', () => {
  // `node platform/pages/roundtrip.mjs fence-bid-calculator` predates
  // ONLY_SLUGS and is documented in three of the checks' own headers. It has
  // to keep meaning exactly what it meant.
  const only = onlySlugs({ ONLY_SLUGS: 'from-env' }, ['fence-bid-calculator']);
  assert.deepEqual([...only], ['fence-bid-calculator']);
});

test('keepSlug passes everything when there is no filter', () => {
  assert.equal(keepSlug('anything', null), true);
  assert.equal(keepSlug('ebay-fee-calculator', new Set(['ebay-fee-calculator'])), true);
  assert.equal(keepSlug('shopify-fee-calculator', new Set(['ebay-fee-calculator'])), false);
});

test('keepPagePath keeps a venture\'s own pages, at both nesting depths', () => {
  const only = new Set(['ebay-fee-calculator']);
  assert.equal(keepPagePath('ebay-fee-calculator/index.html', only), true);
  assert.equal(keepPagePath('ebay-fee-calculator/should-i-offer-a-partial-refund-on-ebay.html', only), true);
  // `build.mjs` emits a second level for ventures with a nested hub, e.g.
  // ai-engineering-academy's six electronics calculators.
  assert.equal(keepPagePath('ebay-fee-calculator/sub/index.html', only), true);
  assert.equal(keepPagePath('shopify-fee-calculator/index.html', only), false);
});

test('keepPagePath drops the catalogue pages under a filter, keeps them without one', () => {
  const only = new Set(['ebay-fee-calculator']);
  // A run scoped to one venture is asking about that venture. The hub, the
  // category pages and /about belong to no slug and are what the nightly is
  // for -- and `sweep`'s hub assertions would fail for a reason that is not a
  // defect if they were filtered underneath it.
  assert.equal(keepPagePath('index.html', only), false);
  assert.equal(keepPagePath('about/index.html', only), false);
  assert.equal(keepPagePath('c/trades/index.html', only), false);
  // With no filter, every one of them is still checked.
  for (const rel of ['index.html', 'about/index.html', 'c/trades/index.html']) {
    assert.equal(keepPagePath(rel, null), true);
  }
});

test('describeFilter is empty without a filter and names every slug with one', () => {
  // Returning '' rather than undefined is what lets a check call it
  // unconditionally without printing a reassuring header on a full run.
  assert.equal(describeFilter(null), '');
  const text = describeFilter(new Set(['b-tool', 'a-tool']));
  assert.match(text, /^FILTERED to 2 venture\(s\): a-tool, b-tool$/);
});

test('requireNonEmpty exits 2, not 1, when a filter matched nothing', async () => {
  // 2 is "nothing was verified" and 1 is "something is broken". Reporting an
  // over-narrow filter as a site defect sends the reader hunting for a bug in
  // a calculator that is fine.
  const { spawnSync } = await import('node:child_process');
  const script = `
    import { requireNonEmpty } from '${new URL('./only-slugs.mjs', import.meta.url).pathname}';
    requireNonEmpty([], new Set(['typo-slug']), 'tool directories');
    console.log('UNREACHABLE');
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.doesNotMatch(run.stdout, /UNREACHABLE/);
  assert.match(run.stderr, /typo-slug/);
  assert.match(run.stderr, /skip and not a pass/);
});

test('requireNonEmpty returns quietly when there is something to check', () => {
  // No process.exit, no output: the ordinary path must stay silent or every
  // check gains a line of noise per run.
  assert.equal(requireNonEmpty(['a-tool'], new Set(['a-tool'])), undefined);
});

// The rest of this file is about the checks that *use* the filter, not the
// filter itself. It exists because of a bug made while wiring it in: three of
// the checks had taken slugs as an argv **array** since they were written, and
// removing one `const only = process.argv.slice(2)` left a second line below
// it still doing `if (only.length)`. `onlySlugs()` returns a Set or null, so
// with a filter that read as falsy and did nothing (the filtered run passed),
// and without one it threw `Cannot read properties of null`. The filtered path
// worked and the ordinary path crashed — which is the worst possible way round,
// because the filtered path is the one a new feature gets tested on.

test('no check treats the filter as an array', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const here = path.dirname(new URL(import.meta.url).pathname);
  const files = (await fs.readdir(here)).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));

  const arrayIsms = /\bonly\s*\.\s*(length|includes|indexOf|filter|map|join|slice|push)\b/;
  const offenders = [];
  for (const file of files) {
    const src = await fs.readFile(path.join(here, file), 'utf8');
    if (!src.includes("from './only-slugs.mjs'")) continue;
    const line = src.split('\n').findIndex((l) => arrayIsms.test(l));
    if (line !== -1) offenders.push(`${file}:${line + 1}`);
  }
  assert.deepEqual(offenders, [],
    'onlySlugs() returns a Set or null — an array method on it is either a '
    + 'leftover from the old argv filter or a silent no-op under a Set.');
});

test('every check that imports the filter actually applies it', async () => {
  // Importing the helper and then never calling onlySlugs() would leave a
  // check silently unfiltered while looking wired up — a scoped run that
  // quietly swept the whole site would be slow but honest; the reverse, a
  // check that reports on 169 tools when asked about one, is neither.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const here = path.dirname(new URL(import.meta.url).pathname);
  const files = (await fs.readdir(here)).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));

  const wired = [];
  for (const file of files) {
    const src = await fs.readFile(path.join(here, file), 'utf8');
    if (!src.includes("from './only-slugs.mjs'")) continue;
    assert.match(src, /\bonlySlugs\(\)/, `${file} imports the filter but never reads it`);
    assert.match(src, /\b(keepSlug|keepPagePath)\(/, `${file} reads the filter but never applies it`);
    wired.push(file);
  }
  // The seven per-venture checks. `journey.mjs` is a whole-site narrative and
  // is deliberately absent; if it ever appears here, that was a decision, not
  // a tidy-up.
  assert.deepEqual(wired.sort(), [
    'contrast.mjs', 'highlight.mjs', 'optout.mjs', 'presets.mjs',
    'roundtrip.mjs', 'sideways.mjs', 'sweep.mjs',
  ]);
});
