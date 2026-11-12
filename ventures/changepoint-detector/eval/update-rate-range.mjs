// Pre-registered, second round: a date RANGE for each change of update rate (update-rate.mjs cutRanges).
//
// Round one (eval/update-rate-sim.mjs, .out.txt) picked 'markov', m 2 on its calibration seed and failed
// its confirmation rule on dating to within 5 steps: S1 179 of 200 (needed 180), S4 121 (needed 150),
// with every null cell at or below 0.005 false cuts. A diagnostic on a fresh seed (777, not a decision
// input) showed S4's misses are mostly early dates, not missed changes: 16 of 200 had no cut, 49 were
// dated 6 to 20 steps early, 113 within 5. In a clumped chain the last flat run before the switch ends
// at a random point, so the data do not say to the step when the rate changed. A description should
// then give a range, as the level models already do (README "A range on each change date").
//
// Written 2026-11-12 after round one's verdict, committed before cutRanges ran on any series.
// Fixed from round one: cost 'markov', m 2, minimum stretch 20, at least 10 repeats.
// Range: positions k between the neighbouring cuts whose two-stretch cost is within `slack` of the best.
// Calibration (seed 20261203, 200 series a cell, cells S1-S4 of round one): slack in {2, 3.84, 6, 9, 2 log n};
//   pick the smallest whose coverage (true change inside the range of the nearest cut, among series with
//   a cut) is >= 0.90 in every cell. If none, nothing ships.
// Confirmation (seed 20261204), all must hold to ship the description with its range:
//   R1. every null cell of round one: mean false cuts <= 0.10 a series;
//   R2. S1: series with a cut whose range contains the change >= 170 of 200;
//   R3. S4: the same >= 150 of 200;
//   R4. S1: median range width <= 30 steps.
// usage: node eval/update-rate-range.mjs > eval/update-rate-range.out.txt
import { partitionRates, cutRanges } from '../update-rate.mjs';
import { makeRng, chain, NULLS, POWER } from './update-rate-sim.mjs';

export const SETTING = { kind: 'markov', mult: 2, minSegment: 20 };
export const SLACKS = [2, 3.84, 6, 9, 2 * Math.log(300)];
const AT = 149; // z position of the change (value index 150)

function powerRun(seed, slacks, reps = 200) {
  const rnd = makeRng(seed), out = {};
  for (const [cell, [a, b]] of Object.entries(POWER)) {
    out[cell] = slacks.map(() => ({ withCut: 0, covered: 0, widths: [] }));
    for (let r = 0; r < reps; r++) {
      const z = chain(rnd, 299, a, b, AT);
      const { cuts } = partitionRates(z, SETTING);
      if (!cuts.length) continue;
      slacks.forEach((slack, i) => {
        const rg = cutRanges(z, cuts, { ...SETTING, slack });
        const j = cuts.reduce((bj, c, k) => (Math.abs(c - AT) < Math.abs(cuts[bj] - AT) ? k : bj), 0);
        const o = out[cell][i];
        o.withCut++;
        if (rg.some(([lo, hi]) => lo <= AT && AT <= hi)) o.covered++;
        o.widths.push(rg[j][1] - rg[j][0] + 1);
      });
    }
  }
  return out;
}
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const cal = powerRun(20261203, SLACKS);
  console.log('CALIBRATION, seed 20261203: covered / with a cut (coverage), median width of the nearest cut\'s range');
  console.log(`  cell ${SLACKS.map((s) => `slack ${s.toFixed(2)}`.padStart(24)).join('')}`);
  for (const [cell, v] of Object.entries(cal)) console.log(`  ${cell.padEnd(4)} ${v.map((o) => `${o.covered}/${o.withCut} (${(o.covered / o.withCut).toFixed(2)}) w${median(o.widths)}`.padStart(24)).join('')}`);
  const idx = SLACKS.findIndex((_, i) => Object.values(cal).every((v) => v[i].covered / v[i].withCut >= 0.9));
  if (idx < 0) { console.log('No slack reaches 0.90 coverage in every cell: nothing ships.'); process.exit(0); }
  const slack = SLACKS[idx];
  console.log(`Chosen slack: ${slack.toFixed(2)}`);

  const rnd = makeRng(20261204);
  const nulls = {};
  for (const [cell, p] of Object.entries(NULLS)) for (const n of [100, 300, 600]) {
    let s = 0;
    for (let r = 0; r < 200; r++) { const z = chain(rnd, n - 1, p); if (z.reduce((a, v) => a + v, 0) >= 10) s += partitionRates(z, SETTING).cuts.length; }
    nulls[`${cell} n${n}`] = s / 200;
  }
  const conf = powerRun(20261204 + 1, [slack]);
  console.log('\nCONFIRMATION, seed 20261204 (nulls) and 20261205 (power cells)');
  for (const [k, v] of Object.entries(nulls)) console.log(`  ${k.padEnd(10)} ${v.toFixed(3)} false cuts a series`);
  for (const [cell, [o]] of Object.entries(conf)) console.log(`  ${cell.padEnd(10)} range contains the change ${o.covered} of 200 (cut in ${o.withCut}); median width ${median(o.widths)}`);
  const worst = Math.max(...Object.values(nulls));
  const R1 = worst <= 0.1, R2 = conf.S1[0].covered >= 170, R3 = conf.S4[0].covered >= 150, R4 = median(conf.S1[0].widths) <= 30;
  console.log(`\nR1 nulls <= 0.10 (worst ${worst.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 S1 covered >= 170 (${conf.S1[0].covered}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 S4 covered >= 150 (${conf.S4[0].covered}): ${R3 ? 'pass' : 'FAIL'}`);
  console.log(`R4 S1 median width <= 30 (${median(conf.S1[0].widths)}): ${R4 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${R1 && R2 && R3 && R4 ? 'SHIP the description with its range' : 'do not ship'}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
