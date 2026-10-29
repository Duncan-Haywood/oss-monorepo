import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// eval/drift-warning-elecequip.mjs: the output is committed in eval/drift-warning-elecequip.out.txt and the README.
test('driftWarning on 195 months of euro-area electrical-equipment orders: warns in all four setups, and the 2008-09 collapse is found in each', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-elecequip.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  const lines = out.split('\n').filter((l) => l.includes('warning'));
  assert.equal(lines.length, 4);
  assert.equal(lines.filter((l) => l.includes('warning yes')).length, 4, out);
  assert.equal(lines.filter((l) => l.includes('2008-11-') && l.includes('2009-01-')).length, 4, out);
  // many other steps: the series is a business cycle, so a warning here is not evidence of a growing season
  for (const l of lines) assert.ok(+l.match(/steps\s+(\d+)/)[1] >= 16, l);
});
