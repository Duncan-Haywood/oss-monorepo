#!/usr/bin/env node
// node cli.mjs schedule.xer [--json] [--csv findings.csv] [--project CODE]
// Prints the DCMA 14-point assessment of a Primavera P6 XER file.
import { readFileSync, writeFileSync } from "node:fs";
import { parseXer, decodeXer } from "./xer.mjs";
import { assess, findingsCsv } from "./dcma.mjs";

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith("--") && !["--csv", "--project"].includes(args[i - 1]));
if (!file) {
  console.error("usage: node cli.mjs schedule.xer [--json] [--csv findings.csv] [--project CODE]");
  process.exit(2);
}
const xer = parseXer(decodeXer(readFileSync(file)));
let projId = null;
if (args.includes("--project")) {
  const code = args[args.indexOf("--project") + 1];
  projId = (xer.tables.PROJECT || []).find((p) => p.proj_short_name === code)?.proj_id ?? null;
  if (!projId) { console.error(`no project ${code}`); process.exit(2); }
}
const report = assess(xer, { projId });
if (args.includes("--csv")) writeFileSync(args[args.indexOf("--csv") + 1], findingsCsv(report));
if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const p = report.project;
  console.log(`${p.name}  (P6 ${p.version}; data date ${p.dataDate}; forecast finish ${p.finish}${p.mustFinish ? `; must finish by ${p.mustFinish}` : ""})`);
  console.log(`${p.open} open of ${p.activities} activities, ${p.relationships} relationships`);
  for (const w of report.warnings) console.log(`WARNING: ${w}`);
  console.log(`DCMA 14-point: ${report.passed} of 14 pass\n`);
  for (const c of report.checks) {
    const v = c.value === null ? "n/a" : `${typeof c.value === "number" ? (Math.abs(c.value) < 10 ? Math.round(c.value * 1000) / 1000 : Math.round(c.value * 10) / 10) : c.value}${c.unit ? " " + c.unit : ""}`;
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${String(c.id).padStart(2)}. ${c.name.padEnd(36)} ${v.padEnd(22)} (${c.threshold})${c.total ? `  ${c.count}/${c.total}` : ""}`);
  }
  console.log("");
  for (const e of report.extra) console.log(`${e.pass ? "ok  " : "warn"}  ${e.name}: ${e.count}`);
  console.log(report.recompute.compared
    ? `\nRecomputed vs stored: ${report.recompute.matched} of ${report.recompute.compared} open activities agree on early finish, late finish and total float.`
    : "\nThe file stores no early and late dates to compare with (it was not scheduled before export).");
  console.log(`Driving path: ${report.drivingPath.length} activities, ${report.drivingPath.slice(0, 3).map((d) => d.code).join(", ")}${report.drivingPath.length > 3 ? " ... " + report.drivingPath.at(-1).code : ""}`);
}
