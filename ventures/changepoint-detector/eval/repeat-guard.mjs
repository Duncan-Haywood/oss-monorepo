// The repeat guard (consensus.mjs `repeatGuard`): many every-setting changes spread through a
// series. Pre-registered in eval/repeat-guard-prereg-2026-11-15.md (lines G1-G3) before this
// script was first run. Three sets: TSSB (seen; the cached detections of eval/tssb.mjs), the 38
// univariate TCPD series (must stay quiet) and HAS 2023 (fresh; accelerometer magnitude).
//
// usage:
//   sh eval/tssb-fetch.sh tssb-data && node eval/tssb.mjs tssb-data > /dev/null
//   sh eval/tcpd-fetch.sh tcpd-data
//   sh eval/has-fetch.sh has-data
//   node eval/repeat-guard.mjs tssb-data tcpd-data has-data > eval/repeat-guard.out.txt
// HAS detections are cached as JSON in has-data/cache (four series at once in child processes).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { availableParallelism } from 'node:os';
import { covering, fMeasure } from './tcpd-metrics.mjs';
import { parseDesc, clean, detect, SETTINGS } from './tssb.mjs';
import { repeatGuard, REPEAT_GUARD } from '../consensus.mjs';

const EVERY = 'consensus: every setting';
const r3 = (v) => v.toFixed(3);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

// The count-only arm (descriptive, decides nothing).
export const countOnly = (idx) => idx.length >= REPEAT_GUARD.minCount;

// One CSV line of has2023_master.csv: commas inside double quotes are not separators.
export function splitCsv(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
// The pre-registered series: the accelerometer magnitude, nothing else.
export const magnitude = (x, y, z) => x.map((v, i) => Math.hypot(v, y[i], z[i]));

let seed = 20261115;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const binom2 = (k, n) => {
  if (n === 0) return 1;
  const c = (n, r) => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return v; };
  const lo = Math.min(k, n - k); let p = 0;
  for (let i = 0; i <= lo; i++) p += c(n, i) / 2 ** n;
  return Math.min(1, 2 * p);
};
export function paired(d) {
  const boots = [];
  for (let i = 0; i < 10000; i++) { let t = 0; for (let j = 0; j < d.length; j++) t += d[Math.floor(rnd() * d.length)]; boots.push(t / d.length); }
  boots.sort((x, y) => x - y);
  const pos = d.filter((v) => v > 1e-12).length, neg = d.filter((v) => v < -1e-12).length;
  return { mean: mean(d), lo: boots[249], hi: boots[9749], pos, neg, p: binom2(pos, pos + neg) };
}
export const fmt = (x) => `mean ${x.mean >= 0 ? '+' : ''}${r3(x.mean)} [95% ${r3(x.lo)}, ${r3(x.hi)}]; better on ${x.pos}, worse on ${x.neg}, sign test p ${x.p.toFixed(3)}`;

// rows: { name, n, cps (one annotator), every (cleaned indexes), cover per setting }
function scoreSet(rows) {
  for (const r of rows) {
    r.guard = repeatGuard(r.every, r.n);
    r.count = countOnly(r.every);
    const ann = { 0: r.cps };
    r.cEvery = covering(ann, r.every, r.n);
    r.cZero = covering(ann, [], r.n);
    r.cGuard = r.guard ? r.cZero : r.cEvery;
    r.cCount = r.count ? r.cZero : r.cEvery;
  }
  return rows;
}

export async function loadHas(DIR) {
  const SER = join(DIR, 'series');
  mkdirSync(SER, { recursive: true });
  const index = join(SER, 'index.json');
  if (existsSync(index)) return JSON.parse(readFileSync(index, 'utf8'));
  const rl = createInterface({ input: createReadStream(join(DIR, 'has2023_master.csv')), crlfDelay: Infinity });
  let head = null; const list = [];
  for await (const line of rl) {
    const f = splitCsv(line);
    if (!head) { head = Object.fromEntries(f.map((k, i) => [k, i])); continue; }
    const g = (k) => f[head[k]];
    const values = magnitude(JSON.parse(g('x-acc')), JSON.parse(g('y-acc')), JSON.parse(g('z-acc')));
    const name = `has-${g('ts_id')}`;
    writeFileSync(join(SER, `${name}.json`), JSON.stringify(values));
    list.push({ name, n: values.length, cps: JSON.parse(g('change_points')), group: g('group'), split: g('split') });
  }
  writeFileSync(index, JSON.stringify(list));
  return list;
}

async function runCached(names, load, CACHE, childArgs) {
  mkdirSync(CACHE, { recursive: true });
  const todo = names.filter((n) => !existsSync(join(CACHE, `${n}.json`))).sort((a, b) => load(b).length - load(a).length);
  const self = fileURLToPath(import.meta.url);
  const pool = Math.max(1, Math.min(4, availableParallelism()));
  let next = 0;
  await Promise.all(Array.from({ length: pool }, async () => {
    while (next < todo.length) {
      const nm = todo[next++];
      await new Promise((res, rej) => spawn(process.execPath, [self, ...childArgs, nm], { stdio: 'inherit' })
        .on('exit', (c) => (c === 0 ? res() : rej(new Error(`${nm} exited ${c}`)))));
      process.stderr.write(`done ${nm}\n`);
    }
  }));
}

function report(title, rows, extra = () => '') {
  const fired = rows.filter((r) => r.guard), cnt = rows.filter((r) => r.count);
  console.log(`\n${title}: ${rows.length} series, ${rows.reduce((s, r) => s + r.n, 0)} points.`);
  console.log(`  guard fires on ${fired.length} (count-only arm: ${cnt.length}); agreed changes on those: ${fired.reduce((s, r) => s + r.every.length, 0)} of ${rows.reduce((s, r) => s + r.every.length, 0)}`);
  console.log(`  covering: every-setting ${r3(mean(rows.map((r) => r.cEvery)))}, guarded ${r3(mean(rows.map((r) => r.cGuard)))}, count-only ${r3(mean(rows.map((r) => r.cCount)))}, zero ${r3(mean(rows.map((r) => r.cZero)))}`);
  const d = paired(rows.map((r) => r.cGuard - r.cEvery));
  console.log(`  guarded minus every-setting: ${fmt(d)}`);
  for (const r of fired) console.log(`    fires: ${r.name.padEnd(30)} n ${String(r.n).padStart(5)}  cps ${String(r.cps.length).padStart(2)}  agreed ${String(r.every.length).padStart(3)} in ${r.guard.tenths}/10, gap ~${r.guard.medianGap}  cover every ${r3(r.cEvery)} -> zero ${r3(r.cZero)}${extra(r)}`);
  const near = cnt.filter((r) => !r.guard);
  for (const r of near) console.log(`    count-only, guard quiet: ${r.name.padEnd(20)} n ${String(r.n).padStart(5)}  agreed ${r.every.length} in ${new Set(r.every.map((i) => Math.min(9, Math.floor((10 * i) / r.n)))).size}/10  cover every ${r3(r.cEvery)}, zero ${r3(r.cZero)}`);
  return d;
}

async function main() {
  const [, , TSSB = 'tssb-data', TCPD = 'tcpd-data', HAS = 'has-data', one] = process.argv;
  if (one) { // child: one HAS series
    const values = JSON.parse(readFileSync(join(HAS, 'series', `${one}.json`), 'utf8'));
    writeFileSync(join(HAS, 'cache', `${one}.json`), JSON.stringify(await detect(values)));
    return;
  }
  console.log(`Repeat guard (consensus.mjs repeatGuard: at least ${REPEAT_GUARD.minCount} every-setting changes in at least ${REPEAT_GUARD.minTenths} of 10 tenths of the series).`);
  console.log('Pre-registered in eval/repeat-guard-prereg-2026-11-15.md. Covering is one-annotator (TSSB, HAS) or TCPD\'s all-annotator form.');

  // TSSB (seen), from eval/tssb.mjs's cache.
  const D = join(TSSB, 'tssb', 'datasets');
  const desc = parseDesc(readFileSync(join(D, 'desc.txt'), 'utf8'));
  const tssb = scoreSet(desc.map((d) => {
    const n = readFileSync(join(D, `${d.name}.txt`), 'utf8').trim().split('\n').length;
    const c = JSON.parse(readFileSync(join(TSSB, 'cache', `${d.name}.json`), 'utf8'));
    return { name: d.name, n, cps: d.cps, window: d.window, every: clean(c.cps[EVERY], n) };
  }));
  report('TSSB (seen: the guard was designed on its counts)', tssb, (r) => `  near a label ${r.every.filter((x) => r.cps.some((t) => Math.abs(t - x) <= r.window)).length}`);
  const g1 = mean(tssb.map((r) => r.cGuard)), z1 = mean(tssb.map((r) => r.cZero));

  // TCPD: the 31 shipped and the 7 held-out univariate series, all annotators.
  const { consensus } = await import('../consensus.mjs');
  const ann = JSON.parse(readFileSync(join(TCPD, 'annotations.json'), 'utf8'));
  const tcpd = [];
  for (const sub of ['ds', 'heldout']) {
    for (const f of readdirSync(join(TCPD, sub)).filter((f) => f.endsWith('.json')).sort()) {
      const j = JSON.parse(readFileSync(join(TCPD, sub, f), 'utf8'));
      const name = f.replace(/\.json$/, '');
      if (!ann[name] || j.n_dim !== 1) continue;
      let last = null;
      const values = j.series[0].raw.map((v) => { if (v == null || !Number.isFinite(Number(v))) return last; last = Number(v); return last; });
      const c = consensus({ values });
      const every = clean(c.changes.filter((x) => x.tier === 'all').map((x) => x.index), values.length);
      tcpd.push({ name, sub, n: values.length, every, guard: repeatGuard(every, values.length), count: countOnly(every), f1: fMeasure(ann[name], every, 5).F, cover: covering(ann[name], every, values.length) });
    }
  }
  const tFired = tcpd.filter((r) => r.guard);
  const most = tcpd.reduce((m, r) => (r.every.length > m.every.length ? r : m));
  console.log(`\nTCPD: ${tcpd.length} univariate series (${tcpd.filter((r) => r.sub === 'ds').length} shipped, ${tcpd.filter((r) => r.sub === 'heldout').length} held out); ${tcpd.reduce((s, r) => s + r.every.length, 0)} every-setting changes, most on one series ${most.every.length} (${most.name}).`);
  console.log(`  guard fires on ${tFired.length}${tFired.length ? `: ${tFired.map((r) => r.name).join(', ')}` : ''}; count-only arm on ${tcpd.filter((r) => r.count).length}. Every-setting F1 ${r3(mean(tcpd.map((r) => r.f1)))}, covering ${r3(mean(tcpd.map((r) => r.cover)))} (unchanged where the guard is quiet).`);

  // HAS 2023 (fresh).
  const hasList = await loadHas(HAS);
  const loadH = (nm) => JSON.parse(readFileSync(join(HAS, 'series', `${nm}.json`), 'utf8'));
  await runCached(hasList.map((h) => h.name), loadH, join(HAS, 'cache'), [TSSB, TCPD, HAS]);
  const hasRows = hasList.map((h) => {
    const c = JSON.parse(readFileSync(join(HAS, 'cache', `${h.name}.json`), 'utf8'));
    const cpsClean = clean(h.cps, h.n);
    const per = Object.fromEntries(SETTINGS.map((s) => [s, covering({ 0: cpsClean }, clean(c.cps[s], h.n), h.n)]));
    return { ...h, cps: cpsClean, every: clean(c.cps[EVERY], h.n), per, fired: c.fired };
  });
  scoreSet(hasRows);
  const g3 = report('HAS 2023 (fresh; accelerometer magnitude)', hasRows, (r) => `  ${r.group}`);

  console.log('\nHAS, every setting (deciding nothing): mean covering, cuts per 1,000 points.');
  const pts = hasRows.reduce((s, r) => s + r.n, 0);
  for (const s of SETTINGS) {
    const cuts = hasList.reduce((t, h) => t + clean(JSON.parse(readFileSync(join(HAS, 'cache', `${h.name}.json`), 'utf8')).cps[s], h.n).length, 0);
    console.log(`  ${s.padEnd(40)} ${r3(mean(hasRows.map((r) => r.per[s])))}  ${((1000 * cuts) / pts).toFixed(2)}`);
  }
  const eZ = paired(hasRows.map((r) => r.cEvery - r.cZero));
  console.log(`  every-setting minus zero: ${fmt(eZ)}`);
  let agreed = 0, nearL = 0;
  for (const r of hasRows) for (const x of r.every) { agreed++; if (r.cps.some((t) => Math.abs(t - x) <= Math.max(2, Math.round(0.02 * r.n)))) nearL++; }
  console.log(`  every-setting changes within 2% of the length of a labelled change: ${nearL} of ${agreed}${agreed ? ` (${((100 * nearL) / agreed).toFixed(0)}%)` : ''}`);
  for (const grp of ['indoor', 'outdoor']) {
    const g = hasRows.filter((r) => r.group === grp);
    console.log(`  ${grp}: ${g.length} series; every-setting ${r3(mean(g.map((r) => r.cEvery)))}, guarded ${r3(mean(g.map((r) => r.cGuard)))}, zero ${r3(mean(g.map((r) => r.cZero)))}; guard fires on ${g.filter((r) => r.guard).length}`);
  }

  console.log('\nPre-registered lines:');
  console.log(`  G1 TSSB guarded every-setting covering ${r3(g1)} >= zero ${r3(z1)} - 0.02 = ${r3(z1 - 0.02)}: ${g1 >= z1 - 0.02 ? 'MET' : 'NOT MET'}`);
  console.log(`  G2 TCPD guard fires on ${tFired.length} of ${tcpd.length} (bar 0): ${tFired.length === 0 ? 'MET' : 'NOT MET'}`);
  const hf = hasRows.filter((r) => r.guard);
  const g3d = paired(hf.map((r) => r.cGuard - r.cEvery));
  const g3met = hf.length < 5 ? 'NOT INFORMATIVE' : (g3.mean >= -0.005 && g3d.pos >= g3d.neg ? 'MET' : 'NOT MET');
  console.log(`  G3 HAS guarded minus every-setting mean ${g3.mean >= 0 ? '+' : ''}${r3(g3.mean)} (bar -0.005); where it fires (${hf.length}): better on ${g3d.pos}, worse on ${g3d.neg}: ${g3met}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
