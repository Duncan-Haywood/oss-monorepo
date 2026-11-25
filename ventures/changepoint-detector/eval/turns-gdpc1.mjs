// BBQ dated turning points on a fresh GDP vintage that runs past 2009 and includes 2020: FRED GDPC1,
// 1947Q1-2026Q1, against NBER's peaks and troughs.
//
// Open item from README "Dated turning points by Bry-Boschan's rule": D1 (GDP turns matched >= 80%, at most 2
// false turns) was missed by 0.019 on the two old GDP files, and one of the misses was a trough two quarters
// from the file's end. "Next: one fresh GDP vintage that runs past 2009 and includes 2020 (FRED's GDPC1),
// scored under the same D1 bar. A pass there ships turns-cli.mjs with classical and growth modes."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// file's first and last rows and that four independent copies agree (data/SOURCE.md). BBQ has not been run
// on this file. Nothing in turning-points.mjs changes for this round: the module's defaults, nothing tuned.
//
// Series: data/us-gdpc1.csv, real_gdp, quarterly 1947Q1-2026Q1 (317 quarters).
// Labels, scoring, random draws and the shipped arm exactly as eval/turns-bbq.mjs (its loadSeries and match):
//   NBER peaks (month before a recession's first month) and troughs (its last month), data/nber-recessions.csv,
//   only those at indices 1..n-2; matched within 1 quarter, false turn when no NBER turn of the same kind is
//   within 2 quarters; F1 kind-blind at margin 2; random = k uniform cuts at BBQ's count, 5,000 draws, seed
//   20261124.
//
// Bars:
//   D1g matched share of NBER turns >= 0.80 and at most 2 false turns (the D1 bar, on this one file).
//   D2g beyond chance: F1 - random mean F1 >= +0.15 with p <= 0.05.
// Ships: if D1g and D2g pass, turns-cli.mjs (classical and growth modes; G1 passed in the last round) and a
// README section. If either fails, nothing ships and the failure is recorded.
// Printed, no bar: dates beside NBER's; the shipped drift model's F1; the same rule on the 2000-onward part of
// the main file and on an earlier and a later vintage (data/us-gdpc1-vintage-*.csv), to show which dates move
// with BEA's revisions; growth mode's turn count.
//
// usage: node eval/turns-gdpc1.mjs > eval/turns-gdpc1.out.txt
import { pathToFileURL } from 'node:url';
import { driftLevelChanges } from '../drift-level.mjs';
import { turningPoints } from '../turning-points.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance } from './turns-iran.mjs';
import { loadSeries, match } from './turns-bbq.mjs';

const DRAWS = 5000, SEED = 20261124;
const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

export const MAIN = { name: 'FRED GDPC1', file: 'us-gdpc1.csv', col: 'real_gdp', frequency: 'quarterly' };
export const VINTAGES = [
  { name: 'earlier vintage (to 2024Q4)', file: 'us-gdpc1-vintage-2025.csv', col: 'real_gdp', frequency: 'quarterly' },
  { name: 'later vintage (to 2026Q2)', file: 'us-gdpc1-vintage-2026q2.csv', col: 'real_gdp', frequency: 'quarterly' },
];

function score(s, { draws = DRAWS, from = null } = {}) {
  let { label, values, turns } = loadSeries(s);
  if (from) {
    const k = label.indexOf(from);
    label = label.slice(k); values = values.slice(k);
    turns = turns.map((t) => ({ ...t, i: t.i - k })).filter((t) => t.i >= 1 && t.i <= values.length - 2);
  }
  const n = values.length;
  const tp = turningPoints(values, { frequency: 'quarterly' });
  const bi = tp.turns.map((t) => t.i);
  const ann = { nber: [...new Set(turns.map((t) => t.i))].sort((a, b) => a - b) };
  const F = fMeasure(ann, bi, 2).F;
  const R = draws ? chance(n, bi.length, ann, 2, F, draws, SEED) : null;
  return { name: s.name + (from ? ` from ${from}` : ''), n, label, turns, bbq: tp.turns, F, R, ...match(turns, tp.turns, 1, 2), ann, values };
}

export function run({ draws = DRAWS } = {}) {
  const m = score(MAIN, { draws });
  const cs = clean(driftLevelChanges(m.values, { noise: 'ml' }).changepoints, m.n);
  const shippedF = fMeasure(m.ann, cs, 2).F;
  const growth = turningPoints(m.values, { frequency: 'quarterly', mode: 'growth' }).turns.length;
  const share = m.matched / m.turns.length;
  const D1g = share >= 0.80 && m.falses <= 2;
  const D2g = m.F - m.R.mean >= 0.15 && m.R.p <= 0.05;
  const vint = [score(MAIN, { draws: 0, from: '2000Q1' }), ...VINTAGES.map((v) => score(v, { draws: 0 }))];
  return { main: m, share, D1g, D2g, shipped: { cuts: cs.length, F: shippedF }, growth, vint };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run(), m = o.main;
  const show = (lab, ts) => ts.map((t) => `${lab[t.i]}${t.kind[0]}`).join(' ');
  console.log('BBQ (classical, log level, module defaults) on FRED GDPC1 vs NBER peaks and troughs');
  console.log(`\n${m.name}: n ${m.n} (${m.label[0]}-${m.label[m.n - 1]}), NBER turns ${m.turns.length}, BBQ turns ${m.bbq.length}, matched ${m.matched}/${m.turns.length}, false ${m.falses}`);
  console.log(`  F1 bbq ${r3(m.F)} (random ${r3(m.R.mean)}, excess ${sg(m.F - m.R.mean)}, p ${r3(m.R.p)})  shipped drift model ${o.shipped.cuts} cuts F1 ${r3(o.shipped.F)}`);
  console.log(`  NBER  ${show(m.label, m.turns)}`);
  console.log(`  BBQ   ${show(m.label, m.bbq)}`);
  const missed = m.turns.filter((t) => !m.bbq.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= 1));
  console.log(`  missed: ${show(m.label, missed) || 'none'}`);
  console.log(`  growth mode (no bar): ${o.growth} turns`);
  console.log('\nVintage check (no bar), 2000 onward:');
  for (const v of o.vint) console.log(`  ${v.name}: matched ${v.matched}/${v.turns.length}, false ${v.falses}; BBQ ${show(v.label, v.bbq)}`);
  console.log(`\nD1g ${o.D1g ? 'PASSES' : 'FAILS'}: matched share ${r3(o.share)} (bar 0.80), false turns ${m.falses} (bar <= 2)`);
  console.log(`D2g ${o.D2g ? 'PASSES' : 'FAILS'}: excess over random ${sg(m.F - m.R.mean)} (bar +0.15), p ${r3(m.R.p)} (bar 0.05)`);
  console.log(`\nShips: ${o.D1g && o.D2g ? 'turns-cli.mjs, classical and growth modes' : 'nothing'}.`);
}
