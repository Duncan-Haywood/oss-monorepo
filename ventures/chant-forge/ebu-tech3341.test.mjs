import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// eval/ebu-tech3341.mjs synthesises EBU Tech 3341 Table 1 cases 1-5, 9, 10, 12, 13
// and 15-23 from the table's text and exits 0 only when every reading of
// master.mjs (and the Annex 2 FIR) is inside the table's tolerance.
test('EBU Tech 3341 minimum-requirements cases: every meter reading inside tolerance', () => {
  const script = fileURLToPath(new URL('./eval/ebu-tech3341.mjs', import.meta.url));
  const p = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const rows = JSON.parse(p.stdout.slice(0, p.stdout.lastIndexOf(']') + 1));
  const meter = rows.filter((r) => !r.what.startsWith('sample peak'));
  assert.equal(meter.length, 69);
  // the true-peak cases must need oversampling: the plain sample peak fails some
  assert.ok(rows.some((r) => r.what.startsWith('sample peak') && !r.ok));
});
