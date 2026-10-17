#!/usr/bin/env node
// CLI: price object storage (S3, R2, B2, Wasabi, Spaces, Hetzner) at a stored volume and a
// monthly egress volume, project 12 months of growth and find the egress level where the
// cheapest provider changes. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --stored-gb <n> --egress-gb <n> [--growth <pct/month>] [--months <n>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs crossover --stored-gb <n> [--prices file.json] [--max <egress gb>] [--json]
       node cli.mjs providers

--prices is a JSON object of provider overrides, merged over the defaults, e.g.
  {"r2":{"storagePerGb":0.015,"includedStorageGb":10,"egressPerGb":0}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", baseUsd: 0, includedStorageGb: 0, minBilledStorageGb: 0, storagePerGb: 0, includedEgressGb: 0, egressFreeRatio: 0, egressPerGb: 0 }), ...v };
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
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) console.log(`${k.padEnd(8)} ${p.label.padEnd(58)} $${p.storagePerGb}/GB stored  $${p.egressPerGb}/GB egress  ${p.url}`);
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt["stored-gb"] === undefined || opt["egress-gb"] === undefined) fail(`--stored-gb and --egress-gb are required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const stored = num("stored-gb"), egress = num("egress-gb");
  const rows = compare(stored, egress, providers);
  const proj = project(stored, egress, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && s.errors === 1 && !s.overBudget) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ storedGb: stored, egressGb: egress, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${n0(stored)} GB stored, ${n0(egress)} GB egress a month\n`);
    for (const r of rows) console.log(`${r.label.padEnd(60)} ${fmt(r.monthly).padStart(12)}/mo  ${fmt(r.annual).padStart(14)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month spend at ${num("growth", 0)}%/mo growth (${n0(stored)} -> ${n0(proj.endStored)} GB stored, ${n0(proj.endEgress)} GB egress a month at the end):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(60)} ${fmt(t.total).padStart(14)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else if (cmd === "crossover") {
  if (opt["stored-gb"] === undefined) fail(`--stored-gb is required\n${USAGE}`);
  const segs = cheapestSegments(num("stored-gb"), loadProviders(opt.prices), num("max", 500000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(9)} - ${String(s.to).padStart(9)} GB egress   cheapest: ${s.label}`);
} else fail(USAGE);
