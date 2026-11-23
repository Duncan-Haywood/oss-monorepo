// A stiff slope: the trend walk with its slope wander capped, the cap chosen in simulation before any
// real series is fitted (README "The trend-walk route on fresh series", last paragraph: "if the trend
// walk is tried again, cap its slope wander (a stiff slope, qz well under 0.1, chosen in simulation
// before any real series) so a turn costs a cut").
//
// Pre-registered 2026-11-23, written and committed before this script was first run. Seen beforehand:
// nothing fitted with a capped walk, simulated or real. The uncapped walk's results on the NBER seven
// and on TCPD are known (README "Jumps on a smooth trend" and "The trend-walk route"), so those two
// sets are not fresh for the idea of a cap, only for its value; the fresh set F below has never been
// fitted by any model in this repository.
//
// Model: trendWalkChanges(x, { qzMax: CAP }) (drift-trend.mjs): the 'ml' search over the slope wander
// qz = zeta^2 / sigma^2 is limited to [0, CAP]; everything else is the default (3 log n, minSegment 3).
// Comparator: the shipped --model drift default, driftLevelChanges(x, { noise: 'ml' }).
//
// Stage 1, choose CAP in simulation (n 200, 200 series a cell, sigma 1, slope starting at 0.05, seeds
// fixed below and not reused in stage 2). Cells:
//   A0 null, slope wander zeta 0.02 (slow turns): false cuts a series.
//   A4 a 4-sigma level step at t 100 on the zeta 0.02 background: found within 5.
//   B4 a 4-sigma level step at t 100 on a zeta 0.1 background (the uncapped walk's weak cell, 38%).
//   K  a kink: the slope changes by 0.2 (sign by coin) at t 100 on the zeta 0.02 background: found within 5.
// Grid: CAP in {1e-4, 3e-4, 1e-3, 3e-3, 1e-2}. Rule: among caps with A0 at most 0.15 false cuts a
// series, take the one with the highest mean of B4 and K found; ties go to the larger cap. If no cap
// qualifies, stop: nothing is scored on real series and nothing ships.
//
// Stage 2, the chosen CAP on fresh seeds and real series. Bars:
//   R0 (simulation, fresh seeds): A0 at most 0.15 false cuts a series and B4 found at least 50%.
//   R1 (fresh set F, NBER peaks and troughs, margin 5): mean F1(stiff) - F1(shipped) at least +0.03
//      and stiff wins (diff > 0.005) on more series than it loses (diff < -0.005).
//   R2 (the NBER seven of eval/trend-walk-nber.mjs, same labels): mean diff at least +0.03.
//   R3 (TCPD, the 21 drift-floored series of eval/trend-walk-floored.mjs): mean diff at least 0
//      (the stiff walk must not lose where the uncapped walk gained +0.028).
// Fresh set F, chosen a priori as US activity measures NBER dates that no earlier round scored:
//   data/us-industrial-production-monthly.csv (AER USMacroSWM production, 1947-01 to 2004-12; industrial
//   production is one of the four monthly indicators the NBER committee reads);
//   data/us-industrial-production-quarterly.csv (AER USProdIndex adjusted, 1960Q1 to 1991Q4; the same
//   concept, another source and step, so F holds two concepts, not three independent series);
//   data/us-unemployed-monthly.csv (ggplot2 economics unemploy, persons unemployed, 1967-07 to 2015-04;
//   a sibling column of the median duration the NBER round scored, a different measure).
// Labels: as eval/trend-walk-nber.mjs (peak = month before a recession's first month, trough = its last
// month, data/nber-recessions.csv, kept when in 1..n-2, TCPD's F1 with margin 5).
// Ships: if R0, R1, R2 and R3 all pass, the CLI gets `--model drift --drift-trend stiff` (opt-in);
// defaults do not change either way. Otherwise `qzMax` stays a module option and the result is recorded.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/trend-walk-stiff.mjs tcpd-data > eval/trend-walk-stiff.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { driftNoise, driftLevelChanges } from '../drift-level.mjs';
import { trendWalkChanges } from '../drift-trend.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.argv[2] || 'tcpd-data';
const MARGIN = 5;
const r3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const sg = (v) => `${v >= 0 ? '+' : ''}${r3(v)}`;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const shipped = (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints;
const stiff = (cap) => (x) => trendWalkChanges(x, { qzMax: cap }).changepoints;

// --- simulation
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function series(seed, { zeta, step = 0, kink = 0 }) {
  const u = rng(seed), g = () => Math.sqrt(-2 * Math.log(u() + 1e-300)) * Math.cos(2 * Math.PI * u());
  const sign = u() < 0.5 ? -1 : 1;
  let mu = 0, b = 0.05; const y = [];
  for (let t = 0; t < 200; t++) {
    if (t === 100) { mu += step; b += sign * kink; }
    y.push(mu + g()); mu += b; b += zeta * g();
  }
  return y;
}
const CELLS = { A0: { zeta: 0.02 }, A4: { zeta: 0.02, step: 4 }, B4: { zeta: 0.1, step: 4 }, K: { zeta: 0.02, kink: 0.2 } };
const REPS = 200;
function simulate(fit, base) {
  const out = {};
  Object.entries(CELLS).forEach(([k, c], ci) => {
    let found = 0, falsec = 0;
    for (let r = 0; r < REPS; r++) {
      const cps = fit(series(base + 1000 * ci + r, c));
      if (k === 'A0') { falsec += cps.length; continue; }
      const near = (p) => Math.abs(p - 100) <= MARGIN;
      if (cps.some(near)) found++;
      falsec += cps.filter((p) => !near(p)).length;
    }
    out[k] = { found: found / REPS, falsec: falsec / REPS };
  });
  return out;
}
const simLine = (s) => `A0 false ${r3(s.A0.falsec)}; A4 found ${r3(s.A4.found)}; B4 found ${r3(s.B4.found)}; K found ${r3(s.K.found)} (false/series beside a change: A4 ${r3(s.A4.falsec)}, B4 ${r3(s.B4.falsec)}, K ${r3(s.K.falsec)})`;

console.log('Stage 1: choose the cap in simulation (n 200, 200 series a cell, seeds 100000+)');
const CAPS = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2];
const s1 = CAPS.map((cap) => ({ cap, s: simulate(stiff(cap), 100000) }));
const ref = { uncapped: simulate((x) => trendWalkChanges(x).changepoints, 100000), shipped: simulate(shipped, 100000) };
for (const { cap, s } of s1) console.log(`  cap ${cap.toExponential(0)}: ${simLine(s)}`);
console.log(`  uncapped walk (no bar): ${simLine(ref.uncapped)}`);
console.log(`  shipped drift (no bar): ${simLine(ref.shipped)}`);
const ok = s1.filter((r) => r.s.A0.falsec <= 0.15);
if (!ok.length) { console.log('\nNo cap has A0 at most 0.15: stop, nothing scored on real series, nothing ships.'); process.exit(0); }
const score = (r) => (r.s.B4.found + r.s.K.found) / 2;
const chosen = ok.reduce((a, r) => (score(r) >= score(a) ? r : a));
const CAP = chosen.cap;
console.log(`Chosen cap ${CAP.toExponential(0)} (A0 ${r3(chosen.s.A0.falsec)}, mean of B4 and K ${r3(score(chosen))}; ${ok.length} of ${CAPS.length} caps qualified)`);

console.log('\nStage 2');
const s2 = simulate(stiff(CAP), 900000);
const r0 = s2.A0.falsec <= 0.15 && s2.B4.found >= 0.5;
console.log(`  fresh seeds 900000+: ${simLine(s2)}`);

// --- NBER-labelled series
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const turns = [];
for (const [a, b] of rows('nber-recessions.csv').slice(1)) {
  let [y, m] = a.split('-').map(Number); m -= 1; if (m === 0) { m = 12; y -= 1; }
  turns.push({ y, m });
  const [y2, m2] = b.split('-').map(Number);
  turns.push({ y: y2, m: m2 });
}
const quarterStart = (lab) => { const [y, q] = lab.split('Q').map(Number); return [y, 3 * (q - 1) + 1]; };
const monthStart = (lab) => lab.split('-').map(Number);
const Q = (name, file, col) => ({ name, file, col, per: 3, start: quarterStart });
const M = (name, file, col) => ({ name, file, col, per: 1, start: monthStart });
const FRESH = [
  M('industrial production monthly', 'us-industrial-production-monthly.csv', 'production'),
  Q('industrial production quarterly', 'us-industrial-production-quarterly.csv', 'adjusted'),
  M('persons unemployed monthly', 'us-unemployed-monthly.csv', 'unemploy'),
];
const SEVEN = [
  ...['realgdp', 'realcons', 'realinv', 'realdpi', 'unemp'].map((c) => Q(`macrodata ${c}`, 'us-macro-quarterly.csv', c)),
  Q('us-real-gdp', 'us-real-gdp.csv', 'real_gdp'),
  M('us-unemployment-duration', 'us-unemployment-duration.csv', 'uempmed'),
];
function scoreSet(title, set) {
  console.log(`\n${title}: F1 shipped drift vs stiff walk (cap ${CAP.toExponential(0)}), NBER peaks and troughs, margin 5`);
  const out = [];
  let hS = 0, hT = 0, nL = 0;
  for (const s of set) {
    const r = rows(s.file), i = r[0].indexOf(s.col);
    const label = r.slice(1).map((x) => x[0]), x = r.slice(1).map((v) => Number(v[i])), n = x.length;
    const [y0, m0] = s.start(label[0]);
    const labels = [...new Set(turns.map((t) => Math.floor(((t.y - y0) * 12 + (t.m - m0)) / s.per)))].filter((c) => c >= 1 && c <= n - 2).sort((a, b) => a - b);
    const cs = clean(shipped(x), n), tw = trendWalkChanges(x, { qzMax: CAP }), ct = clean(tw.changepoints, n);
    const fs = fMeasure({ nber: labels }, cs, MARGIN).F, ft = fMeasure({ nber: labels }, ct, MARGIN).F;
    const near = (cuts) => labels.filter((l) => cuts.some((c) => Math.abs(c - l) <= MARGIN)).length;
    hS += near(cs); hT += near(ct); nL += labels.length;
    out.push({ d: ft - fs, fs, ft });
    console.log(`  ${s.name.padEnd(32)} n ${String(n).padStart(3)} labels ${String(labels.length).padStart(2)}  shipped ${String(cs.length).padStart(3)} cuts F1 ${r3(fs)} recall ${near(cs)}/${labels.length}  stiff ${String(ct.length).padStart(3)} cuts F1 ${r3(ft)} recall ${near(ct)}/${labels.length}  diff ${sg(ft - fs)}  qz ${tw.q.toExponential(2)}${tw.atCap ? ' (at cap)' : ''}`);
    console.log(`      labels  [${labels.map((l) => label[l]).join(' ')}]`);
    console.log(`      shipped [${cs.map((c) => label[c]).join(' ')}]`);
    console.log(`      stiff   [${ct.map((c) => label[c]).join(' ')}]`);
  }
  const wins = out.filter((r) => r.d > 0.005).length, losses = out.filter((r) => r.d < -0.005).length;
  console.log(`  mean F1 ${r3(mean(out.map((r) => r.fs)))} -> ${r3(mean(out.map((r) => r.ft)))}, diff ${sg(mean(out.map((r) => r.d)))}; ${wins} wins, ${losses} losses; pooled recall shipped ${hS}/${nL}, stiff ${hT}/${nL}`);
  return { md: mean(out.map((r) => r.d)), wins, losses };
}
const F = scoreSet('Fresh set F', FRESH);
const N7 = scoreSet('The NBER seven', SEVEN);
const r1 = F.md >= 0.03 && F.wins > F.losses;
const r2 = N7.md >= 0.03;

// --- TCPD floored series
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
function load(dir, held) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (!ann[name]) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    out.push({ name, values, n: values.length, held });
  }
  return out;
}
const all = [...load(join(DIR, 'ds'), false), ...load(join(DIR, 'heldout'), true)];
if (all.length < 38) throw new Error(`expected 38 series, found ${all.length}: run sh eval/tcpd-fetch.sh ${DIR}`);
console.log(`\nTCPD, the drift-floored series: F1 shipped drift vs stiff walk (cap ${CAP.toExponential(0)}), margin 5`);
const tr = all.filter((s) => driftNoise(s.values).flooredSigma).map((s) => {
  const cs = clean(shipped(s.values), s.n), tw = trendWalkChanges(s.values, { qzMax: CAP }), ct = clean(tw.changepoints, s.n);
  const fs = fMeasure(ann[s.name], cs, MARGIN).F, ft = fMeasure(ann[s.name], ct, MARGIN).F;
  console.log(`  ${s.name.padEnd(22)}${s.held ? ' (held out)' : '           '} n ${String(s.n).padStart(4)}  shipped ${String(cs.length).padStart(3)} ${r3(fs)}  stiff ${String(ct.length).padStart(3)} ${r3(ft)}  diff ${sg(ft - fs)}  qz ${tw.q.toExponential(2)}${tw.atCap ? ' (at cap)' : ''}`);
  return { d: ft - fs, fs, ft };
});
const tw = tr.filter((r) => r.d > 0.005).length, tl = tr.filter((r) => r.d < -0.005).length;
const r3m = mean(tr.map((r) => r.d));
console.log(`  ${tr.length} series, mean F1 ${r3(mean(tr.map((r) => r.fs)))} -> ${r3(mean(tr.map((r) => r.ft)))}, diff ${sg(r3m)}; ${tw} wins, ${tl} losses`);
const r3b = r3m >= 0;

console.log(`\nR0 ${r0 ? 'PASSES' : 'FAILS'}: fresh seeds A0 false ${r3(s2.A0.falsec)} (bar 0.15), B4 found ${r3(s2.B4.found)} (bar 0.50)`);
console.log(`R1 ${r1 ? 'PASSES' : 'FAILS'}: fresh set mean diff ${sg(F.md)} (bar +0.03), ${F.wins} wins vs ${F.losses} losses`);
console.log(`R2 ${r2 ? 'PASSES' : 'FAILS'}: NBER seven mean diff ${sg(N7.md)} (bar +0.03)`);
console.log(`R3 ${r3b ? 'PASSES' : 'FAILS'}: TCPD floored mean diff ${sg(r3m)} (bar 0)`);
console.log(`\nShips: ${r0 && r1 && r2 && r3b ? '`--model drift --drift-trend stiff` (opt-in)' : 'nothing in the CLI (R0-R3 must all pass); qzMax stays a module option'}.`);
