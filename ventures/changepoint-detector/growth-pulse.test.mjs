// Round 8 (eval/growth-pulse.prereg.md): the pulse-in-growth check failed its bars, so nothing ships. These tests pin
// the committed verdict and the statistic's behaviour, so a later change to the generator or to P shows here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generator, growthPulse } from './eval/growth-pulse-sim.mjs';

test('the committed round-8 verdict: c = 6 calibrated, P1 and P3 fail, P2 passes, nothing ships', () => {
  const out = readFileSync(new URL('./eval/growth-pulse-sim.out.txt', import.meta.url), 'utf8');
  assert.match(out, /^c = 6$/m);
  assert.match(out, /P1 R30 by 8 weeks: Q\+DW\+P 92 vs Q\+DW 89 \+ 15 -> FAIL/);
  assert.match(out, /P2 N false: Q\+DW\+P 1\.131 vs Q\+DW 1\.055 \+ 0\.15 -> PASS/);
  assert.match(out, /P3 gain in each half: s < 0\.30 \+2, s >= 0\.30 \+1 \(each >= 5\) -> FAIL/);
  assert.match(out, /Ships a pulse check: no/);
  // round 7's shipped Q+DW, replicated on round 8's fresh shops (round 7: 131 of 150, 1.071 per 100 days)
  assert.match(out, /R90 all \(150 shops\): by 8 weeks Q\+DW 130,/);
});

test('round 8 draws round 7\'s shops from round 7\'s seed', async () => {
  const r7 = await import('./eval/weekly-beside-sim.mjs');
  const g = generator(20261124);
  for (const size of [null, 1.3, 1.9]) assert.deepEqual(g(size), r7.shop(size));
});

test('P hears a clean step in weekly totals, but dates it weeks early (the longest window wins)', () => {
  const W = [], WL = [], end = [];
  let x = 7;
  const noise = () => { x = (x * 16807) % 2147483647; return x / 2147483647 - 0.5; }; // seeded, uniform -0.5..0.5
  for (let t = 0; t < 52; t++) {
    W.push(1000 * Math.exp(0.1 * noise()) * (t >= 36 ? 1.5 : 1));
    const m = Date.UTC(2024, 0, 1 + 7 * t);
    WL.push(new Date(m).toISOString().slice(0, 10)); end.push(new Date(m + 6 * 864e5).toISOString().slice(0, 10));
  }
  const { alerts } = growthPulse(W, WL, end, { c: 6 });
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].reportedAtLabel >= end[36] && alerts[0].reportedAtLabel <= end[38], alerts[0].reportedAtLabel);
  // the step is in week 36; the largest |Z| is the 5-week window, so the alert is dated to week 32's Monday
  assert.equal(alerts[0].label, WL[32]);
  assert.equal(alerts[0].k, 5);
});
