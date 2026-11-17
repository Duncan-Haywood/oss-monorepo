// Why a 5-sd step goes missing in a sticky walk under repeats 'missing' (README "Sticky series: why the
// step goes missing"; eval/drift-sticky-why.mjs, pre-registered, minutes to run, so this pins its output).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const out = readFileSync(new URL('./eval/drift-sticky-why.out.txt', import.meta.url), 'utf8');

test('the step is found less often the longer the run of repeats around it (P1-P3 hold)', () => {
  assert.match(out, /\n  1\s+43\s+39\s+0\.91/);
  assert.match(out, /\n  3\s+26\s+9\s+0\.35/);
  assert.match(out, /\(P1\)[^\n]*holds/);
  assert.match(out, /\(P2\) misses with k >= 2: 39 of 43[^\n]*holds/);
  assert.match(out, /\(P3\)[^\n]*G 0\.917[^\n]*holds/);
});

test('at a matched false-alarm rate the two models are close, and the opt-in rule fails', () => {
  // 40% repeats: shipped at twice the penalty has the same false cuts as missing at the default (1.35).
  assert.match(out, /shipped m 2\s+F cuts\s+1\.35, G 82\/120; missing at no more F cuts finds at best 77\/120: FAILS/);
  assert.match(out, /shipped m 1\s+F cuts\s+7\.76, G 118\/120; missing at no more F cuts finds at best 100\/120: FAILS/);
  assert.match(out, /Rule [^\n]*FAILS -> nothing changes for users/);
});
