#!/usr/bin/env node
// node cli.mjs prospects.csv --start 2026-10-26 --tz America/Denver --sender sender.json [--cadence b2b-classic]
//   [--suppress suppression.txt] [--holidays 2026-11-26,2026-11-27] [--csv tasks.csv] [--ics cadence.ics]
// Plans the cadence and writes a task CSV and a calendar file. It never sends, dials or posts anything.
import { readFileSync, writeFileSync } from "node:fs";
import { buildPlan, toCsv, toIcs, CADENCES } from "./calc.mjs";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!file || args.includes("--help")) {
  console.log(`usage: node cli.mjs prospects.csv --start YYYY-MM-DD --tz <IANA zone> --sender sender.json [--cadence ${Object.keys(CADENCES).join("|")}] [--suppress file] [--holidays d1,d2] [--csv out.csv] [--ics out.ics]`);
  process.exit(file ? 0 : 2);
}
const sender = flag("sender") ? JSON.parse(readFileSync(flag("sender"), "utf8")) : {};
const plan = buildPlan(readFileSync(file, "utf8"), sender, {
  cadence: flag("cadence"), start: flag("start"), sellerTz: flag("tz"),
  suppression: flag("suppress") ? readFileSync(flag("suppress"), "utf8") : "",
  holidays: (flag("holidays") || "").split(",").filter(Boolean),
});
const s = plan.summary;
console.log(`${s.included} of ${s.prospects} prospects in the cadence, ${s.tasks} touches from ${s.first} to ${s.last}: ${Object.entries(s.byChannel).map(([k, v]) => `${v} ${k}`).join(", ")}.`);
for (const p of plan.people) {
  if (p.excluded) console.log(`  left out row ${p.row} (${p.first_name || p.email}): ${p.excluded}`);
  for (const [ch, why] of Object.entries(p.dropped)) console.log(`  row ${p.row} no ${ch}: ${why}`);
}
if (s.blocked) console.log(`${s.blocked} touches need a fix before use (see the issues column).`);
writeFileSync(flag("csv") || "cadence-tasks.csv", toCsv(plan.tasks));
writeFileSync(flag("ics") || "cadence.ics", toIcs(plan.tasks));
console.log(`wrote ${flag("csv") || "cadence-tasks.csv"} and ${flag("ics") || "cadence.ics"}`);
process.exit(s.blocked ? 1 : 0);
