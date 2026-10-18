#!/usr/bin/env node
// CLI: price uptime-monitoring services (UptimeRobot, Better Stack, Hyperping, Pingdom, self-hosted
// Uptime Kuma) for a number of monitors at a check interval, project 12 months of monitor growth and
// find the monitor count where the cheapest provider changes. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --monitors <n> [--interval-sec <s>] [--status-page] [--growth <pct/month>] [--months <n>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs crossover [--interval-sec <s>] [--status-page] [--max <monitors>] [--prices file.json] [--json]
       node cli.mjs providers

--interval-sec is the check interval you need (default 300). --prices is a JSON object of provider overrides,
merged over the defaults; a provider's "plans" array replaces its default plans, e.g.
  {"uptimerobot":{"plans":[{"name":"Team","usd":29,"monitors":100,"minIntervalSec":60,"statusPage":true}]}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", plans: [] }), ...v };
  return merged;
}

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = {};
const flags = new Set(["json", "status-page"]);
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
const money = (n) => (n == null ? "n/a" : fmt(n));

if (cmd === "providers") {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) {
    console.log(`${k.padEnd(12)} ${p.label}  ${p.url}`);
    for (const pl of p.plans) console.log(`             ${pl.name.padEnd(34)} $${String(pl.usd).padEnd(6)} ${String(pl.monitors).padStart(4)} monitors  >= ${pl.minIntervalSec}s  status page: ${pl.statusPage ? "yes" : "no"}${pl.extraMonitorUsd != null ? `  +$${pl.extraMonitorUsd}/extra monitor` : ""}`);
  }
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt.monitors === undefined) fail(`--monitors is required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const monitors = num("monitors"), interval = num("interval-sec", 300), sp = Boolean(opt["status-page"]);
  const rows = compare(monitors, interval, sp, providers);
  const proj = project(monitors, interval, sp, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && !s.overBudget) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ monitors, intervalSec: interval, statusPage: sp, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${n0(monitors)} monitors every ${interval}s${sp ? ", public status page" : ""}\n`);
    for (const r of rows) console.log(`${(r.label + (r.plan ? ` [${r.plan}]` : "")).padEnd(62)} ${r.monthly == null ? "no covering plan".padStart(12) : (fmt(r.monthly) + "/mo").padStart(12)}  ${money(r.annual).padStart(12)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month spend at ${num("growth", 0)}%/mo monitor growth (${n0(monitors)} -> ${n0(proj.endMonitors)} monitors at the end):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(62)} ${money(t.total).padStart(12)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else if (cmd === "crossover") {
  const segs = cheapestSegments(num("interval-sec", 300), Boolean(opt["status-page"]), loadProviders(opt.prices), num("max", 1000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(6)} - ${String(s.to).padStart(6)} monitors   cheapest: ${s.label}`);
} else fail(USAGE);
