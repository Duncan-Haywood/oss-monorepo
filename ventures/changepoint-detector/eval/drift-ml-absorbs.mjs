// Why `--model drift`'s wander by likelihood (driftNoiseML) loses the 1983 seat-belt law and
// quality control 4 (README "A step-robust omega", Next), and whether the cause can be seen before
// fitting, from the lag-difference variances driftNoise already computes.
//
// Pre-registered 2026-11-22, written before this script was first run. What had been seen: a probe
// (not kept) of the q profile on seatbelts, quality_control_3/4, gdp_iran, gdp_japan, nile and
// quality_control_1, printing sigma, omega, q, the lag variances and cuts per q. Nothing was scored.
// From it, two candidate mechanisms:
//   seasonal: on seatbelts the lag variances rise to lag 7 and fall back by lag 10 (a yearly cycle),
//     so a random walk is fitted to the seasonal swing; q = omega^2/sigma^2 rises to 0.51, where the
//     law's step (~1 sigma at monthly noise) costs less as wander than as one change.
//   floored: on quality_control_4 the lag variances grow faster than linearly in k (a smooth,
//     momentum-like level), the least-squares intercept falls below driftNoise's 2% floor, and
//     sigma sits at that floor (0.079 against a lag-1 sd of 0.79), so q is ~90.
// Flags, fixed here: floored = the fitted intercept a/2 is below the floor 0.02 v_1 / 2 (sigma is the
// floor); seasonal = the largest lag variance is at an interior lag (2..K-1) and v_K is under 0.75 of
// it. K = driftNoise's own (up to 10).
// Lines:
//   M1 (seatbelts, mechanism): with the 12 calendar-month medians taken off, the ML fit cuts within
//      5 of 169 (every annotator's 1983 law) and chooses q under half of the raw series' q.
//   M2 (quality_control_4, mechanism): its sigma is floored, and the ML fit still cuts within 5 of
//      338-342 (the step is found; the F1 loss is extra cuts, not absorption).
//   G1 (the flags explain losses): of the TCPD series (31 shipped + 7 held out) where ML minus lag
//      noise F1 is below -0.05, at least half are flagged.
//   G2 (the flags are worth a note): mean ML minus lag F1 is negative on flagged series and not
//      negative on unflagged ones.
// If G1 and G2 pass, a note ships with `--model drift` on flagged series (compare --drift-noise lags);
// defaults do not change either way. M1 and M2 are explanations, not shipping rules.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/drift-ml-absorbs.mjs tcpd-data > eval/drift-ml-absorbs.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { driftNoise, driftLevelChanges } from '../drift-level.mjs';
import { median } from '../stats-core.mjs';
import { fMeasure } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const MARGIN = 5;
const r3 = (v) => v.toFixed(3);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

function load(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (!ann[name]) continue;
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
    out.push({ name, values, n: values.length });
  }
  return out;
}
const all = [...load(join(DIR, 'ds')), ...load(join(DIR, 'heldout'))];
if (all.length < 38) throw new Error(`expected 38 series, found ${all.length}: run sh eval/tcpd-fetch.sh ${DIR}`);

export function lagFlags(values) {
  const est = driftNoise(values);
  const v = est.lagVariances;
  const floored = est.flooredSigma;
  let mi = 0; v.forEach((r, i) => { if (r.v > v[mi].v) mi = i; });
  const seasonal = v.length >= 3 && mi >= 1 && mi < v.length - 1 && v[v.length - 1].v < 0.75 * v[mi].v;
  return { floored, seasonal, peakLag: v[mi].k, est };
}

const near = (cps, targets) => cps.some((c) => targets.some((t) => Math.abs(c - t) <= MARGIN));
const ml = (x) => driftLevelChanges(x, { noise: 'ml' });

console.log('M1 seatbelts: ML wander on the raw series and with calendar-month medians taken off');
const sb = all.find((s) => s.name === 'seatbelts');
const raw = ml(sb.values);
const med = Array.from({ length: 12 }, (_, m) => median(sb.values.filter((_, t) => t % 12 === m)));
const des = sb.values.map((v, t) => v - med[t % 12]);
const dz = ml(des);
console.log(`  raw:          q ${r3(raw.ml.q)}  sigma ${r3(raw.sigma)}  cuts [${raw.changepoints}]  flags ${JSON.stringify((({ floored, seasonal, peakLag }) => ({ floored, seasonal, peakLag }))(lagFlags(sb.values)))}`);
console.log(`  deseasonal:   q ${r3(dz.ml.q)}  sigma ${r3(dz.sigma)}  cuts [${dz.changepoints}]  flags ${JSON.stringify((({ floored, seasonal, peakLag }) => ({ floored, seasonal, peakLag }))(lagFlags(des)))}`);
const m1 = near(dz.changepoints, [169]) && dz.ml.q < raw.ml.q / 2;
console.log(`  M1 ${m1 ? 'PASSES' : 'FAILS'}: cut near 169 ${near(dz.changepoints, [169])}, q ${r3(dz.ml.q)} vs half of raw ${r3(raw.ml.q / 2)}`);

console.log('\nM2 quality_control_4: sigma floored, step at 338-342 still cut');
const q4 = all.find((s) => s.name === 'quality_control_4');
const f4 = lagFlags(q4.values), r4 = ml(q4.values), l4 = driftLevelChanges(q4.values, {});
console.log(`  lag fit: sigma ${r3(f4.est.sigma)} (lag-1 sd ${r3(Math.sqrt(f4.est.lagVariances[0].v))}), floored ${f4.floored}; lag-noise cuts [${l4.changepoints}]`);
console.log(`  ML: q ${r3(r4.ml.q)} cuts [${r4.changepoints}]`);
const m2 = f4.floored && near(r4.changepoints, [338, 340, 342]);
console.log(`  M2 ${m2 ? 'PASSES' : 'FAILS'}`);

console.log('\nPer series: flags, F1 with lag noise and with ML noise (margin 5)');
const rows = all.map((s) => {
  const fl = lagFlags(s.values);
  const lag = clean(driftLevelChanges(s.values, {}).changepoints, s.n);
  const m = clean(ml(s.values).changepoints, s.n);
  const fLag = fMeasure(ann[s.name], lag, MARGIN).F, fMl = fMeasure(ann[s.name], m, MARGIN).F;
  return { name: s.name, n: s.n, ...fl, flagged: fl.floored || fl.seasonal, fLag, fMl, d: fMl - fLag, cl: lag.length, cm: m.length };
});
for (const r of rows) console.log(`  ${r.name.padEnd(22)} n ${String(r.n).padStart(4)}  ${r.floored ? 'floored' : '       '} ${r.seasonal ? `seasonal(peak ${r.peakLag})` : '                '}  lag ${String(r.cl).padStart(3)} ${r3(r.fLag)}  ML ${String(r.cm).padStart(3)} ${r3(r.fMl)}  diff ${r.d >= 0 ? '+' : ''}${r3(r.d)}`);

const losses = rows.filter((r) => r.d < -0.05);
const lf = losses.filter((r) => r.flagged);
const g1 = lf.length * 2 >= losses.length;
console.log(`\nG1 ${g1 ? 'PASSES' : 'FAILS'}: ${lf.length} of ${losses.length} ML losses (diff < -0.05) are flagged (${losses.map((r) => r.name + (r.flagged ? '*' : '')).join(', ')})`);
const fl = rows.filter((r) => r.flagged), un = rows.filter((r) => !r.flagged);
const g2 = mean(fl.map((r) => r.d)) < 0 && !(mean(un.map((r) => r.d)) < 0);
console.log(`G2 ${g2 ? 'PASSES' : 'FAILS'}: mean ML minus lag F1 ${r3(mean(fl.map((r) => r.d)))} on ${fl.length} flagged, ${r3(mean(un.map((r) => r.d)))} on ${un.length} unflagged`);
console.log(`  by flag: floored ${rows.filter((r) => r.floored).length} series, mean diff ${r3(mean(rows.filter((r) => r.floored).map((r) => r.d)))}; seasonal ${rows.filter((r) => r.seasonal).length}, mean diff ${r3(mean(rows.filter((r) => r.seasonal).map((r) => r.d)))}`);
console.log(`\nShips: ${g1 && g2 ? 'a note on flagged series under --model drift' : 'nothing (G1 and G2 must both pass)'}.`);
