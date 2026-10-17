#!/usr/bin/env node
// CLI: first-year and multi-year write-off of a business vehicle under regular MACRS, 100% bonus and
// Section 179, with the passenger-car 280F caps and the heavy-SUV 179 cap. No network.
// Exit 0 ok, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_LIMITS, LIMITS_AS_OF, CLASSES, compute, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --price <usd> --business-pct <0-100> [--class passenger|heavy_suv|exempt] [--tax-rate <pct>] [--income <usd>] [--miles <n>] [--limits file.json] [--json]
       node cli.mjs classes

--class: ${Object.entries(CLASSES).map(([k, v]) => `${k} = ${v}`).join("; ")}
--limits is a JSON object merged over the defaults, e.g. {"heavySuv179Cap":32000,"passengerCaps":{"year1WithBonus":20400}}`;

function fail(msg) { console.error(msg); process.exit(2); }

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) fail(`unexpected argument "${a}"\n${USAGE}`);
  const k = a.slice(2);
  if (k === "json") opt[k] = true;
  else { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); opt[k] = argv[++i]; }
}
const num = (k, d) => {
  if (opt[k] === undefined) return d;
  const n = Number(opt[k]);
  if (!Number.isFinite(n) || n < 0) fail(`--${k} needs a non-negative number, got "${opt[k]}"`);
  return n;
};

if (cmd === "classes") {
  for (const [k, v] of Object.entries(CLASSES)) console.log(`${k.padEnd(10)} ${v}`);
  console.log(`\n${LIMITS_AS_OF}`);
} else if (cmd === "compare") {
  if (opt.price === undefined || opt["business-pct"] === undefined) fail(`--price and --business-pct are required\n${USAGE}`);
  const klass = opt.class || "passenger";
  if (!CLASSES[klass]) fail(`unknown --class "${klass}"\n${USAGE}`);
  let limits = JSON.parse(JSON.stringify(DEFAULT_LIMITS));
  if (opt.limits) {
    try {
      const o = JSON.parse(readFileSync(opt.limits, "utf8"));
      limits = { ...limits, ...o, passengerCaps: { ...limits.passengerCaps, ...(o.passengerCaps || {}) } };
    } catch (e) { fail(`could not read --limits ${opt.limits}: ${e.message}`); }
  }
  const r = compute({ price: num("price"), businessPct: num("business-pct"), vehicleClass: klass, taxRate: num("tax-rate", 0), businessIncome: opt.income, miles: num("miles", 0) }, limits);
  if (r.status === "error") fail(r.text);
  if (opt.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`${r.text}\n`);
    for (const m of r.methods) {
      const years = m.schedule.map((v, i) => [i + 1, v]).filter(([, v]) => v > 0.5).map(([y, v]) => `y${y} ${fmt(v)}`).join("  ");
      console.log(`${m.label}\n  year one ${fmt(m.year1)}${m.taxSavedYear1 ? ` (tax saved ${fmt(m.taxSavedYear1)})` : ""}\n  ${years}`);
      for (const n of m.notes) console.log(`  - ${n}`);
    }
    if (r.mileage) console.log(`\nStandard mileage instead (no depreciation): ${fmt(r.mileage.deduction)} at ${r.mileage.rate}/mile`);
    for (const w of r.warnings) console.log(`\nNote: ${w}`);
    console.log(`\n${LIMITS_AS_OF}. Not tax advice.`);
  }
} else fail(USAGE);
