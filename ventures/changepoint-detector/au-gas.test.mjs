import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slopeBreaks, slopeBreakPValue } from './slope-breaks.mjs';

// Real series (data/au-gas.csv): Australian monthly gas production, 1956-01 to 1995-08, 476 values (forecast::gas).
// Documented: production was small until natural gas came into use around 1969-70, then grew fast (recalled, source not read).
// Counts match README "Australian gas production".
const rows = readFileSync(new URL('./data/au-gas.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const values = rows.map((r) => +r[1]);
const annual = Array.from({ length: 39 }, (_, y) => values.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b)); // 1956..1994

test('au-gas: 476 months, 39 full years', () => {
  assert.equal(values.length, 476);
  assert.equal(annual.length, 39);
});

test('au-gas: the annual slope test dates the takeoff at 1969 and clears its bar, narrowly', () => {
  const b = slopeBreaks(annual, { critical: 'auto' });
  assert.equal(b.knots.length, 1);
  assert.equal(1956 + b.knots[0].index, 1969);
  assert.ok(b.knots[0].before < 2000 && b.knots[0].after > 15000);
  const p = slopeBreakPValue(annual, { reps: 499 });
  assert.ok(p.w > p.bar95 && p.w < 1.1 * p.bar95, `W ${p.w} bar ${p.bar95}`); // a margin under 2%: a result, not a rout
});

test('au-gas: on logs the same test finds nothing (growth is near-exponential, not a bend)', () => {
  assert.equal(slopeBreaks(annual.map(Math.log), { critical: 'auto' }).knots.length, 0);
});

test('au-gas: across 20 Monte Carlo seeds the takeoff clears the bar most of the time, not always (eval/au-gas-seeds.mjs)', () => {
  let clear = 0;
  for (let seed = 1; seed <= 20; seed++) { const r = slopeBreakPValue(annual, { reps: 499, seed }); if (r.w > r.bar95) clear++; }
  assert.equal(clear, 17); // 17/20 at 499 reps; 19/20 at 1999 reps (output file). A borderline result, p about 0.04 to 0.05.
});
