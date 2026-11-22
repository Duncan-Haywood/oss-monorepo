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
// node cli.mjs schedule.xer --level [--crew 2] [--within-float] [--curves] [--csv levelled.csv] [--json] [--project CODE]
// Resource levelling instead (level.mjs): the levelled finish, every activity
// moved and the resource that moved it, peak use before and after. --curves
// levels each assignment on its P6 resource curve instead of an even spread.
// node cli.mjs --windows u1.xer u2.xer u3.xer ... [--json] [--csv windows.csv] [--project CODE]
// Windows analysis over a series of updates instead (windows.mjs): per window
// between consecutive data dates, how far the forecast finish moved, the
// half-step split into progress and revisions, and the activities on the
// driving path behind each. With --report review.html [--appendix] [--risk]:
// the written review of the latest update, compared with the one before it,
// with a "Delay by window" section and its corrections.
// node cli.mjs --windows u1.xer u2.xer ... --earned-value [--csv ev-windows.csv] [--json] [--project CODE]
// Earned value across the series instead (evmseries.mjs): per window, what was
// earned against what the previous update's forecast promised, against the
// first update's planned curve held as baseline, and against what was spent;
// the activities that earned less (or more) than promised, budget changes,
// earned value taken back and actuals reversed.
// node cli.mjs schedule.xer --float-paths [CODE] [--paths N] [--csv paths.csv] [--json] [--project CODE]
// Multiple float paths to one activity instead (floatpaths.mjs): path 1 is the
// driving chain into it, each later path the next least float relative to it.
// With no CODE, the activity the longest path ends on.
// node cli.mjs schedule.xer --gantt [--baseline baseline.xer] [--html gantt.html] [--csv gantt.csv] [--level N] [--critical] [--links] [--group-by CODE,...|--codes] [--json]
// A Gantt chart instead (gantt.mjs): the WBS tree with a summary bar per
// node, a bar per activity (level of effort and WBS summary activities given
// P6's dates), and each activity's finish variance against the baseline
// file, or the planned dates the file keeps. --html writes a printable page
// with the chart; the text output lists the WBS rows and the late activities.
// --group-by "Responsibility,WBS" groups the rows by activity codes (name or
// id) and/or the WBS instead, outermost first (actvcodes.mjs); --codes lists
// the code types the project can be grouped by.
// node cli.mjs schedule.xer --lookahead [WEEKS] [--from YYYY-MM-DD] [--csv lookahead.csv] [--html lookahead.html] [--by NAME] [--json] [--project CODE]
// A look-ahead instead (lookahead.mjs): the next WEEKS weeks (3) of work by
// WBS with a bar per day and a make-ready check of what each activity still
// waits on; --html writes a page to print for the site meeting.
// --constraints log.csv merges the site team's constraints log (materials,
// permits, RFIs: constraints.mjs) into make-ready and says how far the
// finish moves if every open row clears on its expected date;
// --constraints-csv OUT writes the log back with the schedule's need-by dates.
// node cli.mjs schedule.xer --calendar-slack [--csv slack.csv] [--json] [--project CODE]
// Float P6's late dates miss across calendars instead (calslack.mjs): the FF/SF
// lags that end in a successor's non-work time on a calendar that works then,
// and every activity whose total float is larger than P6 shows because of it.
// node cli.mjs schedule.xer --milestone-calendars [--csv held.csv] [--json] [--project CODE]
// Time milestones hold back across calendars instead (milestones.mjs): the
// milestones whose own calendar's non-work time delays a successor on another
// calendar, and what comes back with every milestone on a 24-hour calendar.
// node cli.mjs schedule.xer --earned-value [--hours] [--even-spread] [--csv activities.csv] [--curve s-curve.csv] [--json] [--project CODE]
// Earned value from the resource assignments instead (evm.mjs): budget,
// planned, earned and actual cost (or labour hours), SPI, CPI, the estimates
// at completion, earned schedule, the S-curve by month and the cost-loading
// faults (unloaded work, actuals on unstarted work, actuals computed from
// percent complete, front-loaded progress, overruns). Planned and remaining
// work follow each assignment's P6 resource curve (curves.mjs; --even-spread
// spreads evenly); --hours reads labour hours even when cost is loaded.
// node cli.mjs update.xer --tia fragnet.csv [--csv impact.csv] [--html tia.html] [--xer impacted.xer] [--event NAME] [--by NAME] [--no-expected-finish] [--json] [--project CODE]
// Time impact analysis instead (tia.mjs): the fragnet (new activities with
// durations, predecessors and successors; "+N" days on an existing one)
// inserted into the update and the schedule recomputed: the finish and every
// milestone moved, float used, each event alone; --xer writes the impacted
// schedule for import into P6.
// node cli.mjs schedule.xer --to-project schedule.xml [--project CODE] [--code-names] [--outline-codes] [--all-resources] [--json]
// Converts the XER to Microsoft Project XML instead (msproject.mjs): open the
// .xml in Microsoft Project, ProjectLibre or GanttProject. WBS as summary
// tasks, activity IDs in Text1, calendars with every exception, relationships
// and lags, constraints, progress, baseline, resources and assignments, and
// activity codes in Text2..Text30 named after their code types (--code-names
// writes "code - description"; --outline-codes writes the 10 most assigned
// code types as Outline Code1..10 instead, each with a lookup table holding
// the P6 code tree and descriptions; --all-resources writes every resource in
// the file, not only those the project's activities use); the lines it prints
// name what Project will schedule differently.
// node cli.mjs schedule.xml --to-p6 schedule.xer [--project-id CODE] [--row-ids] [--deadlines] [--types-from original.xer] [--no-interim] [--skip-fields Start1,Finish1] [--json]
// (--no-interim leaves out Start/Finish pairs that look like a Project interim
// plan, which otherwise become date UDFs; --skip-fields names task Number,
// Cost, Date, Start or Finish fields to leave out; both work on any .xml read)
// Converts Microsoft Project XML to a Primavera P6 XER instead (p6xer.mjs),
// for P6's import: summary tasks as the WBS, activity IDs from a text field
// named "Activity ID" (else A + row ID x 10; --row-ids always), calendars, deadlines as
// finish-on-or-before constraints with --deadlines,
// links, constraints, progress, baseline, resources and assignments, text
// fields as activity codes, and Project's scheduling options; the lines it
// prints name what is not carried.
// With --previous, --narrative FILE [--weeks N] [--by NAME] [--to NAME] [--ref TEXT]
// also writes the contractor's monthly schedule narrative (narrative.mjs):
// status, critical path, work done, planned work missed, every change with a
// marked fill-in for its reason, float, the next N weeks (default 4) and the
// delays; .html gives a printable page, any other name plain text.
//
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
import { narrative, narrativeText, narrativeHtml } from "./narrative.mjs";
import { reviewHtml, reviewItems, windowsFor } from "./report.mjs";
import { riskAnalysis, riskCsv, parseRanges, parseRisks } from "./risk.mjs";
import { rangesFromUdf, udfFields, udfSpec, udfRangeNote } from "./udf-ranges.mjs";
import { formatDate } from "./xer.mjs";
import { level, levelCsv } from "./level.mjs";
import { schedule } from "./cpm.mjs";
import { floatPaths, floatPathsCsv, finishActivity } from "./floatpaths.mjs";
import { lookahead, lookaheadText, lookaheadCsv, lookaheadHtml } from "./lookahead.mjs";
import { constraintLogCsv } from "./constraints.mjs";
import { timeImpact, timeImpactText, timeImpactCsv, timeImpactHtml } from "./tia.mjs";
import { xerText } from "./xer.mjs";
import { calendarSlack, calendarSlackText, calendarSlackCsv } from "./calslack.mjs";
import { milestoneCalendars, milestoneCalendarsText, milestoneCalendarsCsv } from "./milestones.mjs";
import { earnedValue, earnedValueText, earnedValueCsv, sCurveCsv } from "./evm.mjs";
import { earnedValueSeries, earnedValueSeriesText, earnedValueSeriesCsv } from "./evmseries.mjs";
import { gantt, ganttText, ganttCsv, ganttHtml, codeTypes } from "./gantt.mjs";
import { mspdiText, msprojectSummary } from "./msproject.mjs";
import { p6XerText, p6xerSummary } from "./p6xer.mjs";

const args = process.argv.slice(2);
const VALUED = ["--ranges-udf", "--udf-unit", "--range", "--correlation", "--ranges", "--risks", "--seed", "--csv", "--project", "--previous", "--schedule", "--report", "--to", "--from", "--ref", "--notes", "--crew", "--paths", "--from", "--html", "--by", "--constraints", "--constraints-csv", "--curve", "--tia", "--xer", "--event", "--baseline", "--level", "--group-by", "--to-project", "--to-p6", "--project-id", "--types-from", "--skip-fields", "--narrative", "--weeks"];
// Print and exit only once stdout has taken it all: to a pipe, process.exit()
// straight after a write cuts the output off at 64 KB (a --json report of a
// large file).
const emit = (text) => new Promise((done) => process.stdout.write(text, done));
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
  if (args.includes("--earned-value")) {
    const ev = earnedValueSeries(ups, { projectName: opt("--project") });
    if (opt("--csv")) writeFileSync(opt("--csv"), earnedValueSeriesCsv(ev));
    await emit(args.includes("--json") ? JSON.stringify(ev, null, 2) + "\n" : earnedValueSeriesText(ev));
    process.exit(0);
  }
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
  await emit(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : windowsText(rep));
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
// --no-interim / --skip-fields: Microsoft Project interim plans (Start/Finish
// pairs) and named task fields left out of the user-defined fields (mspdi.mjs)
const fieldOpts = { interim: args.includes("--no-interim") ? "skip" : "keep", skipFields: (opt("--skip-fields") || "").split(",").map((f) => f.trim()).filter(Boolean) };
const xer = parseSchedule(decodeXer(readFileSync(file)), fieldOpts);
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
  if (opt("--narrative")) {
    const out = opt("--narrative");
    const wk = opt("--weeks");
    const la = lookahead(xer, { weeks: wk && /^\d+$/.test(wk) ? Number(wk) : 4, projId: ids.curProjId ?? null });
    const nar = narrative(rep, { lookahead: la });
    writeFileSync(out, /\.html?$/i.test(out) ? narrativeHtml(nar, { by: opt("--by"), to: opt("--to"), ref: opt("--ref") }) : narrativeText(nar));
    console.error(`schedule narrative written to ${out}: ${nar.fillIns} fill-ins left for causes and reasons`);
  }
  await emit(args.includes("--json") ? JSON.stringify(rep, null, 2) + "\n" : compareText(rep));
  process.exit(0);
}
const projId = args.includes("--project") ? projectFor(xer) : null;
if (args.includes("--to-p6")) {
  if (xer.format !== "mspdi") { console.error("--to-p6: this file is already an XER (it takes Microsoft Project XML)"); process.exit(2); }
  const r = p6XerText(decodeXer(readFileSync(file)), { projectId: opt("--project-id") || "", activityIds: args.includes("--row-ids") ? "row" : "auto", deadlines: args.includes("--deadlines"), typesFrom: opt("--types-from") ? decodeXer(readFileSync(opt("--types-from"))) : null, ...fieldOpts });
  writeFileSync(opt("--to-p6"), r.bytes);
  if (args.includes("--json")) { const { xer: _x, text: _t, bytes: _b, ...rest } = r; await emit(JSON.stringify(rest, null, 2) + "\n"); process.exit(0); }
  await emit(`${r.project.id}: ${p6xerSummary(r)} to ${opt("--to-p6")}\n${r.warnings.map((w) => `- ${w}\n`).join("")}`);
  process.exit(0);
}
if (args.includes("--to-project")) {
  if (xer.format === "mspdi") { console.error("--to-project: this file is already Microsoft Project XML"); process.exit(2); }
  const r = mspdiText(xer, { projId, codeNames: args.includes("--code-names"), outlineCodes: args.includes("--outline-codes"), allResources: args.includes("--all-resources") });
  writeFileSync(opt("--to-project"), r.xml);
  if (args.includes("--json")) { const { xml, taskUid, codeFields, outlineFields, ...rest } = r; await emit(JSON.stringify(rest, null, 2) + "\n"); process.exit(0); }
  await emit(`${r.project.name}: ${msprojectSummary(r)} to ${opt("--to-project")}\n${r.warnings.map((w) => `- ${w}\n`).join("")}`);
  process.exit(0);
}
if (args.includes("--risk")) {
  const assessed = args.includes("--report") ? assess(xer, { projId }) : null;
  const r = runRisk(xer, assessed ? assessed.project.id : projId);
  writeReview(assessed, null, r);
  if (args.includes("--csv")) writeFileSync(opt("--csv"), riskCsv(r));
  if (args.includes("--json")) { await emit(JSON.stringify(r, null, 2) + "\n"); process.exit(0); }
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
if (args.includes("--tia")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const r = timeImpact(xer, readFileSync(opt("--tia"), "utf8"), { projId: pid, expectedFinish: !args.includes("--no-expected-finish") });
  if (opt("--csv")) writeFileSync(opt("--csv"), timeImpactCsv(r));
  if (opt("--html")) { writeFileSync(opt("--html"), timeImpactHtml(r, { by: opt("--by"), event: opt("--event") })); console.error(`time impact analysis written to ${opt("--html")}`); }
  if (opt("--xer")) { writeFileSync(opt("--xer"), xerText(r.impactedXer)); console.error(`impacted schedule written to ${opt("--xer")}`); }
  const { impactedXer, ...plain } = r;
  await emit(args.includes("--json") ? JSON.stringify(plain, null, 2) + "\n" : timeImpactText(r));
  process.exit(0);
}
if (args.includes("--gantt")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const baseline = opt("--baseline") ? parseSchedule(decodeXer(readFileSync(opt("--baseline")))) : null;
  if (args.includes("--codes")) {
    const list = codeTypes(xer, pid);
    if (!list.length) { await emit("No activity code types in this file.\n"); process.exit(0); }
    await emit(args.includes("--json") ? JSON.stringify(list, null, 2) + "\n" : list.map((t) => `${t.id}\t${t.name}\t${t.scope}\t${t.values} values${t.hierarchical ? " (nested)" : ""}\t${t.assigned} activities`).join("\n") + "\n");
    process.exit(0);
  }
  const groupBy = opt("--group-by") ? opt("--group-by").split(",").map((x) => x.trim()).filter(Boolean) : null;
  const g = gantt(xer, { projId: pid, result, baseline, groupBy });
  const view = { level: opt("--level") ? Number(opt("--level")) : 99, critical: args.includes("--critical"), links: args.includes("--links") };
  if (opt("--csv")) writeFileSync(opt("--csv"), ganttCsv(g));
  if (opt("--html")) { writeFileSync(opt("--html"), ganttHtml(g, view, { by: opt("--by") })); console.error(`Gantt chart written to ${opt("--html")}`); }
  await emit(args.includes("--json") ? JSON.stringify(g, null, 2) + "\n" : ganttText(g, view));
  process.exit(0);
}
if (args.includes("--lookahead")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const w = opt("--lookahead");
  const la = lookahead(xer, { weeks: w && /^\d+$/.test(w) ? Number(w) : 3, from: opt("--from"), projId: pid, result, constraints: opt("--constraints") ? readFileSync(opt("--constraints"), "utf8") : null });
  if (opt("--csv")) writeFileSync(opt("--csv"), lookaheadCsv(la));
  if (opt("--constraints-csv") && la.constraintLog) writeFileSync(opt("--constraints-csv"), constraintLogCsv(la.constraintLog));
  if (opt("--html")) { writeFileSync(opt("--html"), lookaheadHtml(la, { by: opt("--by") })); console.error(`look-ahead written to ${opt("--html")}`); }
  await emit(args.includes("--json") ? JSON.stringify(la, null, 2) + "\n" : lookaheadText(la));
  process.exit(0);
}
if (args.includes("--earned-value")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const r = earnedValue(xer, { projId: pid, result, measure: args.includes("--hours") ? "hours" : null, curves: !args.includes("--even-spread") });
  if (opt("--csv")) writeFileSync(opt("--csv"), earnedValueCsv(r));
  if (opt("--curve")) writeFileSync(opt("--curve"), sCurveCsv(r));
  await emit(args.includes("--json") ? JSON.stringify(r, null, 2) + "\n" : earnedValueText(r));
  process.exit(0);
}
if (args.includes("--calendar-slack")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const r = calendarSlack(xer, { projId: pid, base: result });
  if (opt("--csv")) writeFileSync(opt("--csv"), calendarSlackCsv(r));
  await emit(args.includes("--json") ? JSON.stringify(r, null, 2) + "\n" : calendarSlackText(r));
  process.exit(0);
}
if (args.includes("--milestone-calendars")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const r = milestoneCalendars(xer, { projId: pid, base: result });
  if (opt("--csv")) writeFileSync(opt("--csv"), milestoneCalendarsCsv(r));
  await emit(args.includes("--json") ? JSON.stringify(r, null, 2) + "\n" : milestoneCalendarsText(r));
  process.exit(0);
}
if (args.includes("--float-paths")) {
  const result = schedule(xer);
  const pid = assess(xer, { projId, result }).project.id;
  const code = opt("--float-paths");
  let target;
  if (code && !code.startsWith("--")) {
    target = [...result.model.tasks.values()].find((t) => t.code === code && t.proj === pid) || [...result.model.tasks.values()].find((t) => t.code === code);
    if (!target) { console.error(`no activity ${code}`); process.exit(2); }
  } else target = finishActivity(result, pid);
  if (!target) { console.error("no open activity finishes on the project finish: name one, --float-paths CODE"); process.exit(2); }
  const fp = floatPaths(result, target.id, { count: Number(opt("--paths") || 10) });
  if (!fp.target) { console.error(`${target.code} is finished or not scheduled: float paths run to an open activity`); process.exit(2); }
  if (args.includes("--csv")) writeFileSync(opt("--csv"), floatPathsCsv(fp));
  if (args.includes("--json")) { const { bound, ...plain } = fp; await emit(JSON.stringify(plain, null, 2) + "\n"); process.exit(0); }
  console.log(`Float paths to ${fp.target.code} ${fp.target.name} (early finish ${fp.target.finish}); relative float in working hours on each activity's calendar`);
  for (const p of fp.paths) {
    console.log(`\nPath ${p.n}: ${p.activities.length} activit${p.activities.length === 1 ? "y" : "ies"}, relative float ${+p.float.toFixed(2)} h`);
    for (const a of p.activities) console.log(`  ${a.code.padEnd(18)} ${a.start} -> ${a.finish}  rel ${String(+a.rf.toFixed(2)).padStart(7)} h  TF ${String(a.tf === undefined ? "-" : +a.tf.toFixed(2)).padStart(7)} h${a.link ? `  ${a.link.type}${a.link.lag ? ` ${a.link.lag} h` : ""} -> ${a.link.to}` : ""}  ${a.name}`);
  }
  if (fp.unreached) console.log(`\n${fp.unreached} more activities lead into ${fp.target.code} on later paths (--paths N to list more).`);
  process.exit(0);
}
if (args.includes("--level")) {
  const crew = Number(opt("--crew") || 1);
  const r = level(xer, { projId, limitScale: crew !== 1 ? { "*": crew } : null, ...(args.includes("--within-float") ? { withinFloat: true } : {}), curves: args.includes("--curves") });
  if (args.includes("--csv")) writeFileSync(opt("--csv"), levelCsv(r));
  if (args.includes("--json")) { const { result, floors, placed, ignored, ...plain } = r; await emit(JSON.stringify(plain, null, 2) + "\n"); process.exit(0); }
  console.log(`${r.project.code}: ${r.resources.length} resources levelled${crew !== 1 ? ` at ${crew}x the file's limits` : ""}${r.settings.withinFloat ? ", within float" : ""}${r.curves ? `, ${r.curves.curved} assignment${r.curves.curved === 1 ? "" : "s"} on resource curves` : ""} (${r.ms} ms)`);
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
  const lp = report.longestPath;
  if (lp.p6Flagged) console.log(`Longest path: ${lp.count} open activities; P6 flagged ${lp.p6Flagged} at its last run; ${lp.agree} on both${lp.onlyP6.length ? `; only P6: ${lp.onlyP6.slice(0, 5).join(", ")}${lp.onlyP6.length > 5 ? ` and ${lp.onlyP6.length - 5} more` : ""}` : ""}${lp.onlyHere.length ? `; only here: ${lp.onlyHere.slice(0, 5).join(", ")}` : ""}.`);
  else console.log(`Longest path: ${lp.count} open activities (the file stores no longest-path flag to compare with).`);
  console.log(`Driving path: ${report.drivingPath.length} activities, ${report.drivingPath.slice(0, 3).map((d) => d.code).join(", ")}${report.drivingPath.length > 3 ? " ... " + report.drivingPath.at(-1).code : ""}`);
}
