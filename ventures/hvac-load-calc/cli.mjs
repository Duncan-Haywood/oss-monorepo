#!/usr/bin/env node
// Command line: node cli.mjs house.json   |   node cli.mjs --example [--json]
import { readFileSync } from 'node:fs';
import { calculate, EXAMPLE } from './load.mjs';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false };
  for (const a of argv) {
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.file = a;
  }
  return o;
}

export function run(opts, read = p => readFileSync(p, 'utf8')) {
  if (opts.help || (!opts.file && !opts.example)) return { error: 'Usage: node cli.mjs house.json [--json]   or   node cli.mjs --example' };
  let input = EXAMPLE;
  if (!opts.example) {
    try { input = JSON.parse(read(opts.file)); } catch (e) { return { error: `Could not read ${opts.file} as JSON: ${e.message}` }; }
  }
  const result = calculate(input);
  if (result.errors.length) return { error: result.errors.join('\n') };
  return { result };
}

const n = x => Math.round(x).toLocaleString('en-US');

export function report({ result: r }) {
  const h = r.house, c = h.cooling;
  const lines = [];
  lines.push(`Room            Heat Btu/h   Cool sens Btu/h  peak hr  Latent  Design cfm`);
  for (const x of r.rooms) lines.push(`${x.name.padEnd(16).slice(0, 16)}${n(x.heating.total).padStart(10)}${n(x.cooling.sensible).padStart(17)}${String(x.cooling.peakHour).padStart(9)}${n(x.cooling.latent).padStart(8)}${n(x.airflow.design).padStart(12)}`);
  lines.push('');
  lines.push(`Heating load: ${n(h.heating.total)} Btu/h (${h.heatingBtuhPerFt2.toFixed(1)} Btu/h per ft²)`);
  lines.push(`Cooling load at the house peak (solar hour ${c.peakHour}): ${n(c.sensible)} sensible + ${n(c.latent)} latent = ${n(c.total)} Btu/h (${h.coolingTons.toFixed(2)} tons, SHR ${c.sensibleHeatRatio.toFixed(2)})`);
  lines.push(`Sum of room peaks (rooms peak at different hours): ${n(c.sumOfRoomPeaks)} Btu/h sensible`);
  lines.push(`Smallest common nominal size covering the load: ${h.nominalTons ? h.nominalTons + ' tons' : 'over 5 tons, consider zoning or two systems'}`);
  lines.push(`Rule of thumb (500 ft²/ton) would say ${h.ruleOfThumbTons.toFixed(1)} tons; this house works out at ${h.ft2PerTon ? n(h.ft2PerTon) : '-'} ft² per ton.`);
  lines.push(`Design airflow: ${n(h.designCFM)} cfm`);
  lines.push('');
  lines.push('Estimate only, not engineering advice and not an ACCA Manual J report. Check it against a full load calculation before buying equipment.');
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const out = run(opts);
  if (out.error) { console.error(out.error); process.exit(1); }
  console.log(opts.json ? JSON.stringify(out.result, null, 2) : report(out));
}
