#!/usr/bin/env node
// node cli.mjs schedule.xer [--json] [--csv findings.csv] [--schedule activities.csv] [--project CODE]
// Prints the DCMA 14-point assessment of a Primavera P6 XER file. Any
// schedule argument can also be a Microsoft Project XML (MSPDI) file
// (mspdi.mjs): File, Save As, XML Format in Microsoft Project.
// node cli.mjs current.xer --previous last-month.xer [--json] [--csv changes.csv] [--project CODE]
// Compares two updates of the same project instead (compare.mjs).
// Either form takes --report review.html [--to NAME] [--from NAME] [--ref TEXT]
// [--notes TEXT]: the written review (report.mjs) to print or save as a PDF.
// node cli.mjs schedule.xer --risk [N] [--range 90,100,125] [--correlation 0.3]
//   [--ranges ranges.csv] [--ranges-udf auto|"opt,likely,pess" [--udf-unit days|hours|pct]] [--risks register.csv] [--seed S] [--csv drivers.csv] [--json] [--project CODE]
// Monte Carlo finish-date risk instead (risk.mjs): P10/P50/P80/P90, the chance
// of the forecast and must-finish dates, criticality index per activity;
// --risks adds risk register events (id, probability, min, likely, max days,
// activity IDs) and ranks them by how far they move the finish. With --report,
// the written review carries the risk section and its corrections too (also
// with --previous: the risk run is made on the current file).
// node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--csv levelled.csv] [--json] [--project CODE]
// Resource levelling instead (level.mjs): the levelled finish, every activity
// moved and the resource that moved it, peak use before and after.
// node cli.mjs --windows u1.xer u2.xer u3.xer ... [--json] [--csv windows.csv] [--project CODE]
// Windows analysis over a series of updates instead (windows.mjs): per window
// between consecutive data dates, how far the forecast finish moved, the
// half-step split into progress and revisions, and the activities on the
// driving path behind each. With --report review.html [--appendix] [--risk]:
// the written review of the latest update, compared with the one before it,
// with a "Delay by window" section and its corrections.
// Any --report also takes --appendix: every activity behind every correction
// printed in an appendix, not only the first 40 of each.
import { readFileSync, writeFileSync } from "node:fs";
// A file that cannot be assessed (no PROJECT table, not an XER at all) ends
// with one line saying why, not a stack trace. XER_DEBUG=1 keeps the trace.
if (!process.env.XER_DEBUG) process.on("uncaughtException", (e) => { console.error(`xer-schedule-check: ${e && e.message ? e.message : e}`); process.exit(1); });
import { windows, windowsText, windowsCsv } from "./windows.mjs";
import { decodeXer } from "./xer.mjs";
import { parseSchedule } from "./mspdi.mjs";
import { assess, findingsCsv, scheduleCsv } from "./dcma.mjs";
import { compare, compareCsv, compareText } from "./compare.mjs";
import { reviewHtml, reviewItems, windowsFor } from "./report.mjs";
import { riskAnalysis, riskCsv, parseRanges, parseRisks } from "./risk.mjs";
import { rangesFromUdf, udfFields, udfSpec, udfRangeNote } from "./udf-ranges.mjs";
import { formatDate } from "./xer.mjs";
import { level, levelCsv } from "./level.mjs";

const args = process.argv.slice(2);
const VALUED = ["--ranges-udf", "--udf-unit", "--range", "--correlation", "--ranges", "--risks", "--seed", "--csv", "--project", "--previous", "--schedule", "--report", "--to", "--from", "--ref", "--notes", "--crew"];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
function writeReview(report, cmp, risk = null, win = null) {
  if (!args.includes("--report")) return;
  writeFileSync(opt("--report"), reviewHtml(report, cmp, { recipient: opt("--to"), reviewer: opt("--from"), reference: opt("--ref"), notes: opt("--notes"), risk, windows: win, appendix: args.includes("--appendix") }));
  const items = reviewItems(report, cmp, risk, windowsFor(report, win)), n = (s) => items.filter((x) => x.severity === s).length;
  console.error(`review written to ${opt("--report")}: ${items.length} corrections (${n("high")} high, ${n("medium")} medium, ${n("low")} low)`);
}
if (args.includes("--windows")) {
  const files = args.filter((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
  if (files.length < 2) { console.error("usage: node cli.mjs --windows update1.xer update2.xer [update3.xer ...] [--json] [--csv windows.csv] [--project CODE]"); process.exit(2); }
  const ups = files.map((f) => ({ xer: parseSchedule(decodeXer(readFileSync(f))), label: f.split("/").pop() }));
  const rep = windows(ups, { projectName: opt("--project") });
  if (args.includes("--report")) {
    // the review is of the latest update, compared with the one before it,
    // with the whole series' windows in it
    const byLabel = (l) => ups.find((u) => u.label === l).xer;
    const lastX = byLabel(rep.updates[rep.updates.length - 1].label), prevX = byLabel(rep.updates[rep.updates.length - 2].label);
    const w = rep.windows[rep.windows.length - 1];
    const idOf = (x) => (x.tables.PROJECT || []).find((p) => p.proj_short_name === rep.project)?.proj_id ?? null;
    const cur = assess(lastX, { projId: idOf(lastX) });
    const cmp = compare(prevX, lastX, { curProjId: cur.project.id, ...(idOf(prevX) ? { prevProjId: idOf(prevX) } : {}) });
    writeReview(cur, cmp, args.includes("--risk") ? runRisk(lastX, cur.project.id) : null, rep);
    if (w.dataDateTo.slice(0, 16) !== cur.project.dataDate.slice(0, 16)) console.error("note: the latest update's project differs from the windows' project; the windows were left out of the review");
  }
  if (opt("--csv")) writeFileSync(opt("--csv"), windowsCsv(rep));
  process.stdout.write(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : windowsText(rep));
  process.exit(0);
}
const file = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]));
if (!file) {
  console.error("usage: node cli.mjs schedule.xer [--report review.html] [--json] [--csv findings.csv] [--schedule activities.csv] [--project CODE]\n       node cli.mjs current.xer --previous previous.xer [--json] [--csv changes.csv] [--project CODE]\n       node cli.mjs --windows update1.xer update2.xer [...] [--json] [--csv windows.csv] [--project CODE]");
  process.exit(2);
}
function runRisk(x, projId) {
  const nArg = opt("--risk");
  const iterations = nArg && /^\d+$/.test(nArg) ? Number(nArg) : 500;
  const [min, likely, max] = (opt("--range") || "90,100,125").split(",").map((v) => Number(v) / 100);
  let ranges, rangeSource;
  if (opt("--ranges-udf")) {
    const u = rangesFromUdf(x, { ...udfSpec(x, opt("--ranges-udf")), projId, unit: opt("--udf-unit") || undefined });
    if (!u.fields) {
      const fl = udfFields(x);
      console.error(`--ranges-udf: no optimistic and pessimistic activity UDFs recognised by name. Name them: --ranges-udf "optimistic,most likely,pessimistic" (id or label; most likely may be -). Numeric activity UDFs in the file: ${fl.map((f) => `${f.id} "${f.label}" (${f.values} values)`).join(", ") || "none"}`);
    } else {
      ranges = u.ranges;
      rangeSource = udfRangeNote(u);
    }
  }
  if (opt("--ranges")) {
    const pr = parseRanges(readFileSync(opt("--ranges"), "utf8"));
    if (pr.bad.length) console.error(`skipped range lines ${pr.bad.join(", ")} (need code,min,likely,max in working days, min <= likely <= max)`);
    ranges = ranges ? new Map([...ranges, ...pr.ranges]) : pr.ranges; // pasted lines win over UDF values
  }
  let risks;
  if (opt("--risks")) {
    const pk = parseRisks(readFileSync(opt("--risks"), "utf8"));
    if (pk.bad.length) console.error(`skipped risk lines ${pk.bad.join(", ")} (need id,probability,min,likely,max,activity ID[,activity ID...], probability above 0, min <= likely <= max days)`);
    risks = pk.risks;
  }
  return riskAnalysis(x, { projId, iterations, range: { min, likely, max }, correlation: Number(opt("--correlation") || 0), ranges, rangeSource, risks, seed: Number(opt("--seed") || 1) });
}
const xer = parseSchedule(decodeXer(readFileSync(file)));
const projectFor = (x) => {
  const code = args[args.indexOf("--project") + 1];
  const id = (x.tables.PROJECT || []).find((p) => p.proj_short_name === code)?.proj_id ?? null;
  if (!id) { console.error(`no project ${code}`); process.exit(2); }
  return id;
};
if (args.includes("--previous")) {
  const prev = parseSchedule(decodeXer(readFileSync(args[args.indexOf("--previous") + 1])));
  const ids = args.includes("--project") ? { curProjId: projectFor(xer), prevProjId: projectFor(prev) } : {};
  // the review's assessment and the comparison must describe the same project
  const cur = args.includes("--report") ? assess(xer, { projId: ids.curProjId ?? null }) : null;
  const rep = compare(prev, xer, cur ? { ...ids, curProjId: cur.project.id } : ids);
  writeReview(cur, rep, cur && args.includes("--risk") ? runRisk(xer, cur.project.id) : null);
  if (args.includes("--csv")) writeFileSync(args[args.indexOf("--csv") + 1], compareCsv(rep));
  process.stdout.write(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : compareText(rep));
  process.exit(0);
}
const projId = args.includes("--project") ? projectFor(xer) : null;
if (args.includes("--risk")) {
  const assessed = args.includes("--report") ? assess(xer, { projId }) : null;
  const r = runRisk(xer, assessed ? assessed.project.id : projId);
  writeReview(assessed, null, r);
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
if (args.includes("--level")) {
  const crew = Number(opt("--crew") || 1);
  const r = level(xer, { projId, limitScale: crew !== 1 ? { "*": crew } : null, ...(args.includes("--within-float") ? { withinFloat: true } : {}) });
  if (args.includes("--csv")) writeFileSync(opt("--csv"), levelCsv(r));
  if (args.includes("--json")) { const { result, floors, placed, ignored, ...plain } = r; console.log(JSON.stringify(plain, null, 2)); process.exit(0); }
  console.log(`${r.project.code}: ${r.resources.length} resources levelled${crew !== 1 ? ` at ${crew}x the file's limits` : ""}${r.settings.withinFloat ? ", within float" : ""} (${r.ms} ms)`);
  for (const w of r.warnings) console.log(`NOTE: ${w}`);
  console.log(`Finish ${r.finish} -> levelled ${r.levelledFinish} (+${r.extensionDays} working days)${r.lowerBound ? `; no levelling can finish before ${r.lowerBound.date} (${r.lowerBound.resource} work at its limit)` : ""}`);
  console.log(`${r.activities.filter((a) => a.by.length).length} activities delayed for resources, ${r.activities.filter((a) => !a.by.length).length} carried by their logic, ${r.left.length} left over-allocated`);
  console.log("\nResource            limit  peak before -> after   hours over before -> after   self-check");
  for (const q of r.resources) console.log(`  ${q.code.padEnd(18)} ${String(q.limit).padStart(5)}  ${String(q.before.peak).padStart(6)} -> ${String(q.after.peak).padEnd(8)} ${String(q.before.overHours).padStart(9)} -> ${String(q.after.overHours).padEnd(9)} ${q.selfCheckHours}`);
  console.log("\nMost delayed:");
  for (const a of r.activities.slice(0, 15)) console.log(`  ${String(a.delayDays).padStart(7)} d  ${a.code}  ${a.levelledStart} -> ${a.levelledFinish}  ${a.by.join(", ") || "(logic)"}`);
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
  console.log(`${p.name}  (${/^MSPDI/.test(p.version || "") ? "Microsoft Project XML" + p.version.slice(5) : "P6 " + p.version}; data date ${p.dataDate}; forecast finish ${p.finish}${p.mustFinish ? `; must finish by ${p.mustFinish}` : ""})`);
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
