#!/usr/bin/env node
// node cli.mjs schedule.xer [--json] [--csv findings.csv] [--schedule activities.csv] [--project CODE]
// Prints the DCMA 14-point assessment of a Primavera P6 XER file.
// node cli.mjs current.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
// Compares two updates of the same project instead (compare.mjs).
// Either form takes --report review.html [--to NAME] [--from NAME] [--ref TEXT]
// [--notes TEXT]: the written review (report.mjs) to print or save as a PDF.
// node cli.mjs schedule.xer --risk [N] [--range 90,100,125] [--correlation 0.3]
//   [--ranges ranges.csv] [--risks register.csv] [--seed S] [--csv drivers.csv] [--json] [--project CODE]
// Monte Carlo finish-date risk instead (risk.mjs): P10/P50/P80/P90, the chance
// of the forecast and must-finish dates, criticality index per activity;
// --risks adds risk register events (id, probability, min, likely, max days,
// activity IDs) and ranks them by how far they move the finish.
import { readFileSync, writeFileSync } from "node:fs";
import { parseXer, decodeXer } from "./xer.mjs";
import { assess, findingsCsv, scheduleCsv } from "./dcma.mjs";
import { compare, compareCsv, compareText } from "./compare.mjs";
import { reviewHtml, reviewItems } from "./report.mjs";
import { riskAnalysis, riskCsv, parseRanges, parseRisks } from "./risk.mjs";
import { formatDate } from "./xer.mjs";

const args = process.argv.slice(2);
const VALUED = ["--range", "--correlation", "--ranges", "--risks", "--seed", "--csv", "--project", "--previous", "--schedule", "--report", "--to", "--from", "--ref", "--notes"];
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
if (args.includes("--risk")) {
  const nArg = opt("--risk");
  const iterations = nArg && /^\d+$/.test(nArg) ? Number(nArg) : 500;
  const [min, likely, max] = (opt("--range") || "90,100,125").split(",").map((x) => Number(x) / 100);
  let ranges;
  if (opt("--ranges")) {
    const pr = parseRanges(readFileSync(opt("--ranges"), "utf8"));
    if (pr.bad.length) console.error(`skipped range lines ${pr.bad.join(", ")} (need code,min,likely,max in working days, min <= likely <= max)`);
    ranges = pr.ranges;
  }
  let risks;
  if (opt("--risks")) {
    const pk = parseRisks(readFileSync(opt("--risks"), "utf8"));
    if (pk.bad.length) console.error(`skipped risk lines ${pk.bad.join(", ")} (need id,probability,min,likely,max,activity ID[,activity ID...], probability above 0, min <= likely <= max days)`);
    risks = pk.risks;
  }
  const r = riskAnalysis(xer, { projId, iterations, range: { min, likely, max }, correlation: Number(opt("--correlation") || 0), ranges, risks, seed: Number(opt("--seed") || 1) });
  if (args.includes("--csv")) writeFileSync(opt("--csv"), riskCsv(r));
  if (args.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  const p = r.project;
  console.log(`${p.code}: ${r.iterations} runs, ${r.varied} activities varied, correlation ${r.correlation}, seed ${r.seed}`);
  for (const w of r.warnings) console.log(`NOTE: ${w}`);
  console.log(`Forecast finish ${formatDate(p.finish)}: met in ${Math.round(r.pDeterministic * 100)}% of runs${p.mustFinish != null ? `; must finish by ${formatDate(p.mustFinish)}: met in ${Math.round(r.pMustFinish * 100)}%` : ""}`);
  for (const q of r.percentiles) console.log(`  P${q.p}  ${formatDate(q.date)}  (${q.overDeterministic >= 0 ? "+" : ""}${q.overDeterministic} working days on the forecast)`);
  if (r.withoutRisks) {
    const w = r.withoutRisks, p80 = (x) => x.percentiles.find((q) => q.p === 80);
    console.log(`Without the ${r.risks.length} risk events: forecast met in ${Math.round(w.pDeterministic * 100)}%, P80 ${formatDate(p80(w).date)}; the events add ${(p80(r).days - p80(w).days).toFixed(1)} working days at P80 (mean ${w.eventDelay.mean} per run; no delay in ${Math.round(w.eventDelay.noDelay * 100)}% of runs)`);
    console.log("\nRisk events by expected finish shift (occurred share x shift when it occurs):");
    for (const k of r.risks) console.log(`  ${(k.occurred * 100).toFixed(0).padStart(3)}%  ${k.finishShift === null ? "    -" : ((k.finishShift >= 0 ? "+" : "") + k.finishShift.toFixed(1)).padStart(6)} days${k.finishShift !== null && !k.notNoise ? " (within noise +/-" + k.shiftNoise + ")" : ""}  ${k.id}  -> ${k.targets.join(", ")}`);
  }
  console.log("\nMost often on the driving path (criticality index; sensitivity = correlation of duration with finish):");
  for (const a of r.activities.slice(0, 15)) console.log(`  ${(a.criticality * 100).toFixed(0).padStart(3)}%  ${a.sensitivity === null ? "   -  " : a.sensitivity.toFixed(2).padStart(6)}  ${a.deterministicCritical ? "*" : " "} ${a.code}  ${a.name}`);
  console.log("  (* on the forecast's driving path)");
  process.exit(0);
}
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
