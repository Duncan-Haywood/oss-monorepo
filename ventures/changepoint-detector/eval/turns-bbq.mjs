// A dating rule built for turning points: Bry-Boschan's quarterly rule (BBQ, turning-points.mjs) against the
// NBER business-cycle dates and Iran's MBRI growth-cycle dating.
//
// Open item from README "A turning-point option on Iran's dated cycle": "A person who wants dated turns in a
// smooth aggregate is better served by a dating rule built for it (Bry-Boschan / BBQ, which BCDating
// implements) than by a changepoint model." This round builds that rule and holds it to bars written first.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Seen beforehand: the
// data files (all used in earlier rounds here) and two synthetic checks of the module (a sine of period 20
// dated at its crests; a straight line's HP cycle is 0). BBQ has not been run on any of these series here.
//
// Series, chosen before running, procyclical activity measures only (unemployment is left out because it
// turns the other way round, so "peak" would mean the opposite):
//   quarterly: macrodata realgdp, realcons, realinv, realdpi (1959Q1-2009Q3, data/us-macro-quarterly.csv);
//              R's real GDP (1950Q1-2000Q4, data/us-real-gdp.csv); industrial production (1960Q1-1991Q4,
//              data/us-industrial-production-quarterly.csv)
//   monthly:   industrial production (1947-01 to 2004-12, data/us-industrial-production-monthly.csv)
// Labels: NBER peaks (month before a recession's first month) and troughs (its last month),
// data/nber-recessions.csv, as in eval/trend-walk-nber.mjs; only those at indices 1..n-2 are scored.
// Arms: bbq = turningPoints(x, { frequency }) (classical mode, on log x, the module's defaults, nothing tuned);
// shipped = driftLevelChanges(x, { noise: 'ml' }) on the level, as in the earlier rounds.
// Scores:
//   matched: an NBER turn is matched when a BBQ turn of the same kind is within 1 quarter (3 months);
//   false turn: a BBQ turn with no NBER turn of the same kind within 2 quarters (6 months);
//   F1: TCPD's F1 (eval/tcpd-metrics.mjs), kind-blind, margin 2 quarters (6 months), so both arms are scored alike;
//   random: k distinct uniform cuts at the arm's own count, 5,000 draws, seed 20261124; p = share >= the arm's F1.
//
// Bars:
//   D1 the textbook check, the two real GDP series: pooled matched share of NBER turns >= 0.80, and at most 2
//      false turns on each.
//   D2 beyond chance on all seven series: mean (F1 - random mean F1 at BBQ's count) >= +0.15, and p <= 0.05 on
//      at least 6 of the 7.
//   D3 better than the shipped changepoint model on the seven: mean F1(bbq) - F1(shipped) >= +0.10, and more
//      wins than losses (a difference over 0.005 either way).
//   G1 growth cycle, Iran (fresh for this rule): turningPoints(level, { mode: 'growth' }) (HP lambda 1600 on
//      the log level, the module's own filter) against MBRI's 13 turns at margin 2: F1 - random mean >= +0.10
//      with p <= 0.05, and F1 >= 0.447 (the shipped model's 0.417 on the same scoring, +0.03).
// Printed, no bar: each series' dates beside NBER's; the rule on the package's own hp_cycle column; Iran's
// matched share within 1 quarter; growth mode on the US series.
// Ships: if D1, D2 and D3 pass, a turning-point CLI (turns-cli.mjs, classical mode) and a README section.
// Growth mode goes in the CLI only if G1 also passes; otherwise it stays a module option and the reason is
// recorded. If any of D1-D3 fails, nothing ships and the failure is recorded.
//
// usage: node eval/turns-bbq.mjs > eval/turns-bbq.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { driftLevelChanges } from '../drift-level.mjs';
import { turningPoints, bbq, PRESETS } from '../turning-points.mjs';
import { fMeasure } from './tcpd-metrics.mjs';
import { chance, loadIran } from './turns-iran.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWS = 5000, SEED = 20261124;
const r3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

const nberMonths = [];
for (const [a, b] of rows('nber-recessions.csv').slice(1)) {
  let [y, m] = a.split('-').map(Number); m -= 1; if (m === 0) { m = 12; y -= 1; }
  nberMonths.push({ kind: 'peak', y, m });
  const [y2, m2] = b.split('-').map(Number);
  nberMonths.push({ kind: 'trough', y: y2, m: m2 });
}
const quarterStart = (lab) => { const [y, q] = lab.split('Q').map(Number); return [y, 3 * (q - 1) + 1]; };
const monthStart = (lab) => lab.split('-').map(Number);

export const SERIES = [
  ...['realgdp', 'realcons', 'realinv', 'realdpi'].map((c) => ({ name: `macrodata ${c}`, file: 'us-macro-quarterly.csv', col: c, frequency: 'quarterly', gdp: c === 'realgdp' })),
  { name: 'us-real-gdp', file: 'us-real-gdp.csv', col: 'real_gdp', frequency: 'quarterly', gdp: true },
  { name: 'industrial production (q)', file: 'us-industrial-production-quarterly.csv', col: 'adjusted', frequency: 'quarterly' },
  { name: 'industrial production (m)', file: 'us-industrial-production-monthly.csv', col: 'production', frequency: 'monthly' },
];

export function loadSeries(s) {
  const r = rows(s.file), i = r[0].indexOf(s.col);
  const label = r.slice(1).map((x) => x[0]), values = r.slice(1).map((x) => Number(x[i]));
  const per = s.frequency === 'monthly' ? 1 : 3;
  const [y0, m0] = (per === 1 ? monthStart : quarterStart)(label[0]);
  const n = values.length;
  const seen = new Set();
  const turns = nberMonths
    .map((t) => ({ kind: t.kind, i: Math.floor(((t.y - y0) * 12 + (t.m - m0)) / per) }))
    .filter((t) => t.i >= 1 && t.i <= n - 2 && !seen.has(`${t.kind}${t.i}`) && seen.add(`${t.kind}${t.i}`));
  return { label, values, turns, per };
}

export function match(truth, found, near, far) {
  const matched = truth.filter((t) => found.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= near)).length;
  const falses = found.filter((f) => !truth.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= far)).length;
  return { matched, falses };
}

export function run({ draws = DRAWS } = {}) {
  const us = [];
  for (const s of SERIES) {
    const { label, values, turns, per } = loadSeries(s);
    const n = values.length, monthly = per === 1;
    const near = monthly ? 3 : 1, far = monthly ? 6 : 2, margin = monthly ? 6 : 2;
    const tp = turningPoints(values, { frequency: s.frequency });
    const bi = tp.turns.map((t) => t.i);
    const cs = clean(driftLevelChanges(values, { noise: 'ml' }).changepoints, n);
    const ann = { nber: [...new Set(turns.map((t) => t.i))].sort((a, b) => a - b) };
    const fb = fMeasure(ann, bi, margin).F, fs = fMeasure(ann, cs, margin).F;
    const rb = chance(n, bi.length, ann, margin, fb, draws, SEED);
    const m = match(turns, tp.turns, near, far);
    const growth = turningPoints(values, { frequency: s.frequency, mode: 'growth' });
    const gm = match(turns, growth.turns, near, far);
    us.push({ ...s, n, label, turns, bbq: tp.turns, shipped: cs, fb, fs, rb, ...m, growth: { turns: growth.turns, ...gm, F: fMeasure(ann, growth.turns.map((t) => t.i), margin).F } });
  }
  const gdp = us.filter((r) => r.gdp);
  const D1share = gdp.reduce((s, r) => s + r.matched, 0) / gdp.reduce((s, r) => s + r.turns.length, 0);
  const D1 = D1share >= 0.80 && gdp.every((r) => r.falses <= 2);
  const D2excess = mean(us.map((r) => r.fb - r.rb.mean)), D2p = us.filter((r) => r.rb.p <= 0.05).length;
  const D2 = D2excess >= 0.15 && D2p >= 6;
  const D3diff = mean(us.map((r) => r.fb - r.fs));
  const wins = us.filter((r) => r.fb - r.fs > 0.005).length, losses = us.filter((r) => r.fb - r.fs < -0.005).length;
  const D3 = D3diff >= 0.10 && wins > losses;

  const { quarter, level, turns: mbri } = loadIran();
  const n = level.length;
  const ann = { mbri: mbri.map((t) => t.i).filter((c) => c >= 1 && c <= n - 2) };
  const g = turningPoints(level, { frequency: 'quarterly', mode: 'growth' });
  const gi = g.turns.map((t) => t.i), gF = fMeasure(ann, gi, 2).F, gR = chance(n, gi.length, ann, 2, gF, draws, SEED);
  const gm = match(mbri, g.turns, 1, 2);
  const r = rows('iran-non-oil-gdp-quarterly.csv'), hc = r.slice(1).map((x) => Number(x[r[0].indexOf('hp_cycle')]));
  const pk = bbq(hc, PRESETS.quarterly), pkF = fMeasure(ann, pk.map((t) => t.i), 2).F, pkm = match(mbri, pk, 1, 2);
  const iran = { quarter, mbri, turns: g.turns, F: gF, R: gR, ...gm, pkg: { turns: pk, F: pkF, ...pkm } };
  const G1 = gF - gR.mean >= 0.10 && gR.p <= 0.05 && gF >= 0.447;
  return { us, D1share, D1, D2excess, D2p, D2, D3diff, wins, losses, D3, iran, G1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run();
  const show = (lab, ts) => ts.map((t) => `${lab[t.i]}${t.kind[0]}`).join(' ');
  console.log('BBQ (classical, log level, module defaults) vs NBER peaks and troughs; shipped drift model beside it');
  for (const r of o.us) {
    console.log(`\n${r.name}: n ${r.n}, NBER turns ${r.turns.length}, BBQ turns ${r.bbq.length}, matched ${r.matched}/${r.turns.length}, false ${r.falses}`);
    console.log(`  F1 bbq ${r3(r.fb)} (random ${r3(r.rb.mean)}, excess ${sg(r.fb - r.rb.mean)}, p ${r3(r.rb.p)})  shipped ${r.shipped.length} cuts F1 ${r3(r.fs)}  bbq - shipped ${sg(r.fb - r.fs)}`);
    console.log(`  NBER  ${show(r.label, r.turns)}`);
    console.log(`  BBQ   ${show(r.label, r.bbq)}`);
    console.log(`  growth mode (no bar): ${r.growth.turns.length} turns, matched ${r.growth.matched}/${r.turns.length}, false ${r.growth.falses}, F1 ${r3(r.growth.F)}`);
  }
  const I = o.iran;
  console.log(`\nIran non-oil GDP, growth mode (HP 1600 on log level): ${I.turns.length} turns, matched ${I.matched}/${I.mbri.length} within 1 quarter, false ${I.falses}`);
  console.log(`  F1 ${r3(I.F)} (random ${r3(I.R.mean)}, excess ${sg(I.F - I.R.mean)}, p ${r3(I.R.p)})`);
  console.log(`  MBRI  ${I.mbri.map((t) => `${t.q}${t.kind[0]}`).join(' ')}`);
  console.log(`  BBQ   ${show(I.quarter, I.turns)}`);
  console.log(`  on the package's hp_cycle column (no bar): ${I.pkg.turns.length} turns, matched ${I.pkg.matched}/${I.mbri.length}, false ${I.pkg.falses}, F1 ${r3(I.pkg.F)}: ${show(I.quarter, I.pkg.turns)}`);
  console.log(`\nD1 ${o.D1 ? 'PASSES' : 'FAILS'}: GDP matched share ${r3(o.D1share)} (bar 0.80), false turns ${o.us.filter((r) => r.gdp).map((r) => r.falses).join(' and ')} (bar <= 2 each)`);
  console.log(`D2 ${o.D2 ? 'PASSES' : 'FAILS'}: mean excess over random ${sg(o.D2excess)} (bar +0.15), p <= 0.05 on ${o.D2p} of 7 (bar 6)`);
  console.log(`D3 ${o.D3 ? 'PASSES' : 'FAILS'}: mean bbq - shipped ${sg(o.D3diff)} (bar +0.10), ${o.wins} wins, ${o.losses} losses`);
  console.log(`G1 ${o.G1 ? 'PASSES' : 'FAILS'}: Iran growth F1 ${r3(I.F)} (bar 0.447), excess ${sg(I.F - I.R.mean)} (bar +0.10), p ${r3(I.R.p)} (bar 0.05)`);
  const ship = o.D1 && o.D2 && o.D3;
  console.log(`\nShips: ${ship ? `turns-cli.mjs, classical mode${o.G1 ? ', and growth mode' : '; growth mode stays a module option'}` : 'nothing'}.`);
}
