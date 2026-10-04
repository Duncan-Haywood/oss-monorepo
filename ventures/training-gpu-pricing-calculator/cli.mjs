#!/usr/bin/env node
// CLI: price a GPU workload across GPU clouds (RunPod, Lambda, Vast.ai, CoreWeave, AWS, Google
// Cloud, Modal) by busy GPU-hours a month, compare with buying the card and find the hours where
// owning wins. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, DEFAULT_OWN, GPUS, PRICES_AS_OF, compare, ownCost, breakevenHours, project, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --gpu <${Object.keys(GPUS).join("|")}> --hours <busy gpu-hours/month> [--gpus <n>] [--utilization <pct>] [--storage-gb <n>] [--growth <pct/month>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs providers

--utilization is the share of rented time the GPU is actually busy (instances bill while up).
--prices is a JSON object of provider overrides, merged over the defaults, e.g.
  {"runpod":{"rates":{"h100":2.49}}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) {
    const base = merged[k] || { label: k, url: "", idleBilled: true, interruptionPct: 0, storagePerGbMonth: 0, rates: {} };
    merged[k] = { ...base, ...v, rates: { ...base.rates, ...(v.rates || {}) } };
  }
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
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) console.log(`${k.padEnd(10)} ${p.label.padEnd(40)} ${Object.entries(p.rates).map(([g, r]) => `${g} ${r == null ? "-" : "$" + r}`).join("  ")}`);
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  const gpu = opt.gpu;
  if (!gpu || !(gpu in GPUS)) fail(`--gpu must be one of ${Object.keys(GPUS).join(", ")}\n${USAGE}`);
  if (opt.hours === undefined) fail(`--hours is required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const input = { count: Math.max(1, num("gpus", 1)), busyHours: num("hours"), utilizationPct: num("utilization", 100), storageGb: num("storage-gb", 0) };
  const { rows, unavailable } = compare(gpu, input, providers);
  const own = ownCost(gpu, input);
  const proj = project(gpu, input, num("growth", 0), 12, providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && !s.overBudget) fail(s.text);
  const cheapRate = rows[0].rate;
  const be = breakevenHours(gpu, cheapRate, input);
  if (opt.json) console.log(JSON.stringify({ gpu, input, rows, unavailable, own, breakevenHours: be, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${input.count} x ${GPUS[gpu].label}, ${input.busyHours} busy GPU-hours a month at ${input.utilizationPct}% utilisation\n`);
    for (const r of rows) console.log(`${r.label.padEnd(42)} $${r.rate}/GPU-h ${fmt(r.monthly).padStart(12)}/mo ${fmt(r.annual).padStart(14)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    if (unavailable.length) console.log(`\nNot offered for this GPU: ${unavailable.map((u) => u.label).join(", ")}`);
    console.log(`\nBuy and run it yourself: ${fmt(own.monthly)}/mo (${fmt(own.depreciation)} depreciation + ${fmt(own.power)} power at ${DEFAULT_OWN.kwhUsd}/kWh over ${DEFAULT_OWN.months} months)`);
    console.log(be == null ? `Owning does not beat the cheapest rental (${rows[0].label}) at any hours a month.` : `Owning beats the cheapest rental above about ${be} busy GPU-hours a month.`);
    console.log(`\n12-month spend at ${num("growth", 0)}%/mo growth in busy hours (${input.busyHours} -> ${proj.endBusyHours}):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(50)} ${fmt(t.total).padStart(14)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else fail(USAGE);
