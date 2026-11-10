// Why the every-setting consensus loses F1 on TCPD's measles series (991 weekly case counts,
// England and Wales, 1948-1966), and whether either cure found there works as a default.
//
// The flagship item asked "why the consensus misses measles' marked change". The annotations
// answer the premise first: four of the five annotators marked no change, one marked week 141.
// TCPD's F1 counts the start as a change for every annotator, so reporting nothing scores 0.947
// (amoc and binseg score the same because their one cut is the last point, which is dropped).
// The consensus loses F1 by cutting, not by missing. This script shows where that cut is, which
// declared options remove it, and then tests those options as defaults on every TCPD series
// they apply to, because one series cannot choose a default.
//
// usage: sh eval/tcpd-fetch.sh tcpd-data && node eval/tcpd-measles.mjs tcpd-data > eval/tcpd-measles.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { consensus, PANEL } from '../consensus.mjs';
import { analyze } from '../engine.mjs';
import { fMeasure, covering } from './tcpd-metrics.mjs';

const DIR = process.argv[2] || 'tcpd-data';
if (!existsSync(join(DIR, 'heldout', 'measles.json'))) throw new Error(`${DIR}/heldout/measles.json missing: run sh eval/tcpd-fetch.sh ${DIR}`);
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const pubF1 = JSON.parse(readFileSync(join(DIR, 'bench/analysis/output/scores/default_f1_scores.json'), 'utf8'));
const MARGIN = 5;
const r3 = (v) => v.toFixed(3);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const load = (sub, name) => {
  const j = JSON.parse(readFileSync(join(DIR, sub, `${name}.json`), 'utf8'));
  let last = null;
  const values = j.series[0].raw.map((v) => (v == null || !Number.isFinite(Number(v)) ? last : (last = Number(v))));
  return { name, sub, j, values, n: values.length, times: j.time?.raw ?? null, format: j.time?.format ?? null };
};
const every = (s, extra = {}) => consensus({ values: s.values, ...extra }).changes
  .filter((c) => c.tier === 'all').map((c) => c.index).filter((i) => i >= 1 && i < s.n - 1).sort((a, b) => a - b);
const score = (s, cps) => ({ f1: fMeasure(ann[s.name], cps, MARGIN).F, cover: covering(ann[s.name], cps, s.n), k: cps.length, cps });

// 1. Measles itself.
const m = load('heldout', 'measles');
console.log(`TCPD measles: ${m.n} weekly counts, ${m.times[0]} to ${m.times[m.n - 1]} (decimal years).`);
const marks = Object.entries(ann.measles);
console.log(`Annotations: ${marks.map(([who, cps]) => `annotator ${who}: ${cps.length ? cps.join(', ') : 'none'}`).join('; ')}.`);
console.log(`So ${marks.filter(([, c]) => !c.length).length} of ${marks.length} marked no change. Reporting nothing scores F1 ${r3(fMeasure(ann.measles, [], MARGIN).F)}; a lone cut at 141 would score ${r3(fMeasure(ann.measles, [141], MARGIN).F)}.`);
const pubBest = Object.entries(pubF1.measles).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
console.log(`Published scores equal to "zero" (${r3(pubF1.measles.zero)}): ${pubBest.filter(([, v]) => Math.abs(v - pubF1.measles.zero) < 1e-12).map(([k]) => k).join(', ')}.`);

const base = score(m, every(m));
console.log(`\nConsensus, every setting: ${base.k} cut at ${base.cps.map((i) => `${i} (${m.times[i]})`).join(', ')}; F1 ${r3(base.f1)}, cover ${r3(base.cover)}.`);
const at = base.cps[0];
if (at != null) {
  let pk = 0;
  for (let i = 0; i < m.n; i++) if (m.values[i] > m.values[pk]) pk = i;
  console.log(`The series' largest week is ${pk} (${m.times[pk]}, ${m.values[pk]} cases); the cut is ${at - pk} weeks after it, on the fall of the 1961 epidemic: weeks ${at - 3}..${at + 3} = ${m.values.slice(at - 3, at + 4).join(' ')}.`);
  const yr = {};
  m.values.forEach((v, i) => { const y = Math.floor(Number(m.times[i])); (yr[y] = yr[y] || []).push(v); });
  console.log(`Yearly mean cases: ${Object.entries(yr).map(([y, a]) => `${y} ${Math.round(mean(a))}`).join(', ')} (the two-year epidemic cycle; 1961 is the largest year).`);
  console.log('Each setting alone (cuts, and its cut nearest the consensus cut):');
  for (const p of PANEL) {
    const cps = analyze({ values: m.values, ...p.opts }).pelt.changepoints.map((c) => c.index);
    const near = cps.length ? cps.reduce((b, c) => (Math.abs(c - at) < Math.abs(b - at) ? c : b)) : null;
    console.log(`  ${p.name.padEnd(36)} ${String(cps.length).padStart(3)} cuts, nearest ${near ?? '-'}`);
  }
}

console.log('\nThe same consensus with one declared option (every-setting cuts, F1, cover):');
for (const [label, extra] of [['none', {}], ['--period 52 (the yearly season of weekly data)', { period: 52 }], ['--period 104 (the two-year epidemic cycle)', { period: 104 }], ['--log', { log: true }], ['--log --period 52', { log: true, period: 52 }]]) {
  const r = score(m, every(m, extra));
  console.log(`  ${label.padEnd(48)} ${String(r.k).padStart(2)} cuts  F1 ${r3(r.f1)}  cover ${r3(r.cover)}`);
}

// 2. Are the cures defaults? Every univariate TCPD series, shipped and held out.
const all = [];
for (const sub of ['ds', 'heldout']) {
  if (!existsSync(join(DIR, sub))) continue;
  for (const f of readdirSync(join(DIR, sub)).filter((f) => f.endsWith('.json')).sort()) {
    const name = f.replace(/\.json$/, '');
    if (!ann[name]) continue;
    const s = load(sub, name);
    if (s.j.n_dim !== 1) continue;
    s.base = score(s, every(s));
    all.push(s);
  }
}
const paired = (rows, label) => {
  const d = rows.map((r) => r.alt.f1 - r.s.base.f1);
  const better = d.filter((v) => v > 1e-9).length, worse = d.filter((v) => v < -1e-9).length;
  console.log(`  ${label}: ${rows.length} series switched; F1 ${r3(mean(rows.map((r) => r.s.base.f1)))} -> ${r3(mean(rows.map((r) => r.alt.f1)))} (mean ${mean(d) >= 0 ? '+' : ''}${r3(mean(d))}); better on ${better}, worse on ${worse}, same on ${rows.length - better - worse}.`);
};

console.log(`\nCure 1 as a default: --log on every all-positive series whose max/min ratio is at least R (${all.length} univariate series; shipped = the 31 the defaults were chosen on, held out = the 7 opened later).`);
const logged = new Map(all.filter((s) => Math.min(...s.values) > 0).map((s) => [s.name, score(s, every(s, { log: true }))]));
for (const R of [100, 30, 10, 3]) {
  for (const sub of ['ds', 'heldout']) {
    const rows = all.filter((s) => s.sub === sub && logged.has(s.name) && Math.max(...s.values) / Math.min(...s.values) >= R).map((s) => ({ s, alt: logged.get(s.name) }));
    const pool = all.filter((s) => s.sub === sub);
    const after = mean(pool.map((s) => rows.find((r) => r.s === s)?.alt.f1 ?? s.base.f1));
    paired(rows, `R ${String(R).padStart(3)}, ${sub === 'ds' ? 'shipped ' : 'held out'} (mean over all ${pool.length}: ${r3(mean(pool.map((s) => s.base.f1)))} -> ${r3(after)})`);
  }
}
console.log('  Per series where --log changes the every-setting cuts:');
for (const s of all) {
  const l = logged.get(s.name);
  if (!l || (l.k === s.base.k && l.cps.every((c, i) => c === s.base.cps[i]))) continue;
  console.log(`    ${s.name.padEnd(18)} max/min ${(Math.max(...s.values) / Math.min(...s.values)).toFixed(1).padStart(7)}  F1 ${r3(s.base.f1)} (${s.base.k} cuts) -> ${r3(l.f1)} (${l.k})`);
}

console.log('\nCure 2 as a default: declare the calendar season the time stamps imply (monthly -> 12, weekly -> 52) on every series that has one:');
const PER = { '%Y-%m': 12, '%Y-%F': 52 };
const dated = all.filter((s) => PER[s.format]);
const rows = dated.map((s) => ({ s, alt: score(s, every(s, { period: PER[s.format] })) }));
for (const { s, alt } of rows) console.log(`    ${s.name.padEnd(18)} period ${String(PER[s.format]).padStart(2)}  F1 ${r3(s.base.f1)} (${s.base.k} cuts) -> ${r3(alt.f1)} (${alt.k})  annotators marking nothing: ${Object.values(ann[s.name]).filter((c) => !c.length).length}/${Object.keys(ann[s.name]).length}`);
paired(rows, 'calendar season');
