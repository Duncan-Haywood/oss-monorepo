#!/usr/bin/env node
// CLI: what Stripe and merchant-of-record platforms take from a monthly revenue figure, net payout,
// 12-month projection, and the revenue where the cheapest option changes. No network.
// Exit 0 ok, 1 over --max-fee-pct, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --revenue <usd/month> [--price <avg sale usd>] [--intl <pct international>] [--tax <usd/month filing cost if you are seller of record>] [--growth <pct/month>] [--months <n>] [--provider <key>] [--max-fee-pct <n>] [--prices file.json] [--json]
       node cli.mjs crossover [--price <n>] [--intl <pct>] [--tax <usd/month>] [--prices file.json] [--max <usd>] [--json]
       node cli.mjs providers

--prices is a JSON object of provider overrides merged over the defaults, e.g.
  {"paddle":{"pct":5,"fixed":0.5,"intlPct":0,"extraPct":0,"mor":true}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", pct: 0, fixed: 0, intlPct: 0, extraPct: 0, mor: false }), ...v };
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
const inputs = () => {
  const price = num("price", 29);
  if (price <= 0) fail("--price must be above 0");
  const intl = num("intl", 50);
  if (intl > 100) fail("--intl is a percentage from 0 to 100");
  return { avgPrice: price, intlShare: intl, selfTaxMonthly: num("tax", 100) };
};

if (cmd === "providers") {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) console.log(`${k.padEnd(13)} ${p.label.padEnd(54)} ${p.pct}% + $${p.fixed}${p.intlPct ? ` (+${p.intlPct}% intl)` : ""}${p.extraPct ? ` (+${p.extraPct}%)` : ""}  ${p.url}`);
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt.revenue === undefined) fail(`--revenue is required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const input = { revenue: num("revenue"), ...inputs() };
  const rows = compare(input, providers);
  const proj = project(input, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { maxPct: opt["max-fee-pct"] === undefined ? null : num("max-fee-pct"), provider: opt.provider || null });
  if (s.status === "error" && !s.overLimit) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ input, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${fmt(input.revenue)} a month, average sale ${fmt(input.avgPrice)}, ${input.intlShare}% international; ${fmt(input.selfTaxMonthly)}/mo tax filing if you are seller of record\n`);
    for (const r of rows) console.log(`${r.label.padEnd(54)} ${fmt(r.total).padStart(11)}/mo  ${String(r.effectivePct).padStart(5)}%  net ${fmt(r.net).padStart(12)}${r.extraVsBest ? `  (+${fmt(r.extraVsBest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month totals at ${num("growth", 0)}%/mo growth (${fmt(input.revenue)} -> ${fmt(proj.endRevenue)} a month):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(54)} costs ${fmt(t.totalCost).padStart(13)}   keeps ${fmt(t.totalNet).padStart(14)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote, not tax advice.`);
  }
  process.exit(s.overLimit ? 1 : 0);
} else if (cmd === "crossover") {
  const segs = cheapestSegments({ revenue: 0, ...inputs() }, loadProviders(opt.prices), num("max", 1000000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(9)} - ${String(s.to).padStart(9)} USD/mo   lowest cost: ${s.label}`);
} else fail(USAGE);
