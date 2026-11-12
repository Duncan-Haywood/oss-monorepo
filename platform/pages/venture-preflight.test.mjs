import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildProblem, changedPostPaths, checkProblems, COUNT_CHECKS, countProblem, fastTestFiles, launchedProblems, postProblem, SLOW_TESTS, testProblems } from './venture-preflight.mjs';

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

const TAP = `TAP version 13
# Subtest: every authored FAQPage question and answer is visible on its page
not ok 1 - every authored FAQPage question and answer is visible on its page
  ---
  duration_ms: 1612.8
  type: 'test'
  location: '/r/platform/pages/faq-visible.test.mjs:124:1'
  failureType: 'testCodeFailure'
  error: |-
    FAQPage markup must be visible to the visitor.
      tax/how-much.html
        question of "is it safe" diverges after 2 char(s)
    + actual - expected
    + [
    +   'tax/how-much.html\\n' +
    - []
  code: 'ERR_ASSERTION'
  ...
# Subtest: tax: lead is sourced
ok 2 - tax: lead is sourced
  ---
  duration_ms: 3.1
  ...
# Subtest: every secondary prose page
    # Subtest: tax-calc
    not ok 1 - tax-calc
      ---
      location: '/r/platform/pages/secondary-schema.test.mjs:50:3'
      error: 'ventures/tax-calc/why.html has no JSON-LD'
      ...
not ok 3 - every secondary prose page
  ---
  location: '/r/platform/pages/secondary-schema.test.mjs:43:1'
  error: '1 subtest failed'
  ...
1..3
`;

test('a failing test is yours only when its failure text names the slug', () => {
  const r = testProblems(TAP, 'tax');
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /^faq-visible\.test\.mjs \(every authored FAQPage/);
  // The message line once, not again from the actual/expected echo.
  assert.equal(r.failures[0].split('tax/how-much.html').length, 2);
  assert.match(r.failures[0], /rerun: node --test /);
  // tax-calc is a different slug, so that test is a note, and the passing "tax:" test is neither.
  assert.deepEqual(r.other, ['secondary-schema.test.mjs (every secondary prose page)']);
});

test('a nested failure that names the slug is found from its parent', () => {
  const r = testProblems(TAP, 'tax-calc');
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /secondary-schema\.test\.mjs.*fails on tax-calc:\n {6}error: 'ventures\/tax-calc\/why\.html/);
});

test('clean TAP output has no test problems', () => {
  assert.deepEqual(testProblems('# Subtest: a\nok 1 - a\n  ---\n  ...\n1..1\n', 'tax'), { failures: [], other: [] });
});

test('fast test files skip the slow ones and include the source scans', () => {
  const files = fastTestFiles();
  for (const slow of SLOW_TESTS) assert.ok(!files.some((f) => f.endsWith(`/${slow}`)), slow);
  assert.ok(files.includes('platform/pages/faq-visible.test.mjs'));
  assert.ok(files.every((f) => f.startsWith('platform/pages/') && f.endsWith('.test.mjs')));
});
