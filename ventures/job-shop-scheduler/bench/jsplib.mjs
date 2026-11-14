#!/usr/bin/env node
// Runs the solver on every JSPLIB instance and prints a Markdown table.
//   node bench/jsplib.mjs <dir with instances.json and instances/> [--ms 4000] [--only ft,la]
// Get the data (not copied into this repository; JSPLIB states no licence):
//   git clone --depth 1 https://github.com/tamy0612/JSPLIB
// Every schedule is re-checked by checkSchedule, which shares no code with the search.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { solve, parseStandard, checkSchedule } from '../engine.mjs';

const args = process.argv.slice(2);
const flagValues = new Set(['--ms', '--only'].map((f) => args.indexOf(f)).filter((i) => i >= 0).map((i) => i + 1));
const dir = args.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
const ms = Number(args[args.indexOf('--ms') + 1]) || 4000;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
if (!dir) { console.error('usage: node bench/jsplib.mjs JSPLIB_DIR [--ms 4000] [--only ft,la]'); process.exit(2); }
const meta = JSON.parse(readFileSync(join(dir, 'instances.json'), 'utf8')).filter((x) => !only || only.some((p) => x.name.startsWith(p)));

const rows = [];
let equal = 0, proved = 0, withKnown = 0, worseThanUpper = 0, belowLower = 0, betterThanUpper = 0, gaps = [];
for (const x of meta) {
  const inst = parseStandard(readFileSync(join(dir, x.path), 'utf8'));
  const r = solve(inst, { ms, seed: 12345 });
  const checked = checkSchedule(inst, r.schedule);
  if (Math.abs(checked - r.makespan) > 1e-9) throw new Error(`${x.name}: checkSchedule ${checked} != ${r.makespan}`);
  const opt = x.optimum;
  const lo = opt ?? x.bounds?.lower ?? null;
  const hi = opt ?? x.bounds?.upper ?? null;
  if (r.makespan < (lo ?? -Infinity)) belowLower++;
  if (r.optimal && hi != null && r.makespan > hi) throw new Error(`${x.name}: claims optimal ${r.makespan} above published ${hi}`);
  if (opt != null) { withKnown++; if (r.makespan === opt) equal++; }
  if (hi != null && r.makespan > hi) worseThanUpper++;
  if (hi != null && r.makespan < hi) betterThanUpper++;
  if (r.optimal) proved++;
  const ref = hi ?? null;
  const gap = ref ? (r.makespan - ref) / ref : null;
  if (gap != null) gaps.push(gap);
  rows.push(`| ${x.name} | ${x.jobs}x${x.machines} | ${opt ?? (x.bounds ? `${x.bounds.lower}-${x.bounds.upper}` : 'none')} | ${r.makespan} | ${r.lowerBound} | ${r.optimal ? 'yes' : 'no'} | ${gap == null ? '' : (100 * gap).toFixed(1) + '%'} |`);
  process.stderr.write(`${x.name} ${r.makespan} ${opt ?? ''}\n`);
}
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
console.log(`# JSPLIB benchmark, ${ms} ms per instance\n`);
console.log(`Instances: ${meta.length}. Node ${process.version}, seed 12345, one thread.\n`);
console.log(`Same value as JSPLIB's recorded optimum: ${equal} of ${withKnown}`);
console.log(`Proved optimal by this engine within the limits: ${proved} of ${meta.length}`);
console.log(`Worse than JSPLIB's optimum or upper bound: ${worseThanUpper}; better than its upper bound: ${betterThanUpper}; below its lower bound: ${belowLower}`);
console.log(`Mean gap to JSPLIB's optimum or upper bound: ${(100 * mean).toFixed(2)}%\n`);
console.log(`Mean over the ${gaps.length} instances with an optimum or upper bound in JSPLIB. JSPLIB values as recorded in its instances.json; several bounds there have since been improved in the literature, so "better than its upper bound" is not a new best known result.\n`);
console.log('| Instance | Size | JSPLIB optimum (or bounds) | This engine | Proved lower bound | Proved optimal | Gap |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(r);
