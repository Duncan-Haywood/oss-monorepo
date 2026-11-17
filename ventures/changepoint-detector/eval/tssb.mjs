// The shipped settings on the Time Series Segmentation Benchmark (TSSB): 75 labelled series of
// 240 to 20,700 points from outside TCPD. Pre-registered in eval/tssb-prereg-2026-11-15.md (lines
// T1-T4), committed before this script was first run. The settings are exactly those of
// eval/tcpd-heldout.mjs; nothing is read from the series.
//
// usage: sh eval/tssb-fetch.sh tssb-data && node eval/tssb.mjs tssb-data [cache-dir] > eval/tssb.out.txt
// The per-series detections are cached as JSON (default tssb-data/cache) because the six-setting
// consensus is slow on the longest series; four series run at once in child processes.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fMeasure, covering } from './tcpd-metrics.mjs';

export const PIN = 'e0c7a1f6cee6874e60cbacd3b8601f2de259606e';
// Published means of the "unknown number of segments" sheet (TSSB README, 75 series).
export const PUBLISHED_MEANS = { ClaSP: 0.8547, PELT: 0.581, BinSeg: 0.5749, FLOSS: 0.5674, BOCD: 0.4488, ESPRESSO: 0.4436, Window: 0.401 };
export const SETTINGS = [
  'level (default)', 'level, following the over-cut warning', 'noise floor 2, local 25 (always)',
  'level+volatility', 'bocpd (default)', 'consensus: every setting', 'consensus: half or more', 'zero',
];

// TSSB's desc.txt: name, window size, change points...
export function parseDesc(text) {
  return text.trim().split('\n').map((l) => {
    const [name, w, ...cps] = l.trim().split(',');
    return { name, window: Number(w), cps: cps.filter((c) => c !== '').map(Number) };
  });
}
export const clean = (cps, n) => [...new Set(cps)].filter((c) => c >= 1 && c < n - 1).sort((a, b) => a - b);

// One series: every setting's change indexes (uncleaned), and whether the warning fired.
export async function detect(values) {
  const { analyze } = await import('../engine.mjs');
  const { consensus } = await import('../consensus.mjs');
  const FLOOR = { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 };
  const t0 = Date.now();
  const plain = analyze({ values });
  const fired = !!plain.overcutWarning;
  const level = plain.pelt.changepoints.map((c) => c.index);
  const floor = analyze({ values, ...FLOOR }).pelt.changepoints.map((c) => c.index);
  const cons = consensus({ values });
  return {
    fired,
    seconds: (Date.now() - t0) / 1000,
    cps: {
      'level (default)': level,
      'level, following the over-cut warning': fired ? floor : level,
      'noise floor 2, local 25 (always)': floor,
      'level+volatility': analyze({ values, model: 'meanvar' }).pelt.changepoints.map((c) => c.index),
      'bocpd (default)': plain.bocpd.detections.map((c) => c.index),
      'consensus: every setting': cons.changes.filter((c) => c.tier === 'all').map((c) => c.index),
      'consensus: half or more': cons.changes.filter((c) => c.tier !== 'few').map((c) => c.index),
      zero: [],
    },
  };
}

const r3 = (v) => v.toFixed(3);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

async function main() {
  const [, , DIR = 'tssb-data', CACHE = join(DIR, 'cache'), one] = process.argv;
  const D = join(DIR, 'tssb', 'datasets');
  const load = (name) => readFileSync(join(D, `${name}.txt`), 'utf8').trim().split('\n').map(Number);
  if (one) { // child: one series
    const out = await detect(load(one));
    writeFileSync(join(CACHE, `${one}.json`), JSON.stringify(out));
    return;
  }
  if (!existsSync(D)) throw new Error(`${D} missing: run sh eval/tssb-fetch.sh ${DIR}`);
  mkdirSync(CACHE, { recursive: true });
  const desc = parseDesc(readFileSync(join(D, 'desc.txt'), 'utf8'));
  const todo = desc.filter((d) => !existsSync(join(CACHE, `${d.name}.json`)))
    .sort((a, b) => load(b.name).length - load(a.name).length);
  const self = fileURLToPath(import.meta.url);
  const pool = Math.max(1, Math.min(4, availableParallelism()));
  let next = 0;
  await Promise.all(Array.from({ length: pool }, async () => {
    while (next < todo.length) {
      const d = todo[next++];
      await new Promise((res, rej) => spawn(process.execPath, [self, DIR, CACHE, d.name], { stdio: 'inherit' })
        .on('exit', (c) => (c === 0 ? res() : rej(new Error(`${d.name} exited ${c}`)))));
      process.stderr.write(`done ${d.name}\n`);
    }
  }));

  const pubText = readFileSync(join(DIR, 'tssb', 'notebooks', 'segmentation_covering_unknown.csv'), 'utf8').trim().split('\n');
  const pubCols = pubText[0].split(',').slice(1);
  const pub = Object.fromEntries(pubText.slice(1).map((l) => { const [n, ...v] = l.split(','); return [n, Object.fromEntries(pubCols.map((c, i) => [c, Number(v[i])]))]; }));

  const rows = desc.map((d) => {
    const values = load(d.name), n = values.length, ann = { 0: d.cps };
    const c = JSON.parse(readFileSync(join(CACHE, `${d.name}.json`), 'utf8'));
    const sc = {};
    for (const s of SETTINGS) {
      const cps = clean(c.cps[s], n);
      sc[s] = { cuts: cps.length, cover: covering(ann, cps, n), f5: fMeasure(ann, cps, 5).F, fw: fMeasure(ann, cps, d.window).F };
    }
    return { ...d, n, fired: c.fired, seconds: c.seconds, sc };
  });

  const N = rows.length;
  console.log(`TSSB at ${PIN}: ${N} series, ${rows.reduce((s, r) => s + r.n, 0)} points (${Math.min(...rows.map((r) => r.n))} to ${Math.max(...rows.map((r) => r.n))}), ${rows.reduce((s, r) => s + r.cps.length, 0)} annotated changes.`);
  console.log('Settings exactly as eval/tcpd-heldout.mjs; pre-registered in eval/tssb-prereg-2026-11-15.md.');
  // The metric port against the published sheet: a method that cut nothing scores zero's covering.
  const zeroLike = rows.filter((r) => pubCols.some((m) => Math.abs(pub[r.name][m] - r.sc.zero.cover) < 0.0005));
  console.log(`Metric check: on ${zeroLike.length} of ${N} series some published method's covering equals this port's "zero" covering to 3 decimals (the published sheet rounds to 3).`);

  console.log(`\nMean over the ${N} series (covering is TSSB's metric; F1 margin 5 is TCPDBench's; F1 margin w uses TSSB's window size):`);
  console.log('  setting                                  cover   F1@5   F1@w   cuts/1000 pts');
  const pts = rows.reduce((s, r) => s + r.n, 0);
  const tab = SETTINGS.map((s) => [s, mean(rows.map((r) => r.sc[s].cover)), mean(rows.map((r) => r.sc[s].f5)), mean(rows.map((r) => r.sc[s].fw)), (1000 * rows.reduce((t, r) => t + r.sc[s].cuts, 0)) / pts]);
  for (const m of pubCols) tab.push([`${m} (published)`, mean(rows.map((r) => pub[r.name][m])), null, null, null]);
  for (const [nm, c, f, w, k] of tab.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${(SETTINGS.includes(nm) ? `* ${nm}` : `  ${nm}`).padEnd(40)} ${r3(c)}  ${f == null ? '  -  ' : r3(f)}  ${w == null ? '  -  ' : r3(w)}  ${k == null ? '' : k.toFixed(2)}`);
  }

  let seed = 20261115;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const binom2 = (k, n) => {
    if (n === 0) return 1;
    const c = (n, r) => { let v = 1; for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i; return v; };
    const lo = Math.min(k, n - k); let p = 0;
    for (let i = 0; i <= lo; i++) p += c(n, i) / 2 ** n;
    return Math.min(1, 2 * p);
  };
  const paired = (set, a, b) => {
    const d = set.map((r) => a(r) - b(r));
    const boots = [];
    for (let i = 0; i < 10000; i++) { let t = 0; for (let j = 0; j < d.length; j++) t += d[Math.floor(rnd() * d.length)]; boots.push(t / d.length); }
    boots.sort((x, y) => x - y);
    const pos = d.filter((v) => v > 1e-12).length, neg = d.filter((v) => v < -1e-12).length;
    return { mean: mean(d), lo: boots[249], hi: boots[9749], pos, neg, p: binom2(pos, pos + neg) };
  };
  const fmt = (x) => `mean ${x.mean >= 0 ? '+' : ''}${r3(x.mean)} [95% ${r3(x.lo)}, ${r3(x.hi)}]; better on ${x.pos}, worse on ${x.neg}, sign test p ${x.p.toFixed(3)}`;
  const cov = (s) => (r) => r.sc[s].cover;
  const pubc = (m) => (r) => pub[r.name][m];

  console.log('\nPre-registered lines:');
  const every = mean(rows.map(cov('consensus: every setting'))), zero = mean(rows.map(cov('zero')));
  console.log(`  T1 every-setting consensus covering ${r3(every)} >= zero ${r3(zero)} - 0.02 = ${r3(zero - 0.02)}: ${every >= zero - 0.02 ? 'MET' : 'NOT MET'}`);
  const fired = rows.filter((r) => r.fired);
  console.log(`  T2 over-cut warning fires on ${fired.length} of ${N} (bar 50): ${fired.length >= 50 ? 'MET' : 'NOT MET'}`);
  const t3 = paired(fired, cov('level, following the over-cut warning'), cov('level (default)'));
  console.log(`  T3 following the warning minus plain level, on the ${fired.length} where it fires: ${fmt(t3)}: ${t3.pos > t3.neg && t3.p < 0.05 ? 'MET' : 'NOT MET'}`);
  const t4bar = Math.max(PUBLISHED_MEANS.PELT, PUBLISHED_MEANS.BinSeg) - 0.05; // within 0.05 of both, or above both
  console.log(`  T4 every-setting consensus ${r3(every)} within 0.05 of published PELT ${PUBLISHED_MEANS.PELT} and BinSeg ${PUBLISHED_MEANS.BinSeg}, or above (>= ${r3(t4bar)}): ${every >= t4bar ? 'MET' : 'NOT MET'}`);

  console.log('\nPaired covering differences over all series:');
  for (const [a, bf, bn] of [
    ['consensus: every setting', cov('zero'), 'zero'],
    ['consensus: every setting', pubc('PELT'), 'published PELT'],
    ['consensus: every setting', pubc('BinSeg'), 'published BinSeg'],
    ['consensus: every setting', pubc('ClaSP'), 'published ClaSP'],
    ['bocpd (default)', cov('zero'), 'zero'],
    ['level+volatility', cov('zero'), 'zero'],
    ['level, following the over-cut warning', cov('zero'), 'zero'],
  ]) console.log(`  ${a} minus ${bn}: ${fmt(paired(rows, cov(a), bf))}`);

  // Do the every-setting changes land on a labelled change at all? (a detection rate, as on TCPD)
  let agreed = 0, near = 0;
  for (const r of rows) {
    const c = JSON.parse(readFileSync(join(CACHE, `${r.name}.json`), 'utf8'));
    for (const x of clean(c.cps['consensus: every setting'], r.n)) { agreed++; if (r.cps.some((t) => Math.abs(t - x) <= r.window)) near++; }
  }
  console.log(`\nEvery-setting changes within one window of a labelled change: ${near} of ${agreed}${agreed ? ` (${((100 * near) / agreed).toFixed(0)}%)` : ''}.`);

  console.log('\nPer series: n, labelled changes, cuts (level / level+warn / bocpd / every), covering (every / zero / PELT / ClaSP).');
  for (const r of rows) {
    const k = (s) => r.sc[s].cuts;
    console.log(`  ${r.name.padEnd(30)} n ${String(r.n).padStart(5)}  cps ${r.cps.length}  cuts ${k('level (default)')}/${k('level, following the over-cut warning')}/${k('bocpd (default)')}/${k('consensus: every setting')}  cover ${r3(r.sc['consensus: every setting'].cover)}/${r3(r.sc.zero.cover)}/${r3(pub[r.name].PELT)}/${r3(pub[r.name].ClaSP)}${r.fired ? '  [warning]' : ''}  ${r.seconds.toFixed(0)} s`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
