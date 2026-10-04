#!/usr/bin/env node
// CLI: price hosted feature-flag services at a monthly volume of flag requests (thousands), project 12 months of
// growth and find the volume where the cheapest provider changes. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --kreq <thousand-requests> [--growth <pct/month>] [--months <n>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs crossover [--prices file.json] [--max <thousand-requests>] [--json]
       node cli.mjs providers

--prices is a JSON object of provider overrides, merged over the defaults, e.g.
  {"posthog":{"freeK":1000,"plans":[{"k":0,"price":0}],"overagePerK":0.1}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", freeK: 0, plans: [{ k: 0, price: 0 }], overagePerK: 0 }), ...v };
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

if (cmd === "providers") {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) console.log(`${k.padEnd(10)} ${p.label.padEnd(40)} free to ${p.freeK} K req  ${p.url}`);
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt.kreq === undefined) fail(`--kreq is required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const kreq = num("kreq");
  const rows = compare(kreq, providers);
  const proj = project(kreq, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && s.errors === 1 && !s.overBudget) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ kreq, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${kreq.toLocaleString("en-US")} thousand requests a month\n`);
    for (const r of rows) console.log(`${r.label.padEnd(40)} ${fmt(r.monthly).padStart(12)}/mo  ${fmt(r.annual).padStart(14)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month spend at ${num("growth", 0)}%/mo growth (${kreq.toLocaleString("en-US")} -> ${proj.endVolume.toLocaleString("en-US")} thousand requests a month):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(40)} ${fmt(t.total).padStart(14)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else if (cmd === "crossover") {
  const segs = cheapestSegments(loadProviders(opt.prices), num("max", 5000000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(9)} - ${String(s.to).padStart(9)} K req   cheapest: ${s.label}`);
} else fail(USAGE);
