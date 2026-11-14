#!/usr/bin/env node
// Command line: node cli.mjs building.json [--interval 30] [--pct 12] [--simulate] [--search] [--json]
//               node cli.mjs --example [...]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { upPeak, summarise, searchDesigns, EXAMPLE } from './engine.mjs';
import { tripSample, simulate } from './sim.mjs';

const USAGE = 'Usage: node cli.mjs building.json|--example [--interval S] [--pct P] [--simulate] [--search] [--json] [--print-example]';
const DISCLAIMER = 'An up-peak estimate, not engineering advice; a qualified lift consultant checks a real design.';

export function parseArgs(argv) {
  const o = { file: null, example: false, json: false, simulate: false, designs: false, printExample: false, maxInterval: 30, minPctPop: 12 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--example') o.example = true;
    else if (a === '--json') o.json = true;
    else if (a === '--simulate') o.simulate = true;
    else if (a === '--search') o.designs = true;
    else if (a === '--print-example') o.printExample = true;
    else if (a === '--interval') o.maxInterval = Number(argv[++i]);
    else if (a === '--pct') o.minPctPop = Number(argv[++i]);
    else if (!a.startsWith('--')) o.file = a;
    else o.error = `unknown option ${a}`;
  }
  return o;
}

export function run(o, read = (f) => readFileSync(f, 'utf8')) {
  if (o.error) return { error: `${o.error}\n${USAGE}` };
  if (o.printExample) return { text: JSON.stringify(EXAMPLE, null, 2) };
  let input;
  if (o.example) input = EXAMPLE;
  else if (o.file) {
    try {
      input = JSON.parse(read(o.file));
    } catch (e) {
      return { error: `could not read ${o.file} as JSON: ${e.message}` };
    }
  } else return { error: USAGE };
  try {
    const result = upPeak(input);
    const out = { result, summary: summarise(result, o) };
    if (o.designs) out.designs = searchDesigns(input, o);
    if (o.simulate) {
      out.check = tripSample(input, { trips: 20000 });
      out.sim = simulate(input, { demandPct: result.pctPop });
    }
    return out;
  } catch (e) {
    return { error: e.message };
  }
}

const f1 = (x) => x.toFixed(1);

export function report(r) {
  if (r.error) return `Error: ${r.error}`;
  if (r.text) return r.text;
  const x = r.result;
  const lines = [
    `Round trip time: ${f1(x.rtt)} s (running ${f1(x.components.running)}, stops ${f1(x.components.stopping)}, transfers ${f1(x.components.transfer)}, losses ${f1(x.components.losses)})`,
    `Interval: ${f1(x.interval)} s   Handling capacity: ${f1(x.handling)} persons / 5 min = ${f1(x.pctPop)}% of ${x.Ueff.toFixed(0)}`,
    `Passengers per trip P: ${x.P.toFixed(2)} of ${x.persons}   Stops S: ${x.S.toFixed(2)}   Reversal floor H: ${x.H.toFixed(2)}   Stop time ts: ${x.ts.toFixed(2)} s`,
    r.summary,
  ];
  if (r.designs) {
    lines.push(`Designs meeting the targets (${r.designs.passing} of ${r.designs.checked} checked; none better on lifts, load and speed at once):`);
    for (const d of r.designs.frontier.slice(0, 12)) lines.push(`  ${d.lifts} x ${d.ratedLoad} kg (${d.persons} persons) at ${d.speed} m/s: interval ${f1(d.interval)} s, ${f1(d.pctPop)}%`);
    if (!r.designs.frontier.length) lines.push('  none in the range searched');
  }
  if (r.check) lines.push(`Formula vs ${r.check.trips} sampled trips: ${f1(r.check.formulaRtt)} s vs ${f1(r.check.meanRtt)} s (${r.check.gapPct >= 0 ? '+' : ''}${r.check.gapPct.toFixed(2)}%)`);
  if (r.sim) lines.push(`Simulated hour at ${f1(r.sim.demandPct)}% demand: mean wait ${f1(r.sim.meanWait)} s, 90th percentile ${f1(r.sim.p90Wait)} s, mean car load ${f1(r.sim.meanLoad)} of ${r.sim.capacity}`);
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = parseArgs(process.argv.slice(2));
  const r = run(o);
  if (o.json && !r.error) console.log(JSON.stringify(r, null, 2));
  else console.log(report(r));
  process.exitCode = r.error ? 2 : 0;
}
