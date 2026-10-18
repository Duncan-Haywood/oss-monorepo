#!/usr/bin/env node
// Zero-dependency CLI: price a bookkeeping retainer, or rank an existing
// client roster by effective hourly. No network call -- local files/stdin only.
//
//   node cli.mjs price --transactions 420 --accounts 4 --cleanliness messy --competitor 500
//   node cli.mjs roster clients.csv --target 80
//   cat clients.csv | node cli.mjs roster - --json

import fs from "node:fs/promises";
import { price, summarizePrice, parseRoster, roster, summarizeRoster, money, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = {
  "--transactions": "transactions", "--accounts": "accounts", "--payroll": "payrollRuns", "--arap": "arApItems",
  "--salestax": "salesTaxFilings", "--cleanup": "cleanupMonths", "--cleanliness": "cleanliness",
  "--min-clean": "minClean", "--min-average": "minAverage", "--min-messy": "minMessy",
  "--recon-minutes": "reconMinutes", "--payroll-minutes": "payrollMinutes", "--arap-minutes": "arApMinutes",
  "--salestax-minutes": "salesTaxMinutes", "--review-minutes": "reviewMinutes", "--cleanup-multiplier": "cleanupMultiplier",
  "--software": "software", "--target": "targetHourly", "--buffer": "bufferPct", "--walkaway": "walkAwayPct",
  "--competitor": "competitorFee",
};

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
  "  node cli.mjs price [--transactions 300] [--accounts 3] [--payroll 1] [--arap 40] [--salestax 1] [--cleanup 0]",
  "                     [--cleanliness clean|average|messy] [--software 40] [--target 75] [--buffer 20]",
  "                     [--walkaway 75] [--competitor 600] [--json]",
  "  node cli.mjs roster <clients.csv|-> [--target 75] [--json]",
  "",
  "Minutes per transaction: --min-clean 0.5  --min-average 1  --min-messy 2",
  "Minutes per unit: --recon-minutes 20 (per account)  --payroll-minutes 25  --arap-minutes 3  --salestax-minutes 45  --review-minutes 30 (fixed)",
  "--cleanup N months of catch-up (one-time fee)   --cleanup-multiplier 1.25 (catch-up is slower)",
  "--target your hourly rate   --buffer percent added to the minimum for the quote   --walkaway percent of target as the floor rate",
  "Roster rows: client,fee,hours[,software]",
  `Up to 200 clients. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "price" && args.sub !== "roster") return bad("Expected the price or roster command");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    opts[FLAGS[flag]] = v;
  }
  if (args.sub === "price") {
    let p;
    try { p = price(opts); } catch (e) { return bad(e.message); }
    if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
    const lines = [summarizePrice(p).text, "", `Monthly work: ${p.hours.toFixed(2)} hours (${p.minutes.toFixed(0)} minutes)`];
    for (const [k, v] of Object.entries(p.parts)) lines.push(`  ${k}: ${v.toFixed(0)} min`);
    lines.push("", `Minimum fee      ${money(p.minimum)}`, `Recommended fee  ${money(p.recommended)}`, `Walk-away price  ${money(p.walkAway)}`);
    if (p.options.cleanupMonths > 0) lines.push(`One-time cleanup ${money(p.cleanupQuote)} (${p.cleanupHours.toFixed(1)} hours)`);
    if (p.competitor) lines.push(`At ${money(p.competitor.fee)}: ${money(p.competitor.effectiveHourly)} an hour (${p.competitor.status})`);
    lines.push("", "By state of the books (minimum fee):");
    for (const [c, v] of Object.entries(p.byCleanliness)) lines.push(`  ${c}: ${money(v.minimum)} (${v.hours.toFixed(2)} hours)`);
    lines.push(MODEL_NOTE);
    return { exitCode: 0, output: lines.join("\n") };
  }
  const file = args.positional[0];
  if (!file) return bad("Give a clients file, or - for stdin");
  let text;
  try { text = file === "-" ? await readStdin() : await io.readFile(file); } catch (e) { return bad(`Cannot read ${file}: ${e.message}`); }
  const parsed = parseRoster(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.clients.length) return bad("No client rows found");
  let r;
  try { r = roster(parsed, opts); } catch (e) { return bad(e.message); }
  if (args.json) return { exitCode: 0, output: JSON.stringify(r, null, 2) };
  const lines = [summarizeRoster(r).text, "", "Worst effective hourly first:"];
  r.clients.forEach((c, i) => {
    lines.push(`  ${i + 1}. ${c.name}  ${money(c.fee)} for ${c.hours} h = ${money(c.effective)}/h  ${c.atTarget ? "at target" : `raise by ${money(c.raise)} (${pct(c.raisePct, 0)}) to ${money(c.neededFee)}`}`);
  });
  lines.push("", `Total fees ${money(r.fee)}, ${r.hours.toFixed(1)} hours, blended ${money(r.blendedHourly)}/h; at target ${money(r.blendedAtTarget)}/h`, MODEL_NOTE);
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
