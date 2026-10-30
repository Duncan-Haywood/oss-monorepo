import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// eval/drift-warning-arrivals.mjs: the output is committed in eval/drift-warning-arrivals.out.txt and the README.
test('driftWarning on arrivals to Australia: fires in 7 of 8 cells and the dated shocks are found', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-arrivals.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  const lines = out.split('\n').filter((l) => l.includes('warning'));
  assert.equal(lines.length, 8);
  assert.equal(lines.filter((l) => l.includes('warning yes')).length, 7, out);
  assert.equal(lines.filter((l) => l.includes('2001Q3-')).length, 4, out); // US, all four cells: the 11 Sept quarter
});
