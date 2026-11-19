#!/usr/bin/env node
// node cli.mjs schedule.csv [--stock 12000,6000] [--round 25] [--kerf 0] [--csv]
// node cli.mjs --example
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { run, scheduleCsv, cuttingCsv, EXAMPLE } from './schedule.mjs';

export function parseArgs(argv) {
  const o = { file: null, stock: [12000], round: 25, kerf: 0, csv: false, example: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stock') o.stock = argv[++i].split(',').map(Number);
    else if (a === '--round') o.round = Number(argv[++i]);
    else if (a === '--kerf') o.kerf = Number(argv[++i]);
    else if (a === '--csv') o.csv = true;
    else if (a === '--example') o.example = true;
    else o.file = a;
  }
  return o;
}

const f = (x, d = 0) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function report(r) {
  const out = [];
  for (const e of r.errors) out.push(`! ${e}`);
  out.push('Mark  Size  Shape  No.   Cut (mm)  kg');
  for (const l of r.lines) out.push(`${l.mark.padEnd(5)} ${String(l.dia).padStart(4)}  ${l.shape.padEnd(5)} ${String(l.count).padStart(4)}  ${String(l.cut).padStart(8)}  ${f(l.kg, 1)}`);
  out.push(`Total steel in the schedule: ${f(r.totalKg, 1)} kg`);
  for (const p of r.plans) {
    if (p.error) { out.push(`${p.dia} mm: ${p.error}`); continue; }
    out.push(`${p.dia} mm: ${p.bars} stock bars (${f(p.boughtKg, 1)} kg), waste ${f(p.wasteKg, 1)} kg, ${p.proven ? 'proven optimal' : `at most ${f(p.gap / 1000, 1)} m over the bound`}; first-fit decreasing: ${p.firstFit.bars} bars`);
    for (const q of p.patterns) out.push(`  ${q.times} x ${q.stock}: ${q.cuts.map(c => `${c.count} x ${c.length}`).join(' + ')}, offcut ${q.offcut}`);
  }
  out.push('A scheduling aid, not engineering or detailing advice: check every length against the drawings.');
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.file && !o.example) { console.error('usage: node cli.mjs schedule.csv [--stock 12000,6000] [--round 25] [--kerf 0] [--csv] | --example'); process.exit(2); }
  const r = run(o.example ? EXAMPLE : readFileSync(o.file, 'utf8'), o);
  if (o.csv) process.stdout.write(scheduleCsv(r) + '\n' + cuttingCsv(r));
  else console.log(report(r));
  process.exit(r.errors.length ? 1 : 0);
}
