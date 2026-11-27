import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildProblem, localOnlyFiles, localOnlySummary, splitLocalOnly, changedPostPaths, checkProblems, COUNT_CHECKS, countProblem, inheritedKeysProblem, launchedProblems, notListedNote, placementProblems, postProblem, routerProblem, SITE_BUILD_TESTS, siteTestFiles, siteTestProblem, touchesRouterInputs, treeCheckArgs, treeCheckProblem } from './venture-preflight.mjs';

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
  // At the cap, a new arrival fails (build.test.mjs would); one already counted does not.
  const full = Array.from({ length: site.CATCH_ALL_MAX }, (_, i) => `tool-${i}`);
  const over = placementProblems('zzz-unclaimed-slug', site, full);
  assert.match(over.failures[0], new RegExp(`hold ${site.CATCH_ALL_MAX + 1} tools`));
  assert.deepEqual(over.notes, []);
  const counted = placementProblems('zzz-unclaimed-slug', site, [...full.slice(1), 'zzz-unclaimed-slug']);
  assert.deepEqual(counted.failures, []);
});

test('router inputs: validate.py runs only when flagships.yaml or a VENTURE.yaml changed', () => {
  assert.equal(touchesRouterInputs('portfolio/flagships.yaml\n', ''), true);
  assert.equal(touchesRouterInputs('', 'ventures/chant-forge/VENTURE.yaml\n'), true);
  assert.equal(touchesRouterInputs('ventures/chant-forge/README.md\nventures/a/b/VENTURE.yaml\n'), false);
  assert.equal(routerProblem(0, 'All valid.'), null);
  assert.match(routerProblem(1, 'flagships.yaml: x `next:` is 2050 characters (cap 2000).'), /2050 characters/);
});

test('treeCheckProblem is silent on exit 0 and lists each red check with its tail', () => {
  assert.equal(treeCheckProblem(0, 'ok   check_a.py (1/2)\nDONE', 'lift-calc'), null);
  const out = [
    'ok   check_a.py (1/3)', 'FAIL check_step_grid.py (2/3)', 'ok   check_c.py (3/3)',
    'FAIL check_step_grid.py (exit 1)', '1 number input(s) whose step grid excludes whole numbers:', '', '  - ventures/lift-calc/index.html: capacityFactor min=1 step=5', '',
    'FAIL check_doc_counts.py (exit 1)', 'PRODUCT_PLAYBOOK.md:12: ventures 1338, tree 1366', '',
    '1/3 checks pass', 'DONE',
  ].join('\n');
  const p = treeCheckProblem(1, out, 'lift-calc');
  assert.match(p, /the output names lift-calc/);
  assert.match(p, /FAIL check_step_grid\.py \(exit 1\)\n\s+1 number input\(s\)[^\n]*\n\s+- ventures\/lift-calc\/index\.html/);
  assert.match(p, /FAIL check_doc_counts\.py \(exit 1\)\n\s+PRODUCT_PLAYBOOK/);
  assert.doesNotMatch(p, /\(2\/3\)|checks pass|DONE/);
  assert.match(treeCheckProblem(1, out, 'other-tool'), /none of the output names other-tool/);
});

test('treeCheckProblem stops a block at the summary line main_health prints with its test files', () => {
  const out = [
    'FAIL check_doc_counts.py (2/3)',
    'FAIL check_doc_counts.py (exit 1)', 'PRODUCT_PLAYBOOK.md:12: ventures 1338, tree 1366', '',
    '271/272 checks pass (98 checks, 174 platform/ci test files)', 'DONE',
  ].join('\n');
  assert.doesNotMatch(treeCheckProblem(1, out, 'lift-calc'), /checks pass|DONE/);
});

test('treeCheckArgs skips the platform/ci unit tests unless the branch touches platform/ci', () => {
  assert.deepEqual(treeCheckArgs('', ''), ['--checks-only']);
  assert.deepEqual(treeCheckArgs('ventures/lift-calc/index.html\ndocs/posts/x.md\n', ''), ['--checks-only']);
  assert.deepEqual(treeCheckArgs('ventures/platform/ci/x.py\n'), ['--checks-only']);
  assert.deepEqual(treeCheckArgs('', 'platform/ci/check_new.py\n'), []);
  assert.deepEqual(treeCheckArgs('ventures/a/b.js\nplatform/ci/run_venture_tests.py\n', ''), []);
});

test('treeCheckProblem falls back to the output tail when no block parses', () => {
  assert.match(treeCheckProblem(2, 'Traceback\nboom', 'x'), /boom/);
});

// Git-ignored files the local build publishes but CI's checkout lacks (run record 2026-11-15:
// changepoint-detector's fetched utsa-data/ held a .ppt that failed check.mjs only locally).
test('localOnlyFiles keeps ignored publishable files, drops CI build outputs and what copyTree skips', async () => {
  const { copiesDir, isPublishable } = await import('./build.mjs');
  const rules = [
    'ventures/v/.gitignore:1:utsa-data/\tventures/v/utsa-data/',
    '.gitignore:2:*.log\tventures/v/run.log',
    '.gitignore:15:__pycache__/\tventures/v/__pycache__/',
    '.gitignore:40:ventures/v/browser/\tventures/v/browser/',
    '.gitignore:2:*.log\tventures/other/x.log',
  ].join('\n');
  const dirs = { 'ventures/v/utsa-data/': ['ventures/v/utsa-data/a.ppt', 'ventures/v/utsa-data/fetch.py', 'ventures/v/utsa-data/.cache/z.json'] };
  const files = localOnlyFiles(rules, 'v', { copiesDir, isPublishable, listDir: (rel) => dirs[rel] ?? assert.fail(`walked ${rel}`) });
  assert.deepEqual(files, ['ventures/v/run.log', 'ventures/v/utsa-data/a.ppt']);
});

test('splitLocalOnly demotes check.mjs lines on a local-only file, also under a published subdir', () => {
  const lines = [
    'v/utsa-data/a.ppt: nothing says how the site should type ".ppt".',
    'v/index.html: carries no disclaimer, so it must not ship',
    'v/data/b.ppt: nothing says how the site should type ".ppt".',
  ];
  const { real, local } = splitLocalOnly(lines, 'v', ['ventures/v/utsa-data/a.ppt', 'ventures/v/site/data/b.ppt']);
  assert.deepEqual(real, [lines[1]]);
  assert.deepEqual(local, [lines[0], lines[2]]);
  assert.deepEqual(splitLocalOnly(lines, 'v', []).real, lines);
});

test('localOnlySummary groups local-only files by their first two directory levels, most first', () => {
  const files = [
    ...Array.from({ length: 834 }, (_, i) => `ventures/v/eval/IDS/f${i}.c`),
    'ventures/v/covid-data/a.csv', 'ventures/v/covid-data/b.csv', 'ventures/v/eval/IDS/deep/x.c', 'ventures/v/notes.ppt',
  ];
  assert.equal(localOnlySummary(files, 'v'), 'Where: eval/IDS/ (835), covid-data/ (2), notes.ppt (1).');
  assert.equal(localOnlySummary(files, 'v', 1), 'Where: eval/IDS/ (835), +2 more.');
});

test('notListedNote names the app\'s own CI workflow when it has one, else the venture runner', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-note-'));
  await fs.mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await fs.writeFile(path.join(root, '.github', 'workflows', 'some-app-ci.yml'), 'name: x\n');
  const withCi = notListedNote('some-app', root);
  assert.match(withCi, /no catalogue entry/);
  assert.match(withCi, /run_workflow_locally\.py some-app-ci/);
  const without = notListedNote('other-app', root);
  assert.match(without, /run_venture_tests\.py other-app/);
  assert.doesNotMatch(without, /run_workflow_locally/);
});

test('the moved paid apps are not catalogue entries, so preflight skips their launch date and placement', async () => {
  const site = await import('./build.mjs');
  const slugs = new Set((await site.discoverSurfaces(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'ventures'))).map((s) => s.slug));
  for (const app of ['payapps', 'jobshop-quote']) {
    try { await fs.access(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'ventures', app)); } catch { continue; }
    assert.equal(slugs.has(app), false, `${app} is listed; the preflight would demand a launch date for it`);
  }
});
