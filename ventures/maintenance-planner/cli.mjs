#!/usr/bin/env node
// maintenance-planner from the command line: read the data file the page
// exports and print what is due, the parts to order and the reliability
// readings. A cron job can run it each morning and mail the output.
//
//   node cli.mjs data.json [--today YYYY-MM-DD] [--csv] [--json] [--example]

import { readFileSync } from "node:fs";
import { normalize } from "./store.mjs";
import { summarize, toCsv, PLAN_COLUMNS } from "./report.mjs";
import { parseDay } from "./schedule.mjs";
import { exampleData } from "./example.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
if (flag("--help") || flag("-h") || (!args.length)) {
  console.log(`usage: node cli.mjs data.json [--today YYYY-MM-DD] [--csv | --json]
       node cli.mjs --example        (runs on the invented example plant)

Prints overdue and due preventive maintenance, open work orders, parts at or
below their reorder point, and each asset's failure pattern.

No warranty. This tool is provided free and as-is, without warranty of any
kind. It is not engineering or safety advice and does not replace a qualified
professional or the equipment maker's instructions. You are responsible for
reviewing its output before relying on it.`);
  process.exit(args.length ? 0 : 2);
}
const todayArg = opt("--today");
const today = todayArg ? parseDay(todayArg) : Math.floor(Date.now() / 86400000);
if (today === null) { console.error("--today must be YYYY-MM-DD"); process.exit(2); }
let data;
if (flag("--example")) data = exampleData(today);
else {
  const file = args.find((a) => !a.startsWith("--") && a !== todayArg);
  const { data: d, problems } = normalize(JSON.parse(readFileSync(file, "utf8")));
  for (const p of problems) console.error(`warning: ${p}`);
  data = d;
}
const s = summarize(data, today);
if (flag("--json")) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
if (flag("--csv")) { process.stdout.write(toCsv(s.plans, PLAN_COLUMNS)); process.exit(0); }
const c = s.counts;
console.log(`Maintenance on ${s.today}: ${c.overdue} overdue, ${c.due} due soon, ${c.openWorkOrders} open work orders (${c.backlogHours} h), ${c.partsToOrder} parts to order. PM compliance ${s.compliancePct ?? "n/a"}%.`);
for (const p of s.plans.filter((x) => x.status === "overdue" || x.status === "due")) {
  const when = p.daysLeft < 0 ? `${-p.daysLeft} d late` : p.daysLeft === 0 ? "today" : `in ${p.daysLeft} d`;
  console.log(`  ${p.status.toUpperCase().padEnd(8)} ${p.due} (${when}, by ${p.dueBy})  ${p.asset}: ${p.title}${p.meterLeft !== null ? `  [meter ${p.meterNow} of ${p.meterDue}]` : ""}`);
}
const order = s.parts.filter((p) => p.status !== "ok");
if (order.length) console.log("Parts:");
for (const p of order) console.log(`  ${p.status.toUpperCase().padEnd(8)} ${p.name}: available ${p.available}, reorder at ${p.reorderPoint}, suggest ${p.suggestOrder}`);
console.log("Failure patterns:");
for (const r of s.reliability.filter((x) => x.failures)) console.log(`  ${r.asset}: ${r.failures} failures, MTBF ${r.mtbf === null ? "n/a" : r.mtbf.toFixed(0)} ${r.unit}, MTTR ${r.mttr === null ? "n/a" : `${r.mttr.toFixed(1)} h`}. ${r.reading.pattern}.${r.replacement?.optimal ? ` Replace at ${Math.round(r.replacement.optimal)} ${r.unit}: cost per ${r.unit === "days" ? "day" : r.unit.replace(/s$/, "")} ${Math.round(r.replacement.saving * 100)}% below running to failure.` : ""}`);
