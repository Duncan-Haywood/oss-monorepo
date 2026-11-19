#!/usr/bin/env node
// node cli.mjs schedule.xer [--json] [--csv findings.csv] [--schedule activities.csv] [--project CODE]
// Prints the DCMA 14-point assessment of a Primavera P6 XER file.
// node cli.mjs current.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
// Compares two updates of the same project instead (compare.mjs).
// Either form takes --report review.html [--to NAME] [--from NAME] [--ref TEXT]
// [--notes TEXT]: the written review (report.mjs) to print or save as a PDF.
import { readFileSync, writeFileSync } from "node:fs";
import { parseXer, decodeXer } from "./xer.mjs";
import { assess, findingsCsv, scheduleCsv } from "./dcma.mjs";
import { compare, compareCsv, compareText } from "./compare.mjs";
import { reviewHtml, reviewItems } from "./report.mjs";

const args = process.argv.slice(2);
const VALUED = ["--csv", "--project", "--previous", "--schedule", "--report", "--to", "--from", "--ref", "--notes"];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
function writeReview(report, cmp) {
  if (!args.includes("--report")) return;
  writeFileSync(opt("--report"), reviewHtml(report, cmp, { recipient: opt("--to"), reviewer: opt("--from"), reference: opt("--ref"), notes: opt("--notes") }));
  const items = reviewItems(report, cmp), n = (s) => items.filter((x) => x.severity === s).length;
  console.error(`review written to ${opt("--report")}: ${items.length} corrections (${n("high")} high, ${n("medium")} medium, ${n("low")} low)`);
}
const file = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
if (!file) {
  console.error("usage: node cli.mjs schedule.xer [--report review.html] [--json] [--csv findings.csv] [--schedule activities.csv] [--project CODE]\n       node cli.mjs current.xer --previous previous.xer [--json] [--csv changes.csv] [--project CODE]");
  process.exit(2);
}
const xer = parseXer(decodeXer(readFileSync(file)));
const projectFor = (x) => {
  const code = args[args.indexOf("--project") + 1];
  const id = (x.tables.PROJECT || []).find((p) => p.proj_short_name === code)?.proj_id ?? null;
  if (!id) { console.error(`no project ${code}`); process.exit(2); }
  return id;
};
if (args.includes("--previous")) {
  const prev = parseXer(decodeXer(readFileSync(args[args.indexOf("--previous") + 1])));
  const ids = args.includes("--project") ? { curProjId: projectFor(xer), prevProjId: projectFor(prev) } : {};
  // the review's assessment and the comparison must describe the same project
  const cur = args.includes("--report") ? assess(xer, { projId: ids.curProjId ?? null }) : null;
  const rep = compare(prev, xer, cur ? { ...ids, curProjId: cur.project.id } : ids);
  writeReview(cur, rep);
  if (args.includes("--csv")) writeFileSync(args[args.indexOf("--csv") + 1], compareCsv(rep));
  process.stdout.write(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : compareText(rep));
  process.exit(0);
}
const projId = args.includes("--project") ? projectFor(xer) : null;
const report = assess(xer, { projId });
writeReview(report, null);
if (args.includes("--csv")) writeFileSync(args[args.indexOf("--csv") + 1], findingsCsv(report));
if (args.includes("--schedule")) writeFileSync(args[args.indexOf("--schedule") + 1], scheduleCsv(report));
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
