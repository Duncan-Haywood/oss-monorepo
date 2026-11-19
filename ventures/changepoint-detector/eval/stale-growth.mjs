// Pre-registered: a catch-up growth test for multi-tick feeds (update-rate.mjs `catchUpGrowth`), README
// "A catch-up test for multi-tick feeds" (2026-11-19). Header committed before the first run.
//
// Why. README "A real carried-forward feed: last-trade prices" ran the shipped likelihood test on real
// last-trade samples (carry-forward known from the trade times) and on the trade prints (nothing carried).
// It caught the carried windows (B1 84/85) and called every print window stale too (B2 56/56): above about
// 1.5 ticks the test scores excess exact repeats, and prints that sit at a quote have them. The README's
// next item: "A test for staleness at multi-tick moves would have to score the growth of the move after a
// run ... The prints here are the null to check it on."
//
// The test. For each move that ends a run, k = the repeats directly before it (0 after a move); |move| in
// ticks. Spearman correlation of k with |move| (Pearson on mid-ranks); under exchangeability its
// permutation variance is exactly 1/(n-1), so z = r sqrt(n-1). Stale when z >= 1.645 (one-sided 5%), at
// least 30 moves and at least 10 of them after a run. Values within floatNoise count as a repeat.
//
// Disclosed beforehand: the earlier README section's post-hoc read already reports, pooled over the day, an
// RMS move ending a run of 3+ repeats of 3.2 ticks vs 3.6 after none on the prints, and 5.6 vs 4.8 on the
// carried D = 1 series. So the prints are expected to pass size and the carried series' growth is weak;
// R2 (power at 300 steps) may well fail. No window was scored with this test before this header.
//
// Simulation (seed 20261119, 300-step windows, tick 1, sigma 3.5 ticks, 2,000 windows a cell):
//   null-g  zero-inflated walk: each step 0 with p 0.3 (a quote holding), else round(sigma * N(0,1)).
//   null-t  the same with Student t3 steps scaled to sd sigma.
//   null-v  reported: null-g with volatility regimes (sigma 2 or 6, switch with p 0.02 a step).
//   carry-55  a hidden walk (Gaussian, sigma) carried forward in runs: after a fresh step the next is
//             carried with p 0.50, after a carried one with p 0.59 (stationary share 0.55; the fit of the
//             disclosed window in the earlier section); observed = round(hidden value at the last fresh step).
//   carry-30  reported: the same with 0.30 / 0.30 (share 0.30).
//   carry-55t reported: carry-55 with t3 steps.
// Real data: the same files, windows and plan as eval/stale-real-trades.mjs (highfrequency's trade samples,
// GPL, fetched by eval/hf-trades-fetch.py, not committed). Europe judged, the US sample reported.
//
// Bars:
//   G1 size in simulation: null-g and null-t each called stale in <= 7% of windows.
//   G2 power in simulation: carry-55 called stale in >= 80%.
//   R1 size on the real null: Europe trade-print windows called stale in <= 10%.
//   R2 power on the real carried feed: Europe grid windows with carried share >= 0.30 called stale in >= 80%.
// Reported: carry-30, carry-55t, null-v; per series: windows, mean r, called stale; the whole day pooled per
// series (one z each); the US sample.
// What the bars decide: all four pass, `updateRateChanges` reports the growth test on multi-tick sticky
// stretches (where today no catch-up check runs) and the line says a carried figure is catching up when it
// fires. Any fail: catchUpGrowth stays an exported function with no sentence, and the README says which bar.
//
// usage: node eval/stale-growth.mjs <dir> > eval/stale-growth.out.txt
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catchUpGrowth, smallestStep } from '../update-rate.mjs';
import { readTrades, sampleEvery, tradePrints, windows, WINDOW, PLAN_EU, PLAN_US } from './stale-real-trades.mjs';

export const SEED = 20261119, SIGMA = 3.5, N_SIM = 2000;

export function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const norm = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  const t3 = () => { const z = norm(); const c = norm() ** 2 + norm() ** 2 + norm() ** 2; return z / Math.sqrt(c / 3) / Math.sqrt(3); };
  return { u, norm, t3 };
}

export function simNull(R, { q = 0.3, heavy = false, regimes = false, n = WINDOW } = {}) {
  const v = [1000];
  let s = regimes ? 2 : SIGMA;
  for (let t = 1; t <= n; t++) {
    if (regimes && R.u() < 0.02) s = s === 2 ? 6 : 2;
    const d = R.u() < q ? 0 : Math.round(s * (heavy ? R.t3() : R.norm()));
    v.push(v[t - 1] + d);
  }
  return v;
}

export function simCarry(R, { pEnter, pStay, heavy = false, n = WINDOW }) {
  let h = 1000, shown = 1000, carried = false, nc = 0;
  const v = [shown];
  for (let t = 1; t <= n; t++) {
    h += SIGMA * (heavy ? R.t3() : R.norm());
    carried = R.u() < (carried ? pStay : pEnter);
    if (carried) nc++; else shown = Math.round(h);
    v.push(shown);
  }
  return { v, carried: nc / n };
}

export const CELLS = [
  ['null-g', (R) => simNull(R)], ['null-t', (R) => simNull(R, { heavy: true })], ['null-v', (R) => simNull(R, { regimes: true })],
  ['carry-55', (R) => simCarry(R, { pEnter: 0.5, pStay: 0.59 }).v], ['carry-30', (R) => simCarry(R, { pEnter: 0.3, pStay: 0.3 }).v],
  ['carry-55t', (R) => simCarry(R, { pEnter: 0.5, pStay: 0.59, heavy: true }).v],
];

export function simulate(nSim = N_SIM, seed = SEED) {
  const out = {};
  CELLS.forEach(([name, make], c) => {
    const R = rng(seed + 7919 * c);
    let called = 0, scored = 0, rs = 0;
    for (let i = 0; i < nSim; i++) {
      const g = catchUpGrowth(make(R), 0, WINDOW, 1);
      if (g && g.z != null) { scored++; rs += g.r; }
      if (g && g.grows) called++;
    }
    out[name] = { n: nSim, called, share: called / nSim, scored, meanR: scored ? rs / scored : null };
  });
  return out;
}

export function realRows(days, file, plan) {
  const rows = [];
  for (const [day, trades] of days) {
    for (const [kind, D, every] of plan) {
      const s = kind === 'prints' ? tradePrints(trades) : sampleEvery(trades, D);
      const tick = smallestStep(s.v);
      const label = kind === 'prints' ? 'prints' : `D=${D}`;
      for (const [from, to, w] of windows(s.v.length, every)) {
        let carried = 0;
        for (let t = from + 1; t <= to; t++) if (!s.traded[t]) carried++;
        const g = catchUpGrowth(s.v, from, to, tick);
        rows.push({ file, day, kind: label, w, carried: carried / (to - from), n: g?.n ?? 0, r: g?.r ?? null, z: g?.z ?? null, stale: !!g?.grows });
      }
      const all = catchUpGrowth(s.v, 0, s.v.length - 1, tick, { minMoves: 0, minRunMoves: 0 });
      rows.push({ file, day, kind: label, pooled: true, n: all.n, r: all.r, z: all.z });
    }
  }
  return rows;
}

export function bars(sim, rows) {
  const eu = rows.filter((r) => r.file === 'europe' && !r.pooled);
  const r1 = eu.filter((r) => r.kind === 'prints'), r2 = eu.filter((r) => r.kind !== 'prints' && r.carried >= 0.3);
  const k = (a) => a.filter((r) => r.stale).length;
  return {
    G1: { text: `null-g ${sim['null-g'].called}/${sim['null-g'].n}, null-t ${sim['null-t'].called}/${sim['null-t'].n} (bar <= 7% each)`, pass: sim['null-g'].share <= 0.07 && sim['null-t'].share <= 0.07 },
    G2: { text: `carry-55 ${sim['carry-55'].called}/${sim['carry-55'].n} (bar >= 80%)`, pass: sim['carry-55'].share >= 0.8 },
    R1: { text: `prints ${k(r1)}/${r1.length} (bar <= 10%)`, pass: r1.length > 0 && k(r1) / r1.length <= 0.1 },
    R2: { text: `carried >= 0.30 ${k(r2)}/${r2.length} (bar >= 80%)`, pass: r2.length > 0 && k(r2) / r2.length >= 0.8 },
  };
}

const f2 = (x) => (x == null ? '-' : x.toFixed(2));
function printReal(label, rows) {
  console.log(`\n## ${label}\n\nseries  windows  carried (mean)  mean r  called stale  | whole day pooled: moves r z`);
  const keys = [...new Set(rows.map((r) => `${r.day} ${r.kind}`))];
  for (const key of keys) {
    const g = rows.filter((r) => `${r.day} ${r.kind}` === key && !r.pooled), p = rows.find((r) => `${r.day} ${r.kind}` === key && r.pooled);
    const sc = g.filter((r) => r.r != null);
    console.log(`${key}  ${g.length}  ${f2(g.reduce((a, r) => a + r.carried, 0) / g.length)}  ${f2(sc.reduce((a, r) => a + r.r, 0) / (sc.length || 1))}  ${g.filter((r) => r.stale).length}  | ${p.n} ${f2(p.r)} ${f2(p.z)}`);
  }
  const grid = rows.filter((r) => !r.pooled && r.kind !== 'prints');
  for (const [lo, hi] of [[0, 0.1], [0.1, 0.3], [0.3, 0.5], [0.5, 1.01]]) {
    const g = grid.filter((r) => r.carried >= lo && r.carried < hi);
    console.log(`grid windows carried ${lo}-${hi > 1 ? 1 : hi}: ${g.filter((r) => r.stale).length} of ${g.length} called stale`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'hf-data';
  const t0 = Date.now();
  const sim = simulate();
  console.log(`# catch-up growth test (eval/stale-growth.mjs); window ${WINDOW}, z >= 1.645, seed ${SEED}, sigma ${SIGMA}\n\n## Simulation (${N_SIM} windows a cell)\n`);
  for (const [name, x] of Object.entries(sim)) console.log(`${name}: called stale ${x.called} of ${x.n} (${(100 * x.share).toFixed(1)}%), scored ${x.scored}, mean r ${f2(x.meanR)}`);
  const rows = [
    ...realRows(readTrades(readFileSync(join(dir, 'sampleTDataEurope.csv'), 'utf8')), 'europe', PLAN_EU),
    ...realRows(readTrades(readFileSync(join(dir, 'sampleTData.csv'), 'utf8')), 'us', PLAN_US),
  ];
  printReal('Europe (judged)', rows.filter((r) => r.file === 'europe'));
  printReal('US sample (reported)', rows.filter((r) => r.file === 'us'));
  const b = bars(sim, rows);
  console.log('\n## Bars\n');
  for (const [k, x] of Object.entries(b)) console.log(`${k}: ${x.text}: ${x.pass ? 'pass' : 'FAIL'}`);
  const failed = Object.entries(b).filter(([, x]) => !x.pass).map(([k]) => k);
  console.log(`\nverdict: ${failed.length ? `fails ${failed.join(', ')}` : 'all four bars pass'}`);
  console.log(`\nper window (file day kind window carried moves r z stale):`);
  for (const r of rows.filter((x) => !x.pooled)) console.log([r.file, r.day, r.kind, r.w, f2(r.carried), r.n, f2(r.r), f2(r.z), r.stale ? 'STALE' : '-'].join(' '));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
