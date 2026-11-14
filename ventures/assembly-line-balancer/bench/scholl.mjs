#!/usr/bin/env node
// Run the engine on Scholl's SALBP benchmark data sets and compare with the
// published optima.
//
//   curl -o SALBP-data-sets.zip https://assembly-line-balancing.de/wp-content/uploads/2017/01/SALBP-data-sets.zip
//   node bench/scholl.mjs SALBP-data-sets.zip [--type 1|2] [--ms 4000] [--nodes 4000000] > bench/salbp1.md
//
// The data are Scholl, A. (1993), "Data of assembly line balancing
// problems", TH Darmstadt, with the optima tabulated by Scholl and Klein at
// assembly-line-balancing.de. They are not copied into this repository: the
// script reads the zip as published (task files in .IN2 format and the
// optima in the spreadsheet inside it), using only Node's built-in zlib.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseIn2, minimizeStations, minimizeCycleTime, checkBalance } from '../engine.mjs';

function unzip(buf) {
  // Find the end of central directory record, then walk the central directory.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const lName = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lName + lExtra, local + 30 + lName + lExtra + size);
    if (!name.endsWith('/')) files.set(name, method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function sheetRows(xlsx, sheetIndex) {
  const files = unzip(xlsx);
  const strings = [];
  const ss = files.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) strings.push([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
  const xml = files.get(`xl/worksheets/sheet${sheetIndex}.xml`).toString('utf8');
  const rows = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(c[1])[1];
      const col = [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || '')?.[1] ?? '';
      row[col] = /t="s"/.test(c[1]) ? strings[Number(v)] : v;
    }
    rows.push(row);
  }
  return rows;
}

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const zipPath = args.find(a => a.endsWith('.zip'));
if (!zipPath) { console.error('usage: node bench/scholl.mjs SALBP-data-sets.zip [--type 1|2] [--ms 4000] [--nodes 4000000] [--only NAME]'); process.exit(2); }
const type = Number(opt('--type', '1'));
const limits = { ms: Number(opt('--ms', '4000')), nodes: Number(opt('--nodes', '4000000')) };
const only = opt('--only', null);
const zipBuf = readFileSync(zipPath);
const sha = createHash('sha256').update(zipBuf).digest('hex');
const files = unzip(zipBuf);
const graphs = new Map();
for (const [name, data] of files) {
  const m = /([^/]+)\.IN2$/i.exec(name);
  if (m) graphs.set(m[1].toUpperCase(), parseIn2(data.toString('latin1')));
}
const xlsx = [...files].find(([n]) => n.endsWith('.xlsx'))[1];
// The spreadsheet names graphs as e.g. "Arcus1", "Wee-Mag", "Barthol2"; the files as ARC83, WEE-MAG, BARTHOL2.
const ALIAS = { ARCUS1: 'ARC83', ARCUS2: 'ARC111', SAWYER: 'SAWYER30', TONGE: 'TONGE70', BOWMAN: 'BOWMAN8', HESKIAOFF: 'HESKIA', MUKHERJEE: 'MUKHERJE', KILBRIDGE: 'KILBRID', ROSZIEG: 'ROSZIEG', BARTHOLDI: 'BARTHOLD' };
const fileFor = name => { const k = name.toUpperCase().replace(/\s+/g, ''); return graphs.has(k) ? k : ALIAS[k]; };

const instances = [];
if (type === 1) {
  for (const r of sheetRows(xlsx, 2)) {
    if (!r[0] || !/^\d+$/.test(r[1] || '') || !fileFor(r[0])) continue;
    const known = /^\d+$/.test(r[2] || '') ? { lb: Number(r[2]), ub: Number(r[2]) } : { lb: Number(r[4]), ub: Number(r[5]) };
    instances.push({ graph: r[0], c: Number(r[1]), known });
  }
} else {
  for (const r of sheetRows(xlsx, 3)) {
    if (!r[0] || !/^\d+$/.test(r[1] || '') || !fileFor(r[0])) continue;
    const v = String(r[2] || '');
    const range = /\[?\s*(\d+)\s*[,;]\s*(\d+)\s*\]?/.exec(v);
    const known = /^\d+$/.test(v) ? { lb: Number(v), ub: Number(v) } : range ? { lb: Number(range[1]), ub: Number(range[2]) } : null;
    if (known) instances.push({ graph: r[0], m: Number(r[1]), known });
  }
}

const rows = [];
let agreeOpt = 0, provedOpt = 0, worse = 0, better = 0, totalMs = 0;
const start = Date.now();
for (const inst of instances) {
  if (only && fileFor(inst.graph) !== only.toUpperCase()) continue;
  const g = graphs.get(fileFor(inst.graph));
  const res = type === 1 ? minimizeStations({ ...g, cycleTime: inst.c }, limits) : minimizeCycleTime(g, inst.m, limits);
  const value = type === 1 ? res.stationCount : res.cycleTime;
  // Every answer is re-checked independently of the solver.
  checkBalance(g, res.assignment, type === 1 ? inst.c : res.cycleTime);
  totalMs += res.ms;
  const k = inst.known;
  if (value === k.ub && k.lb === k.ub) agreeOpt++;
  if (res.optimal) provedOpt++;
  if (value > k.ub) worse++;
  if (value < k.ub) better++;
  rows.push(`| ${inst.graph} | ${type === 1 ? inst.c : inst.m} | ${type === 1 ? n(g) : n(g)} | ${k.lb === k.ub ? k.lb : `[${k.lb}, ${k.ub}]`} | ${value} | ${res.optimal ? 'yes' : `no (LB ${res.lowerBound})`} | ${res.nodes} | ${res.ms} |`);
  process.stderr.write(`${inst.graph} ${type === 1 ? 'c=' + inst.c : 'm=' + inst.m}: ${value} (known ${k.lb}-${k.ub}) ${res.optimal ? 'proved' : 'open'} ${res.ms} ms\n`);
}
function n(g) { return g.tasks.length; }
const N = rows.length;
const out = [];
out.push(`# Scholl SALBP-${type} benchmark`);
out.push('');
out.push(`Data: Scholl (1993), assembly-line-balancing.de, \`SALBP-data-sets.zip\` sha256 \`${sha}\`.`);
out.push(`Limits per instance: ${limits.nodes} nodes, ${limits.ms} ms. Node ${process.version}. Every balance re-checked by \`checkBalance\`.`);
out.push('');
out.push(`- Instances: ${N}`);
out.push(`- Same value as the published optimum: ${agreeOpt} of ${rows.length}`);
out.push(`- Proved optimal by this engine within the limits: ${provedOpt} of ${N}`);
out.push(`- Worse than the published best: ${worse}; better than the published upper bound: ${better}`);
out.push(`- Solver time, sum over instances: ${(totalMs / 1000).toFixed(1)} s (wall ${((Date.now() - start) / 1000).toFixed(1)} s)`);
out.push('');
out.push(`| Graph | ${type === 1 ? 'Cycle time' : 'Stations'} | Tasks | Published ${type === 1 ? 'm*' : 'c*'} | This engine | Proved | Nodes | ms |`);
out.push('|---|---:|---:|---:|---:|---|---:|---:|');
out.push(...rows);
console.log(out.join('\n'));
