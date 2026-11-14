#!/usr/bin/env node
// Command line: node cli.mjs system.json [--json] [--trim]   |   node cli.mjs --example [--json] [--trim]
import { readFileSync } from 'node:fs';
import { sizeSystem, EXAMPLE_SYSTEM, MATERIALS } from './pipe.mjs';
import { demand } from './demand.mjs';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false, trim: false };
  for (const a of argv) {
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--trim') o.trim = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.file = a;
  }
  return o;
}

export function run(opts, read = p => readFileSync(p, 'utf8')) {
  if (opts.help || (!opts.file && !opts.example)) return { error: 'Usage: node cli.mjs system.json [--json] [--trim]   or   node cli.mjs --example [--json] [--trim]\nThe file holds fixtureTypes, segments and the pressure budget (README, "Input file").' };
  let input = EXAMPLE_SYSTEM;
  if (!opts.example) {
    try { input = JSON.parse(read(opts.file)); } catch (e) { return { error: `Could not read ${opts.file} as JSON: ${e.message}` }; }
  }
  if (opts.trim) input = { ...input, trim: true };
  const result = sizeSystem(input);
  if (result.errors.length) return { error: result.errors.join('\n') };
  const whole = demand((input.fixtureTypes || []).map(f => ({ ...f, count: result.segments.find(s => !s.from).served[f.name] })), { tail: Number(input.tail ?? 0.01), truncate: Boolean(input.truncate) });
  return { result, whole };
}

const f1 = x => x.toFixed(1);

export function report({ result: r, whole }) {
  const lines = [];
  lines.push(`Whole building: design flow ${f1(whole.designGpm)} gpm (exceeded ${(whole.tail * 100).toFixed(1)}% of the time${whole.truncate ? ' while any water is drawn' : ''}); average ${f1(whole.meanGpm)} gpm; everything at once ${f1(whole.allAtOnceGpm)} gpm.`);
  lines.push(`Each type sized alone and added (Hunter's single-type m x q): ${f1(whole.sumOfTypesAloneGpm)} gpm.`);
  lines.push(`${MATERIALS[r.material].label}, C = ${r.c}. Allowable friction ${r.allowablePsiPer100.toFixed(2)} psi per 100 ft, set by the path to "${r.criticalEnd}".`);
  lines.push('');
  lines.push('Segment               from                    gpm  size   ID in  ft/s  psi/100ft  loss psi');
  for (const s of r.segments) lines.push(`${s.name.padEnd(22).slice(0, 22)}${(s.from || 'meter').padEnd(22).slice(0, 22)}${f1(s.gpm).padStart(6)}${s.nominal.padStart(7)}${s.idIn.toFixed(3).padStart(8)}${s.velocityFps.toFixed(1).padStart(6)}${s.psiPer100.toFixed(2).padStart(11)}${s.lossPsi.toFixed(2).padStart(10)}`);
  lines.push('');
  for (const e of r.ends) lines.push(`End of ${e.end}: ${f1(e.pressurePsi)} psi after ${Math.round(e.developedFt)} ft developed and ${e.riseFt} ft of rise.`);
  if (r.trimmed) lines.push(`Trimmed: ${r.trimmed} size step(s) down where the path had pressure to spare (--trim).`);
  for (const w of r.warnings) lines.push(`Warning: ${w}`);
  lines.push('');
  lines.push('Estimate only, not engineering advice and not a plumbing code sizing method. Your local code and the authority having jurisdiction decide what is accepted.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  const out = run(opts);
  if (out.error) { console.error(out.error); process.exit(1); }
  console.log(opts.json ? JSON.stringify({ system: out.result, wholeBuilding: out.whole }, null, 2) : report(out));
}
