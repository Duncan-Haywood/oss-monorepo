// Pre-registered: dating a change in how often a series updates (update-rate.mjs).
//
// Background (README "A stale probability per segment", 2026-11-12): a per-segment stale probability
// inside the drift model dated a pure change in stickiness 103 times in 120, but did not help find level
// changes, so it was declined as a level-change option and left as "a different product question": show
// the change of update rate as a *description*. This file sets and checks that description on its own
// (update-rate.mjs: optimal partitioning of the 0/1 repeat indicators), apart from any level model.
//
// Written 2026-11-12 and committed before update-rate.mjs was run on any series, real or simulated.
//
// Setting chosen on a CALIBRATION seed (20261201), checked on a CONFIRMATION seed (20261202):
//   Candidates: cost 'bernoulli' or 'markov' x penalty multiplier m in {1, 1.5, 2, 3, 4} of 2 log n;
//   minimum stretch 20 steps; the description runs only with at least 10 repeats.
//   Null cells (no change of rate), n in {100, 300, 600}, 200 series a cell:
//     B10, B25, B40, B60: independent repeats with probability 0.10, 0.25, 0.40, 0.60;
//     M40: clumped repeats, a two-state chain with P(repeat | repeat) 0.7, P(repeat | update) 0.2
//          (stationary share 0.40: flat runs, as a quote that sits for months does);
//     M60: P(repeat | repeat) 0.85, P(repeat | update) 0.225 (share 0.60).
//   Power cells, n 300, change at step 150, 200 series a cell (found = a cut within 5 steps):
//     S1: independent 0.10 -> 0.60; S2: 0.20 -> 0.50; S3: 0.40 -> 0.10;
//     S4: clumped (M40's chain) -> independent 0.05 (a stale feed that was fixed).
//   Choice: for each cost, the smallest m whose mean false cuts are <= 0.05 a series in every null cell;
//   between the two costs, the one with more found summed over S1-S4, ties to 'bernoulli'. If no
//   candidate meets 0.05, nothing ships.
// Confirmation rule (fresh seed, chosen setting only; all must hold to ship the description):
//   R1. every null cell: mean false cuts <= 0.10 a series;
//   R2. S1 found >= 180 of 200;
//   R3. S4 found >= 150 of 200.
// Real series are descriptive only (eval/update-rate-real.mjs), run after this file's verdict.
// usage: node eval/update-rate-sim.mjs > eval/update-rate-sim.out.txt
import { partitionRates } from '../update-rate.mjs';

export const KINDS = ['bernoulli', 'markov'];
export const MULTS = [1, 1.5, 2, 3, 4];
export const NULLS = { B10: [0.1, 0.1], B25: [0.25, 0.25], B40: [0.4, 0.4], B60: [0.6, 0.6], M40: [0.7, 0.2], M60: [0.85, 0.225] };
export const POWER = {
  S1: [[0.1, 0.1], [0.6, 0.6]], S2: [[0.2, 0.2], [0.5, 0.5]], S3: [[0.4, 0.4], [0.1, 0.1]], S4: [[0.7, 0.2], [0.05, 0.05]],
};

// [pRepeatGivenRepeat, pRepeatGivenUpdate]; equal values mean independent repeats.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
export function chain(rnd, n, before, after = before, at = Infinity) {
  const z = [];
  let prev = 0;
  for (let t = 0; t < n; t++) {
    const [pr, pu] = t < at ? before : after;
    prev = rnd() < (prev ? pr : pu) ? 1 : 0;
    z.push(prev);
  }
  return z;
}

export function runSeed(seed, settings, reps = 200) {
  const rnd = makeRng(seed);
  const out = { nulls: {}, power: {} };
  for (const [cell, p] of Object.entries(NULLS)) for (const n of [100, 300, 600]) {
    const key = `${cell} n${n}`;
    out.nulls[key] = settings.map(() => 0);
    for (let r = 0; r < reps; r++) {
      const z = chain(rnd, n - 1, p);
      const enough = z.reduce((a, v) => a + v, 0) >= 10;
      settings.forEach((st, i) => { if (enough) out.nulls[key][i] += partitionRates(z, st).cuts.length; });
    }
    out.nulls[key] = out.nulls[key].map((v) => v / reps);
  }
  for (const [cell, [a, b]] of Object.entries(POWER)) {
    out.power[cell] = settings.map(() => 0);
    for (let r = 0; r < reps; r++) {
      const z = chain(rnd, 299, a, b, 149);
      settings.forEach((st, i) => { if (partitionRates(z, st).cuts.some((c) => Math.abs(c + 1 - 150) <= 5)) out.power[cell][i]++; });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const settings = KINDS.flatMap((kind) => MULTS.map((mult) => ({ kind, mult, minSegment: 20 })));
  const name = (s) => `${s.kind} m${s.mult}`;
  const print = (title, res, sts) => {
    console.log(title);
    console.log(`  ${'cell'.padEnd(10)} ${sts.map((s) => name(s).padStart(13)).join('')}`);
    for (const [k, v] of Object.entries(res.nulls)) console.log(`  ${k.padEnd(10)} ${v.map((x) => x.toFixed(3).padStart(13)).join('')}`);
    for (const [k, v] of Object.entries(res.power)) console.log(`  ${(k + ' found').padEnd(10)} ${v.map((x) => String(x).padStart(13)).join('')}`);
  };
  const cal = runSeed(20261201, settings);
  print('CALIBRATION, seed 20261201: null cells = mean false cuts a series; power cells = found of 200', cal, settings);
  const chosenPer = KINDS.map((kind) => {
    const idx = settings.map((s, i) => [s, i]).filter(([s]) => s.kind === kind)
      .find(([, i]) => Object.values(cal.nulls).every((v) => v[i] <= 0.05));
    return idx ? { setting: idx[0], found: Object.values(cal.power).reduce((a, v) => a + v[idx[1]], 0) } : null;
  });
  console.log('\nSmallest m meeting <= 0.05 in every null cell:', chosenPer.map((c, k) => `${KINDS[k]}: ${c ? `m ${c.setting.mult}, found ${c.found} of 800` : 'none'}`).join('; '));
  const ok = chosenPer.filter(Boolean);
  if (!ok.length) { console.log('No candidate qualifies: nothing ships.'); process.exit(0); }
  const pick = ok.reduce((a, c) => (c.found > a.found ? c : a)).setting;
  console.log(`Chosen: ${name(pick)}, minimum stretch 20`);
  const conf = runSeed(20261202, [pick]);
  print('\nCONFIRMATION, seed 20261202, chosen setting only', conf, [pick]);
  const maxNull = Math.max(...Object.values(conf.nulls).map((v) => v[0]));
  const R1 = maxNull <= 0.10, R2 = conf.power.S1[0] >= 180, R3 = conf.power.S4[0] >= 150;
  console.log(`\nR1 every null cell <= 0.10 (worst ${maxNull.toFixed(3)}): ${R1 ? 'pass' : 'FAIL'}`);
  console.log(`R2 S1 found >= 180 (${conf.power.S1[0]}): ${R2 ? 'pass' : 'FAIL'}`);
  console.log(`R3 S4 found >= 150 (${conf.power.S4[0]}): ${R3 ? 'pass' : 'FAIL'}`);
  console.log(`Verdict: ${R1 && R2 && R3 ? 'SHIP the description' : 'do not ship'}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
