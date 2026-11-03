import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildProblem, checkProblems, COUNT_CHECKS, countProblem, launchedProblems } from './venture-preflight.mjs';

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
