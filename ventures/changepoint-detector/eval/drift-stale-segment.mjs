// Pre-registered: a stale probability per segment for `--model drift` with repeats 'missing'
// (drift-level.mjs, stale 'segment'). README "Why the step goes missing" (2026-11-12) showed one
// stale probability for the whole series cannot change any partition, and left a probability per
// segment, where a change in how often a series updates is itself a change, as the only repeat model
// that could add something. "A doubled penalty on sticky series" showed every option tried so far
// buys fewer cuts on frozen orange juice by losing the smaller freezes (1958, 1970, 1985).
//
// The hypothesis: a freeze moves the price and also makes it update more often (repeats fall after
// a shock), so the per-segment term recovers freezes that 'missing' alone loses, while keeping far
// fewer cuts than shipped.
//
// Written 2026-11-12 and committed before stale 'segment' was run on any series, real or simulated.
// Seen before writing: shipped and 'missing' (global scale) results on the same data (README tables:
// juice shipped 67 cuts 8 of 8, missing 18 cuts 5 of 8; TCPD sticky four shipped mean F1 0.380,
// cover 0.524). Not seen: anything with stale 'segment'.
//
// Settings: ML wander, global scale, default penalty 2 log n. shipped = repeats 'keep';
// missing = repeats 'missing' (stale 'shared'); segment = repeats 'missing', stale 'segment'.
// Data:
//   Synthetic, seed 20261114, n 300, 120 series a cell, random walk step sd 1, noise sd 0.1:
//     F  40% stale repeats, no change;        G  same with a 5-unit level step at t 150 (found within 5);
//     S  repeats 10% before t 150 and 60% after, no level step (descriptive: cuts within 5 of 150).
//   Real: TCPD's four sticky series (bank, children_per_woman, ratner_stock, scanline_42049; TCPD F1,
//     margin 5, and cover), and frozen orange juice (eight freezes, found within 2 months).
// Decision rule (all must hold for the sticky-series warning to point to stale 'segment' as an
// opt-in, which would also need a CLI flag; the default never changes on this evidence):
//   R1. juice: at least 7 of 8 freezes found, with at most half the shipped cuts;
//   R2. TCPD sticky four: mean F1 >= shipped and mean cover >= shipped - 0.02;
//   R3. F: mean cuts at most twice those of missing, plus 0.5;
//   R4. G: steps found at least those of missing, less 3 of 120.
// If any fails, nothing changes for users; the option stays in the library with its tests.
//
// First run stopped on a loader bug (ratner_stock and scanline_42049 are in DIR/heldout) after the
// synthetic table and two TCPD rows had printed; the lookup was fixed and the whole file rerun, rule
// unchanged (README "A stale probability per segment").
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/drift-stale-segment.mjs tcpd-data > eval/drift-stale-segment.out.txt
import { driftLevelChanges } from '../drift-level.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';
import { STICKY_TCPD, frozenJuice } from './drift-sticky-penalty.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MODELS = { shipped: {}, missing: { repeats: 'missing' }, segment: { repeats: 'missing', stale: 'segment' } };
export const cuts = (values, model) => driftLevelChanges(values, { noise: 'ml', ...MODELS[model] }).changepoints;

if (import.meta.url === `file://${process.argv[1]}`) {
  const DIR = process.argv[2] || 'tcpd-data';
  const t0 = Date.now();
  const r3 = (v) => v.toFixed(3);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const names = Object.keys(MODELS);

  let seed = 20261114;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const N = 300, REPS = 120, AT = 150;
  const walk = (step) => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? gauss() : 0) + (t >= AT ? step : 0) + 0.1 * gauss()); };
  const sticky = (x, pOf) => { const y = x.slice(); for (let t = 1; t < N; t++) if (rnd() < pOf(t)) y[t] = y[t - 1]; return y; };
  const near = (cps) => cps.some((c) => Math.abs(c - AT) <= 5);
  const sim = {};
  for (const [cell, step, pOf] of [['F', 0, () => 0.4], ['G', 5, () => 0.4], ['S', 0, (t) => (t < AT ? 0.1 : 0.6)]]) {
    sim[cell] = Object.fromEntries(names.map((k) => [k, { cuts: 0, near: 0 }]));
    for (let r = 0; r < REPS; r++) {
      const y = sticky(walk(step), pOf);
      for (const k of names) { const c = cuts(y, k); sim[cell][k].cuts += c.length; sim[cell][k].near += near(c) ? 1 : 0; }
    }
  }
  console.log(`Synthetic: n ${N}, ${REPS} series a cell, seed 20261114. Mean cuts a series / series with a cut within 5 of t ${AT}`);
  console.log(`  model     F (40%, no change)    G (40%, 5-unit step)    S (10% -> 60% repeats, no step)`);
  for (const k of names) console.log(`  ${k.padEnd(9)} ${(sim.F[k].cuts / REPS).toFixed(2).padStart(6)} / ${String(sim.F[k].near).padStart(3)}       ${(sim.G[k].cuts / REPS).toFixed(2).padStart(6)} / ${String(sim.G[k].near).padStart(3)}         ${(sim.S[k].cuts / REPS).toFixed(2).padStart(6)} / ${String(sim.S[k].near).padStart(3)}`);

  const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
  const res = {};
  console.log('\nTCPD sticky series: cuts / F1 / cover');
  for (const name of STICKY_TCPD) {
    const f = ['ds', 'heldout'].map((d) => join(DIR, d, `${name}.json`)).find(existsSync);
    const j = JSON.parse(readFileSync(f, 'utf8'));
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    const n = values.length;
    res[name] = {};
    for (const k of names) {
      const c = [...new Set(cuts(values, k))].filter((x) => x >= 1 && x < n - 1).sort((a, b) => a - b);
      res[name][k] = { cuts: c.length, f1: fMeasure(ann[name], c, 5).F, cover: covering(ann[name], c, n) };
    }
    console.log(`  ${name.padEnd(20)} ${names.map((k) => `${k}: ${String(res[name][k].cuts).padStart(3)} ${r3(res[name][k].f1)} ${r3(res[name][k].cover)}`).join('   ')}`);
  }
  const mF = (k) => mean(STICKY_TCPD.map((s) => res[s][k].f1)), mC = (k) => mean(STICKY_TCPD.map((s) => res[s][k].cover));
  console.log(`  mean                 ${names.map((k) => `${k}: F1 ${r3(mF(k))} cover ${r3(mC(k))}`).join('   ')}`);

  const fj = frozenJuice();
  const fjr = {};
  console.log(`\nFrozen orange juice (${fj.price.length} months; freezes ${fj.freezes.join(' ')})`);
  for (const k of names) {
    fjr[k] = fj.score(cuts(fj.price, k));
    console.log(`  ${k.padEnd(9)} ${String(fjr[k].cuts).padStart(3)} cuts, ${fjr[k].found.length} of ${fj.freezes.length} found (${fjr[k].found.join(' ')}), ${fjr[k].near} cuts near a freeze`);
  }

  const R = {
    R1: [fjr.segment.found.length >= 7 && fjr.segment.cuts <= fjr.shipped.cuts / 2, `juice ${fjr.segment.found.length} of 8 found, ${fjr.segment.cuts} cuts vs shipped ${fjr.shipped.cuts}`],
    R2: [mF('segment') >= mF('shipped') && mC('segment') >= mC('shipped') - 0.02, `F1 ${r3(mF('segment'))} vs ${r3(mF('shipped'))}, cover ${r3(mC('segment'))} vs ${r3(mC('shipped'))}`],
    R3: [sim.F.segment.cuts / REPS <= 2 * (sim.F.missing.cuts / REPS) + 0.5, `F cuts ${(sim.F.segment.cuts / REPS).toFixed(2)} vs missing ${(sim.F.missing.cuts / REPS).toFixed(2)}`],
    R4: [sim.G.segment.near >= sim.G.missing.near - 3, `G found ${sim.G.segment.near} vs missing ${sim.G.missing.near}`],
  };
  console.log('\nDecision rule:');
  for (const [k, [ok, why]] of Object.entries(R)) console.log(`  ${k} ${ok ? 'PASS' : 'FAIL'}: ${why}`);
  console.log(`  verdict: ${Object.values(R).every(([ok]) => ok) ? 'PASS, the warning may point to stale segment as an opt-in' : 'FAIL, nothing changes for users'}`);
  console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
