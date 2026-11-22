// The trend-walk routing rule on fresh labelled series: US activity measures scored against NBER
// business-cycle peaks and troughs (README "Jumps on a smooth trend", last paragraph: "That routing
// rule (trend walk when the drift sigma floors and the trend sigma does not) was chosen on these
// series and needs fresh labelled series to test").
//
// Pre-registered 2026-11-22, written before this script was first run. Seen beforehand: only the
// two pre-fit flags (driftNoise(x).flooredSigma, trendNoise(x).flooredSigma) on every committed
// series and every macrodata column, to find where the rule applies; no series below was fitted or
// scored with either model. Documented-event series probed first (strucchange's GermanM1,
// BostonHomicide, Grossarl, TSA's airmiles, Seatbelts' front and van series): none has a floored
// drift sigma, so the rule would not route any of them; they are not scored here.
//
// Series, chosen a priori as US aggregate activity measures whose turning points NBER dates (all
// seven are drift-floored and trend-not-floored, so the rule routes every one to the trend walk):
//   data/us-macro-quarterly.csv (statsmodels macrodata, 1959Q1-2009Q3): realgdp, realcons, realinv,
//     realdpi, unemp; data/us-real-gdp.csv (R's USMacroG gdp, 1950Q1-2000Q4); and
//   data/us-unemployment-duration.csv (FRED UEMPMED, monthly 1967-07 to 2015-04).
//   Left out beforehand, as NBER dates are not their turning points: realgovt, cpi, m1, tbilrate,
//   pop, productivity, the saving rate. realgdp and us-real-gdp overlap 1959-2000 (two vintages of
//   one concept), so the seven are not independent.
// Labels: data/nber-recessions.csv (R package tis, nberDates(): first and last month of each
//   recession). A peak is the month before a recession's first month, a trough its last month;
//   both are labels, mapped to the series' own step (a quarter holds its months) and kept when they
//   fall in 1..n-2. One annotator, TCPD's F1 with margin 5 (eval/tcpd-metrics.mjs).
// Arms: routed = trendWalkChanges(x) (defaults: wander by likelihood, 3 log n, minSegment 3);
//   shipped = driftLevelChanges(x, { noise: 'ml' }) (the CLI's --model drift default).
// Bars:
//   N1: mean F1(routed) - F1(shipped) over the seven series is at least +0.03.
//   N2: routed wins (diff > 0.005) on more series than it loses (diff < -0.005).
//   N3: pooled recall (labels with a cut within 5) of routed is at least shipped's.
// Ships: if N1 and N2 pass, `--drift-trend` on the CLI (opt-in) and a note under --model drift when
// the rule would route; defaults unchanged either way. Otherwise nothing in the CLI changes and the
// result is recorded in the README.
//
// usage: node eval/trend-walk-nber.mjs > eval/trend-walk-nber.out.txt
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { driftNoise, driftLevelChanges } from '../drift-level.mjs';
import { trendNoise, trendWalkChanges } from '../drift-trend.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARGIN = 5;
const r3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const rows = (f) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => l.split(','));
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

// Recession months as [year, month] pairs: peak = month before the first month, trough = last month.
const turns = [];
for (const [a, b] of rows('nber-recessions.csv').slice(1)) {
  let [y, m] = a.split('-').map(Number); m -= 1; if (m === 0) { m = 12; y -= 1; }
  turns.push({ kind: 'peak', y, m });
  const [y2, m2] = b.split('-').map(Number);
  turns.push({ kind: 'trough', y: y2, m: m2 });
}
// index of a month in a series that starts at (y0, m0) with `per` months a step
const at = (y0, m0, per) => (t) => Math.floor(((t.y - y0) * 12 + (t.m - m0)) / per);

function column(file, col) {
  const r = rows(file), h = r[0], i = h.indexOf(col);
  return { label: r.slice(1).map((x) => x[0]), values: r.slice(1).map((x) => Number(x[i])) };
}
const quarterStart = (lab) => { const [y, q] = lab.split('Q').map(Number); return [y, 3 * (q - 1) + 1]; };
const monthStart = (lab) => lab.split('-').map(Number);

const series = [
  ...['realgdp', 'realcons', 'realinv', 'realdpi', 'unemp'].map((c) => ({ name: `macrodata ${c}`, file: 'us-macro-quarterly.csv', col: c, per: 3, start: quarterStart })),
  { name: 'us-real-gdp', file: 'us-real-gdp.csv', col: 'real_gdp', per: 3, start: quarterStart },
  { name: 'us-unemployment-duration', file: 'us-unemployment-duration.csv', col: 'uempmed', per: 1, start: monthStart },
];

console.log('Trend walk (routed) vs shipped drift (wander by likelihood), NBER peaks and troughs, margin 5');
const out = [];
let hitR = 0, hitS = 0, nLab = 0;
for (const s of series) {
  const { label, values } = column(s.file, s.col);
  const n = values.length;
  const [y0, m0] = s.start(label[0]);
  const idx = at(y0, m0, s.per);
  const labels = [...new Set(turns.map(idx))].filter((c) => c >= 1 && c <= n - 2).sort((a, b) => a - b);
  const dFloor = driftNoise(values).flooredSigma, tFloor = trendNoise(values).flooredSigma;
  const routes = dFloor && !tFloor;
  const cs = clean(driftLevelChanges(values, { noise: 'ml' }).changepoints, n);
  const ct = clean(trendWalkChanges(values).changepoints, n);
  const ann = { nber: labels };
  const fs = fMeasure(ann, cs, MARGIN).F, ft = fMeasure(ann, ct, MARGIN).F;
  const near = (cuts) => labels.filter((l) => cuts.some((c) => Math.abs(c - l) <= MARGIN)).length;
  hitR += near(ct); hitS += near(cs); nLab += labels.length;
  out.push({ ...s, n, fs, ft, d: ft - fs, routes });
  console.log(`  ${s.name.padEnd(26)} n ${String(n).padStart(3)} labels ${String(labels.length).padStart(2)} routes ${routes ? 'yes' : 'NO '}  shipped ${String(cs.length).padStart(3)} cuts F1 ${r3(fs)} recall ${near(cs)}/${labels.length}  routed ${String(ct.length).padStart(3)} cuts F1 ${r3(ft)} recall ${near(ct)}/${labels.length}  diff ${ft - fs >= 0 ? '+' : ''}${r3(ft - fs)}`);
  console.log(`      labels [${labels.map((l) => label[l]).join(' ')}]`);
  console.log(`      shipped [${cs.map((c) => label[c]).join(' ')}]`);
  console.log(`      routed  [${ct.map((c) => label[c]).join(' ')}]`);
}
if (out.some((r) => !r.routes)) console.log('NOTE: a series the header says routes does not; bars are scored on all seven as registered.');
const md = mean(out.map((r) => r.d));
const wins = out.filter((r) => r.d > 0.005).length, losses = out.filter((r) => r.d < -0.005).length;
const n1 = md >= 0.03, n2 = wins > losses, n3 = hitR >= hitS;
console.log(`\nN1 ${n1 ? 'PASSES' : 'FAILS'}: mean diff ${md >= 0 ? '+' : ''}${r3(md)} (bar +0.03); F1 ${r3(mean(out.map((r) => r.fs)))} -> ${r3(mean(out.map((r) => r.ft)))}`);
console.log(`N2 ${n2 ? 'PASSES' : 'FAILS'}: ${wins} wins, ${losses} losses, ${out.length - wins - losses} ties`);
console.log(`N3 ${n3 ? 'PASSES' : 'FAILS'}: pooled recall routed ${hitR}/${nLab} vs shipped ${hitS}/${nLab}`);
console.log(`\nShips: ${n1 && n2 ? '--drift-trend (opt-in) and a routing note under --model drift' : 'nothing in the CLI (N1 and N2 must both pass)'}.`);
