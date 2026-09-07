import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findOrphans, outboundToolLinks, relatedness, surveyTools } from './siblings.mjs';

test('a one-hop link to a sibling tool counts', () => {
  const links = outboundToolLinks('<a href="../irrigation-winterization-bid-calculator/">blowout</a>');
  assert.deepEqual([...links], ['irrigation-winterization-bid-calculator']);
});

test('the index.html spelling of the same destination counts', () => {
  assert.deepEqual([...outboundToolLinks('<a href="../foo-calculator/index.html">x</a>')], ['foo-calculator']);
});

test('an anchor or query on a sibling link still reaches the tool', () => {
  assert.deepEqual([...outboundToolLinks('<a href="../foo/#inputs">x</a>')], ['foo']);
  assert.deepEqual([...outboundToolLinks('<a href="../foo/?a=1">x</a>')], ['foo']);
});

// The distinction the whole report turns on. A link into a sibling's *sub-page*
// lands a crawler on a comparison or guide page, which still has to walk up to
// reach the tool — so it is not the one hop this measures, and counting it
// would report an orphan as closed when it is not.
test('a link to a sibling sub-page is not a link to the tool', () => {
  assert.deepEqual([...outboundToolLinks('<a href="../foo/vs-jobber.html">x</a>')], []);
  assert.deepEqual([...outboundToolLinks('<a href="../foo/how-much.html">x</a>')], []);
});

test("a page's own relative links are not sibling links", () => {
  assert.deepEqual([...outboundToolLinks('<a href="./vs-aspire.html">x</a><a href="LICENSE">y</a>')], []);
});

// Measured on 2026-09-07 and the reason this file exists: #3682's commit
// message says it closed the orphan to the Whatnot payout calculator, and the
// only thing it added to the static HTML was FAQ prose. The href is written by
// `calc.mjs` at runtime, so a crawler that does not execute JavaScript never
// sees it. A report that counted prose mentions would have called that closed.
test('a bare mention with no href does not close an orphan', () => {
  assert.deepEqual([...outboundToolLinks('<p>See the whatnot-seller-payout calculator.</p>')], []);
});

test('generic slug words do not make two unrelated tools look close', () => {
  // Both are "bid calculators"; nothing else is shared, so the score is 0.
  assert.equal(relatedness('roofing-bid-calculator', 'toilet-replacement-bid-calculator'), 0);
  // The job words are what count.
  assert.ok(
    relatedness('irrigation-install-bid-calculator', 'irrigation-winterization-bid-calculator') > 0,
  );
});

test('relatedness is symmetric', () => {
  assert.equal(relatedness('asphalt-sealcoat-bid', 'asphalt-driveway-pave-bid'), relatedness('asphalt-driveway-pave-bid', 'asphalt-sealcoat-bid'));
});

async function fixtureTree(pages) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'siblings-'));
  for (const [slug, html] of Object.entries(pages)) {
    await fs.mkdir(path.join(dir, slug), { recursive: true });
    await fs.writeFile(path.join(dir, slug, 'index.html'), html);
  }
  return dir;
}

test('a tool linked by a sibling is not an orphan; the sibling still is', async () => {
  const dir = await fixtureTree({
    'roofing-bid-calculator': '<a href="../gutter-bid-calculator/">gutters</a>',
    'gutter-bid-calculator': '<p>no outbound sibling links</p>',
  });
  const tools = await surveyTools(dir);
  const orphans = findOrphans(tools).map((o) => o.slug);
  assert.deepEqual(orphans, ['roofing-bid-calculator']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('reciprocal links leave no orphans', async () => {
  const dir = await fixtureTree({
    'roofing-bid-calculator': '<a href="../gutter-bid-calculator/">gutters</a>',
    'gutter-bid-calculator': '<a href="../roofing-bid-calculator/">roofing</a>',
  });
  assert.deepEqual(findOrphans(await surveyTools(dir)), []);
  await fs.rm(dir, { recursive: true, force: true });
});

// A href into a venture that shipped no entry page is a dead link — `check.mjs`
// fails on it — and must not read here as a closed orphan.
test('a link to a venture with no entry page does not count', async () => {
  const dir = await fixtureTree({
    'roofing-bid-calculator': '<a href="../does-not-exist/">nowhere</a>',
    'gutter-bid-calculator': '<a href="../roofing-bid-calculator/">roofing</a>',
  });
  const tools = await surveyTools(dir);
  assert.equal(tools.get('roofing-bid-calculator').outbound.size, 0);
  assert.deepEqual(
    findOrphans(tools).map((o) => o.slug),
    ['gutter-bid-calculator'],
  );
  await fs.rm(dir, { recursive: true, force: true });
});

test('a tool linking only to itself is still an orphan', async () => {
  const dir = await fixtureTree({
    'roofing-bid-calculator': '<a href="../roofing-bid-calculator/">self</a>',
  });
  const tools = await surveyTools(dir);
  assert.equal(tools.get('roofing-bid-calculator').outbound.size, 0);
  assert.deepEqual(findOrphans(tools).map((o) => o.slug), ['roofing-bid-calculator']);
  await fs.rm(dir, { recursive: true, force: true });
});

test('the suggested sibling prefers the same subcategory', async () => {
  const dir = await fixtureTree({
    'asphalt-sealcoat-bid-calculator': '<p>orphan</p>',
    'asphalt-driveway-pave-bid-calculator': '<p>orphan</p>',
    'ebay-fee-calculator': '<p>orphan</p>',
  });
  const orphans = findOrphans(await surveyTools(dir));
  const sealcoat = orphans.find((o) => o.slug === 'asphalt-sealcoat-bid-calculator');
  assert.equal(sealcoat.nearest.tool.slug, 'asphalt-driveway-pave-bid-calculator');
  await fs.rm(dir, { recursive: true, force: true });
});

test('the committed budget matches what the tree measures today', async () => {
  const budget = JSON.parse(
    await fs.readFile(new URL('./siblings-budget.json', import.meta.url), 'utf8'),
  );
  const orphans = findOrphans(await surveyTools());
  assert.ok(
    orphans.length <= budget.orphanBudget,
    `${orphans.length} crawlable orphans exceeds the committed budget of ${budget.orphanBudget}. ` +
      'Close a pair, or raise the budget deliberately and say in the PR why.',
  );
});
