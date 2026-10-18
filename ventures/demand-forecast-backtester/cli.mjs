#!/usr/bin/env node
// Demand forecast back-test and reorder points from a sales export, in a terminal.
//
//   node cli.mjs sales.csv                         # summary, findings, per-SKU table
//   node cli.mjs --period month --lead 45 --service 97 sales.csv
//   node cli.mjs --csv sales.csv > reorder.csv     # one row per SKU, for a spreadsheet
//   node cli.mjs --json sales.csv                  # machine-readable
//   cat sales.csv | node cli.mjs -                 # read stdin
//   node cli.mjs --example                         # run on the built-in synthetic data
//
// Zero dependencies, no network: the file is read locally and nothing is sent.
// Same analysis as the web page (calc.mjs).

import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseSales, analyze, reportCsv, sampleText, pct, num } from "./calc.mjs";

const USAGE = `Back-test demand forecasts per SKU and get safety stock and reorder points.

Usage:
  node cli.mjs [options] <file.csv | ->

Options:
  --period week|month  bucket sales by week (default) or month
  --lead <days>        supplier lead time plus review period in days (default 14)
  --service <percent>  target in-stock probability, 50 to 99.9 (default 95)
  --keep-partial       keep a part-filled first or last period (default drops them)
  --top <n>            rows in the text table (default 15)
  --csv                one row per SKU as CSV
  --json               the full result as JSON
  --example            use built-in synthetic data
  -h, --help           this text

Input: one row per sale or per day, with a date, a SKU and units sold.`;

export function parseArgs(argv) {
  const o = { period: "week", lead: 14, service: 95, top: 15, partial: "auto", csv: false, json: false, example: false, file: null, help: false };
  const num = (flag, v) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${flag} needs a number`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--period") { o.period = argv[++i]; if (!["week", "month"].includes(o.period)) throw new Error("--period must be week or month"); }
    else if (a === "--lead") o.lead = num(a, argv[++i]);
    else if (a === "--service") o.service = num(a, argv[++i]);
    else if (a === "--top") o.top = num(a, argv[++i]);
    else if (a === "--keep-partial") o.partial = "keep";
    else if (a === "--csv") o.csv = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "-") o.file = "-";
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.file = a;
  }
  if (o.csv && o.json) throw new Error("use only one of --csv and --json");
  return o;
}

export function run(text, opts = {}) {
  const lead = opts.lead ?? 14, service = opts.service ?? 95;
  if (!(lead >= 1 && lead <= 365)) return { error: "lead time must be between 1 and 365 days" };
  if (!(service >= 50 && service <= 99.9)) return { error: "service level must be between 50 and 99.9 percent" };
  const parsed = parseSales(text);
  if (parsed.error) return { error: parsed.error };
  const result = analyze(parsed.rows, { period: opts.period || "week", leadDays: lead, serviceLevel: service / 100, partial: opts.partial || "auto" });
  if (result.error) return { error: result.error };
  return { result, parsed };
}

export function render(result, parsed, opts = {}) {
  const s = result.summary;
  const out = [];
  out.push(`${s.skus} SKUs, ${s.periods} ${s.period}s (${s.startLabel} to ${s.endLabel}); lead time ${s.leadDays} days = ${s.horizon} ${s.period}(s); service level ${pct(s.service)}`);
  if (s.pooledWape !== null) out.push(`Lead-time error on unseen back-test points: ${pct(s.pooledWape)} with the chosen methods, ${pct(s.pooledNaiveWape)} repeating last ${s.period} (${s.beatNaive} of ${s.tested} SKUs clearly better)`);
  out.push("", "Findings");
  for (const f of result.findings) out.push(`  [${f.severity}] ${f.title}. ${f.detail}`);
  out.push("", `Top ${opts.top ?? 15} SKUs by volume`);
  out.push(["SKU".padEnd(18), "ABC", "XYZ", "Method".padEnd(30), "Demand".padStart(8), "Safety".padStart(8), "Reorder".padStart(8), "Err".padStart(5), "Naive".padStart(6)].join(" "));
  for (const k of result.skus.slice(0, opts.top ?? 15)) {
    out.push([k.sku.slice(0, 18).padEnd(18), k.abc.padEnd(3), k.xyz.padEnd(3), k.methodLabel.padEnd(30), num(k.leadDemand).padStart(8), num(k.safetyStock).padStart(8), num(k.reorderPoint).padStart(8), pct(k.wape).padStart(5), pct(k.naiveWape).padStart(6)].join(" "));
  }
  if (parsed.skipped) out.push("", `${parsed.skipped} unreadable rows skipped (lines ${parsed.skippedLines.join(", ")}${parsed.skipped > parsed.skippedLines.length ? ", ..." : ""}).`);
  return out.join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}\n\n${USAGE}`); process.exit(2); }
  if (o.help || (!o.file && !o.example)) { console.log(USAGE); process.exit(o.help ? 0 : 2); }
  let text;
  try { text = o.example ? sampleText() : o.file === "-" ? await readStdin() : await readFile(o.file, "utf8"); }
  catch (e) { console.error(`error: cannot read ${o.file}: ${e.message}`); process.exit(2); }
  // The built-in example is monthly.
  const { result, parsed, error } = run(text, { ...o, period: o.example && o.period === "week" ? "month" : o.period, lead: o.example && o.lead === 14 ? 60 : o.lead });
  if (error) { console.error(`error: ${error}`); process.exit(2); }
  if (o.json) console.log(JSON.stringify(result, null, 2));
  else if (o.csv) process.stdout.write(reportCsv(result));
  else console.log(render(result, parsed, o));
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href) await main();
