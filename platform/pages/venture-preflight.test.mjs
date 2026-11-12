import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildProblem, changedPostPaths, checkProblems, COUNT_CHECKS, countProblem, inheritedKeysProblem, launchedProblems, placementProblems, postProblem, SITE_BUILD_TESTS, siteTestFiles, siteTestProblem } from './venture-preflight.mjs';

async function fixture(launched) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-'));
  const file = path.join(dir, 'launched.json');
  await fs.writeFile(file, JSON.stringify({ launched }));
  return file;
}

test('clean when the slug is dated and keys are sorted', async () => {
  assert.deepEqual(await launchedProblems('a', await fixture({ a: '2026-10-01', b: '2026-10-02' })), []);
});

test('flags a slug with no date', async () => {
  const p = await launchedProblems('c', await fixture({ a: '2026-10-01' }));
  assert.equal(p.length, 1);
  assert.match(p[0], /no launch date/);
});

test('flags out-of-order keys', async () => {
  const p = await launchedProblems('a', await fixture({ b: '2026-10-02', a: '2026-10-01' }));
  assert.match(p.join('\n'), /out of order/);
});

test('build problem only on a non-zero exit, tail of stderr first', () => {
  assert.equal(buildProblem({ status: 0, stdout: '', stderr: '' }), null);
  assert.match(buildProblem({ status: 1, stdout: 'out', stderr: 'boom' }), /build\.mjs failed:\nboom/);
  assert.match(buildProblem({ status: 1, stdout: 'out', stderr: '' }), /failed:\nout/);
});

test('check output is split by slug, joining stdout and stderr', () => {
  const r = checkProblems({ stdout: 'header\n  tax/index.html: no disclaimer\n', stderr: '  other/x.html: bad link\n' }, 'tax');
  assert.deepEqual(r.failures, ['tax/index.html: no disclaimer']);
  assert.deepEqual(r.other, ['  other/x.html: bad link']);
});

test('a slug does not claim a longer slug it prefixes', () => {
  const r = checkProblems({ stdout: '  tax-calc/index.html: bad\n  ventures/tax/a.html: bad\n', stderr: '' }, 'tax');
  assert.deepEqual(r.failures, ['ventures/tax/a.html: bad']);
  assert.equal(r.other.length, 1);
});

test('unparseable check output is reported whole', () => {
  const r = checkProblems({ stdout: 'crash', stderr: '' }, 'tax');
  assert.match(r.failures[0], /check\.mjs failed:\ncrash/);
});

test('countProblem is silent on exit 0 and names the fix otherwise', () => {
  assert.equal(countProblem(COUNT_CHECKS[0], 0), null);
  assert.match(countProblem(COUNT_CHECKS[1], 1), /publish_surface\.py --write` and commit/);
});

test('changedPostPaths keeps only top-level posts, deduplicated and sorted', () => {
  const diff = 'docs/posts/2026-11-12-b.md\nventures/x/README.md\ndocs/posts/img/a.md\n';
  const untracked = 'docs/posts/2026-11-12-a.md\ndocs/posts/2026-11-12-b.md\n';
  assert.deepEqual(changedPostPaths(diff, untracked, undefined), ['docs/posts/2026-11-12-a.md', 'docs/posts/2026-11-12-b.md']);
});

test('postProblem is silent on exit 0 and indents the checker output otherwise', () => {
  assert.equal(postProblem(0, ''), null);
  const p = postProblem(1, 'a.md: description is 214 characters; keep it to 160\n');
  assert.match(p, /check_post_frontmatter\.py/);
  assert.match(p, /\n {6}a\.md: description is 214/);
});

test('siteTestFiles is CI\'s glob minus the whole-site builds', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-site-'));
  await fs.mkdir(path.join(dir, 'cloudflare'));
  for (const f of ['b.test.mjs', 'a.test.mjs', 'helper.mjs', ...SITE_BUILD_TESTS]) await fs.writeFile(path.join(dir, f), '');
  await fs.writeFile(path.join(dir, 'cloudflare', 'split.test.mjs'), '');
  assert.deepEqual(siteTestFiles(dir), ['a.test.mjs', 'b.test.mjs', 'cloudflare/split.test.mjs']);
});

test('the real site-test list keeps faq-visible and drops build.test', () => {
  const files = siteTestFiles();
  assert.ok(files.includes('faq-visible.test.mjs'));
  assert.ok(!files.includes('build.test.mjs'));
});

test('siteTestProblem is silent on exit 0, lists failing tests and says whether the slug is named', () => {
  assert.equal(siteTestProblem({ status: 0, stdout: '', stderr: '' }, 'tax'), null);
  const tap = `ok 1 - fine\nnot ok 2 - FAQ answers are visible\n  ---\n  error: ventures/tax/faq.html\n  location: '/r/platform/pages/faq-visible.test.mjs:124:1'\n  not ok 3 - FAQ answers are visible\n`;
  const mine = siteTestProblem({ status: 1, stdout: tap, stderr: '' }, 'tax');
  assert.match(mine, /names tax/);
  assert.match(mine, /node --test faq-visible\.test\.mjs`/);
  assert.equal(mine.match(/not ok: FAQ answers are visible/g).length, 1);
  const other = siteTestProblem({ status: 1, stdout: tap, stderr: '' }, 'ta');
  assert.match(other, /none of the output names ta;/);
});

test('inheritedKeysProblem is silent on exit 0 and names the own-key fix otherwise', () => {
  assert.equal(inheritedKeysProblem(0, 'whatever'), null);
  const p = inheritedKeysProblem(1, 'ventures/x/calc.mjs:3: UNITS[input.units]\n1 new unguarded lookup(s)');
  assert.match(p, /Object\.hasOwn/);
  assert.match(p, /\n {6}ventures\/x\/calc\.mjs:3/);
});

test('placementProblems fails a trade tool in the trades catch-all and notes the site catch-all', async () => {
  const site = await import('./build.mjs');
  const named = placementProblems('earthwork-cut-fill', site);
  assert.deepEqual([named.category, named.subcategory, named.failures, named.notes], ['trades', 'trades-site', [], []]);
  const fake = {
    categoryFor: () => ({ id: 'trades', title: 'Trades' }),
    subcategoryFor: () => ({ id: 'trades-other' }),
  };
  assert.match(placementProblems('zz-bid-calculator', fake).failures[0], /SUBCATEGORY_RULES\.trades/);
  const more = placementProblems('zzz-unclaimed-slug', site);
  assert.equal(more.category, 'more');
  assert.deepEqual(more.failures, []);
  assert.match(more.notes[0], /CATEGORY_RULES/);
});
