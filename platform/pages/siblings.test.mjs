import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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

test('same subcategory outranks a higher word score in another subcategory', async () => {
  const dir = await fixtureTree({
    'asphalt-sealcoat-bid-calculator': '<p>orphan</p>',
    'asphalt-patch-bid-calculator': '<p>orphan</p>',
    'paving-sealcoat-asphalt-bid-calculator': '<p>orphan</p>',
  });
  const orphans = findOrphans(await surveyTools(dir));
  const sealcoat = orphans.find((o) => o.slug === 'asphalt-sealcoat-bid-calculator');
  assert.equal(sealcoat.nearest.tool.slug, 'asphalt-patch-bid-calculator');
  await fs.rm(dir, { recursive: true, force: true });
});

test('within a subcategory the most shared job words wins over alphabetical order', async () => {
  const dir = await fixtureTree({
    'asphalt-sealcoat-bid-calculator': '<p>orphan</p>',
    'asphalt-driveway-pave-bid-calculator': '<p>orphan</p>',
    'asphalt-sealcoat-driveway-bid-calculator': '<p>orphan</p>',
  });
  const orphans = findOrphans(await surveyTools(dir));
  const sealcoat = orphans.find((o) => o.slug === 'asphalt-sealcoat-bid-calculator');
  assert.equal(sealcoat.nearest.tool.slug, 'asphalt-sealcoat-driveway-bid-calculator');
  await fs.rm(dir, { recursive: true, force: true });
});

const CLI = fileURLToPath(new URL('./siblings.mjs', import.meta.url));

test('--json prints two-space-indented JSON of the survey', () => {
  const out = execFileSync('node', [CLI, '--json'], { encoding: 'utf8' });
  assert.ok(out.includes('\n  "tools": '), 'expected two-space indent');
  assert.ok(Array.isArray(JSON.parse(out).orphans));
});

test('--check passes when the orphan count equals the committed budget', () => {
  const budget = JSON.parse(execFileSync('cat', [fileURLToPath(new URL('./siblings-budget.json', import.meta.url))], { encoding: 'utf8' }));
  const { orphans } = JSON.parse(execFileSync('node', [CLI, '--json'], { encoding: 'utf8' }));
  // Meeting the budget exactly is within it; only exceeding it fails.
  if (orphans.length === budget.orphanBudget) {
    const out = execFileSync('node', [CLI, '--check'], { encoding: 'utf8' });
    assert.match(out, /within the committed budget/);
  }
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

test('each shared job word adds exactly one point; generic words add none', () => {
  // Shares `asphalt` and `sealcoat` (2); `bid` is generic.
  assert.equal(relatedness('asphalt-sealcoat-bid', 'asphalt-sealcoat-driveway-bid'), 2);
  assert.equal(relatedness('asphalt-bid', 'asphalt-bid'), 1);
});

test('--check exits 1 when orphans exceed the budget, or when no budget exists', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sib-budget-'));
  const tight = path.join(dir, 'budget.json');
  await fs.writeFile(tight, JSON.stringify({ orphanBudget: -1 }));
  const run = (file) => {
    try {
      execFileSync('node', [CLI, '--check'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, SIBLINGS_BUDGET_FILE: file } });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  assert.equal(run(tight), 1);
  assert.equal(run(path.join(dir, 'missing.json')), 1);
});
