#!/usr/bin/env node
// Command line: node cli.mjs system.txt [--json]   |   node cli.mjs --example [--json]   |   node cli.mjs --print-example
// The file is the plain-text format in format.mjs (or a JSON model).
import { readFileSync } from 'node:fs';
import { analyze, EXAMPLE } from './hydraulics.mjs';
import { parse, serialize } from './format.mjs';
import { pathToFileURL } from 'node:url';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false, print: false };
  for (const a of argv) {
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--print-example') o.print = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else o.file = a;
  }
  return o;
}

export function run(opts, read = p => readFileSync(p, 'utf8')) {
  if (opts.print) return { text: serialize(EXAMPLE) };
  if (opts.help || (!opts.file && !opts.example)) return { error: 'Usage: node cli.mjs system.txt [--json]   or   node cli.mjs --example [--json]   or   node cli.mjs --print-example > system.txt\nThe file lists source, supply, design, node and pipe lines (README, "Input format").' };
  let model = EXAMPLE;
  if (!opts.example) {
    let text;
    try { text = read(opts.file); } catch (e) { return { error: `Could not read ${opts.file}: ${e.message}` }; }
    if (/^\s*\{/.test(text)) {
      try { model = JSON.parse(text); } catch (e) { return { error: `Could not read ${opts.file} as JSON: ${e.message}` }; }
    } else {
      const p = parse(text);
      if (p.errors.length) return { error: p.errors.join('\n') };
      model = p.model;
    }
  }
  const result = analyze(model);
  if (result.errors.length) return { error: result.errors.join('\n') };
  return { model, result };
}

const f1 = x => x.toFixed(1);
const f2 = x => x.toFixed(2);

export function report({ model, result: r }) {
  const d = r.demand;
  const lines = [];
  lines.push(`Demand at the source (${model.source}): ${f1(d.psi)} psi and ${f1(d.sprinklerGpm)} gpm of sprinklers${d.otherGpm ? ` + ${f1(d.otherGpm)} gpm other outflow` : ''}${d.hoseGpm ? ` + ${f1(d.hoseGpm)} gpm hose = ${f1(d.totalGpm)} gpm` : ''}.`);
  lines.push(`Most demanding head: ${d.remote}. Over-discharge across the open heads: ${f1(r.overdischargeGpm)} gpm.`);
  if (r.supply) {
    lines.push(`Supply at ${f1(d.totalGpm)} gpm: ${f1(r.supply.availablePsi)} psi, margin ${f1(r.supply.marginPsi)} psi.`);
    const op = r.supply.operating;
    if (op) lines.push(`With every listed head open the system and supply curves meet at ${f1(op.psi)} psi, ${f1(op.totalGpm)} gpm (hose included).`);
  }
  lines.push('');
  lines.push('Head        K     psi     gpm   required');
  for (const s of r.solution.sprinklers) lines.push(`${s.id.padEnd(10).slice(0, 10)}${String(s.k).padStart(5)}${f2(s.psi).padStart(8)}${f2(s.gpm).padStart(8)}${f2(r.required[s.id]).padStart(11)}`);
  lines.push('');
  lines.push('Pipe          from       to            gpm  ID in   ft/s  psi/ft  friction psi');
  for (const p of r.solution.pipes) lines.push(`${p.id.padEnd(14).slice(0, 14)}${p.from.padEnd(11).slice(0, 11)}${p.to.padEnd(11).slice(0, 11)}${f2(p.gpm).padStart(8)}${p.idIn.toFixed(3).padStart(7)}${f1(p.velocityFps).padStart(7)}${p.psiPerFt.toFixed(4).padStart(8)}${f2(p.frictionPsi).padStart(14)}`);
  lines.push('');
  lines.push('Node        elev ft    psi');
  for (const n of r.solution.nodes) lines.push(`${n.id.padEnd(10).slice(0, 10)}${f1(n.elevationFt).padStart(9)}${f2(n.psi).padStart(7)}`);
  for (const w of r.warnings) lines.push(`Warning: ${w}`);
  lines.push('');
  lines.push('Estimate only, not engineering advice and not a stamped hydraulic calculation. NFPA 13, your local code and the authority having jurisdiction decide what is accepted.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseArgs(process.argv.slice(2));
  const out = run(opts);
  if (out.error) { console.error(out.error); process.exit(1); }
  if (out.text) console.log(out.text.trimEnd());
  else console.log(opts.json ? JSON.stringify(out.result, null, 2) : report(out));
}
