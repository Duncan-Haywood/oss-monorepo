#!/usr/bin/env node
// Zero-dependency CLI: read a list of SaaS subscriptions, print the negotiation plan
// ranked by notice deadline and savings, optionally an email draft per vendor or an
// .ics calendar of notice deadlines. No network call -- local file/stdin only.
//
//   node cli.mjs plan renewals.csv --as-of 2026-10-02 --ask 10 --json
//   node cli.mjs ics renewals.csv > renewals.ics
//   cat renewals.csv | node cli.mjs email - --vendor Slack

import fs from "node:fs/promises";
import { parseRenewals, plan, summarize, emailDraft, toIcs, money, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--as-of": "asOf", "--buffer": "bufferPct", "--ask": "askPct", "--lead": "leadDays" };

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--vendor") args.vendor = argv[++i];
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
  "  node cli.mjs plan  <renewals.csv|-> [--as-of 2026-10-02] [--buffer 10] [--ask 10] [--lead 30] [--json]",
  "  node cli.mjs email <renewals.csv|-> --vendor <name> [same options]",
  "  node cli.mjs ics   <renewals.csv|-> [same options]",
  "",
  "Rows: vendor,annual_cost,renews_on,notice_days,auto_renew,seats_paid,seats_used,uplift_pct[,note]",
  "--as-of   today's date (default: today, UTC)",
  "--buffer  % of spare seats you keep above used seats (default 10)",
  "--ask     extra % off you ask for beyond right-sizing (default 10)",
  "--lead    days before the notice deadline to start negotiating (default 30)",
  "--json    machine-readable output (plan)",
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (!["plan", "email", "ics"].includes(args.sub)) return bad("Expected the plan, email or ics command");
  const file = args.positional[0];
  if (!file) return bad("Give a renewals file, or - for stdin");
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
  const parsed = parseRenewals(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.renewals.length) return bad("No subscription rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.sub === "ics") return { exitCode: 0, output: toIcs(p) };
  if (args.sub === "email") {
    if (!args.vendor) return bad("email needs --vendor <name>");
    const row = p.rows.find((r) => r.vendor.toLowerCase() === args.vendor.toLowerCase());
    if (!row) return bad(`No vendor named ${args.vendor}`);
    return { exitCode: 0, output: emailDraft(row) };
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", `Plan as of ${p.asOf}:`];
  p.rows.forEach((r, i) => {
    lines.push(`  ${i + 1}. ${r.vendor} [${r.status}] notice by ${r.noticeDeadline} (${r.daysToDeadline}d), start by ${r.startBy}; renew ${money(r.doNothing)} -> target ${money(r.floorTarget)}..${money(r.stretchTarget)}; save ${money(r.floorSavings)}..${money(r.stretchSavings)}`);
  });
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", MODEL_NOTE);
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
