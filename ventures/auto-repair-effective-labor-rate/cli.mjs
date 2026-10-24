#!/usr/bin/env node
// Effective labor rate from a repair-order export, in a terminal.
//
//   node cli.mjs ros.csv --posted 165 --overhead 42000 --parts-gp 18000 --techs 4 --tech-pay 21000
//   node cli.mjs ros.csv --posted 165 ... --json
//   node cli.mjs --example
//
// Same arithmetic as the web page (ro-import.mjs, then calc.mjs). Zero
// dependencies, no network: repair orders never leave the machine. The shop's
// own numbers, divided; not accounting or pricing advice.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { importRepairOrders } from './ro-import.mjs';
import { calculateEffectiveLaborRate, notes } from './calc.mjs';

const USAGE = `Effective labor rate from a repair-order labor export (CSV).

Usage:
  node cli.mjs [options] <ros.csv | ->

Input: a header row, then one labor line per row, with columns for pay type,
hours billed and labor sales (optional: tech, clock hours). Lines whose pay type
cannot be classified are listed and left out, never guessed.

Options:
  --posted <$/hr>       posted door rate (required)
  --overhead <$>        monthly overhead (default 0)
  --parts-gp <$>        monthly parts gross profit (default 0)
  --techs <n>           technician count (default 1)
  --tech-pay <$>        monthly technician pay (default 0)
  --clock-hours <h>     total clock hours, if the CSV has no clock column
  --target <%>          target labor gross profit percent (default 70)
  --json                machine-readable output
  --example             print a sample CSV
  -h, --help
`;

export const EXAMPLE = `RO,Tech,Pay Type,Hours Billed,Labor Sales,Clock Hours
1001,Ana,Customer Pay,2.0,$330.00,2.5
1002,Ana,Warranty,1.5,$142.50,1.0
1003,Ben,CP,3,$420.00,3.5
1004,Ben,Fleet,1,$110,1
1005,Ben,Comeback,0.8,,0.8
`;

const FLAGS = {
  '--posted': 'postedLaborRate',
  '--overhead': 'monthlyOverhead',
  '--parts-gp': 'partsGrossProfit',
  '--techs': 'technicianCount',
  '--tech-pay': 'totalTechnicianPay',
  '--clock-hours': 'totalClockHours',
  '--target': 'targetLaborGrossProfit',
};

export function parseArgs(argv) {
  const opts = { inputs: {}, json: false, file: null, help: false, example: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--example') opts.example = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      opts.inputs[FLAGS[a]] = argv[(i += 1)];
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (opts.file === null) opts.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return opts;
}

/** CSV text plus shop inputs to the same result the page shows. */
export function run(text, inputs) {
  const imported = importRepairOrders(text);
  if (!imported.ok) return { ok: false, errors: [{ id: 'csv', message: imported.error }], skipped: imported.skipped ?? [] };
  const merged = {
    monthlyOverhead: '0', partsGrossProfit: '0', technicianCount: '1', totalTechnicianPay: '0', targetLaborGrossProfit: '70',
    ...imported.fields,
    ...inputs,
  };
  if (merged.totalClockHours === undefined) merged.totalClockHours = String(Number(merged.customerPayHours) + Number(merged.warrantyHours) + Number(merged.internalHours));
  const result = calculateEffectiveLaborRate(merged);
  if (!result.ok) return { ...result, skipped: imported.skipped };
  return { ok: true, figures: result, notes: notes(result), byTech: imported.byTech, skipped: imported.skipped, lines: imported.lines };
}

function format(r) {
  const f = r.figures;
  const out = [`Read ${r.lines} labor lines${r.skipped.length ? `, skipped ${r.skipped.length}` : ''}.`, ''];
  out.push(`Effective labor rate  $${f.effectiveLaborRate.toFixed(2)}/hr  (posted $${f.postedLaborRate.toFixed(2)}, realization ${(f.realizationRatio * 100).toFixed(0)}%)`);
  out.push(`Required posted rate  $${f.requiredPostedRate.toFixed(2)}/hr for ${f.targetLaborGrossProfit}% labor gross profit`, '');
  for (const n of r.notes) out.push(`- ${n}`);
  if (r.byTech.length) {
    out.push('', 'Per technician (sold hours):');
    for (const t of r.byTech) out.push(`  ${t.name.padEnd(16)} ${t.soldHours.toFixed(1).padStart(7)} h  ${t.effectiveRate === null ? 'n/a' : `$${t.effectiveRate.toFixed(2)}/hr`}`);
  }
  for (const s of r.skipped) out.push(`skipped line ${s.line}: ${s.reason}`);
  return out.join('\n');
}

async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(`${e.message}\n\n${USAGE}`); return 2; }
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  if (opts.example) { process.stdout.write(EXAMPLE); return 0; }
  if (!opts.file) { process.stderr.write(USAGE); return 2; }
  let text;
  try {
    text = opts.file === '-' ? await new Promise((res, rej) => { let s = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => res(s)); process.stdin.on('error', rej); }) : await readFile(opts.file, 'utf8');
  } catch (e) { process.stderr.write(`cannot read ${opts.file}: ${e.message}\n`); return 2; }
  const r = run(text, opts.inputs);
  if (opts.json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
  else if (!r.ok) process.stderr.write(`${r.errors.map((e) => e.message).join('\n')}\n`);
  else process.stdout.write(`${format(r)}\n`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
