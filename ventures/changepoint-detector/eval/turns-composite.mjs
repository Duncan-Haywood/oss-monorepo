// BBQ dated turning points on a composite of the monthly coincident indicators NBER's committee weighs, against
// NBER's monthly peaks and troughs.
//
// Open item from README "BBQ on monthly payrolls": a single coincident series will not reproduce NBER's dates
// within a quarter (GDP misses where its own extremes differ, payrolls where employment lags the recovery).
// "Next ... a pre-registered round on a composite of the monthly indicators NBER's committee says it weighs."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// files' first and last rows, that independent copies agree on shared months but the last one or two
// (data/SOURCE.md), and the payroll round's result (bigMove 0.05 changed only 2020 there).
// BBQ has not been run on any of these four new series or on a composite here.
//
// Data, monthly, cut to the months every component has: 1967-01 (CMRMTSPL's first) to 2026-07 (its last).
//   PAYEMS  payroll employment (data/us-payems.csv)
//   CE16OV  household employment (data/us-ce16ov.csv)
//   W875RX1 real personal income less transfer receipts (data/us-w875rx1.csv)
//   INDPRO  industrial production (data/us-indpro.csv)
//   CMRMTSPL real manufacturing and trade sales (data/us-cmrmtspl.csv)
// Added after the first attempt crashed on the blank, before any output: CE16OV's 2025-10 is blank (no household
// survey in the October 2025 shutdown) and is filled halfway between 2025-09 and 2025-11; nothing else changed.
// Real personal consumption (PCEC96) starts in 2002 and is left out; CMRMTSPL carries retail sales.
//
// Composite: compositeIndex() in ../composite-index.mjs (the Conference Board's method: symmetric changes,
// inverse-sd weights, cumulated; no GDP trend step). Standard deviations over 1967-02 to 2019-12, so that
// 2020's swings do not set the weights.
//
// Arms, both on the composite with turningPoints(x, { frequency: 'monthly', bigMove: 0.05 }) (log level,
// window 5, phases 6, cycles 15, a phase shorter than 6 months kept when the index moves 5% or more):
//   A  the Conference Board's four: PAYEMS, W875RX1, INDPRO, CMRMTSPL;
//   B  the same plus CE16OV, the fifth series on NBER's list.
// bigMove is on in both, set before the run: on payrolls it changed only 2020's two-month recession, which
// the 6-month rule otherwise discards.
// Labels: NBER's monthly peaks and troughs off FRED's USREC (as eval/turns-payems.mjs), those at indices
// 1..n-2 of the composite (16 turns, 1969-12 to 2020-04).
// Scoring as eval/turns-payems.mjs: matched when a turn of the same kind is within 3 months; false when no NBER
// turn of the same kind is within 6; F1 kind-blind at margin 6; random = k uniform cuts at the arm's count,
// 5,000 draws, seed 20261124.
//
// Bars (per arm):
//   C1 matched share of NBER's turns >= 0.80 (13 of 16) and at most 2 false turns;
//   C2 F1 - random mean F1 >= +0.15 with p <= 0.05;
//   C3 better than the best single component: matched count strictly above every component's own BBQ count
//      (same options) on the same months.
// Ships: if A passes C1-C3, a `turns` subcommand in cli.mjs that dates turns on one series or on a composite
// of several columns (--composite), documented with this result. If A fails and B passes all three, the same
// with B's five documented. Two arms are two looks at one bar; disclosed either way. Otherwise nothing ships
// in the CLI; composite-index.mjs stays a module.
// Printed, no bar: dates beside NBER's; each component alone; the arms without bigMove; weights; the arms
// with the standard deviations over every month.
//
// usage: node eval/turns-composite.mjs > eval/turns-composite.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance } from './turns-iran.mjs';
import { match } from './turns-bbq.mjs';
import { usrecTurns } from './turns-payems.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWS = 5000, SEED = 20261124, NEAR = 3, FAR = 6, MARGIN = 6, BIG = 0.05;
const FROM = '1967-01', TO = '2026-07', SD_TO = '2019-12';
const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;

export const COMPONENTS = { PAYEMS: 'us-payems.csv', W875RX1: 'us-w875rx1.csv', INDPRO: 'us-indpro.csv', CMRMTSPL: 'us-cmrmtspl.csv', CE16OV: 'us-ce16ov.csv' };
export const ARMS = [
  { name: 'A Conference Board four', parts: ['PAYEMS', 'W875RX1', 'INDPRO', 'CMRMTSPL'] },
  { name: 'B four + household employment', parts: ['PAYEMS', 'W875RX1', 'INDPRO', 'CMRMTSPL', 'CE16OV'] },
];

function readMonthly(file) {
  const m = new Map();
  for (const l of readFileSync(join(ROOT, 'data', file), 'utf8').trim().split('\n').slice(1)) {
    const [k, v] = l.split(',');
    m.set(k, v === undefined || v.trim() === '' ? NaN : Number(v));
  }
  // one blank month between two filled ones is filled on the straight line between them (CE16OV 2025-10: the
  // household survey was not taken in the October 2025 shutdown; FRED leaves it blank). Longer gaps stay NaN.
  const keys = [...m.keys()];
  for (let j = 1; j + 1 < keys.length; j++) {
    const [a, b, c] = [m.get(keys[j - 1]), m.get(keys[j]), m.get(keys[j + 1])];
    if (Number.isNaN(b) && Number.isFinite(a) && Number.isFinite(c)) m.set(keys[j], (a + c) / 2);
  }
  return m;
}

export function load() {
  const maps = Object.fromEntries(Object.entries(COMPONENTS).map(([k, f]) => [k, readMonthly(f)]));
  const label = [...maps.CMRMTSPL.keys()].filter((k) => k >= FROM && k <= TO);
  for (const [k, m] of Object.entries(maps)) for (const l of label) if (!Number.isFinite(m.get(l))) throw new Error(`${k} lacks ${l}`);
  const values = Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, label.map((l) => m.get(l))]));
  const n = label.length;
  const turns = usrecTurns().map((t) => ({ kind: t.kind, i: label.indexOf(t.month) })).filter((t) => t.i >= 1 && t.i <= n - 2);
  return { label, values, n, turns, sdTo: label.indexOf(SD_TO) + 1 };
}

function score(s, x, opts, draws) {
  const tp = turningPoints(x, { frequency: 'monthly', ...opts });
  const bi = tp.turns.map((t) => t.i);
  const ann = { nber: [...new Set(s.turns.map((t) => t.i))].sort((a, b) => a - b) };
  const F = fMeasure(ann, bi, MARGIN).F;
  const R = draws ? chance(s.n, bi.length, ann, MARGIN, F, draws, SEED) : null;
  const m = match(s.turns, tp.turns, NEAR, FAR);
  return { bbq: tp.turns, F, R, ...m, share: m.matched / s.turns.length };
}

export function run({ draws = DRAWS } = {}) {
  const s = load();
  const comps = Object.keys(COMPONENTS).map((k) => ({ name: k, ...score(s, s.values[k], { bigMove: BIG }, 0) }));
  const arms = ARMS.map((a) => {
    const c = compositeIndex(a.parts.map((p) => s.values[p]), { sdWindow: [1, s.sdTo] });
    const r = score(s, c.index, { bigMove: BIG }, draws);
    const best = Math.max(...comps.filter((x) => a.parts.includes(x.name)).map((x) => x.matched));
    const C1 = r.share >= 0.80 && r.falses <= 2;
    const C2 = r.F - r.R.mean >= 0.15 && r.R.p <= 0.05;
    const C3 = r.matched > best;
    const plain = score(s, c.index, {}, 0);
    const allSd = score(s, compositeIndex(a.parts.map((p) => s.values[p])).index, { bigMove: BIG }, 0);
    return { name: a.name, parts: a.parts, weights: c.weights, index: c.index, ...r, best, C1, C2, C3, plain, allSd };
  });
  const ok = (a) => a.C1 && a.C2 && a.C3;
  const decision = ok(arms[0]) ? 'A' : ok(arms[1]) ? 'B' : 'none';
  return { ...s, comps, arms, decision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const show = (ts) => ts.map((t) => `${o.label[t.i]}${t.kind[0]}`).join(' ');
  const misses = (a) => o.turns.filter((t) => !a.bbq.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= NEAR));
  const falses = (a) => a.bbq.filter((f) => !o.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= FAR));
  console.log('BBQ (classical, log level, monthly Bry-Boschan durations, bigMove 0.05) on a coincident composite vs NBER monthly turns');
  console.log(`\nmonths: n ${o.n} (${o.label[0]} to ${o.label[o.n - 1]}), NBER turns ${o.turns.length}`);
  console.log(`NBER: ${show(o.turns)}`);
  console.log('\neach component alone (same options; printed, C3 reads it):');
  for (const c of o.comps) console.log(`  ${c.name.padEnd(9)} turns ${String(c.bbq.length).padStart(2)}, matched ${String(c.matched).padStart(2)}/${o.turns.length}, false ${c.falses}, F1 ${r3(c.F)}; missed: ${show(misses(c)) || '-'}; false: ${show(falses(c)) || '-'}`);
  for (const a of o.arms) {
    console.log(`\n${a.name} (${a.parts.join(', ')}):`);
    console.log(`  weights: ${a.parts.map((p, i) => `${p} ${r3(a.weights[i])}`).join(', ')}`);
    console.log(`  BBQ turns ${a.bbq.length}, matched ${a.matched}/${o.turns.length} (${r3(a.share)}), false ${a.falses}`);
    console.log(`  BBQ: ${show(a.bbq)}`);
    console.log(`  missed: ${show(misses(a)) || '-'}; false: ${show(falses(a)) || '-'}`);
    const off = a.bbq.map((f) => { const t = o.turns.filter((t) => t.kind === f.kind).sort((x, y) => Math.abs(x.i - f.i) - Math.abs(y.i - f.i))[0]; return t ? f.i - t.i : null; }).filter((d) => d !== null && Math.abs(d) <= NEAR);
    console.log(`  months from NBER on matched turns: ${off.join(' ')}`);
    console.log(`  F1 ${r3(a.F)}, random ${r3(a.R.mean)} (${sg(a.F - a.R.mean)}), p ${r3(a.R.p)}`);
    console.log(`  best single component in the arm: matched ${a.best}`);
    console.log(`  C1 ${a.C1 ? 'passes' : 'fails'}; C2 ${a.C2 ? 'passes' : 'fails'}; C3 ${a.C3 ? 'passes' : 'fails'}`);
    console.log(`  printed, no bar: without bigMove matched ${a.plain.matched}, false ${a.plain.falses}; sd over every month matched ${a.allSd.matched}, false ${a.allSd.falses}`);
  }
  console.log(`\ndecision: ${o.decision === 'none' ? 'neither arm passes C1-C3; nothing ships in the CLI' : `arm ${o.decision} passes; a turns subcommand ships`}`);
}
