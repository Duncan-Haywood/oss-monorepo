#!/usr/bin/env node
// CLI: price hosted search (Algolia, Meilisearch Cloud, Typesense Cloud, Elastic Cloud,
// self-hosted) at an index size (thousands of records) and a monthly query volume (thousands
// of searches), project 12 months of growth and find the query level where the cheapest
// option changes. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --records-k <n> --searches-k <n> [--growth <pct/month>] [--months <n>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs crossover --records-k <n> [--prices file.json] [--max <searches K>] [--json]
       node cli.mjs providers

Volumes are in thousands: --records-k 500 is 500,000 records; --searches-k 2000 is 2 million searches a month.
--prices is a JSON object of provider overrides, merged over the defaults, e.g.
  {"algolia":{"perKSearches":0.4,"includedSearchesK":10}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", baseUsd: 0, includedRecordsK: 0, includedSearchesK: 0, freeSearchesPerKRecords: 0, perKRecords: 0, perKSearches: 0 }), ...v };
  return merged;
}

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = {};
const flags = new Set(["json"]);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) fail(`unexpected argument "${a}"\n${USAGE}`);
  const k = a.slice(2);
  if (flags.has(k)) opt[k] = true;
  else { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); opt[k] = argv[++i]; }
}
const num = (k, d) => {
  if (opt[k] === undefined) return d;
  const n = Number(opt[k]);
  if (!Number.isFinite(n) || n < 0) fail(`--${k} needs a non-negative number, got "${opt[k]}"`);
  return n;
};
const n0 = (n) => n.toLocaleString("en-US");

if (cmd === "providers") {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) console.log(`${k.padEnd(12)} ${p.label.padEnd(66)} $${p.baseUsd}/mo base  $${p.perKRecords}/K records  $${p.perKSearches}/K searches  ${p.url}`);
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt["records-k"] === undefined || opt["searches-k"] === undefined) fail(`--records-k and --searches-k are required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const records = num("records-k"), searches = num("searches-k");
  const rows = compare(records, searches, providers);
  const proj = project(records, searches, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && s.errors === 1 && !s.overBudget) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ recordsK: records, searchesK: searches, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${n0(records)}K records, ${n0(searches)}K searches a month\n`);
    for (const r of rows) console.log(`${r.label.padEnd(66)} ${fmt(r.monthly).padStart(12)}/mo  ${fmt(r.annual).padStart(14)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month spend at ${num("growth", 0)}%/mo growth (${n0(records)}K -> ${n0(proj.endRecords)}K records, ${n0(proj.endSearches)}K searches a month at the end):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(66)} ${fmt(t.total).padStart(14)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else if (cmd === "crossover") {
  if (opt["records-k"] === undefined) fail(`--records-k is required\n${USAGE}`);
  const segs = cheapestSegments(num("records-k"), loadProviders(opt.prices), num("max", 500000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(9)} - ${String(s.to).padStart(9)} K searches   cheapest: ${s.label}`);
} else fail(USAGE);
