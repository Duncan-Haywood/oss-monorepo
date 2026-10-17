#!/usr/bin/env node
// Zero-dependency CLI: read a list of cards with your own value and grade
// estimates, print which to send to a grader (and which tier), which to sell
// raw, the break-even chance of a 10 for each, and the downside. No network
// call -- local files/stdin only.
//
//   node cli.mjs pick cards.csv --budget 400 --max-cards 20 --ship 8
//   cat cards.csv | node cli.mjs pick - --tiers my-tiers.csv --json

import fs from "node:fs/promises";
import { parseCards, parseTiers, plan, summarize, money, pct, MODEL_NOTE, DEFAULT_TIERS_TEXT } from "./engine.mjs";

const FLAGS = {
  "--tiers": "tiersFile", "--ship": "shipPerCard", "--sell-fee": "sellFeePct", "--sell-fixed": "sellFixed",
  "--rate": "annualRate", "--budget": "budget", "--max-cards": "maxCards", "--condition": "defaultCondition", "--min-uplift": "minUplift",
};

function parseArgs(argv) {
  const args = { json: false, positional: [], opts: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--example-tiers") args.exampleTiers = true;
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
  "  node cli.mjs pick <cards.csv|-> [--tiers tiers.csv] [--ship 8] [--sell-fee 13] [--sell-fixed 0.30] [--rate 10]",
  "                                  [--budget 400] [--max-cards 20] [--condition clean] [--min-uplift 0] [--json]",
  "  node cli.mjs --example-tiers    print the illustrative fee table to edit",
  "",
  "Rows: name,raw,v10,v9,v8,v7_or_lower,p10,p9,p8[,note]   (p's are YOUR estimates; remainder is grade 7 or lower)",
  "      p10 may be a word (sharp, clean, fair, worn) for an illustrative default chance table",
  "Tiers: name,fee_per_card,max_declared_value,turnaround_days   (the built-in table is an EXAMPLE, update it from the grader's price list)",
  "--ship       shipping and insurance per card to the grader and back, dollars (default 8)",
  "--sell-fee   marketplace fee percent on a sale (default 13)",
  "--sell-fixed fixed fee per sale, dollars (default 0.30)",
  "--rate       your annual discount rate percent for waiting out the turnaround (default 10)",
  "--budget     cap on total grading spend (fees + shipping); blank = no cap",
  "--max-cards  cap on cards per submission; blank = no cap",
  "--json       machine-readable output",
  `Up to 120 cards. ${MODEL_NOTE}`,
].join("\n");

export async function run(argv, io = { readFile: (f) => fs.readFile(f, "utf8") }) {
  const args = parseArgs(argv);
  const bad = (message) => ({ exitCode: 2, output: `${message}\n\n${USAGE}` });
  if (args.help) return { exitCode: 0, output: USAGE };
  if (args.exampleTiers) return { exitCode: 0, output: DEFAULT_TIERS_TEXT.trimEnd() };
  if (args.unknown) return bad(`Unknown option ${args.unknown}`);
  if (args.sub !== "pick") return bad("Expected the pick command");
  const file = args.positional[0];
  if (!file) return bad("Give a cards file, or - for stdin");
  const opts = {};
  for (const [flag, v] of Object.entries(args.opts)) {
    if (v === undefined || v === "") return bad(`${flag} needs a value`);
    if (flag === "--tiers") continue;
    opts[FLAGS[flag]] = v;
  }
  if (args.opts["--tiers"] !== undefined) {
    let t;
    try { t = parseTiers(await io.readFile(args.opts["--tiers"])); } catch (e) { return bad(`Cannot read ${args.opts["--tiers"]}: ${e.message}`); }
    if (t.errors.length) return bad(t.errors.join("\n"));
    opts.tiers = t.tiers;
  }
  let text;
  try {
    text = file === "-" ? await readStdin() : await io.readFile(file);
  } catch (e) {
    return bad(`Cannot read ${file}: ${e.message}`);
  }
  const parsed = parseCards(text);
  if (parsed.errors.length) return bad(parsed.errors.join("\n"));
  if (!parsed.cards.length) return bad("No card rows found");
  let p;
  try {
    p = plan(parsed, opts);
  } catch (e) {
    return bad(e.message);
  }
  if (args.json) return { exitCode: 0, output: JSON.stringify(p, null, 2) };
  const lines = [summarize(p).text, "", "Send to the grader (best first):"];
  p.submit.forEach((c, i) => {
    const be = c.breakEven.status === "always" ? "grading wins at any chance of a 10" : c.breakEven.status === "never" ? "no chance of a 10 within your other odds makes it win" : `wins above a ${pct(c.breakEven.p10)} chance of a 10 (you said ${pct(c.probs.p10)})`;
    lines.push(`  ${i + 1}. ${c.name}  tier ${c.tier} (${money(c.cost)} fee+ship, ${c.tierDays} days)  expected +${money(c.uplift)} vs raw`);
    lines.push(`     ${be}; ${pct(c.pLoseVsRaw, 0)} chance of ending below selling raw; worst case ${money(c.worst.vsRaw)} vs raw (grade ${c.worst.grade})`);
  });
  if (!p.submit.length) lines.push("  (none)");
  lines.push("", "Sell raw / hold:");
  for (const h of p.hold) lines.push(`  - ${h.name}: ${h.reason}${h.uplift === null ? "" : ` (expected ${money(h.uplift)} vs raw)`}`);
  if (!p.hold.length) lines.push("  (none)");
  for (const f of p.findings) lines.push("", `[${f.severity}] ${f.rule}: ${f.message}`);
  lines.push("", `Plan: spend ${money(p.spend)}, expected ${money(p.uplift)} more than selling raw`);
  for (const b of p.baselines) lines.push(`  ${b.label}: ${b.cards} cards, spend ${money(b.spend)}, expected ${money(b.uplift)} more than raw`);
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
