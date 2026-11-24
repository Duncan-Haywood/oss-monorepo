// BBQ dated turning points on monthly payroll employment (FRED PAYEMS, 1939-01 to 2026-07) against NBER's
// monthly peaks and troughs.
//
// Open item from README "BBQ on FRED GDPC1 1947-2026": GDP missed the D1 bar twice by one turn, each miss where
// GDP's own high or low is not NBER's quarter. "A monthly coincident series (payroll employment, which NBER
// weights most) is the fair test against NBER; either, pre-registered, decides turns-cli.mjs."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// files' first and last rows, that four copies of PAYEMS agree on every shared month but their last two (data/SOURCE.md), and the label check below.
// BBQ has not been run on payrolls here.
//
// Labels: NBER's monthly peaks and troughs read off FRED's USREC (data/us-usrec.csv: a peak is the last 0 before
// a run of 1s, a trough the last 1 of the run), only those at indices 1..n-2 of the payroll file (26 turns,
// 1945-02 to 2020-04). Not data/nber-recessions.csv: its copy of tis dates the 2020 recession's first month
// 2020-01 (peak 2019-12) where NBER and USREC have the peak in 2020-02; every other turn since 1939 agrees
// (checked before the run, printed below).
//
// Arms, both on log payrolls with turningPoints(x, { frequency: 'monthly' }) (window 5, phases 6, cycles 15):
//   A  the module's defaults, Bry-Boschan's rule as written;
//   B  the same with bigMove 0.05: a phase shorter than 6 months is kept when payrolls move 5% or more across
//      it (new option, off by default). Set before the run, without looking at any phase's size: written for
//      a collapse like 2020 that the 6-month phase rule exists to stop counting as noise.
// Scoring as eval/turns-bbq.mjs's monthly series: matched when a turn of the same kind is within 3 months;
// false when no NBER turn of the same kind is within 6; F1 kind-blind at margin 6; random = k uniform cuts at
// the arm's count, 5,000 draws, seed 20261124.
//
// Bars (per arm):
//   P1 matched share of NBER's turns >= 0.80 and at most 2 false turns (the D1 bar, monthly);
//   P2 F1 - random mean F1 >= +0.15 with p <= 0.05.
// Ships: if A passes P1 and P2, turns-cli.mjs with the defaults. If A fails and B passes both, turns-cli.mjs
// with --big-move as an option, off by default, its monthly 0.05 documented with this result. Two arms are
// two looks at one bar; that is disclosed in the README either way. If neither passes, nothing ships.
// Printed, no bar: dates beside NBER's; the shipped drift model's F1; both arms on an older vintage (to
// 2024-06, before BLS's 2024 and 2025 benchmarks) and a newer one (to 2026-10); scoring against the tis labels.
//
// usage: node eval/turns-payems.mjs > eval/turns-payems.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { driftLevelChanges } from '../drift-level.mjs';
import { turningPoints } from '../turning-points.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance } from './turns-iran.mjs';
import { loadSeries, match } from './turns-bbq.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWS = 5000, SEED = 20261124, NEAR = 3, FAR = 6, MARGIN = 6;
const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

export const ARMS = [{ name: 'A defaults', opts: {} }, { name: 'B bigMove 0.05', opts: { bigMove: 0.05 } }];
export const MAIN = 'us-payems.csv';
export const VINTAGES = ['us-payems-vintage-2024.csv', 'us-payems-vintage-2026-10.csv'];

// NBER monthly turns from USREC, as month labels
export function usrecTurns() {
  const r = rows('us-usrec.csv').slice(1).map(([m, v]) => [m, Number(v)]);
  const out = [];
  for (let k = 1; k < r.length; k++) {
    if (r[k][1] === 1 && r[k - 1][1] === 0) out.push({ kind: 'peak', month: r[k - 1][0] });
    if (r[k][1] === 0 && r[k - 1][1] === 1) out.push({ kind: 'trough', month: r[k - 1][0] });
  }
  return out;
}

export function load(file) {
  const r = rows(file).slice(1);
  const label = r.map((x) => x[0]), values = r.map((x) => Number(x[1]));
  const n = values.length;
  const turns = usrecTurns().map((t) => ({ kind: t.kind, i: label.indexOf(t.month) })).filter((t) => t.i >= 1 && t.i <= n - 2);
  return { label, values, turns, n };
}

function score({ label, values, turns, n }, opts, draws) {
  const tp = turningPoints(values, { frequency: 'monthly', ...opts });
  const bi = tp.turns.map((t) => t.i);
  const ann = { nber: [...new Set(turns.map((t) => t.i))].sort((a, b) => a - b) };
  const F = fMeasure(ann, bi, MARGIN).F;
  const R = draws ? chance(n, bi.length, ann, MARGIN, F, draws, SEED) : null;
  const m = match(turns, tp.turns, NEAR, FAR);
  const share = m.matched / turns.length;
  const P1 = share >= 0.80 && m.falses <= 2;
  const P2 = R ? F - R.mean >= 0.15 && R.p <= 0.05 : null;
  return { bbq: tp.turns, phases: tp.phases, F, R, ...m, share, P1, P2, ann };
}

export function run({ draws = DRAWS } = {}) {
  const s = load(MAIN);
  const arms = ARMS.map((a) => ({ name: a.name, ...score(s, a.opts, draws) }));
  const cs = clean(driftLevelChanges(s.values, { noise: 'ml' }).changepoints, s.n);
  const shipped = { cuts: cs.length, F: fMeasure(arms[0].ann, cs, MARGIN).F };
  const vint = VINTAGES.map((f) => { const v = load(f); return { file: f, label: v.label, arms: ARMS.map((a) => ({ name: a.name, ...score(v, a.opts, 0) })) }; });
  // the old label file, for comparison only (its 2020 peak is 2019-12)
  const tis = loadSeries({ file: MAIN, col: 'payems', frequency: 'monthly' }).turns;
  const tisArms = ARMS.map((a) => { const tp = turningPoints(s.values, { frequency: 'monthly', ...a.opts }); return { name: a.name, ...match(tis, tp.turns, NEAR, FAR), of: tis.length }; });
  const usrec = s.turns.map((t) => `${s.label[t.i]}${t.kind[0]}`), tisL = tis.map((t) => `${s.label[t.i]}${t.kind[0]}`);
  const labelDiff = { onlyUsrec: usrec.filter((x) => !tisL.includes(x)), onlyTis: tisL.filter((x) => !usrec.includes(x)) };
  const decision = arms[0].P1 && arms[0].P2 ? 'A' : arms[1].P1 && arms[1].P2 ? 'B' : 'none';
  return { ...s, arms, shipped, vint, tisArms, labelDiff, decision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const show = (ts) => ts.map((t) => `${o.label[t.i]}${t.kind[0]}`).join(' ');
  console.log('BBQ (classical, log level, monthly Bry-Boschan durations) on FRED PAYEMS vs NBER monthly peaks and troughs');
  console.log(`\nfile: n ${o.n} (${o.label[0]} to ${o.label[o.n - 1]}), NBER turns ${o.turns.length}`);
  console.log(`label check, USREC vs tis (data/nber-recessions.csv): only USREC ${o.labelDiff.onlyUsrec.join(' ') || '-'}; only tis ${o.labelDiff.onlyTis.join(' ') || '-'}`);
  console.log(`NBER: ${show(o.turns)}`);
  for (const a of o.arms) {
    console.log(`\n${a.name}: BBQ turns ${a.bbq.length}, matched ${a.matched}/${o.turns.length} (${r3(a.share)}), false ${a.falses}`);
    console.log(`  BBQ: ${show(a.bbq)}`);
    const miss = o.turns.filter((t) => !a.bbq.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= NEAR));
    const fal = a.bbq.filter((f) => !o.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= FAR));
    console.log(`  missed: ${show(miss) || '-'}; false: ${show(fal) || '-'}`);
    const off = a.bbq.map((f) => { const t = o.turns.filter((t) => t.kind === f.kind).sort((x, y) => Math.abs(x.i - f.i) - Math.abs(y.i - f.i))[0]; return t ? f.i - t.i : null; }).filter((d) => d !== null && Math.abs(d) <= NEAR);
    console.log(`  months from NBER on matched turns: ${off.join(' ')}`);
    console.log(`  F1 ${r3(a.F)}, random ${r3(a.R.mean)} (${sg(a.F - a.R.mean)}), p ${r3(a.R.p)}`);
    console.log(`  P1 ${a.P1 ? 'passes' : 'fails'}; P2 ${a.P2 ? 'passes' : 'fails'}`);
  }
  console.log(`\nshipped drift model on the level: ${o.shipped.cuts} cuts, F1 ${r3(o.shipped.F)}`);
  console.log('\nvintages (printed, no bar):');
  for (const v of o.vint) for (const a of v.arms) console.log(`  ${v.file} ${a.name}: matched ${a.matched}, false ${a.falses}; from 2000: ${a.bbq.filter((t) => v.label[t.i] >= '2000').map((t) => `${v.label[t.i]}${t.kind[0]}`).join(' ')}`);
  console.log('\nscored against the tis labels instead (printed, no bar):');
  for (const a of o.tisArms) console.log(`  ${a.name}: matched ${a.matched}/${a.of}, false ${a.falses}`);
  console.log(`\ndecision: ${o.decision === 'none' ? 'neither arm passes both bars; nothing ships' : `arm ${o.decision} passes; turns-cli.mjs ships`}`);
}
