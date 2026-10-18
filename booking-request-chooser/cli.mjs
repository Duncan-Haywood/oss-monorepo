#!/usr/bin/env node
// Zero-dependency CLI: read a calendar of confirmed bookings and pending
// booking requests, print which requests to accept so the calendar earns the
// most, what each declined request costs you, and counter-offers worth
// sending. No network call -- local file/stdin only.
//
//   node cli.mjs plan calendar.csv --turnover 60 --night-value 50 --min-stay 3
//   cat calendar.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseCalendar, plan, summarize, isoDay, money, MODEL_NOTE } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--turnover") args.turnover = argv[++i];
    else if (a === "--night-value") args.nightValue = argv[++i];
    else if (a === "--min-stay") args.minStay = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else if (a.startsWith("-") && a !== "-") args.unknown = a;
    else args.positional.push(a);
  }
  return args;
}

const USAGE = [
  "Usage:",
  "  node cli.mjs plan <calendar.csv|-> [--turnover 60] [--night-value 50] [--min-stay 2] [--json]",
  "",
  "Rows: kind,check_in,check_out,price[,label] -- kind is booked (fixed) or request (decide).",
  "--turnover     cost of cleaning and changing over for each stay, dollars (default 0)",
  "--night-value  what a leftover night you can still sell is worth to you, dollars (default 0)",
  "--min-stay     your minimum stay in nights; shorter gaps cannot be sold (default 2)",
  "Exit 2 on bad input. Numbers are the ones you supply, not a forecast. No network call.",
].join("\n");

function bad(msg) {
  return { exitCode: 2, output: `${msg}\n\n${USAGE}` };
}

export async function run(argv, io = { readFile: (p) => fs.readFile(p, "utf8") }) {
  const args = parseArgs(argv);
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad(args.sub ? `Unknown command ${args.sub}` : "Missing command");
  const file = args.positional[0];
  if (!file) return bad("Missing calendar file (use - for stdin)");
  for (const [k, v] of [["--turnover", args.turnover], ["--night-value", args.nightValue], ["--min-stay", args.minStay]]) {
    if (v !== undefined && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${k} needs a number, zero or more`);
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseCalendar(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.requests.length) return bad("No request rows found in the calendar");
  const p = plan(parsed, { turnover: args.turnover, nightValue: args.nightValue, minStay: args.minStay });
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const range = (a, b) => `${isoDay(a)} to ${isoDay(b)}`;
  const lines = [summarize(p).text, "", "Accept:"];
  for (const c of p.chosen) lines.push(`  + ${range(c.start, c.end)}  ${money(c.price)}  ${c.label}`.trimEnd());
  if (!p.chosen.length) lines.push("  (none)");
  lines.push("", "Decline:");
  for (const d of p.declined) lines.push(`  - ${range(d.start, d.end)}  ${money(d.price)}  ${d.label} -- ${d.reason}`.replace(/  --/, " --"));
  if (!p.declined.length) lines.push("  (none)");
  if (p.counterOffers.length) {
    lines.push("", "Counter-offers (same nightly rate, plan improves):");
    for (const o of p.counterOffers) {
      const ext = [o.before ? `${o.before} night(s) earlier` : "", o.after ? `${o.after} night(s) later` : ""].filter(Boolean).join(" and ");
      lines.push(`  * ${o.label || `request on line ${o.line}`}: stay ${range(o.start, o.end)} (${ext}) for ${money(o.price)} -> plan +${money(o.gain)}`);
    }
  }
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} | arrival order ${money(t.firstComeFirstServed)} | highest price first ${money(t.highestPriceFirst)} | accept none ${money(t.noRequests)}`);
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
