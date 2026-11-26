// The ten best practices of the GAO Schedule Assessment Guide (GAO-16-89G,
// December 2015) scored from a P6 XER (or Microsoft Project XML) file: the
// assessment US federal auditors, agency schedulers and the contractors who
// answer to them run next to (or instead of) the DCMA 14 points.
//
// gao(xer, { projId, baseline, result, report }) -> {
//   project, practices: [{ n, name, characteristic, rating, score, tests, note }],
//   characteristics: [{ name, practices, score, rating }],
//   overall: { met, rated, reliable, weakest }, warnings
// }
//
// GAO rates each practice on five levels (Fully met, Substantially met,
// Partially met, Minimally met, Not met) by an auditor's judgment of the
// evidence, and its reports roll the practices up to four characteristics
// (comprehensive, well-constructed, credible, controlled) by averaging the
// practice scores 5 to 1. A file cannot replace that judgment, so here each
// practice is a short list of tests a scheduler can rerun on the file, each
// with its threshold written beside it, and the rating is only the share of
// those tests passed:
//
//   all pass -> Fully met (5); at least 3/4 -> Substantially met (4);
//   at least 1/2 -> Partially met (3); any -> Minimally met (2); none -> Not met (1)
//
// The thresholds are this tool's: the DCMA's published ones where a DCMA
// point measures the same thing (44 working days, 5%), otherwise named in
// the test. The guide gives practices, not numeric limits, so a reviewer
// should read the tests, not the label.
//
// Practice 8 (a schedule risk analysis) is evidence outside the file: it is
// left unrated and out of the average unless the file carries the inputs of
// one (three-point duration UDFs). Practice 10 is scored against a baseline
// XER when one is given (activities matched by activity ID); without one
// against the planned dates the file keeps, which P6 resets for unstarted
// work, so the result there is said to be weaker.

import { assess, baselineFinishes } from "./dcma.mjs";
import { schedule, hardConstraint } from "./cpm.mjs";
import { parseDate, formatDate } from "./xer.mjs";
import { rangesFromUdf } from "./udf-ranges.mjs";

const CSTR = {
  CS_MSO: "Start on", CS_MEO: "Finish on", CS_MSOB: "Start on or before", CS_MEOB: "Finish on or before",
  CS_MANDSTART: "Mandatory start", CS_MANDFIN: "Mandatory finish", CS_MSOA: "Start on or after", CS_MEOA: "Finish on or after",
};

export const LEVELS = ["Not met", "Minimally met", "Partially met", "Substantially met", "Fully met"];

export const PRACTICES = [
  { n: 1, name: "Capturing all activities", characteristic: "Comprehensive" },
  { n: 2, name: "Sequencing all activities", characteristic: "Well-constructed" },
  { n: 3, name: "Assigning resources to all activities", characteristic: "Comprehensive" },
  { n: 4, name: "Establishing the duration of all activities", characteristic: "Comprehensive" },
  { n: 5, name: "Verifying that the schedule can be traced horizontally and vertically", characteristic: "Credible" },
  { n: 6, name: "Confirming that the critical path is valid", characteristic: "Well-constructed" },
  { n: 7, name: "Ensuring reasonable total float", characteristic: "Well-constructed" },
  { n: 8, name: "Conducting a schedule risk analysis", characteristic: "Credible" },
  { n: 9, name: "Updating the schedule using actual progress and logic", characteristic: "Controlled" },
  { n: 10, name: "Maintaining a baseline schedule", characteristic: "Controlled" },
];
export const CHARACTERISTICS = ["Comprehensive", "Well-constructed", "Credible", "Controlled"];

// share of tests passed -> score 1..5
export function scoreOf(passed, total) {
  if (!total) return null;
  const f = passed / total;
  if (f >= 1) return 5;
  if (f >= 0.75) return 4;
  if (f >= 0.5) return 3;
  if (f > 0) return 2;
  return 1;
}
// GAO's roll-up: the average of the practice scores, to the nearest level
export const rollUp = (scores) => {
  const s = scores.filter((x) => x !== null);
  if (!s.length) return null;
  return Math.min(5, Math.max(1, Math.floor(s.reduce((a, b) => a + b, 0) / s.length + 0.5)));
};
const levelOf = (score) => (score === null ? "Not assessed" : LEVELS[score - 1]);

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

export function gao(xer, opts = {}) {
  const result = opts.result || schedule(xer);
  const report = opts.report || assess(xer, { projId: opts.projId, result, baseline: opts.baseline });
  const { model } = result;
  const pid = report.project.id;
  const p = result.projects.get(pid);
  const dd = p ? p.dataDate : null;
  const warnings = [];
  const check = (id) => report.checks.find((c) => c.id === id) || null;
  const extra = (id) => report.extra.find((c) => c.id === id) || null;
  const all = [...model.tasks.values()].filter((t) => t.proj === pid && !t.span);
  const open = all.filter((t) => t.status !== "TK_Complete");
  const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  const tests = new Map(PRACTICES.map((pr) => [pr.n, []]));
  // a test: what it measures, the value, the threshold, pass, and the activities behind a failure
  const add = (n, t) => tests.get(n).push({ items: [], ...t, count: t.count ?? (t.items || []).length });
  const fromDcma = (n, id, label) => {
    const c = check(id);
    if (!c) return;
    const r = (x) => (c.unit && c.unit.startsWith("%") ? Math.round(x * 10) / 10 : Math.round(x * 1000) / 1000);
    const v = c.value === null ? "n/a" : `${typeof c.value === "number" ? r(c.value) : c.value}${c.unit ? (c.unit.startsWith("%") ? c.unit : " " + c.unit) : ""}`;
    add(n, { id: `dcma-${id}`, name: label || `${c.name} (DCMA ${id})`, value: c.total ? `${v} (${c.count} of ${c.total})` : v, threshold: c.threshold, pass: !!c.pass, items: c.items, count: c.count });
  };
  const fromExtra = (n, id, label, threshold = "0") => {
    const e = extra(id);
    if (!e) { add(n, { id, name: label, value: "0", threshold, pass: true }); return; }
    add(n, { id, name: label, value: String(e.count), threshold, pass: e.count === 0, items: e.items, count: e.count });
  };

  // 1 Capturing all activities: every activity in a WBS element, named so it
  // can be told apart, and the work ending in a finish milestone
  {
    const wbs = new Map((xer.tables.PROJWBS || []).map((w) => [w.wbs_id, w]));
    const top = open.filter((t) => { const w = wbs.get(t.row.wbs_id); return !w || w.proj_node_flag === "Y"; });
    const hasWbs = (xer.tables.PROJWBS || []).some((w) => w.proj_id === pid && w.proj_node_flag !== "Y");
    add(1, { id: "wbs", name: "Open activities filed under a WBS element (not the project node)", value: `${pct(open.length - top.length, open.length)}% (${top.length} at the top)`, threshold: ">= 95%",
      pass: hasWbs && pct(top.length, open.length) <= 5, items: top.map((t) => ({ code: t.code, name: t.name, why: wbs.has(t.row.wbs_id) ? "filed on the project node" : "WBS element not in the file" })),
      note: hasWbs ? "" : "The project has no WBS below its own node: the work is not broken down." });
    const byName = new Map();
    for (const t of all) {
      const k = (t.name || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(t);
    }
    const dup = [];
    for (const [k, ts] of byName) if (ts.length > 1 || !k) for (const t of ts) dup.push({ code: t.code, name: t.name, why: k ? `name shared by ${ts.length} activities (${ts.slice(0, 4).map((x) => x.code).join(", ")}${ts.length > 4 ? ", ..." : ""})` : "no name" });
    add(1, { id: "names", name: "Activities with a unique name", value: `${pct(all.length - dup.length, all.length)}% (${dup.length} repeat a name)`, threshold: ">= 95%", pass: pct(dup.length, all.length) <= 5, items: dup,
      note: "A name that repeats (\"Pour slab\" on every floor) only means something with its WBS; GAO asks for names that stand alone." });
    const fin = all.filter((t) => t.type === "TT_FinMile");
    add(1, { id: "finish-milestone", name: "A finish milestone for the project's completion", value: `${fin.length} finish milestone${fin.length === 1 ? "" : "s"}`, threshold: ">= 1", pass: fin.length > 0 });
  }

  // 2 Sequencing all activities
  fromDcma(2, 1);
  fromDcma(2, 2);
  fromDcma(2, 3);
  fromDcma(2, 4);
  fromDcma(2, 5);
  fromExtra(2, "loops", "Logic loops");

  // 3 Assigning resources
  {
    const c = check(10);
    const loaded = (xer.tables.TASKRSRC || []).length + (xer.tables.PROJCOST || []).length > 0;
    if (c) add(3, { id: "dcma-10", name: "Open activities with duration and a resource or cost assignment (DCMA 10)", value: `${pct(c.total - c.count, c.total)}% (${c.count} of ${c.total} without)`, threshold: "100%", pass: c.pass, items: c.items, count: c.count,
      note: loaded ? "" : "The file has no resource assignments or expenses at all." });
    const rs = (xer.tables.RSRC || []).length;
    const limited = new Set((xer.tables.RSRCRATE || []).filter((r) => Number(r.max_qty_per_hr) > 0).map((r) => r.rsrc_id));
    const used = new Set((xer.tables.TASKRSRC || []).filter((a) => open.some((t) => t.id === a.task_id)).map((a) => a.rsrc_id));
    const noLimit = [...used].filter((r) => !limited.has(r));
    const rname = new Map((xer.tables.RSRC || []).map((r) => [r.rsrc_id, r.rsrc_short_name || r.rsrc_name]));
    add(3, { id: "limits", name: "Resources on open work with a maximum units per time (availability to level against)", value: used.size ? `${used.size - noLimit.length} of ${used.size}` : `no resources used (${rs} in the file)`, threshold: "all",
      pass: used.size > 0 && noLimit.length === 0, items: noLimit.map((r) => ({ code: rname.get(r) || r, name: "", why: "no maximum units per time" })) });
  }

  // 4 Establishing durations
  {
    fromDcma(4, 8);
    const zero = open.filter((t) => !isMile(t) && t.status !== "TK_Active" && t.orig === 0);
    add(4, { id: "zero-duration", name: "Unstarted activities of zero duration that are not milestones", value: String(zero.length), threshold: "0", pass: zero.length === 0,
      items: zero.map((t) => ({ code: t.code, name: t.name, why: "0 working days; make it a milestone or give it a duration" })) });
    // durations in working days (whole or half days), not hours that cut a day
    const odd = open.filter((t) => !isMile(t) && t.status !== "TK_Active" && t.orig > 0 && (() => { const h = t.orig / 60, hpd = t.cal.hoursPerDay || 8; return h < hpd && Math.abs(h - hpd / 2) > 1e-6; })());
    add(4, { id: "short", name: "Unstarted activities shorter than half a working day", value: `${pct(odd.length, open.length)}% (${odd.length})`, threshold: "<= 5%", pass: pct(odd.length, open.length) <= 5,
      items: odd.map((t) => ({ code: t.code, name: t.name, why: `${Math.round((t.orig / 60) * 100) / 100} h` })),
      note: "Work below the level a site reports progress at; often a milestone typed as a task, or hours entered as days." });
  }

  // 5 Horizontal and vertical traceability
  {
    fromDcma(5, 12, "Delay flows through to the finish (critical path test, DCMA 12)");
    fromExtra(5, "open-finish", "Open finishes: activities with start-to-start successors only");
    const rc = report.recompute;
    if (rc.compared) add(5, { id: "recompute", name: "Stored dates follow the logic (recomputed early finish, late finish and total float agree)", value: `${pct(rc.matched, rc.compared)}% (${rc.matched} of ${rc.compared})`, threshold: ">= 95%",
      pass: pct(rc.matched, rc.compared) >= 95, items: rc.items, count: rc.compared - rc.matched });
    else warnings.push("The file stores no early and late dates, so whether they follow the logic (practice 5) is not tested; schedule it before export.");
    // vertical: every milestone tied into the network both ways (start and finish milestones one way)
    const loose = open.filter((t) => isMile(t)).filter((t) => {
      const preds = t.preds.filter((r) => !model.tasks.get(r.predId)?.span).length, succs = t.succs.filter((r) => !model.tasks.get(r.succId)?.span).length;
      return t.type === "TT_Mile" ? succs === 0 : preds === 0;
    });
    add(5, { id: "milestones-linked", name: "Open milestones driven by the work they summarise (finish milestones with a predecessor, start milestones with a successor)", value: String(loose.length), threshold: "0", pass: loose.length === 0,
      items: loose.map((t) => ({ code: t.code, name: t.name, why: t.type === "TT_Mile" ? "start milestone with no successor" : "finish milestone with no predecessor" })) });
  }

  // 6 Valid critical path
  {
    const path = report.drivingPath || [];
    const byCode = new Map(open.map((t) => [t.code, t]));
    const pathT = path.map((d) => byCode.get(d.code)).filter(Boolean);
    // traced back by driving links, the path's first activity is in progress,
    // free of unfinished predecessors, or held by something other than them
    const first = pathT[0] || null;
    const work = pathT.filter((t) => !isMile(t));
    const firstOk = first && (first.status === "TK_Active" || !first.preds.some((r) => model.tasks.get(r.predId)?.status !== "TK_Complete"));
    const why = !path.length ? "no driving path into the finish"
      : !work.length ? `the driving path holds only milestone${pathT.length === 1 ? "" : "s"} (${pathT.map((t) => t.code).join(", ")}): no work with a duration drives the finish`
      : !firstOk ? "the path's first activity has unfinished predecessors that do not drive it: a constraint, an open start or the data date sets its date" : "";
    add(6, { id: "path-continuous", name: "A driving path of work runs from the data date (or work in progress) to the finish", value: path.length ? `${path.length} activit${path.length === 1 ? "y" : "ies"}, from ${path[0].code} to ${path[path.length - 1].code}` : "no driving path", threshold: "continuous", pass: !why,
      items: why && first ? [{ code: first.code, name: first.name, why }] : [] });
    const cons = pathT.filter((t) => t.cstr.some((c) => hardConstraint(c.type) || c.type === "CS_MSOA" || c.type === "CS_MEOA"));
    add(6, { id: "path-constraints", name: "Driving path activities held by a date constraint rather than logic", value: String(cons.length), threshold: "0", pass: cons.length === 0,
      items: cons.map((t) => ({ code: t.code, name: t.name, why: t.cstr.map((c) => `${Object.hasOwn(CSTR, c.type) ? CSTR[c.type] : c.type} ${formatDate(c.date)}`).join("; ") })) });
    const pathIds = new Set(pathT.map((t) => t.id));
    const longLag = model.rels.filter((r) => pathIds.has(r.predId) && pathIds.has(r.succId) && r.lag !== 0);
    add(6, { id: "path-lags", name: "Links on the driving path with a lead or lag", value: String(longLag.length), threshold: "0", pass: longLag.length === 0,
      items: longLag.map((r) => { const a = model.tasks.get(r.predId), b = model.tasks.get(r.succId); return { code: `${a.code} -> ${b.code}`, name: b.name, why: `${r.type.replace("PR_", "")} lag ${Math.round((r.lag / 60 / (b.cal.hoursPerDay || 8)) * 10) / 10} days` }; }),
      note: "A lag on the critical path is time with no work, owner or way to status it; GAO asks for it to be an activity." });
    fromDcma(6, 13);
    const lp = report.longestPath;
    if (lp && lp.p6Flagged) {
      const union = lp.count + lp.onlyP6.length;
      add(6, { id: "p6-agrees", name: "The longest path P6 flagged at its last run is the one the logic gives", value: `${lp.agree} of ${union} on both`, threshold: ">= 95%", pass: pct(lp.agree, union) >= 95,
        items: [...lp.onlyP6.map((c) => ({ code: c, name: "", why: "flagged by P6, not on the recomputed longest path" })), ...lp.onlyHere.map((c) => ({ code: c, name: "", why: "on the recomputed longest path, not flagged by P6" }))] });
    }
  }

  // 7 Reasonable total float
  fromDcma(7, 6);
  fromDcma(7, 7);

  // 8 Schedule risk analysis: only its inputs can be in the file
  {
    let r = null;
    try { r = rangesFromUdf(xer, { projId: pid }); } catch { r = null; }
    if (r && r.fields && r.read > 0) {
      const normal = open.filter((t) => !isMile(t)).length;
      add(8, { id: "ranges", name: "Three-point duration ranges kept in the file (activity UDFs)", value: `${r.read} of ${normal} open activities (${r.fields.min.label} / ${r.fields.max.label})`, threshold: ">= 95%", pass: pct(r.read, normal) >= 95,
        note: "The ranges are there; whether a risk analysis was run on them, and its result reported, is outside the file. The Monte Carlo below reads them." });
    }
  }

  // 9 Updating with actual progress and logic
  {
    add(9, { id: "data-date", name: "A data date (status date) is set", value: dd === null ? "none" : formatDate(dd), threshold: "set", pass: dd !== null });
    fromDcma(9, 9);
    fromExtra(9, "out-of-sequence", "Out-of-sequence progress");
    const ed = extra("edited-durations"), el = extra("edited-lags");
    const n = (ed ? ed.count : 0) + (el ? el.count : 0);
    add(9, { id: "rescheduled", name: "Rescheduled after the last edits (durations and lags edited after the last schedule run)", value: String(n), threshold: "0", pass: n === 0, items: [...(ed ? ed.items : []), ...(el ? el.items : [])], count: n });
  }

  // 10 Baseline
  {
    let baseNote = "";
    if (opts.baseline) {
      const b = baselineTests(opts.baseline, all, dd);
      if (b.error) warnings.push(b.error);
      for (const t of b.tests) add(10, t);
      baseNote = b.note;
    } else {
      const withPlan = all.filter((t) => parseDate(t.row.target_end_date) !== null);
      add(10, { id: "planned-dates", name: "Planned (target) dates on every activity", value: `${withPlan.length} of ${all.length}`, threshold: "all", pass: withPlan.length === all.length && all.length > 0 });
      fromDcma(10, 11);
      fromDcma(10, 14);
      baseNote = "No baseline file given: missed tasks and BEI use the planned dates the file keeps, which P6 moves to the early dates for work not yet started, so they read better than against the true baseline. Open the baseline project's XER to score this practice against it.";
    }
    tests.get(10).note = baseNote;
  }

  const practices = PRACTICES.map((pr) => {
    const ts = tests.get(pr.n);
    const passed = ts.filter((t) => t.pass).length;
    const score = scoreOf(passed, ts.length);
    let note = ts.note || "";
    if (pr.n === 8 && !ts.length) note = "A schedule risk analysis is evidence outside the schedule file (its ranges, its run and its result), so this practice is not rated from the file and is left out of the Credible average. Run the Monte Carlo below on agreed ranges and keep its report with the schedule.";
    return { ...pr, tests: ts, passed, total: ts.length, score, rating: levelOf(score), note };
  });
  const characteristics = CHARACTERISTICS.map((name) => {
    const ps = practices.filter((p) => p.characteristic === name);
    const score = rollUp(ps.map((p) => p.score));
    return { name, practices: ps.map((p) => p.n), score, rating: levelOf(score) };
  });
  // GAO rates the four characteristics, not the schedule as a whole: here a
  // schedule reads as reliable only when each of the four is at least
  // substantially met (a plain average would let one unmet practice hide)
  const rated = characteristics.filter((c) => c.score !== null);
  const met = rated.filter((c) => c.score >= 4).length;
  return {
    project: report.project,
    practices,
    characteristics,
    overall: { met, rated: rated.length, reliable: rated.length === 4 && met === 4, weakest: rated.length ? rated.reduce((a, c) => (c.score < a.score ? c : a)).name : null },
    baseline: !!opts.baseline,
    testsPassed: practices.reduce((a, p) => a + p.passed, 0),
    testsTotal: practices.reduce((a, p) => a + p.total, 0),
    warnings: [...report.warnings, ...warnings],
  };
}

// Practice 10 against a baseline XER: activities matched by activity ID.
// Baseline finish: the baseline's actual finish when it had one, else its
// stored early finish (the dates P6 gave the baseline when it was set).
function baselineTests(bx, all, dd) {
  const { rows, finish } = baselineFinishes(bx);
  if (!rows.length) return { tests: [], error: "the baseline file has no activities", note: "" };
  const byCode = new Map(rows.map((r) => [r.task_code, r.task_code]));
  const bFinish = (code) => finish.get(code);
  const cur = new Map(all.map((t) => [t.code, t]));
  const matched = all.filter((t) => byCode.has(t.code));
  const added = all.filter((t) => !byCode.has(t.code));
  const deleted = rows.filter((r) => !cur.has(r.task_code));
  const tests = [];
  tests.push({ id: "baseline-match", name: "Current activities traceable to the baseline (matched by activity ID)", value: `${pct(matched.length, all.length)}% (${added.length} added, ${deleted.length} deleted since)`, threshold: ">= 90%",
    pass: pct(matched.length, all.length) >= 90, items: [...added.map((t) => ({ code: t.code, name: t.name, why: "not in the baseline" })), ...deleted.map((r) => ({ code: r.task_code, name: r.task_name, why: "in the baseline, deleted since" }))], count: added.length + deleted.length });
  const isMile = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  const due = matched.filter((t) => !isMile(t) && dd !== null && bFinish(byCode.get(t.code)) !== null && bFinish(byCode.get(t.code)) <= dd);
  const done = matched.filter((t) => !isMile(t) && t.actEnd !== null);
  const missed = due.filter((t) => t.actEnd === null || t.actEnd > bFinish(byCode.get(t.code)));
  tests.push({ id: "missed-baseline", name: "Missed tasks against the baseline (due by the data date, finished late or not finished)", value: `${pct(missed.length, due.length)}% (${missed.length} of ${due.length})`, threshold: "<= 5%",
    pass: pct(missed.length, due.length) <= 5, items: missed.map((t) => ({ code: t.code, name: t.name, why: t.actEnd === null ? `baseline finish ${formatDate(bFinish(byCode.get(t.code)))}, not finished` : `baseline ${formatDate(bFinish(byCode.get(t.code)))}, finished ${formatDate(t.actEnd)}` })) });
  // DCMA's BEI: every activity finished to date over those the baseline had due by now
  const bei = due.length ? done.length / due.length : null;
  tests.push({ id: "bei-baseline", name: "Baseline execution index against the baseline (finished / due)", value: bei === null ? "n/a (nothing due yet)" : String(Math.round(bei * 1000) / 1000), threshold: ">= 0.95", pass: bei === null || bei >= 0.95 });
  return { tests, note: `Scored against the baseline file: ${matched.length} of ${all.length} activities matched by activity ID; ${due.length} were due by the data date on the baseline.` };
}

export const overallLine = (r) => r.overall.reliable
  ? "All four characteristics are at least substantially met."
  : `${r.overall.met} of ${r.overall.rated} characteristics at least substantially met; weakest: ${r.overall.weakest}.`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function gaoText(r, { limit = 5 } = {}) {
  const out = [];
  out.push(`${r.project.name}: GAO Schedule Assessment Guide, ten best practices (data date ${r.project.dataDate})`);
  out.push(`${overallLine(r)} ${r.testsPassed} of ${r.testsTotal} file tests pass.${r.baseline ? " Practice 10 scored against the baseline file." : ""}`);
  out.push("");
  for (const c of r.characteristics) out.push(`${c.name.padEnd(17)} ${c.rating.padEnd(18)} (practices ${c.practices.join(", ")})`);
  for (const p of r.practices) {
    out.push("");
    out.push(`${String(p.n).padStart(2)}. ${p.name}: ${p.rating}${p.total ? ` (${p.passed} of ${p.total} tests)` : ""}`);
    for (const t of p.tests) {
      out.push(`    ${t.pass ? "PASS" : "FAIL"}  ${t.name}: ${t.value} (${t.threshold})`);
      if (!t.pass) for (const i of t.items.slice(0, limit)) out.push(`          ${i.code}${i.name ? " " + i.name : ""}: ${i.why}`);
      if (!t.pass && t.count > limit) out.push(`          ... ${t.count - Math.min(limit, t.items.length)} more`);
    }
    if (p.note) out.push(`    ${p.note}`);
  }
  out.push("");
  out.push("Ratings are the share of file tests passed, not an auditor's judgment; the guide gives practices, not numeric limits.");
  return out.join("\n") + "\n";
}

const csvEsc = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// one row per test, then one per activity behind a failed test
export function gaoCsv(r) {
  const rows = [["practice", "practice_name", "rating", "test", "value", "threshold", "pass", "activity_id", "activity_name", "why"]];
  for (const p of r.practices) {
    if (!p.tests.length) rows.push([p.n, p.name, p.rating, "", "", "", "", "", "", p.note]);
    for (const t of p.tests) {
      rows.push([p.n, p.name, p.rating, t.name, t.value, t.threshold, t.pass ? "yes" : "no", "", "", ""]);
      if (!t.pass) for (const i of t.items) rows.push([p.n, p.name, p.rating, t.name, "", "", "", i.code, i.name, i.why]);
    }
  }
  return rows.map((row) => row.map(csvEsc).join(",")).join("\r\n") + "\r\n";
}

const COLOR = { 5: "#1a7f37", 4: "#4c8c2b", 3: "#9a6700", 2: "#bc4c00", 1: "#cf222e" };

// the scorecard as an HTML fragment for the page
export function gaoTableHtml(r, { limit = 8 } = {}) {
  const badge = (score, rating) => `<b style="color:${score && Object.hasOwn(COLOR, score) ? COLOR[score] : "inherit"}">${esc(rating)}</b>`;
  const chars = `<table><thead><tr><th>Characteristic</th><th>Practices</th><th>Rating</th></tr></thead><tbody>${r.characteristics.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.practices.join(", "))}</td><td>${badge(c.score, c.rating)}</td></tr>`).join("")}</tbody></table>`;
  const prs = r.practices.map((p) => {
    const tests = p.tests.map((t) => `<li>${t.pass ? "&#10003;" : "&#10007;"} ${esc(t.name)}: <b>${esc(t.value)}</b> <span class="note">(${esc(t.threshold)})</span>${!t.pass && t.items.length ? `<br><span class="note">${t.items.slice(0, limit).map((i) => `${esc(i.code)}${i.name ? " " + esc(i.name) : ""}${i.why ? ": " + esc(i.why) : ""}`).join("; ")}${t.count > limit ? `; and ${esc(t.count - Math.min(limit, t.items.length))} more (CSV)` : ""}</span>` : ""}</li>`).join("");
    return `<details${p.score !== null && p.score < 5 ? " open" : ""}><summary>${esc(p.n)}. ${esc(p.name)}: ${badge(p.score, p.rating)}${p.total ? ` (${esc(p.passed)} of ${esc(p.total)} tests)` : ""}</summary>${tests ? `<ul>${tests}</ul>` : ""}${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}</details>`;
  }).join("");
  return chars + prs;
}

// a printable page: the scorecard to attach to a review
export function gaoHtml(r, { by } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GAO schedule assessment: ${esc(r.project.name)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:60em;margin:24px auto;padding:0 16px;color:#1f2328;background:#fff}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #d0d7de;padding:4px 8px;text-align:left}.note{color:#57606a;font-size:12px}details{margin:8px 0}summary{font-weight:600}@media print{details{break-inside:avoid}}</style></head><body>
<h1>Schedule assessment against the GAO Schedule Assessment Guide</h1>
<p>${esc(r.project.name)}; data date ${esc(r.project.dataDate)}; forecast finish ${esc(r.project.finish)}.${by ? ` Prepared by ${esc(by)}.` : ""}</p>
<p><b>${esc(overallLine(r))}</b> ${esc(r.testsPassed)} of ${esc(r.testsTotal)} file tests pass.</p>
${gaoTableHtml(r, { limit: 25 }).replace(/<details/g, "<details open")}
<p class="note">Each practice of GAO-16-89G is scored by the share of the tests listed under it that the file passes (all: fully met; three quarters: substantially; half: partially; any: minimally; none: not met), and characteristics by the average of their practices, as GAO's reports roll them up. The tests and thresholds are this tool's, not GAO's: the guide sets out practices, not numeric limits, and an auditor's rating weighs evidence beyond the schedule file. A screening aid, not an audit opinion. Made with XER Schedule Check (FSL-1.1-MIT licensed), https://marisstella.app/xer-schedule-check/.</p>
</body></html>`;
}
