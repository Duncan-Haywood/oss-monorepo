#!/usr/bin/env node
// Command line:
//   node cli.mjs shop.csv                 job, machine, time per line, in routing order
//   node cli.mjs ft10.txt --ms 15000      OR-Library / JSPLIB or Taillard instance files
//   node cli.mjs --example [--json] [--gantt] [--ms 4000] [--seed 7]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAny, solve, EXAMPLE } from './engine.mjs';

const USAGE = 'Usage: node cli.mjs shop.csv|instance.txt|shop.json|--example [--ms 4000] [--seed N] [--json] [--gantt]';
export const DISCLAIMER = 'A planning estimate from the routings and times you typed, not engineering or operations advice; setups, breakdowns, transport, operator availability and due dates are for you to check.';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false, gantt: false, ms: 4000, seed: 12345 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--gantt') o.gantt = true;
    else if (a === '--ms') o.ms = Number(argv[++i]);
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('--')) o.file = a;
    else o.error = `unknown option ${a}`;
  }
  return o;
}

export function run(o, read = (f) => readFileSync(f, 'utf8')) {
  if (o.error) return { error: `${o.error}\n${USAGE}` };
  if (o.help) return { text: `${USAGE}\n${DISCLAIMER}` };
  let inst;
  try {
    if (o.example) inst = EXAMPLE;
    else if (o.file) inst = parseAny(read(o.file));
    else return { error: USAGE };
  } catch (e) {
    return { error: `could not read ${o.file}: ${e.message}` };
  }
  try {
    return { result: solve(inst, { ms: o.ms > 0 ? o.ms : 4000, seed: Number.isFinite(o.seed) ? o.seed : 12345 }) };
  } catch (e) {
    return { error: e.message };
  }
}

const num = (x) => String(Math.round(x * 1000) / 1000);

// A text Gantt chart, one row per machine, scaled to 72 columns.
export function gantt(x, width = 72) {
  const scale = x.makespan > 0 ? width / x.makespan : 1;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const names = [...new Set(x.schedule.map((o) => o.job))];
  const lines = [];
  const label = Math.max(...x.machineSummary.map((m) => m.machine.length));
  for (const m of x.machineSummary) {
    const row = new Array(width).fill('.');
    for (const o of x.schedule.filter((s) => s.machine === m.machine)) {
      const a = Math.floor(o.start * scale), b = Math.max(a + 1, Math.round(o.end * scale));
      const ch = letters[names.indexOf(o.job) % letters.length];
      for (let i = a; i < b && i < width; i++) row[i] = ch;
    }
    lines.push(`${m.machine.padEnd(label)} |${row.join('')}|`);
  }
  lines.push(`Key: ${names.slice(0, letters.length).map((n, i) => `${letters[i]}=${n}`).join(' ')}`);
  return lines.join('\n');
}

export function report(r, json = false, withGantt = false) {
  if (r.error) return `Error: ${r.error}`;
  if (r.text) return r.text;
  const x = r.result;
  if (json) return JSON.stringify({ ...x, disclaimer: DISCLAIMER }, null, 2);
  const lines = [];
  lines.push(`${x.jobs} jobs, ${x.machines} machines, ${x.operations} operations.`);
  lines.push(`Makespan ${num(x.makespan)} (${x.optimal ? `proved shortest possible: ${x.proof}` : `best found; no schedule can finish before ${num(x.lowerBound)}, gap ${(100 * x.gap).toFixed(1)}%`}).`);
  lines.push(`Found by ${x.method}; ${x.tabuIterations} tabu moves, ${x.nodes} exact-search nodes, ${x.ms} ms. Average machine utilisation ${(100 * x.averageUtilization).toFixed(1)}%.`);
  lines.push('');
  lines.push('Machine  Busy      Idle      Use     Order');
  for (const m of x.machineSummary) lines.push(`${m.machine.padEnd(8)} ${num(m.busy).padEnd(9)} ${num(m.idle).padEnd(9)} ${(100 * m.utilization).toFixed(0).padStart(3)}%    ${m.sequence.join(' ')}`);
  lines.push('');
  lines.push('Job      Done at   Work      Waiting');
  for (const j of x.jobSummary) lines.push(`${j.job.padEnd(8)} ${num(j.completion).padEnd(9)} ${num(j.work).padEnd(9)} ${num(j.waiting)}`);
  if (withGantt) { lines.push(''); lines.push(gantt(x)); }
  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv.slice(2));
  const r = run(o);
  const text = report(r, o.json, o.gantt);
  if (r.error) { console.error(text); process.exit(2); }
  console.log(text);
}
