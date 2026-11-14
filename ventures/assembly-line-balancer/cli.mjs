#!/usr/bin/env node
// Command line:
//   node cli.mjs tasks.csv --cycle 60            fewest stations at a 60 s cycle (SALBP-1)
//   node cli.mjs tasks.csv --stations 8          shortest cycle on 8 stations (SALBP-2)
//   node cli.mjs tasks.csv --takt 27000,450      cycle = 27000 s available / 450 units
//   node cli.mjs JACKSON.IN2 --cycle 10          Scholl .IN2 files are read too
//   node cli.mjs --example [--json] [--ms 4000]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseIn2, parseTaskTable, minimizeStations, minimizeCycleTime, taktTime, EXAMPLE } from './engine.mjs';

const USAGE = 'Usage: node cli.mjs tasks.csv|tasks.json|graph.IN2|--example (--cycle C | --stations M | --takt AVAILABLE,DEMAND) [--ms 4000] [--json]';
export const DISCLAIMER = 'A planning estimate from the times and precedences you typed, not engineering advice; check ergonomics, zoning, tooling and safety on the real line.';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false, cycle: null, stations: null, takt: null, ms: 4000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--cycle') o.cycle = Number(argv[++i]);
    else if (a === '--stations') o.stations = Number(argv[++i]);
    else if (a === '--takt') o.takt = String(argv[++i] ?? '');
    else if (a === '--ms') o.ms = Number(argv[++i]);
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('--')) o.file = a;
    else o.error = `unknown option ${a}`;
  }
  return o;
}

export function readProblem(name, text) {
  if (/\.in2$/i.test(name)) return parseIn2(text);
  if (/\.json$/i.test(name)) {
    const p = JSON.parse(text);
    return Array.isArray(p) ? { tasks: p } : p;
  }
  return parseTaskTable(text);
}

export function run(o, read = (f) => readFileSync(f, 'utf8')) {
  if (o.error) return { error: `${o.error}\n${USAGE}` };
  if (o.help) return { text: `${USAGE}\n${DISCLAIMER}` };
  let problem;
  try {
    if (o.example) problem = { tasks: EXAMPLE.tasks };
    else if (o.file) problem = readProblem(o.file, read(o.file));
    else return { error: USAGE };
  } catch (e) {
    return { error: `could not read ${o.file}: ${e.message}` };
  }
  try {
    const limits = { ms: o.ms > 0 ? o.ms : 4000 };
    if (o.stations != null) return { result: minimizeCycleTime(problem, o.stations, limits) };
    let cycle = o.cycle;
    if (o.takt) {
      const [avail, demand] = o.takt.split(',').map(Number);
      cycle = taktTime(avail, demand);
    }
    if (cycle == null && o.example) cycle = EXAMPLE.cycleTime;
    if (cycle == null && problem.cycleTime != null) cycle = Number(problem.cycleTime);
    if (cycle == null) return { error: `give --cycle, --stations or --takt\n${USAGE}` };
    return { result: minimizeStations({ ...problem, cycleTime: cycle }, limits) };
  } catch (e) {
    return { error: e.message };
  }
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const num = (x) => String(Math.round(x * 1000) / 1000);

export function report(r, json = false) {
  if (r.error) return `Error: ${r.error}`;
  if (r.text) return r.text;
  const x = r.result;
  if (json) return JSON.stringify({ ...x, disclaimer: DISCLAIMER }, null, 2);
  const lines = [];
  if (x.type === 'SALBP-1') {
    lines.push(`Cycle time ${num(x.cycleTime)}: ${x.stationCount} stations (${x.optimal ? 'proved fewest possible' : `best found; at least ${x.lowerBound} are needed`}).`);
  } else {
    lines.push(`${x.stationsGiven} stations: cycle time ${num(x.cycleTime)} (${x.optimal ? 'proved shortest possible' : `best found; no shorter than ${num(x.lowerBound)}`}).`);
  }
  lines.push(`Total work ${num(x.totalWork)}; line efficiency ${pct(x.efficiency)}; balance delay ${pct(x.balanceDelay)}; smoothness index ${num(x.smoothnessIndex)}; bottleneck load ${num(x.bottleneck)}.`);
  lines.push(`Found by ${x.method} (${x.nodes} search steps, ${x.ms} ms).`);
  lines.push('');
  lines.push('Station  Load      Idle      Tasks');
  for (const s of x.stations) lines.push(`${String(s.station).padEnd(8)} ${num(s.load).padEnd(9)} ${num(s.idle).padEnd(9)} ${s.tasks.join(' ')}`);
  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv.slice(2));
  const r = run(o);
  const text = report(r, o.json);
  if (r.error) { console.error(text); process.exit(2); }
  console.log(text);
}
