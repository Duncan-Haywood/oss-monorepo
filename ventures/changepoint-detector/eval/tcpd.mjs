// The detector on the Turing Change Point Dataset (TCPD; van den Burg and Williams 2020,
// arXiv:2003.06222): real series, each marked by five human annotators, scored with the
// benchmark's own F1 (margin 5) and segmentation cover, beside the published scores of the
// 14 methods in TCPDBench's "default" experiment (no per-series tuning) on the same series.
// Every setting here is fixed in advance and the same for every series: no log, no period,
// nothing read from the series' name or dates.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd.mjs tcpd-data > eval/tcpd.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine.mjs';
import { consensus } from '../consensus.mjs';
import { fMeasure, covering, truePositives } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const pubCov = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_cover_scores.json'), 'utf8'));
const MARGIN = 5;
// TCPDBench summarize.py clean_cps: drop indexes below 1 or above n - 2 (endpoints several methods report by default).
const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);
const r3 = (v) => (v == null ? '  -  ' : v.toFixed(3));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Univariate series that ship in the TCPD repository (the rest need a download from the source).
const names = Object.keys(ann).filter((d) => existsSync(join(DIR, 'ds', `${d}.json`))).sort();
const series = [];
for (const d of names) {
  const j = JSON.parse(readFileSync(join(DIR, 'ds', `${d}.json`), 'utf8'));
  if (j.n_dim !== 1) continue;
  // A missing value is carried forward so the indexes stay those the annotators saw.
  let last = null, filled = 0;
  const values = j.series[0].raw.map((v) => {
    if (v == null || !Number.isFinite(Number(v))) { filled++; return last; }
    last = Number(v); return last;
  });
  if (values[0] == null) throw new Error(`${d}: first value missing`);
  series.push({ name: d, values, n: values.length, filled });
}

// 1. Check the port on the published predictions: re-score TCPDBench's own default runs.
let worst = 0, checked = 0;
for (const s of series) {
  for (const m of ['binseg', 'pelt', 'bocpd', 'zero']) {
    const dir = join(DIR, 'bench/abed_results', s.name, `default_${m}`);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (r.status !== 'SUCCESS' || pubF1[s.name][m] == null) continue;
      const res = typeof r.result === 'string' ? JSON.parse(r.result.replace(/'/g, '"').replace(/None/g, 'null')) : r.result;
      const cps = clean(res.cplocations, s.n);
      worst = Math.max(worst, Math.abs(fMeasure(ann[s.name], cps, MARGIN).F - pubF1[s.name][m]), Math.abs(covering(ann[s.name], cps, s.n) - pubCov[s.name][m]));
      checked++;
    }
  }
}
console.log(`TCPD: ${series.length} univariate series that ship in the repository (of ${Object.keys(ann).length} annotated).`);
console.log(`Port check: ${checked} published default runs (binseg, pelt, bocpd, zero) re-scored; largest difference from the published F1 or cover: ${worst.toExponential(2)}.`);

// 2. Our settings, fixed in advance.
const SETTINGS = {
  'level (default)': (s) => analyze({ values: s.values }).pelt.changepoints.map((c) => c.index),
  'level+volatility': (s) => analyze({ values: s.values, model: 'meanvar' }).pelt.changepoints.map((c) => c.index),
  'bocpd (default)': (s) => analyze({ values: s.values }).bocpd.detections.map((c) => c.index),
};
const cons = new Map();
for (const s of series) cons.set(s.name, consensus({ values: s.values })); // default tolerance, as the CLI and page run it
SETTINGS['consensus: every setting'] = (s) => cons.get(s.name).changes.filter((c) => c.tier === 'all').map((c) => c.index);
SETTINGS['consensus: half or more'] = (s) => cons.get(s.name).changes.filter((c) => c.tier !== 'few').map((c) => c.index);
SETTINGS['consensus: any setting'] = (s) => cons.get(s.name).changes.map((c) => c.index);

const ours = {};
for (const [name, fn] of Object.entries(SETTINGS)) {
  ours[name] = {};
  for (const s of series) {
    const cps = clean(fn(s), s.n);
    ours[name][s.name] = { cps, f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n) };
  }
}

// 3. Table: mean over the series, ours beside the published methods.
const rows = [];
for (const [name, per] of Object.entries(ours)) {
  rows.push({ name: `* ${name}`, f1: mean(series.map((s) => per[s.name].f1)), cover: mean(series.map((s) => per[s.name].cover)), n: series.length });
}
for (const m of Object.keys(pubF1[series[0].name])) {
  const okF = series.filter((s) => pubF1[s.name][m] != null), okC = series.filter((s) => pubCov[s.name][m] != null);
  // A failed run scores 0 here, so a method is not flattered by skipping its hard series.
  rows.push({ name: `  ${m}`, f1: mean(series.map((s) => pubF1[s.name][m] ?? 0)), cover: mean(series.map((s) => pubCov[s.name][m] ?? 0)), n: Math.min(okF.length, okC.length) });
}
console.log(`\nMean over the ${series.length} series (F1 margin ${MARGIN}; * = this detector; others: TCPDBench published default scores, a failed run counted as 0):`);
console.log('  setting                          F1     cover  ran on');
for (const r of [...rows].sort((a, b) => b.f1 - a.f1)) console.log(`  ${r.name.padEnd(31)} ${r3(r.f1)}  ${r3(r.cover)}  ${r.n}`);

// 4. Rank per series (1 = best F1 of the 14 published methods plus ours), for the default level model and the consensus tiers.
console.log('\nPer series: F1 (cover) for the level model, the half-or-more consensus and the best published default method.');
for (const s of series) {
  const pub = Object.entries(pubF1[s.name]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const L = ours['level (default)'][s.name], H = ours['consensus: half or more'][s.name];
  console.log(`  ${s.name.padEnd(19)} n ${String(s.n).padStart(3)}${s.filled ? ` (${s.filled} filled)` : ''}  level ${r3(L.f1)} (${r3(L.cover)}) ${L.cps.length} cuts  half+ ${r3(H.f1)} (${r3(H.cover)}) ${H.cps.length} cuts  best published ${pub[0][0]} ${r3(pub[0][1])}  zero ${r3(pubF1[s.name].zero)}`);
}

// 5. Agreement tiers as a detection rate: what share of the changes in each tier lies within
// the margin of a location at least one annotator marked, and of one a majority marked.
console.log(`\nConsensus tiers against the annotators (a change counts as marked when an annotator put a change point within ${MARGIN} points):`);
const tiers = { all: [0, 0, 0], most: [0, 0, 0], few: [0, 0, 0] };
for (const s of series) {
  const a = ann[s.name], K = Object.keys(a).length;
  const anyMark = new Set(Object.values(a).flat());
  for (const c of cons.get(s.name).changes) {
    const t = tiers[c.tier];
    t[0]++;
    if (truePositives([c.index], [...anyMark], MARGIN).size) t[1]++;
    const votes = Object.values(a).filter((locs) => locs.some((l) => Math.abs(l - c.index) <= MARGIN)).length;
    if (votes * 2 > K) t[2]++;
  }
}
for (const [t, [n, any, maj]] of Object.entries(tiers)) {
  console.log(`  ${({ all: 'every setting', most: 'half or more', few: 'fewer than half' })[t].padEnd(16)} ${String(n).padStart(3)} changes; marked by an annotator ${String(any).padStart(3)} (${n ? Math.round(100 * any / n) : 0}%); by a majority ${String(maj).padStart(3)} (${n ? Math.round(100 * maj / n) : 0}%)`);
}
// Recall side: of the locations a majority of annotators marked, how many does each tier reach.
let majLocs = 0; const reached = { all: 0, most: 0, few: 0 };
for (const s of series) {
  const a = Object.values(ann[s.name]), K = a.length;
  const cand = [...new Set(a.flat())].sort((x, y) => x - y);
  // A majority location: a marked point that more than half the annotators put a change within the margin of; one per cluster.
  const picked = [];
  for (const l of cand) {
    if (a.filter((locs) => locs.some((m) => Math.abs(m - l) <= MARGIN)).length * 2 <= K) continue;
    if (picked.some((p) => Math.abs(p - l) <= MARGIN)) continue;
    picked.push(l);
  }
  majLocs += picked.length;
  for (const p of picked) {
    const near = cons.get(s.name).changes.filter((c) => Math.abs(c.index - p) <= MARGIN);
    const best = near.find((c) => c.tier === 'all') || near.find((c) => c.tier === 'most') || near[0];
    if (best) reached[best.tier]++;
  }
}
console.log(`  Of ${majLocs} locations a majority of annotators marked: reached by an every-setting change ${reached.all}, by a half-or-more change ${reached.most}, only by a fewer-than-half change ${reached.few}, by none ${majLocs - reached.all - reached.most - reached.few}.`);

// 6. Support threshold, chosen on half the series and scored on the other half (alternate
// series in name order; the split was fixed before any score was looked at).
const halves = [series.filter((_, i) => i % 2 === 0), series.filter((_, i) => i % 2 === 1)];
const of = cons.get(series[0].name).settings.length;
const atK = (s, k) => clean(cons.get(s.name).changes.filter((c) => c.support >= k).map((c) => c.index), s.n);
const score = (set, k) => ({ f1: mean(set.map((s) => fMeasure(ann[s.name], atK(s, k), MARGIN).F)), cover: mean(set.map((s) => covering(ann[s.name], atK(s, k), s.n))) });
console.log(`\nKeep a consensus change only when at least k of ${of} settings found it (mean F1 / cover):`);
console.log(`  k   half A (${halves[0].length})      half B (${halves[1].length})      all`);
for (let k = 1; k <= of; k++) {
  const a = score(halves[0], k), b = score(halves[1], k), t = score(series, k);
  console.log(`  ${k}   ${r3(a.f1)} / ${r3(a.cover)}   ${r3(b.f1)} / ${r3(b.cover)}   ${r3(t.f1)} / ${r3(t.cover)}`);
}
for (const [tr, te, nm] of [[0, 1, 'A -> B'], [1, 0, 'B -> A']]) {
  let best = 1;
  for (let k = 1; k <= of; k++) if (score(halves[tr], k).f1 > score(halves[tr], best).f1) best = k;
  const held = score(halves[te], best);
  const zero = mean(halves[te].map((s) => pubF1[s.name].zero));
  const bin = mean(halves[te].map((s) => pubF1[s.name].binseg ?? 0));
  console.log(`  chosen on ${nm}: k = ${best}; held-out F1 ${r3(held.f1)}, cover ${r3(held.cover)} (zero ${r3(zero)}, binseg ${r3(bin)} on the same half)`);
}
