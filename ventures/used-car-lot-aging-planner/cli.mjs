#!/usr/bin/env node
// Zero-dependency CLI: read a used-car lot's inventory, print what each unit
// has cost to carry, the best day to wholesale it, which units to wholesale
// now ranked by earnings per $1,000 of floorplan line per day, and what a
// "wait until it sells" policy leaves behind. No network call -- local
// file/stdin only.
//
//   node cli.mjs plan lot.csv --apr 9 --cash-rate 6 --max-age 180 --curtail 90:10,120:10,150:10
//   cat lot.csv | node cli.mjs plan - --line-value 2 --json

import fs from "node:fs/promises";
import { parseUnits, plan, summarize, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--apr": "apr", "--cash-rate": "cashRate", "--line-value": "lineValue", "--max-age": "maxAge", "--curtail": "curtailments" };

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (FLAGS[a]) args.opts[a] = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan <lot.csv|-> [--apr 9] [--cash-rate 6] [--line-value 0] [--max-age 180] [--curtail 90:10,120:10,150:10] [--json]",
  "",
  "Rows: stock,days,cost,floored,retail,wholesale,retail_drop_30,wholesale_drop_30,days_to_sell,daily_hold[,note]",
  "--apr          floorplan interest rate, % a year (default 9)",
  "--cash-rate    what your own cash in a unit could earn elsewhere, % a year (default 6)",
  "--line-value   what $1,000 of freed floorplan line earns per day on a replacement unit, dollars (default 0)",
  "--max-age      days on the lot by which the floorplan must be paid off; unsold units are wholesaled then (default 180)",
  "--curtail      curtailment schedule as day:percent of the floored amount, or none (default 90:10,120:10,150:10)",
  "--json         machine-readable output",
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad("Expected the plan command");
  const file = args.positional[0];
  if (!file) return bad("Give an inventory file, or - for stdin");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseUnits(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.units.length) return bad("No unit rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Units, wholesale-now first, then lowest earnings per $1,000 of line per day:"];
  p.ranked.forEach((r, i) => {
    const per = r.perLineDay === null ? "" : `  ${money(r.perLineDay)}/$1k line/day`;
    lines.push(
      `  ${i + 1}. ${r.stock}  day ${r.days}  ${r.action}` +
        `  carried ${money(r.carryToDate)} (${money(r.carryPerDay)}/day)  hold adds ${money(r.holdGain)}${per}  waiting leaves ${money(r.leftByWaiting)}`,
    );
  });
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.planValue)} expected from the lot vs ${money(t.waitValue)} waiting until each unit sells; line used ${Math.round(t.planLineDays / 1000).toLocaleString("en-US")} vs ${Math.round(t.waitLineDays / 1000).toLocaleString("en-US")} $1k-days.`);
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
