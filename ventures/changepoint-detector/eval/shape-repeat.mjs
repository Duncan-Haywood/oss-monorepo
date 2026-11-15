// The shape-repeat check (consensus.mjs `shapeRepeats`): drop an agreed change when the segments
// on both sides of it are the same waveform repeated. Pre-registered in
// eval/shape-repeat-prereg-2026-11-15.md (lines S1-S4) before this script was first run. Four sets:
// TSSB (seen), the 38 univariate TCPD series, HAS 2023 (seen) and UTSA (fresh).
//
// usage:
//   sh eval/tssb-fetch.sh tssb-data && node eval/tssb.mjs tssb-data > /dev/null
//   sh eval/tcpd-fetch.sh tcpd-data
//   sh eval/has-fetch.sh has-data && node eval/repeat-guard.mjs tssb-data tcpd-data has-data > /dev/null
//   sh eval/utsa-fetch.sh utsa-data
//   node eval/shape-repeat.mjs tssb-data tcpd-data has-data utsa-data > eval/shape-repeat.out.txt
// UTSA detections are cached as JSON in utsa-data/cache (four series at once in child processes).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { covering, fMeasure } from './tcpd-metrics.mjs';
import { parseDesc, clean, detect } from './tssb.mjs';
import { loadHas, paired, fmt } from './repeat-guard.mjs';
import { shapeRepeats, repeatGuard, SHAPE_REPEAT } from '../consensus.mjs';

const EVERY = 'consensus: every setting';
const r3 = (v) => v.toFixed(3);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

// UTSA file names: name_window_cp1[_cp2].txt (the name itself may hold underscores only before
// the numbers; "UCR_semantic segmentation_2017.ppt" is not a series).
export function parseUtsaName(file) {
  const m = /^(.+?)_(\d+)((?:_\d+)+)\.txt$/.exec(file);
  if (!m) return null;
  return { name: m[1], window: Number(m[2]), cps: m[3].slice(1).split('_').map(Number) };
}
export const loadColumn = (path) => readFileSync(path, 'utf8').trim().split(/\s+/).map(Number);

// rows: { name, n, values, cps (one annotator), every }
export function scoreRows(rows) {
  for (const r of rows) {
    const s = shapeRepeats(r.values, r.every);
    r.kept = s.kept; r.dropped = s.dropped;
    r.guard = !!repeatGuard(r.every, r.n);
    const ann = { 0: r.cps };
    r.cEvery = covering(ann, r.every, r.n);
    r.cZero = covering(ann, [], r.n);
    r.cShape = covering(ann, r.kept, r.n);
    r.cShapeG = r.guard ? r.cShape : r.cEvery;
    delete r.values;
  }
  return rows;
}

function report(title, rows) {
  const ch = rows.filter((r) => r.dropped.length);
  const agreed = rows.reduce((s, r) => s + r.every.length, 0), dropped = rows.reduce((s, r) => s + r.dropped.length, 0);
  console.log(`\n${title}: ${rows.length} series, ${rows.reduce((s, r) => s + r.n, 0)} points.`);
  console.log(`  the filter drops ${dropped} of ${agreed} agreed changes, on ${ch.length} series; the count guard fires on ${rows.filter((r) => r.guard).length}`);
  console.log(`  covering: every-setting ${r3(mean(rows.map((r) => r.cEvery)))}, shape-filtered ${r3(mean(rows.map((r) => r.cShape)))}, shape-filtered where the count guard fires ${r3(mean(rows.map((r) => r.cShapeG)))}, zero ${r3(mean(rows.map((r) => r.cZero)))}`);
  const d = paired(rows.map((r) => r.cShape - r.cEvery));
  console.log(`  shape-filtered minus every-setting: ${fmt(d)}`);
  console.log(`  secondary arm (only where the count guard fires) minus every-setting: ${fmt(paired(rows.map((r) => r.cShapeG - r.cEvery)))}`);
  for (const r of ch) console.log(`    drops: ${r.name.padEnd(34)} n ${String(r.n).padStart(5)}  labels ${String(r.cps.length).padStart(2)}  agreed ${String(r.every.length).padStart(3)}, dropped ${String(r.dropped.length).padStart(3)}${r.guard ? ' (count guard fires)' : ''}  cover ${r3(r.cEvery)} -> ${r3(r.cShape)} (zero ${r3(r.cZero)})`);
  return { d, ch };
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

async function main() {
  const [, , TSSB = 'tssb-data', TCPD = 'tcpd-data', HAS = 'has-data', UTSA = 'utsa-data', one] = process.argv;
  const UD = join(UTSA, 'datasets_seg');
  const utsaFiles = existsSync(UD) ? readdirSync(UD).filter((f) => parseUtsaName(f)).sort() : [];
  const loadU = (f) => loadColumn(join(UD, f));
  if (one) { // child: one UTSA series
    writeFileSync(join(UTSA, 'cache', `${one}.json`), JSON.stringify(await detect(loadU(one))));
    return;
  }
  console.log(`Shape-repeat check (consensus.mjs shapeRepeats: ${SHAPE_REPEAT.points}-point z-normalised segment shapes; match = lengths within ${SHAPE_REPEAT.lenRatio}x and correlation >= ${SHAPE_REPEAT.minCorr}; a segment repeats with ${SHAPE_REPEAT.minMatches}+ matches; an agreed change drops when both its segments repeat).`);
  console.log('Pre-registered in eval/shape-repeat-prereg-2026-11-15.md. Covering is one-annotator (TSSB, HAS, UTSA) or TCPD\'s all-annotator form.');

  // TSSB (seen).
  const D = join(TSSB, 'tssb', 'datasets');
  const desc = parseDesc(readFileSync(join(D, 'desc.txt'), 'utf8'));
  const tssb = scoreRows(desc.map((d) => {
    const values = loadColumn(join(D, `${d.name}.txt`));
    const c = JSON.parse(readFileSync(join(TSSB, 'cache', `${d.name}.json`), 'utf8'));
    return { name: d.name, n: values.length, values, cps: d.cps, every: clean(c.cps[EVERY], values.length) };
  }));
  report('TSSB (seen for counts; the shape never computed)', tssb);
  const s1 = mean(tssb.map((r) => r.cShape)), z1 = mean(tssb.map((r) => r.cZero));

  // TCPD: 31 shipped + 7 held out, all annotators.
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
      const { kept, dropped } = shapeRepeats(values, every);
      tcpd.push({ name, n: values.length, every, dropped, f1: fMeasure(ann[name], every, 5).F, f1s: fMeasure(ann[name], kept, 5).F, cover: covering(ann[name], every, values.length), covers: covering(ann[name], kept, values.length) });
    }
  }
  const tch = tcpd.filter((r) => r.dropped.length);
  const tF = mean(tcpd.map((r) => r.f1)), tFs = mean(tcpd.map((r) => r.f1s)), tC = mean(tcpd.map((r) => r.cover)), tCs = mean(tcpd.map((r) => r.covers));
  console.log(`\nTCPD: ${tcpd.length} univariate series; the filter drops ${tcpd.reduce((s, r) => s + r.dropped.length, 0)} of ${tcpd.reduce((s, r) => s + r.every.length, 0)} agreed changes, on ${tch.length}${tch.length ? `: ${tch.map((r) => `${r.name} (${r.dropped.length} of ${r.every.length}; F1 ${r3(r.f1)} -> ${r3(r.f1s)})`).join(', ')}` : ''}.`);
  console.log(`  F1 every-setting ${r3(tF)}, shape-filtered ${r3(tFs)}; covering ${r3(tC)}, shape-filtered ${r3(tCs)}`);

  // HAS 2023 (seen), from eval/repeat-guard.mjs's cache.
  const hasList = await loadHas(HAS);
  const has = scoreRows(hasList.map((h) => {
    const values = JSON.parse(readFileSync(join(HAS, 'series', `${h.name}.json`), 'utf8'));
    const c = JSON.parse(readFileSync(join(HAS, 'cache', `${h.name}.json`), 'utf8'));
    return { name: h.name, n: h.n, values, cps: clean(h.cps, h.n), every: clean(c.cps[EVERY], h.n) };
  }));
  const s3 = report('HAS 2023 (seen for counts; the shape never computed)', has);

  // UTSA (fresh).
  await runCached(utsaFiles, loadU, join(UTSA, 'cache'), [TSSB, TCPD, HAS, UTSA]);
  const utsa = scoreRows(utsaFiles.map((f) => {
    const p = parseUtsaName(f);
    const values = loadU(f);
    const c = JSON.parse(readFileSync(join(UTSA, 'cache', `${f}.json`), 'utf8'));
    return { name: f.replace(/\.txt$/, ''), n: values.length, values, cps: clean(p.cps, values.length), window: p.window, every: clean(c.cps[EVERY], values.length) };
  }));
  const s4 = report('UTSA (fresh)', utsa);
  let near = 0, agreed = 0;
  for (const r of utsa) for (const x of r.every) { agreed++; if (r.cps.some((t) => Math.abs(t - x) <= r.window)) near++; }
  console.log(`  UTSA every-setting minus zero: ${fmt(paired(utsa.map((r) => r.cEvery - r.cZero)))}`);
  console.log(`  UTSA agreed changes within the file's window of a labelled change: ${near} of ${agreed}`);

  console.log('\nPre-registered lines:');
  console.log(`  S1 TSSB shape-filtered covering ${r3(s1)} >= zero ${r3(z1)} - 0.02 = ${r3(z1 - 0.02)}: ${s1 >= z1 - 0.02 ? 'MET' : 'NOT MET'}`);
  const s2 = tFs >= tF - 0.005 && tCs >= tC - 0.005;
  console.log(`  S2 TCPD F1 ${r3(tFs)} >= ${r3(tF - 0.005)} and covering ${r3(tCs)} >= ${r3(tC - 0.005)}: ${s2 ? 'MET' : 'NOT MET'}`);
  console.log(`  S3 HAS shape-filtered minus every-setting mean ${s3.d.mean >= 0 ? '+' : ''}${r3(s3.d.mean)} (bar -0.005): ${s3.d.mean >= -0.005 ? 'MET' : 'NOT MET'}`);
  const s4d = paired(s4.ch.map((r) => r.cShape - r.cEvery));
  const s4met = s4.ch.length < 5 ? 'NOT INFORMATIVE' : (s4.d.mean >= 0 && s4d.pos >= s4d.neg ? 'MET' : 'NOT MET');
  console.log(`  S4 UTSA shape-filtered minus every-setting mean ${s4.d.mean >= 0 ? '+' : ''}${r3(s4.d.mean)} (bar 0); where it drops (${s4.ch.length}): better on ${s4d.pos}, worse on ${s4d.neg}: ${s4met}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
