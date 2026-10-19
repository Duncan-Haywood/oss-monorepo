#!/usr/bin/env node
// IDR offer sizing from a claims file, in a terminal.
//
//   node cli.mjs claims.csv --admin-fee 115 --entity-fee 700   # which claims to file, and the offer for each
//   node cli.mjs claims.csv --admin-fee 115 --entity-fee 700 --csv > idr.csv
//   node cli.mjs claims.csv --admin-fee 115 --entity-fee 700 --json
//   node cli.mjs --example
//   node cli.mjs --deadlines 2026-03-02 --holidays 2026-05-25,2026-06-19
//
// Same arithmetic as the web page (calc.mjs). Zero dependencies, no network: claim figures
// never leave the machine. Arithmetic on figures you type, not legal or billing advice.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { parseClaims, analyze, deadlines, reportCsv, sampleClaims, money, pct, DEFAULTS } from "./calc.mjs";

const USAGE = `Size No Surprises Act IDR offers and pick the claims worth filing.

Usage:
  node cli.mjs [options] <claims.csv | ->
  node cli.mjs --deadlines <YYYY-MM-DD> [--holidays d1,d2,...]

Input: one claim per line, "label, billed charge, QPA, amount already paid, offer (optional)"
(comma or tab separated, header optional).

Options:
  --admin-fee <n>        administrative fee per dispute (type the current figure; default 0)
  --entity-fee <n>       IDR entity fee per dispute (default 0)
  --per-dispute <n>      claims batched into one dispute (default 1)
  --staff <n>            your staff cost per dispute, in dollars (default 0)
  --p-qpa <pct>          win chance if you offer the QPA (default ${DEFAULTS.pWinAtQpa})
  --p-billed <pct>       win chance if you offer the billed charge (default ${DEFAULTS.pWinAtBilled})
  --payer-pct <pct>      payer's expected offer as % of QPA (default ${DEFAULTS.payerOfferPctQpa})
  --csv                  print the report as CSV
  --json                 print the full result as JSON
  --deadlines <date>     open-negotiation end and IDR initiation date from the initial payment/denial date
  --holidays <list>      comma-separated YYYY-MM-DD holidays to skip for --deadlines
  --example              run on the built-in invented claims
  -h, --help             this message

The win-chance curve is your assumption, not a prediction of an arbitrator's decision. The tool
carries no QPA, fee schedule or holiday calendar. Not legal or billing advice.
`;

const OPT_KEYS = {
  "--admin-fee": "adminFee", "--entity-fee": "entityFee", "--per-dispute": "claimsPerDispute",
  "--staff": "staffCost", "--p-qpa": "pWinAtQpa", "--p-billed": "pWinAtBilled", "--payer-pct": "payerOfferPctQpa",
};

export function parseArgs(argv) {
  const o = { file: null, opts: {}, csv: false, json: false, example: false, help: false, deadlines: null, holidays: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "--deadlines" || a === "--holidays" || OPT_KEYS[a]) {
      const v = argv[++i];
      if (v === undefined) return { error: `${a} needs a value.` };
      if (a === "--deadlines") o.deadlines = v;
      else if (a === "--holidays") o.holidays = v.replace(/,/g, " ");
      else o.opts[OPT_KEYS[a]] = v;
    } else if (a === "-" || !a.startsWith("-")) {
      if (o.file) return { error: "Give one claims file." };
      o.file = a;
    } else return { error: `Unknown option ${a}. Try --help.` };
  }
  return o;
}

export function render(r) {
  const out = [r.verdict, ""];
  for (const l of r.lines) {
    out.push(`${l.file ? "FILE" : "skip"}  ${l.label}: offer ${money(l.offerUsed)} (${pct(l.offerPctQpa, 0)} of QPA), win chance ${pct(l.p, 0)}, expected net ${money(l.ev)}, break-even ${l.breakEven === null ? "n/a" : pct(l.breakEven, 0)}`);
  }
  out.push("", `Disputes to open: ${r.disputes}; administrative fees committed: ${money(r.feesCommitted)}`);
  out.push("How much rides on the win-chance assumption:");
  for (const s of r.sensitivity) out.push(`  ${s.delta > 0 ? "+" : ""}${s.delta} pts: ${s.filing} claim(s) worth filing, total expected net ${money(s.totalEv)}`);
  for (const w of r.warnings) out.push(`Note: ${w}`);
  return out.join("\n") + "\n";
}

export async function main(argv, io = { read: (f) => readFile(f, "utf8"), stdin: () => readFile(0, "utf8") }) {
  const a = parseArgs(argv);
  if (a.error) return { code: 2, err: a.error + "\n" };
  if (a.help) return { code: 0, out: USAGE };
  if (a.deadlines) {
    const d = deadlines(a.deadlines, a.holidays);
    if (d.error) return { code: 2, err: d.error + "\n" };
    const lines = [`Open negotiation ends: ${d.negotiationEnds}`, `Start IDR by: ${d.initiateBy}`, ...d.warnings.map((w) => `Note: ${w}`)];
    return { code: 0, out: a.json ? JSON.stringify(d, null, 2) + "\n" : lines.join("\n") + "\n" };
  }
  let text;
  if (a.example) text = sampleClaims();
  else if (!a.file) return { code: 2, err: "Give a claims file, '-' for stdin, or --example. Try --help.\n" };
  else try { text = a.file === "-" ? await io.stdin() : await io.read(a.file); } catch (e) { return { code: 2, err: `Cannot read ${a.file}: ${e.message}\n` }; }
  const parsed = parseClaims(text);
  if (parsed.error) return { code: 2, err: parsed.error + "\n" };
  const r = analyze(parsed.rows, a.opts);
  if (r.error) return { code: 2, err: r.error + "\n" };
  r.warnings.push(...parsed.warnings);
  return { code: 0, out: a.json ? JSON.stringify(r, null, 2) + "\n" : a.csv ? reportCsv(r) : render(r) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await main(process.argv.slice(2));
  if (res.out) process.stdout.write(res.out);
  if (res.err) process.stderr.write(res.err);
  process.exitCode = res.code;
}
