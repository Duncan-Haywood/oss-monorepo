#!/usr/bin/env node
// Zero-dependency CLI: read a shortlist of loads with your own rates, time
// windows and costs, print the best chain to run, the lowest rate each load is
// worth, and what a simple rule would have left on the table. No network call
// -- local files/stdin only.
//
//   node cli.mjs plan loads.csv --start "Dallas TX" --horizon 120
//   cat loads.csv | node cli.mjs plan - --start "Dallas TX" --per-day --return-home --json
//   node cli.mjs cities

import fs from "node:fs/promises";
import { parseLoads, plan, summarize, money, pct, miles, hours, clock, CITIES, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--start": "start", "--horizon": "horizon", "--mph": "mph", "--mpg": "mpg", "--fuel": "fuel", "--per-mile": "perMile",
  "--fixed-day": "fixedDay", "--dwell": "dwell", "--drive-hours": "hosDrive", "--rest-hours": "hosRest", "--road-factor": "roadFactor",
};
const SWITCHES = { "--return-home": ["returnHome", true], "--per-day": ["objective", "perDay"], "--no-hos": ["hos", false] };

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (FLAGS[a]) args.opts[FLAGS[a]] = argv[++i] ?? "";
    else if (SWITCHES[a]) args.opts[SWITCHES[a][0]] = SWITCHES[a][1];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan <loads.csv|-> --start \"Dallas TX\" [--horizon 168] [--mph 50] [--mpg 6.5] [--fuel 3.90] [--per-mile 0.25]",
  "                                  [--fixed-day 150] [--dwell 2] [--drive-hours 11] [--rest-hours 10] [--no-hos]",
  "                                  [--road-factor 1.2] [--return-home] [--per-day] [--json]",
  "  node cli.mjs cities             list the built-in city names",
  "",
  "Rows: name,from,to,rate[,miles,pickup_open,pickup_close,deliver_by,extra,note]   (cities like 'Dallas TX', no comma, or @lat/lon)",
  "--start       where you are ready to load (required)           --horizon   hours you are free (default 168)",
  "--mph         average moving speed (default 50)                --mpg       miles per gallon (default 6.5)",
  "--fuel        dollars per gallon (default 3.90)                --per-mile  other cost per mile: tires, repairs, reserves (default 0.25)",
  "--fixed-day   truck note, insurance, your pay, per day (150)   --dwell     hours at each pickup and drop (default 2)",
  "--drive-hours / --rest-hours   simplified drive then rest rule (11 / 10); --no-hos turns it off",
  "--road-factor straight-line miles times this (default 1.2)     --return-home  charge the empty run back to the start",
  "--per-day     maximise profit per day the chain takes instead of total profit in the window",
  `Up to 14 loads. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub === "cities") return { exitCode: 0, output: CITIES.map((c) => c.name).join("\n") };
  if (args.sub !== "plan") return bad("Expected the plan command");
  const file = args.positional[0];
  if (!file) return bad("Give a loads file, or - for stdin");
  for (const [k, v] of Object.entries(args.opts)) if (v === "") return bad(`${k} needs a value`);
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseLoads(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.loads.length) return bad("No load rows found");
  let p;
  try {
    p = plan(parsed, args.opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, ""];
  if (p.status === "chain") {
    lines.push("Run, in this order:");
    p.chain.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.name}  ${c.from} -> ${c.to}  ${money(c.rate)}  (${money(c.ratePerLoadedMile)}/loaded mi, ${money(c.allInPerMile)}/mi counting ${miles(c.deadheadMiles)} empty to reach it)`);
      lines.push(`     pick up ${clock(c.pickupAt)}${c.waitHours > 0.05 ? ` after waiting ${hours(c.waitHours)}` : ""}, deliver ${clock(c.deliverAt)}; net ${money(c.net)}; counter at or above ${money(c.walkAway)} (walk-away), ${money(c.headroom)} of room`);
    });
    const t = p.totals;
    lines.push("", `Gross ${money(t.revenue)}, miles ${miles(t.totalMiles)} (${miles(t.emptyMiles)} empty), cost of miles ${money(t.fuelAndMileCost)}${t.extras ? `, extras ${money(t.extras)}` : ""}`);
    lines.push(`Profit before fixed costs ${money(t.profitBeforeFixed)} over ${hours(t.elapsedHours)}; after ${money(p.options.fixedDay)}/day fixed cost: ${money(t.perDayAfterFixed)} a day on the chain, ${money(t.netOverWindow)} over your ${hours(p.options.horizon)} window`);
  }
  lines.push("", "Left out:");
  for (const o of p.others) lines.push(`  - ${o.name}: ${o.reason}`);
  if (!p.others.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", "Against simple rules:");
  for (const b of p.baselines) lines.push(`  ${b.label}: ${b.loads.length} load(s), ${money(b.profit)} before fixed costs`);
  lines.push(MODEL_NOTE);
  return { exitCode: 0, output: lines.join("\n") };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run(process.argv.slice(2)).then(({ exitCode, output }) => {
    (exitCode ? console.error : console.log)(output);
    process.exitCode = exitCode;
  });
}
