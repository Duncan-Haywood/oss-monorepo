// The closest call (drift-level.mjs closestUncut): of the cuts `--model drift` did not make, the one
// that would have saved the most -2 log likelihood, and its shortfall against the penalty. Is it a
// number worth printing beside "no jump stands out"? Three lines, pre-registered 2026-11-22 before
// this script first ran (what had been seen: seat belts only, where the closest call at the ML fit is
// 1983-01, the law, saving 9.15 of 10.51).
//
// On the 38 TCPD series (31 shipped + 7 held out; the default `--model drift`, wander by likelihood,
// penalty 2 log n, minSegment 2). An annotated change is "missed" when no reported cut is within 5 of
// it; the closest call is a "hit" when it is within 5 of a missed annotated change (any annotator).
//   C1 (better than chance): the hit rate over series with a closest call is at least twice the
//      chance rate, the mean over those series of the share of eligible split positions (every
//      position closestUncut searches) that would be hits.
//   C2 (the shortfall ranks it): the median shortfall of hits is below the median of non-hits.
//   C3 (the arithmetic is exact): on every series, a refit at the same sigma and omega with the
//      penalty set to saving - 0.01 lists the closest call, and at saving + 0.01 does not change.
// If C3 fails, the line does not ship. If C3 passes, the line ships stating the arithmetic; the
// line may quote a hit rate only if C1 and C2 both pass. Defaults and cuts do not change either way.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/closest-call.mjs tcpd-data > eval/closest-call.out.txt
// (NOISE=lags gives eval/closest-call-lags.out.txt: the first run, by a bug, called driftLevel with its
// own default, the lag-difference wander, not the CLI's; it is kept, and is not the registered run.)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { driftLevel, driftLevelChanges, closestUncut } from '../drift-level.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const MARGIN = 5;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length; return m ? (m % 2 ? s[(m - 1) / 2] : (s[m / 2 - 1] + s[m / 2]) / 2) : NaN; };

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

const rows = [];
let exact = 0, exactOf = 0;
for (const s of all) {
  const r = driftLevel(s.values, { noise: process.env.NOISE || 'ml' });
  const marked = [...new Set(Object.values(ann[s.name]).flat())].filter((t) => t > 0 && t < s.n);
  const missed = marked.filter((t) => !r.changepoints.some((c) => Math.abs(c - t) <= MARGIN));
  const isHit = (i) => missed.some((t) => Math.abs(i - t) <= MARGIN);
  const cc = r.sigma == null ? null : closestUncut(s.values, r.changepoints, { sigma: r.sigma, omega: r.omega, penalty: r.penalty, slope: r.slope || 0 });
  const c = cc && cc.saving > 0 ? cc : null;
  if (!c) { rows.push({ name: s.name, n: s.n, cuts: r.changepoints.length, missed: missed.length, closest: null }); continue; }
  // Eligible positions: every split closestUncut searches.
  const b = [0, ...r.changepoints, s.n];
  let elig = 0, eligHit = 0;
  for (let k = 0; k + 1 < b.length; k++) for (let i = b[k] + 2; i <= b[k + 1] - 2; i++) { elig++; if (isHit(i)) eligHit++; }
  const fix = { sigma: r.sigma, omega: r.omega, slope: false };
  const lo = driftLevelChanges(s.values, { ...fix, penalty: c.saving - 0.01 }).changepoints;
  const hi = driftLevelChanges(s.values, { ...fix, penalty: c.saving + 0.01 }).changepoints;
  const ok = lo.includes(c.index) && hi.length === r.changepoints.length && hi.every((v, i) => v === r.changepoints[i]);
  exactOf++; if (ok) exact++;
  rows.push({ name: s.name, n: s.n, cuts: r.changepoints.length, missed: missed.length, closest: c, hit: isHit(c.index), chance: elig ? eligHit / elig : 0, exact: ok });
}

console.log('series                        n  cuts missed  closest  saving  penalty  shortfall  jump_sd  hit  chance  exact');
for (const r of rows) {
  const c = r.closest;
  console.log(`${r.name.padEnd(26)} ${String(r.n).padStart(5)} ${String(r.cuts).padStart(5)} ${String(r.missed).padStart(6)}  ${c ? `${String(c.index).padStart(7)} ${c.saving.toFixed(2).padStart(7)} ${c.penalty.toFixed(2).padStart(8)} ${c.shortfall.toFixed(2).padStart(10)} ${c.jumpSd.toFixed(1).padStart(8)}  ${r.hit ? 'yes' : ' no'}  ${r.chance.toFixed(3)}  ${r.exact ? 'yes' : 'NO'}` : '      -'}`);
}
const withC = rows.filter((r) => r.closest);
const hits = withC.filter((r) => r.hit), non = withC.filter((r) => !r.hit);
const h = hits.length / withC.length, ch = withC.reduce((a, r) => a + r.chance, 0) / withC.length;
const mh = median(hits.map((r) => r.closest.shortfall)), mn = median(non.map((r) => r.closest.shortfall));
console.log('');
console.log(`series with a closest call: ${withC.length} of ${rows.length}`);
console.log(`C1 hit rate ${hits.length}/${withC.length} = ${h.toFixed(3)}; chance ${ch.toFixed(3)}; ratio ${(h / ch).toFixed(2)} (needs >= 2): ${h >= 2 * ch ? 'PASS' : 'FAIL'}`);
console.log(`C2 median shortfall: hits ${mh.toFixed(2)}, non-hits ${mn.toFixed(2)} (needs hits below): ${mh < mn ? 'PASS' : 'FAIL'}`);
console.log(`C3 exact threshold: ${exact} of ${exactOf}: ${exact === exactOf ? 'PASS' : 'FAIL'}`);
