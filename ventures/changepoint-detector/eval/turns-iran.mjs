// A turning-point option on a fresh dated cycle: does the stiff-slope trend walk find a business cycle that
// was dated outside the United States, beyond what its number of cuts explains?
//
// Open item from README "A stiff slope": "a turning-point option is a different product question from the
// drift model's jumps; if it is tried, it needs its own registered bars on a fresh turning-point label set
// (another country's dated business cycle, say) with the random-cut baseline as a bar, not a reading."
//
// Pre-registered 2026-11-23, written and committed before this script was first run. Seen beforehand: the
// data files only (their alignment was checked by HP-filtering the log level, lambda 1600, against the
// package's own cycle column: correlation 0.886 at lag 0, 0.743 and 0.714 at lags -1 and +1, and every
// labelled quarter is a local extremum of that cycle but one, the 1378Q4 peak). No changepoint model in
// this repository has been fitted to this series.
//
// Series: data/iran-non-oil-gdp-quarterly.csv, Iran's seasonally adjusted (X-12) non-oil GDP, 108 quarters
// of the Iranian calendar, 1367Q1 to 1393Q4 (about 1988Q2 to 2015Q1), as an index (1367Q1 = 100) built
// from the R package BCDating's quarterly growth (Central Bank of Iran; Einian and Barakchian 2014).
// Labels: data/mbri-iran-dating.csv, the Monetary and Banking Research Institute's official dating, 6 peaks
// and 7 troughs (13 turns; BCDating's MBRI.Iran.Dating, peaks and troughs as quarter indices). These are
// growth-cycle turns (dated on the HP cycle, then adjusted on other facts), so the level need not fall in a
// contraction; that is the harder and more useful test for a person watching a level.
//
// Arms: stiff = trendWalkChanges(level, { qzMax: 3e-4 }) (the cap chosen in simulation in
// eval/trend-walk-stiff.mjs; not re-tuned); shipped = driftLevelChanges(level, { noise: 'ml' }).
// Score: TCPD's F1 (eval/tcpd-metrics.mjs) with margin 2 quarters. Margin 2, not the earlier rounds' 5:
// the 13 turns are a median 8 quarters apart on 108 quarters, so with margin 5 nearly every quarter is
// near a turn and a random cut scores; margin 5 is printed beside it with no bar.
// Random baseline: for a model with k cuts, the F1 of k distinct cuts drawn uniformly from 1..n-2, 5,000
// draws, seed 20261123; p = share of draws whose F1 is at least the model's.
//
// Bars, all on the level at margin 2:
//   T1 beyond chance: F1(stiff) - mean random F1 at stiff's count >= +0.10, and p <= 0.05.
//   T2 better than shipped: F1(stiff) - F1(shipped) >= +0.03.
// Printed, no bar: the shipped model's random excess and p; margin 5; the log level; recall of the 13
// turns; each cut beside its nearest turn.
// Ships: nothing in the CLI from one series either way. If T1 and T2 pass, the next step is one more
// fresh dated cycle under the same bars, and a pass there adds an opt-in turning-point option. If either
// fails, the turning-point option is dropped from the open items and the reason recorded.
//
// usage: node eval/turns-iran.mjs > eval/turns-iran.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { driftLevelChanges } from '../drift-level.mjs';
import { trendWalkChanges } from '../drift-trend.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CAP = 3e-4, MARGIN = 2, DRAWS = 5000, SEED = 20261123;
const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function loadIran() {
  const r = rows('iran-non-oil-gdp-quarterly.csv'), h = r[0];
  const quarter = r.slice(1).map((x) => x[0]);
  const level = r.slice(1).map((x) => Number(x[h.indexOf('level')]));
  const at = new Map(quarter.map((q, i) => [q, i]));
  const turns = rows('mbri-iran-dating.csv').slice(1).map(([q, kind]) => ({ q, kind, i: at.get(q) }));
  return { quarter, level, turns };
}

export function chance(n, k, ann, margin, f, draws = DRAWS, seed = SEED) {
  const u = rng(seed);
  let sum = 0, atLeast = 0;
  for (let d = 0; d < draws; d++) {
    const s = new Set();
    while (s.size < Math.min(k, n - 2)) s.add(1 + Math.floor(u() * (n - 2)));
    const g = fMeasure(ann, [...s].sort((a, b) => a - b), margin).F;
    sum += g; if (g >= f - 1e-12) atLeast++;
  }
  return { mean: sum / draws, p: atLeast / draws };
}

export function run({ draws = DRAWS } = {}) {
  const { quarter, level, turns } = loadIran();
  const n = level.length, labels = turns.map((t) => t.i).filter((c) => c >= 1 && c <= n - 2);
  const ann = { mbri: labels };
  const out = { n, labels: labels.length, arms: {} };
  for (const [name, x] of [['level', level], ['log level', level.map(Math.log)]]) {
    const cs = clean(driftLevelChanges(x, { noise: 'ml' }).changepoints, n);
    const tw = trendWalkChanges(x, { qzMax: CAP }), ct = clean(tw.changepoints, n);
    const arm = { cs, ct, qz: tw.q, atCap: tw.atCap, m: {} };
    for (const margin of [2, 5]) {
      const fs = fMeasure(ann, cs, margin).F, ft = fMeasure(ann, ct, margin).F;
      const rs = chance(n, cs.length, ann, margin, fs, draws), rt = chance(n, ct.length, ann, margin, ft, draws);
      const near = (cuts) => labels.filter((l) => cuts.some((c) => Math.abs(c - l) <= margin)).length;
      arm.m[margin] = { fs, ft, rs, rt, recallS: near(cs), recallT: near(ct) };
    }
    out.arms[name] = arm;
  }
  out.quarter = quarter; out.turns = turns;
  const p = out.arms.level.m[MARGIN];
  out.T1 = p.ft - p.rt.mean >= 0.10 && p.rt.p <= 0.05;
  out.T2 = p.ft - p.fs >= 0.03;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const nearest = (c) => o.turns.reduce((b, t) => (Math.abs(t.i - c) < Math.abs(b.i - c) ? t : b));
  console.log(`Iran non-oil GDP, ${o.n} quarters ${o.quarter[0]}-${o.quarter[o.n - 1]}; MBRI turns scored: ${o.labels} (${o.turns.map((t) => `${t.q} ${t.kind[0]}`).join(', ')})`);
  for (const [name, a] of Object.entries(o.arms)) {
    console.log(`\n${name}: shipped ${a.cs.length} cuts, stiff ${a.ct.length} cuts (qz ${a.qz.toExponential(2)}${a.atCap ? ', at cap' : ''})`);
    for (const margin of [2, 5]) {
      const m = a.m[margin];
      console.log(`  margin ${margin}${margin === MARGIN && name === 'level' ? ' (bars)' : ' (no bar)'}: shipped F1 ${r3(m.fs)} (random ${r3(m.rs.mean)}, excess ${sg(m.fs - m.rs.mean)}, p ${r3(m.rs.p)}; recall ${m.recallS}/${o.labels})  stiff F1 ${r3(m.ft)} (random ${r3(m.rt.mean)}, excess ${sg(m.ft - m.rt.mean)}, p ${r3(m.rt.p)}; recall ${m.recallT}/${o.labels})  stiff - shipped ${sg(m.ft - m.fs)}`);
    }
    for (const [arm, cuts] of [['shipped', a.cs], ['stiff', a.ct]]) {
      console.log(`  ${arm.padEnd(7)} [${cuts.map((c) => { const t = nearest(c); return `${o.quarter[c]} (${t.kind} ${t.q}, ${c - t.i >= 0 ? '+' : ''}${c - t.i})`; }).join(', ')}]`);
    }
  }
  const p = o.arms.level.m[MARGIN];
  console.log(`\nT1 ${o.T1 ? 'PASSES' : 'FAILS'}: stiff excess over random ${sg(p.ft - p.rt.mean)} (bar +0.10), p ${r3(p.rt.p)} (bar 0.05)`);
  console.log(`T2 ${o.T2 ? 'PASSES' : 'FAILS'}: stiff - shipped ${sg(p.ft - p.fs)} (bar +0.03)`);
  console.log(`\nShips: nothing in the CLI (one series). ${o.T1 && o.T2 ? 'Next: one more fresh dated cycle under the same bars.' : 'The turning-point option is dropped from the open items.'}`);
}
