#!/usr/bin/env node
// Zero-dependency CLI: read a list of consignment items, print the best
// markdown schedule for each, which items to decline at intake and the total
// against a fixed 30/60-day rule. No network call -- local file/stdin only.
//
//   node cli.mjs plan items.csv --weeks 12 --lift 0.35 --levels 0,10,25,40,50
//   cat items.csv | node cli.mjs plan - --json

import fs from "node:fs/promises";
import { parseItems, plan, summarize, money, pct, MODEL_NOTE } from "./engine.mjs";

const FLAGS = { "--weeks": "weeks", "--lift": "lift", "--cap": "cap", "--handling": "handling", "--slow": "slow", "--levels": "levels" };

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
  "  node cli.mjs plan <items.csv|-> [--weeks 12] [--lift 0.35] [--levels 0,10,25,40,50] [--handling 2] [--cap 95] [--slow 60] [--json]",
  "",
  "Rows: name,price,weekly_sell_pct,shop_share_pct,shelf_cost_per_week[,weeks][,note]",
  "--weeks      weeks an item stays on the floor (default 12; a row's own weeks wins)",
  "--lift       extra weekly sell chance per 10% off, as a multiple of the base rate (default 0.35)",
  "--levels     markdown levels you will use, percent, comma-separated (default 0,10,25,40,50)",
  "--handling   tagging and steaming cost per item, dollars (default 2)",
  "--cap        highest weekly sell chance allowed, percent (default 95)",
  "--slow       sell rate as a percent of your estimate for the slow-season re-check (default 60)",
  "--json       machine-readable output",
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "plan") return bad("Expected the plan command");
  const file = args.positional[0];
  if (!file) return bad("Give an items file, or - for stdin");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (flag !== "--levels" && !(v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0)) return bad(`${flag} needs a number, zero or more`);
    if (flag === "--levels" && !v) return bad("--levels needs a list like 0,10,25,40,50");
    opts[FLAGS[flag]] = v;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseItems(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.items.length) return bad("No item rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Items:"];
  for (const x of p.items) {
    lines.push(`  ${x.accept ? "+" : "-"} ${x.name}  net ${money(x.net)}  sells ${pct(x.plan.sold * 100)}  ${x.schedule}  (fixed rule ${money(x.standard.net)}, never mark down ${money(x.noMarkdown.net)})`);
  }
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  const t = p.totals;
  lines.push("", `Plan ${money(t.plan)} | fixed 30/60 rule ${money(t.standard)} | never mark down ${money(t.noMarkdown)} | plan if sell rates hit ${p.options.slow}%: ${money(t.slowSeason)}`);
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
