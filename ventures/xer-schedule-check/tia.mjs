// Time impact analysis: a delay event modelled as a fragnet, inserted into
// the schedule update in force when the event happened, and the schedule
// recomputed (AACE International Recommended Practice 52R-06; the
// "modelled / additive / single base" method of RP 29R-03, MIP 3.6).
//
// The contractor (or the owner's reviewer) writes the fragnet as a small
// table: the new activities the event added, how long each takes, what each
// follows and what each holds up. An existing activity can also be made
// longer (added scope on work already planned). The tables of the XER are
// copied, the fragnet's rows are added to TASK and TASKPRED exactly as a
// scheduler would type them into P6, and the same engine that matches P6's
// own dates on 19,820 of 19,822 activities (eval/cpm-vs-p6-2026-11-19.md)
// schedules the copy. The impact is the move of the project finish and of
// every open milestone, in working days of the project calendar, and the
// float every other activity gave up to absorb it.
//
// parseFragnet(text) -> { rows: [{ row, code, name, days, extend, event,
//   preds: [{ code, type, lagDays }], succs: [...], notBefore, calendar }],
//   warnings }
//
// A CSV, tab-separated (pasted from a spreadsheet) or semicolon-separated
// table with a header row. Columns are found by name:
//   activity ID   the fragnet activity's ID (new), or an existing activity's
//                 ID to make it longer
//   name          what the activity is
//   duration      working days; "+5" on an existing activity adds 5 days to
//                 its remaining duration
//   predecessors  "A1030", "A1030 SS", "A1030 FS+2", "F1 FF-1"; several
//                 separated by ";" or "|". Lags in working days.
//   successors    the same, from this activity to the one it holds up
//   not before    the event's date: the activity starts on or after it
//                 (written as a P6 start-on-or-after constraint)
//   event         a name grouping rows into one delay event (optional); each
//                 event is also run alone, so concurrent events can be seen
//   calendar      a calendar ID or name in the file (optional). Without it a
//                 new activity takes the calendar of its first existing
//                 predecessor, else of its first existing successor, else the
//                 project's: it works the hours of the work around it.
//
// timeImpact(xer, fragnet, { projId, expectedFinish }) -> { project, finish: { base,
//   impacted, delayDays }, milestones, fragnet, consumed, drivingPath,
//   fragnetOnPath, byEvent, warnings, impactedXer }
//
// impactedXer is the copy with the fragnet in it; xerText() writes it, so the
// impacted schedule can be imported into P6 and rescheduled there to check
// the dates (the review a TIA gets before anyone signs it).
//
// It models the delay; it does not say who caused it or whether time is due
// under the contract. That is for the parties and their contract.

import { schedule, buildModel, drivingPath } from "./cpm.mjs";
import { pickProject } from "./compare.mjs";
import { splitRows } from "./constraints.mjs";
import { parseLogDate } from "./constraints.mjs";
import { formatDate } from "./xer.mjs";

const COLUMNS = {
  code: /^(activity( id| code)?|task( id| code)?|id|code|fragnet( id)?)$/,
  name: /^(name|activity name|task name|description|what)$/,
  days: /^(duration|days|dur|original duration|working days|added days|remaining duration)/,
  preds: /^(predecessors?|preds?|follows|after)$/,
  succs: /^(successors?|succs?|holds up|before|delays)$/,
  notBefore: /^(not before|start on or after|start no earlier than|event date|date|starts?)$/,
  event: /^(event|delay event|cause|issue)$/,
  calendar: /^(calendar|cal|clndr( id)?)$/,
  group: /^(branch group|group|decision|outcome group|branch point)$/,
  branch: /^(branch|outcome|alternative|branch name)$/,
  probability: /^(probability|prob|chance|likelihood)/,
};

const r1 = (x) => Math.round(x * 10) / 10;

// "A1030 FS+2" -> { code, type, lagDays }
function parseLink(tok) {
  const s = tok.trim();
  if (!s) return null;
  const m = /^(.+?)(?:\s*[:\s]\s*(FS|SS|FF|SF))?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*d?)?$/i.exec(s);
  if (!m) return { code: s, type: "FS", lagDays: 0, raw: s };
  const lag = m[4] ? Number(m[4]) * (m[3] === "-" ? -1 : 1) : 0;
  // raw: the whole token, for an activity ID that itself ends in "-1" or
  // "+2" (A10390-1); insertFragnet takes it whole when the schedule or the
  // fragnet has an activity of that ID
  return { code: m[1].trim(), type: (m[2] || "FS").toUpperCase(), lagDays: lag, raw: s };
}
const links = (cell) => String(cell || "").split(/[;|]/).map(parseLink).filter(Boolean);

export function parseFragnet(text) {
  const rows = splitRows(text);
  const warnings = [];
  if (!rows.length) return { rows: [], warnings: ["the fragnet is empty"] };
  const head = rows[0].map((h) => h.toLowerCase().replace(/[_*:]+/g, " ").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim());
  const columns = {};
  for (const [k, re] of Object.entries(COLUMNS)) {
    const i = head.findIndex((h, j) => re.test(h) && !Object.values(columns).includes(j));
    if (i >= 0) columns[k] = i;
  }
  let body = rows.slice(1);
  if (columns.code === undefined) {
    Object.assign(columns, { code: 0, name: 1, days: 2, preds: 3, succs: 4 });
    body = rows;
    warnings.push("no column named activity ID: read as activity ID, name, duration (days), predecessors, successors");
  }
  const get = (r, k) => (columns[k] === undefined ? "" : (r[columns[k]] ?? "").trim());
  const out = [];
  body.forEach((r, i) => {
    const row = i + (body === rows ? 1 : 2);
    const code = get(r, "code");
    if (!code) { warnings.push(`row ${row}: no activity ID, skipped`); return; }
    const d = get(r, "days");
    const extend = /^\+/.test(d);
    const days = d === "" ? 0 : Number(d.replace(/^\+/, "").replace(/\s*d(ays?)?$/i, ""));
    if (!Number.isFinite(days) || days < 0) { warnings.push(`row ${row}: duration "${d}" is not a number of working days, skipped`); return; }
    const nb = get(r, "notBefore");
    const notBefore = nb ? parseLogDate(nb) : null;
    if (nb && notBefore === null) warnings.push(`row ${row}: date "${nb}" does not read as a date; ignored`);
    for (const l of [...links(get(r, "preds")), ...links(get(r, "succs"))]) if (!["FS", "SS", "FF", "SF"].includes(l.type)) warnings.push(`row ${row}: link type ${l.type} read as FS`);
    // probabilistic branches: rows sharing a group are alternatives, one of
    // which happens (branchSetup)
    const pc = get(r, "probability").replace(/\s+/g, "");
    let probability = null;
    if (pc !== "") {
      probability = /%$/.test(pc) ? Number(pc.slice(0, -1)) / 100 : Number(pc);
      if (Number.isFinite(probability) && probability > 1 && probability <= 100 && !/%$/.test(pc)) probability /= 100;
      if (!(Number.isFinite(probability) && probability > 0 && probability <= 1)) { warnings.push(`row ${row}: probability "${get(r, "probability")}" is not between 0 and 100%; ignored`); probability = null; }
    }
    out.push({ row, code, name: get(r, "name"), days, extend, event: get(r, "event") || null, preds: links(get(r, "preds")), succs: links(get(r, "succs")), notBefore, calendar: get(r, "calendar") || null, group: get(r, "group") || null, branch: get(r, "branch") || null, probability });
  });
  return { rows: out, warnings };
}

// The tables of `xer` with the fragnet rows in them (rows: parseFragnet's).
// Returns { xer, newIds: Map(code -> task_id), extended: [code], warnings }.
export function insertFragnet(xer, rows, { model, project }) {
  const warnings = [];
  const p = project;
  const byCode = new Map();
  for (const t of model.tasks.values()) if (t.proj === p.id && t.code !== undefined) byCode.set(String(t.code), t);
  const calsById = model.cals;
  const calOf = (spec) => {
    if (!spec) return null;
    if (calsById.has(spec)) return calsById.get(spec);
    for (const c of calsById.values()) if ((c.name || "").toLowerCase() === spec.toLowerCase()) return c;
    return null;
  };
  const TASK = (xer.tables.TASK || []).map((r) => ({ ...r }));
  const TASKPRED = [...(xer.tables.TASKPRED || [])];
  const rowById = new Map(TASK.map((r) => [r.task_id, r]));
  const newIds = new Map();
  const newCal = new Map();
  const extended = [];
  const extendedIds = [];
  const fresh = rows.filter((f) => !f.extend && !byCode.has(f.code));
  // ids and calendars for the new activities first, so they may link to each other
  let k = 0;
  const taken = new Set(TASK.map((r) => r.task_id));
  for (const f of fresh) {
    if (newIds.has(f.code)) { warnings.push(`row ${f.row}: activity ${f.code} appears twice in the fragnet; the second row is skipped`); f.skip = true; continue; }
    let id;
    do id = `tia${++k}`; while (taken.has(id));
    newIds.set(f.code, id);
  }
  const existing = (code) => byCode.get(code) || null;
  const known = (code) => byCode.has(code) || newIds.has(code);
  const whole = (l) => (l.raw && l.raw !== l.code && known(l.raw) ? { code: l.raw, type: "FS", lagDays: 0, raw: l.raw } : l);
  for (const f of rows) { f.preds = f.preds.map(whole); f.succs = f.succs.map(whole); }
  for (const f of fresh) {
    if (f.skip) continue;
    let cal = calOf(f.calendar);
    if (f.calendar && !cal) warnings.push(`row ${f.row}: calendar "${f.calendar}" is not in the file; used the calendar of the work around it`);
    if (!cal) cal = [...f.preds, ...f.succs].map((l) => existing(l.code)).find(Boolean)?.cal || p.cal;
    newCal.set(f.code, cal);
  }
  const calFor = (code) => newCal.get(code) || existing(code)?.cal || p.cal;
  const hpd = (cal) => cal?.hoursPerDay || (cal?.weekMinutes ? cal.weekMinutes / 300 : 8);
  const wbsOf = (f) => [...f.preds, ...f.succs].map((l) => existing(l.code)).find(Boolean)?.wbs ?? "";
  for (const f of rows) {
    if (f.skip) continue;
    const t = existing(f.code);
    if (t && !f.extend && f.days > 0) warnings.push(`row ${f.row}: ${f.code} is already in the schedule; read as ${f.days} days added to it (write +${f.days} to say so)`);
    if (t) {
      if (t.status === "TK_Complete") { warnings.push(`row ${f.row}: ${f.code} is finished; a finished activity cannot be made longer (add a new fragnet activity after it)`); }
      // a milestone has no duration in P6 (the engine schedules it as an
      // instant whatever the hours field says), so days added to one would
      // be dropped without a word: refuse them (eval/tia-check-2026-11-20.md)
      else if (f.days > 0 && (t.type === "TT_Mile" || t.type === "TT_FinMile")) { warnings.push(`row ${f.row}: ${f.code} is a milestone, which has no duration, so the ${f.days} days were not added; insert a new fragnet activity before it instead`); }
      else if (f.days > 0 && t.span) { warnings.push(`row ${f.row}: ${f.code} is a level of effort or WBS summary, which takes its dates from its neighbours, so the ${f.days} days were not added`); }
      else if (f.days > 0) {
        const r = rowById.get(t.id);
        const add = f.days * hpd(t.cal);
        r.remain_drtn_hr_cnt = String((Number(r.remain_drtn_hr_cnt) || 0) + add);
        r.target_drtn_hr_cnt = String((Number(r.target_drtn_hr_cnt) || 0) + add);
        extended.push(f.code);
        extendedIds.push(t.id);
        // an FF or SF link to its finish holds the finish where it is: the
        // added days move its start earlier, not its finish (the engine and
        // P6 agree on that, eval/tia-check-2026-11-20.md); say so
        // successors tied only at its start (SS, or SF) do not wait for its
        // finish, so added days reach nothing after it
        const net = t.succs.filter((rel) => { const s2 = model.tasks.get(rel.succId); return s2 && !s2.span; });
        if (net.length && net.every((rel) => rel.type === "PR_SS" || rel.type === "PR_SF")) warnings.push(`row ${f.row}: ${f.code}'s successors are all tied to its start (start-to-start), so the added days hold none of them up; if the delay does hold them up, insert a fragnet activity after it with finish-to-start links, or add the finish-to-finish links the schedule lacks`);
        if (t.status === "TK_NotStart" && t.preds.some((rel) => rel.type === "PR_FF" || rel.type === "PR_SF")) warnings.push(`row ${f.row}: ${f.code} has a finish-to-finish (or start-to-finish) predecessor, so added days can move its start earlier instead of its finish; to model work that comes after it, insert a new fragnet activity`);
      }
    } else {
      const cal = newCal.get(f.code);
      const hrs = f.days * hpd(cal);
      const row = {
        task_id: newIds.get(f.code), proj_id: p.id, wbs_id: wbsOf(f), clndr_id: cal?.id ?? "",
        task_type: f.days === 0 ? "TT_Mile" : "TT_Task", status_code: "TK_NotStart",
        task_code: f.code, task_name: f.name || `Fragnet ${f.code}`,
        remain_drtn_hr_cnt: String(hrs), target_drtn_hr_cnt: String(hrs),
        act_start_date: "", act_end_date: "",
        cstr_type: f.notBefore !== null ? "CS_MSOA" : "", cstr_date: f.notBefore !== null ? formatDate(f.notBefore) : "",
      };
      TASK.push(row);
      rowById.set(row.task_id, row);
    }
    // links: this row's predecessors and successors
    const idOf = (code) => newIds.get(code) ?? existing(code)?.id ?? null;
    const lagHours = (predCode, succCode, days) => {
      if (!days) return 0;
      const lc = p.lagCal;
      const cal = lc === "rcal_Successor" ? calFor(succCode) : lc === "rcal_24Hour" ? { hoursPerDay: 24 } : lc === "rcal_ProjDefault" ? p.cal : calFor(predCode);
      return days * hpd(cal);
    };
    const add = (predCode, succCode, l) => {
      const pid = idOf(predCode), sid = idOf(succCode);
      if (pid === null) { warnings.push(`row ${f.row}: activity ${predCode} is not in project ${p.code || p.id} or the fragnet; link skipped`); return; }
      if (sid === null) { warnings.push(`row ${f.row}: activity ${succCode} is not in project ${p.code || p.id} or the fragnet; link skipped`); return; }
      const st = existing(succCode);
      if (st && st.status === "TK_Complete") { warnings.push(`row ${f.row}: ${succCode} is finished, so the fragnet cannot hold it up; link skipped`); return; }
      const type = ["FS", "SS", "FF", "SF"].includes(l.type) ? l.type : "FS";
      TASKPRED.push({ task_pred_id: `tiar${TASKPRED.length + 1}`, task_id: sid, pred_task_id: pid, proj_id: p.id, pred_proj_id: p.id, pred_type: `PR_${type}`, lag_hr_cnt: String(lagHours(predCode, succCode, l.lagDays)) });
    };
    for (const l of f.preds) add(l.code, f.code, l);
    for (const l of f.succs) add(f.code, l.code, l);
    const hasPred = f.preds.length || rows.some((g) => g.succs.some((l) => l.code === f.code));
    const hasSucc = f.succs.length || rows.some((g) => g.preds.some((l) => l.code === f.code));
    if (!t && !hasPred && f.notBefore === null) warnings.push(`row ${f.row}: ${f.code} has no predecessor and no date, so it starts at the data date`);
    if (!t && !hasSucc) warnings.push(`row ${f.row}: ${f.code} holds nothing up (no successor), so it cannot move the finish unless it outlasts it`);
  }
  return { xer: { ...xer, tables: { ...xer.tables, TASK, TASKPRED } }, newIds, extended, extendedIds, warnings };
}

// Probabilistic branches in the fragnet. Rows with a branch group and a
// branch name are alternatives: in each outcome exactly one branch of every
// group happens (a submittal passes review, 70%, or comes back for
// resubmittal, 30%). Rows of a branch share its probability (written on any
// of them); a branch with none takes an equal share of what the group's given
// probabilities leave; given probabilities under 100% leave the rest to "none
// of these" (no row of the group happens). The same activity ID may be written
// on two branches with different durations or logic (the review takes 5 days
// or 15): only one is ever inserted.
//
// Returns { groups: [{ group, branches: [{ name, probability, rows, remainder }],
//   mostLikely }], outcomes } or null when no row names a group.
export const MAX_OUTCOMES = 512;
export function branchSetup(rows, warnings = []) {
  const groups = new Map();
  for (const f of rows) {
    if (f.skip) continue;
    if (!f.group && f.branch) { warnings.push(`row ${f.row}: branch "${f.branch}" has no branch group, so the row is in every outcome`); continue; }
    if (!f.group) continue;
    if (!f.branch) { warnings.push(`row ${f.row}: branch group "${f.group}" with no branch name; the row is in every outcome`); f.group = null; continue; }
    if (!groups.has(f.group)) groups.set(f.group, { group: f.group, branches: new Map() });
    const g = groups.get(f.group);
    if (!g.branches.has(f.branch)) g.branches.set(f.branch, { name: f.branch, probability: null, rows: [], remainder: false });
    const b = g.branches.get(f.branch);
    b.rows.push(f);
    if (f.probability !== null) {
      if (b.probability === null) b.probability = f.probability;
      else if (Math.abs(b.probability - f.probability) > 1e-9) warnings.push(`row ${f.row}: branch "${f.branch}" of "${f.group}" was given ${r1(b.probability * 100)}% on an earlier row; that is kept`);
    }
  }
  if (!groups.size) return null;
  const out = [];
  let outcomes = 1;
  for (const g of groups.values()) {
    const list = [...g.branches.values()];
    const given = list.filter((b) => b.probability !== null).reduce((a, b) => a + b.probability, 0);
    const missing = list.filter((b) => b.probability === null);
    if (given > 1 + 1e-9) throw new Error(`branch group "${g.group}": the branches' probabilities add to ${r1(given * 100)}%, over 100%`);
    if (missing.length) {
      const each = (1 - given) / missing.length;
      if (each <= 1e-9) throw new Error(`branch group "${g.group}": the given probabilities add to 100%, leaving nothing for ${missing.map((b) => `"${b.name}"`).join(", ")}`);
      for (const b of missing) b.probability = each;
      if (given > 0) warnings.push(`branch group "${g.group}": ${missing.map((b) => `"${b.name}"`).join(", ")} had no probability and ${missing.length === 1 ? "takes" : "share"} the ${r1((1 - given) * 100)}% the others leave`);
      else if (list.length > 1) warnings.push(`branch group "${g.group}": no probabilities given, so its ${list.length} branches are equally likely`);
    } else if (given < 1 - 1e-9) list.push({ name: "none of these", probability: 1 - given, rows: [], remainder: true });
    if (list.length === 1) warnings.push(`branch group "${g.group}" has one branch at 100%: its rows are in every outcome`);
    // the most likely branch (the first listed on a tie) is the one the
    // deterministic analysis takes
    const mostLikely = list.reduce((m, b) => (b.probability > m.probability + 1e-12 ? b : m), list[0]);
    out.push({ group: g.group, branches: list, mostLikely: mostLikely.name });
    outcomes *= list.length;
  }
  if (outcomes > MAX_OUTCOMES) throw new Error(`the branch groups make ${outcomes} outcomes, more than the ${MAX_OUTCOMES} the analysis schedules one by one; merge groups, or run the risk analysis's probabilistic branches instead`);
  return { groups: out, outcomes };
}

// The fragnet rows of one outcome (picks: group -> branch name), copied, with
// links to new activities that exist only on branches not taken dropped.
// existingCodes: the activity IDs already in the schedule.
export function rowsForOutcome(rows, picks, existingCodes) {
  const kept = rows.filter((f) => !f.skip && (!f.group || picks.get(f.group) === f.branch));
  const keptCodes = new Set(kept.map((f) => f.code));
  const gone = new Set(rows.filter((f) => !f.skip && f.group && picks.get(f.group) !== f.branch && !keptCodes.has(f.code) && !existingCodes.has(f.code)).map((f) => f.code));
  const live = (l) => !gone.has(l.code) && !(l.raw && gone.has(l.raw));
  return kept.map((f) => ({ ...f, preds: f.preds.filter(live), succs: f.succs.filter(live) }));
}

// every outcome: one branch per group, with its probability
function* outcomesOf(groups, i = 0, picks = [], prob = 1) {
  if (i === groups.length) { yield { picks, probability: prob }; return; }
  for (const b of groups[i].branches) yield* outcomesOf(groups, i + 1, [...picks, { group: groups[i].group, branch: b.name }], prob * b.probability);
}

export function timeImpact(xer, fragnet, { projId = null, expectedFinish = true } = {}) {
  // expectedFinish: false schedules both runs as if the project did not use
  // expected end dates (the what-if where no crew is assumed to speed up)
  const ex = expectedFinish === false ? { expectedFinish: false } : {};
  const parsed0 = typeof fragnet === "string" ? parseFragnet(fragnet) : fragnet;
  const model = buildModel(xer);
  const base = schedule(null, { model, ...ex });
  const p = pickProject(xer, model, projId);
  if (!p) throw new Error("no project in the file");
  const warnings = [...parsed0.warnings];
  // probabilistic branches: the deterministic analysis below takes the most
  // likely branch of each group; every outcome is scheduled after it
  const setup = branchSetup(parsed0.rows, warnings);
  const existingCodes = new Set();
  for (const t of model.tasks.values()) if (t.proj === p.id && t.code !== undefined) existingCodes.add(String(t.code));
  const mainPicks = setup ? new Map(setup.groups.map((g) => [g.group, g.mostLikely])) : null;
  const parsed = setup ? { ...parsed0, rows: rowsForOutcome(parsed0.rows, mainPicks, existingCodes) } : parsed0;
  const ins = insertFragnet(xer, parsed.rows, { model, project: p });
  warnings.push(...ins.warnings);
  const impModel = buildModel(ins.xer);
  const imp = schedule(null, { model: impModel, ...ex });
  const loops = imp.loops.filter((l) => l.some((id) => [...ins.newIds.values()].includes(id) || ins.extendedIds.includes(id)) || !base.loops.length);
  if (loops.length) {
    const names = loops.map((l) => l.map((id) => impModel.tasks.get(id)?.code ?? id).join(" > "));
    throw new Error(`the fragnet makes a logic loop: ${names.slice(0, 3).join("; ")}`);
  }
  const pcal = p.cal;
  const wd = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : r1((b >= a ? pcal.workBetween(a, b) : -pcal.workBetween(b, a)) / 60 / (pcal.hoursPerDay || 8)));
  const f0 = base.projects.get(p.id)?.finish ?? null;
  const f1 = imp.projects.get(p.id)?.finish ?? null;
  const days = (t, h) => (Number.isFinite(h) ? r1(h / (t.cal.hoursPerDay || 8)) : null);

  // milestones: every open milestone of the project
  const milestones = [];
  for (const t of model.tasks.values()) {
    if (t.proj !== p.id || t.status === "TK_Complete" || (t.type !== "TT_Mile" && t.type !== "TT_FinMile")) continue;
    const a = base.tasks.get(t.id), b = imp.tasks.get(t.id);
    if (!a || !b) continue;
    const at0 = t.type === "TT_FinMile" ? a.ef : (a.remES ?? a.es), at1 = t.type === "TT_FinMile" ? b.ef : (b.remES ?? b.es);
    milestones.push({ code: t.code, name: t.name, base: formatDate(at0), impacted: formatDate(at1), delayDays: wd(at0, at1) ?? 0 });
  }
  milestones.sort((x, y) => y.delayDays - x.delayDays || String(x.code).localeCompare(String(y.code)));

  // the fragnet's own activities (and the activities made longer)
  const fragIds = new Set(ins.newIds.values());
  const pathIds = drivingPath(imp, p.id);
  const onPath = new Set(pathIds);
  const frag = [];
  for (const f of parsed.rows) {
    if (f.skip) continue;
    const id = ins.newIds.get(f.code) ?? [...model.tasks.values()].find((t) => t.proj === p.id && String(t.code) === f.code)?.id;
    const t = impModel.tasks.get(id), r = imp.tasks.get(id);
    if (!t || !r) continue;
    frag.push({ code: f.code, name: t.name, event: f.event, days: f.days, kind: fragIds.has(id) ? "new" : "made longer", start: formatDate(r.remES ?? r.es), finish: formatDate(r.ef), floatDays: days(t, r.tf), driving: onPath.has(id) });
  }

  // float given up by the existing open activities
  const consumed = [];
  let lessFloat = 0, nowCritical = 0, nowNegative = 0;
  for (const t of model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status === "TK_Complete") continue;
    const a = base.tasks.get(t.id), b = imp.tasks.get(t.id);
    if (!a || !b || !Number.isFinite(a.tf) || !Number.isFinite(b.tf)) continue;
    const used = a.tf - b.tf;
    if (used <= 0.01) continue;
    lessFloat++;
    if (a.tf > 0 && b.tf <= 0) nowCritical++;
    if (a.tf >= 0 && b.tf < 0) nowNegative++;
    consumed.push({ code: t.code, name: t.name, floatBefore: days(t, a.tf), floatAfter: days(t, b.tf), usedDays: days(t, used), startBefore: formatDate(a.remES ?? a.es), startAfter: formatDate(b.remES ?? b.es) });
  }
  consumed.sort((x, y) => y.usedDays - x.usedDays || (x.floatAfter ?? 0) - (y.floatAfter ?? 0));

  // expected finish dates ("use expected end dates" on): an activity whose
  // remaining work starts later but still finishes on its expected date has
  // shrunk to absorb the delay, which the real crew may not manage
  const absorbed = [];
  if (p.useExpectedFinish && expectedFinish !== false) for (const t of model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status === "TK_Complete" || t.expEnd === null) continue;
    const a = base.tasks.get(t.id), b = imp.tasks.get(t.id);
    if (!a || !b) continue;
    const s0 = a.remES ?? a.es, s1 = b.remES ?? b.es;
    if (s1 > s0 && b.ef === a.ef) absorbed.push({ code: t.code, name: t.name, startBefore: formatDate(s0), startAfter: formatDate(s1), expectedFinish: formatDate(t.expEnd) });
  }
  if (absorbed.length) warnings.push(`${absorbed.length} ${absorbed.length === 1 ? "activity keeps its" : "activities keep their"} expected finish date and ${absorbed.length === 1 ? "absorbs" : "absorb"} the delay by getting shorter (${absorbed.slice(0, 5).map((x) => x.code).join(", ")}${absorbed.length > 5 ? ` and ${absorbed.length - 5} more` : ""}): the project uses expected end dates, as P6 would; to see the delay if the crew cannot finish in less time, run again without expected finish dates`);

  // each event alone, when the fragnet names more than one
  const events = [...new Set(parsed.rows.filter((f) => !f.skip).map((f) => f.event).filter(Boolean))];
  const byEvent = [];
  if (events.length > 1) {
    for (const e of events) {
      const rows = parsed.rows.filter((f) => !f.skip && f.event === e).map((f) => ({ ...f, preds: f.preds, succs: f.succs }));
      const codes = new Set(rows.map((f) => f.code));
      // links to another event's new activities are dropped when run alone
      const other = new Set(parsed.rows.filter((f) => f.event !== e && ins.newIds.has(f.code)).map((f) => f.code));
      for (const f of rows) { f.preds = f.preds.filter((l) => !other.has(l.code) || codes.has(l.code)); f.succs = f.succs.filter((l) => !other.has(l.code) || codes.has(l.code)); }
      const one = insertFragnet(xer, rows, { model, project: p });
      const run = schedule(one.xer, { forwardOnly: true, ...ex });
      const fe = run.projects.get(p.id)?.finish ?? null;
      byEvent.push({ event: e, finish: formatDate(fe), delayDays: wd(f0, fe) ?? 0 });
    }
  }
  const delayDays = wd(f0, f1) ?? 0;

  // every outcome of the branches, scheduled as the events alone are
  let branches = null;
  if (setup) {
    const outcomes = [];
    for (const o of outcomesOf(setup.groups)) {
      const picks = new Map(o.picks.map((x) => [x.group, x.branch]));
      const rows = rowsForOutcome(parsed0.rows, picks, existingCodes);
      const one = insertFragnet(xer, rows, { model, project: p });
      const run = schedule(one.xer, { forwardOnly: true, ...ex });
      const newIds = new Set(one.newIds.values());
      const loop = run.loops.find((l) => l.some((id) => newIds.has(id) || one.extendedIds.includes(id)));
      if (loop) throw new Error(`the fragnet makes a logic loop when ${o.picks.map((x) => `${x.group} is ${x.branch}`).join(" and ")}: ${loop.map((id) => one.xer.tables.TASK.find((r) => r.task_id === id)?.task_code ?? id).join(" > ")}`);
      const fe = run.projects.get(p.id)?.finish ?? null;
      outcomes.push({ picks: o.picks, probability: o.probability, finish: formatDate(fe), delayDays: wd(f0, fe) ?? 0 });
    }
    const expected = outcomes.reduce((a, o) => a + o.probability * o.delayDays, 0);
    const dist = new Map();
    for (const o of outcomes) dist.set(o.delayDays, (dist.get(o.delayDays) || 0) + o.probability);
    let cum = 0;
    const distribution = [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([d, pr]) => ({ delayDays: d, probability: pr, cumulative: (cum += pr) }));
    const q = (x) => distribution.find((d) => d.cumulative >= x - 1e-9)?.delayDays ?? null;
    const groups = setup.groups.map((g) => ({
      group: g.group,
      mostLikely: g.mostLikely,
      branches: g.branches.map((b) => {
        const mine = outcomes.filter((o) => o.picks.some((x) => x.group === g.group && x.branch === b.name));
        const pr = mine.reduce((a, o) => a + o.probability, 0);
        // the expected delay given this branch happens
        return { name: b.name, probability: b.probability, rows: b.rows.length, remainder: b.remainder, delayDays: pr > 0 ? r1(mine.reduce((a, o) => a + o.probability * o.delayDays, 0) / pr) : null };
      }),
    }));
    for (const g of groups) { const ds = g.branches.map((b) => b.delayDays); g.swingDays = r1(Math.max(...ds) - Math.min(...ds)); }
    outcomes.sort((a, b) => b.delayDays - a.delayDays || b.probability - a.probability);
    branches = {
      groups,
      outcomes,
      expectedDelayDays: r1(expected),
      p50DelayDays: q(0.5),
      p80DelayDays: q(0.8),
      minDelayDays: distribution[0].delayDays,
      maxDelayDays: distribution[distribution.length - 1].delayDays,
      chanceOfDelay: outcomes.filter((o) => o.delayDays > 0).reduce((a, o) => a + o.probability, 0),
      distribution,
      // the deterministic result above is the most likely branch of each group
      deterministicDelayDays: delayDays,
    };
  }
  const sumAlone = byEvent.reduce((s, e) => s + e.delayDays, 0);
  return {
    project: { id: p.id, code: p.code, dataDate: formatDate(p.dataDate) },
    finish: { base: formatDate(f0), impacted: formatDate(f1), delayDays },
    milestones,
    milestonesMoved: milestones.filter((m) => m.delayDays !== 0).length,
    fragnet: frag,
    extended: ins.extended,
    consumed,
    absorbed,
    summary: { activitiesLessFloat: lessFloat, nowCritical, nowNegative, fragnetActivities: ins.newIds.size, madeLonger: ins.extended.length },
    drivingPath: pathIds.map((id) => impModel.tasks.get(id)?.code ?? id),
    fragnetOnPath: pathIds.filter((id) => fragIds.has(id)).map((id) => impModel.tasks.get(id)?.code ?? id),
    byEvent,
    // events alone add up to more than together when they share the path
    // (concurrent); to less when one only bites once another has used the float
    overlapDays: byEvent.length ? r1(sumAlone - delayDays) : null,
    branches,
    warnings,
    impactedXer: ins.xer,
  };
}

const pct = (x) => `${r1(x * 100)}%`;
const picksText = (picks) => picks.map((x) => `${x.group}: ${x.branch}`).join("; ");
function branchLines(b) {
  const L = [];
  L.push(`Probabilistic branches (${b.outcomes.length} outcomes, each scheduled): expected delay ${b.expectedDelayDays} d, P50 ${b.p50DelayDays} d, P80 ${b.p80DelayDays} d, ${b.minDelayDays} to ${b.maxDelayDays} d; ${pct(b.chanceOfDelay)} chance the finish moves. The single result above takes the most likely branch of each group (${b.deterministicDelayDays} d).`);
  for (const g of b.groups) {
    L.push(`  ${g.group} (swing ${g.swingDays} d):`);
    for (const x of g.branches) L.push(`    ${x.name}: ${pct(x.probability)}${x.remainder ? " (the rest)" : `, ${x.rows} row${x.rows === 1 ? "" : "s"}`}, expected delay if it happens ${x.delayDays} d${x.name === g.mostLikely ? " (most likely)" : ""}`);
  }
  L.push("  Outcomes, worst first:");
  for (const o of b.outcomes.slice(0, 12)) L.push(`    ${o.delayDays} d, ${pct(o.probability)}: ${picksText(o.picks)} (finish ${o.finish})`);
  if (b.outcomes.length > 12) L.push(`    and ${b.outcomes.length - 12} more in the CSV`);
  return L;
}

export function timeImpactText(r, { limit = 15 } = {}) {
  const L = [];
  L.push(`Time impact analysis, project ${r.project.code || r.project.id}, data date ${r.project.dataDate}`);
  L.push(`Finish: ${r.finish.base} -> ${r.finish.impacted}: ${r.finish.delayDays > 0 ? `${r.finish.delayDays} working days later` : r.finish.delayDays < 0 ? `${-r.finish.delayDays} working days earlier` : "no change"}`);
  if (r.byEvent.length) {
    L.push("Each event alone:");
    for (const e of r.byEvent) L.push(`  ${e.event}: ${e.delayDays} d (finish ${e.finish})`);
    L.push(`  alone they add to ${r1(r.byEvent.reduce((s, e) => s + e.delayDays, 0))} d, together ${r.finish.delayDays} d${r.overlapDays > 0 ? ` (${r.overlapDays} d overlap: concurrent on the path)` : ""}`);
  }
  if (r.branches) for (const line of branchLines(r.branches)) L.push(line);
  L.push(r.branches ? "Fragnet (most likely branch of each group):" : "Fragnet:");
  for (const f of r.fragnet) L.push(`  ${f.code} ${f.name} (${f.kind}, ${f.days} d): ${f.start} to ${f.finish}, float ${f.floatDays} d${f.driving ? ", drives the finish" : ""}`);
  if (r.milestonesMoved) {
    L.push(`Milestones moved (${r.milestonesMoved} of ${r.milestones.length}):`);
    for (const m of r.milestones.filter((x) => x.delayDays !== 0).slice(0, limit)) L.push(`  ${m.code} ${m.name}: ${m.base} -> ${m.impacted} (${m.delayDays > 0 ? "+" : ""}${m.delayDays} d)`);
  }
  const s = r.summary;
  L.push(`Float: ${s.activitiesLessFloat} activities gave up float, ${s.nowCritical} became critical, ${s.nowNegative} went negative`);
  for (const c of r.consumed.slice(0, limit)) L.push(`  ${c.code} ${c.name}: ${c.floatBefore} -> ${c.floatAfter} d`);
  if (r.warnings.length) L.push("Warnings:", ...r.warnings.map((w) => `  ${w}`));
  return L.join("\n");
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function timeImpactCsv(r) {
  const out = [["section", "activity", "name", "before", "after", "change (working days)", "note"]];
  out.push(["finish", "", "project finish", r.finish.base, r.finish.impacted, r.finish.delayDays, ""]);
  for (const e of r.byEvent) out.push(["event alone", "", e.event, r.finish.base, e.finish, e.delayDays, ""]);
  if (r.branches) {
    const b = r.branches;
    out.push(["branches", "", "expected delay over every outcome", r.finish.base, "", b.expectedDelayDays, `P50 ${b.p50DelayDays} d; P80 ${b.p80DelayDays} d; ${b.minDelayDays} to ${b.maxDelayDays} d; chance of delay ${pct(b.chanceOfDelay)}`]);
    for (const g of b.groups) for (const x of g.branches) out.push(["branch", "", `${g.group}: ${x.name}`, "", "", x.delayDays, `probability ${pct(x.probability)}${x.name === g.mostLikely ? "; most likely, in the single result" : ""}; expected delay if it happens`]);
    for (const o of b.outcomes) out.push(["outcome", "", picksText(o.picks), r.finish.base, o.finish, o.delayDays, `probability ${pct(o.probability)}`]);
  }
  for (const f of r.fragnet) out.push(["fragnet", f.code, f.name, f.start, f.finish, f.days, `${f.kind}; float ${f.floatDays} d${f.driving ? "; drives the finish" : ""}`]);
  for (const m of r.milestones) out.push(["milestone", m.code, m.name, m.base, m.impacted, m.delayDays, ""]);
  for (const c of r.consumed) out.push(["float used", c.code, c.name, c.floatBefore, c.floatAfter, -c.usedDays, `start ${c.startBefore} -> ${c.startAfter}`]);
  return out.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function branchHtml(b) {
  return `<h2>Probabilistic branches</h2>
<p>The fragnet has alternatives: in each outcome one branch of every group happens. All ${esc(b.outcomes.length)} outcomes were scheduled. <b>Expected delay ${esc(b.expectedDelayDays)} working days</b>; P50 ${esc(b.p50DelayDays)}, P80 ${esc(b.p80DelayDays)}, from ${esc(b.minDelayDays)} to ${esc(b.maxDelayDays)}; a ${esc(pct(b.chanceOfDelay))} chance the finish moves. The finish and milestones above take the most likely branch of each group (${esc(b.deterministicDelayDays)} days).</p>
<table><thead><tr><th>Group</th><th>Branch</th><th class="n">Probability</th><th class="n">Expected delay if it happens (d)</th></tr></thead><tbody>${b.groups.map((g) => g.branches.map((x) => `<tr><td>${esc(g.group)}</td><td>${esc(x.name)}${x.name === g.mostLikely ? " (most likely)" : ""}</td><td class="n">${esc(pct(x.probability))}</td><td class="n">${esc(x.delayDays)}</td></tr>`).join("")).join("")}</tbody></table>
<table><thead><tr><th>Outcome</th><th class="n">Probability</th><th>Finish</th><th class="n">Delay (d)</th></tr></thead><tbody>${b.outcomes.slice(0, 40).map((o) => `<tr><td>${esc(picksText(o.picks))}</td><td class="n">${esc(pct(o.probability))}</td><td>${esc(o.finish)}</td><td class="n">${esc(o.delayDays)}</td></tr>`).join("")}</tbody></table>${b.outcomes.length > 40 ? `<p class="note">${esc(b.outcomes.length - 40)} more outcomes in the CSV.</p>` : ""}`;
}

// A printable exhibit for a time extension request or its review.
export function timeImpactHtml(r, meta = {}) {
  const d = r.finish.delayDays;
  const row = (cells) => `<tr>${cells.map((c, i) => `<td${i >= cells.length - 1 && typeof c === "number" ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`;
  const ms = r.milestones.filter((m) => m.delayDays !== 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Time impact analysis: ${esc(meta.title || r.project.code || "")}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}table{border-collapse:collapse;width:100%;margin:8px 0 16px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f3f3}.n{text-align:right}.big{font-size:20px}.note{color:#555;font-size:12px}@media print{body{margin:0}}</style></head><body>
<h1>Time impact analysis</h1>
<p>Project <b>${esc(r.project.code || r.project.id)}</b>, schedule update with data date ${esc(r.project.dataDate)}${meta.event ? `. Delay event: <b>${esc(meta.event)}</b>` : ""}${meta.by ? `. Prepared by ${esc(meta.by)}` : ""}.</p>
<p class="big">Project finish ${esc(r.finish.base)} &rarr; <b>${esc(r.finish.impacted)}</b>: ${d > 0 ? `<b>${esc(d)} working days later</b>` : d < 0 ? `${esc(-d)} working days earlier` : "no change"}.</p>
<p>Method: the fragnet below was inserted into the update in force when the event happened and the schedule recomputed with the file's own calendars, logic, constraints and scheduling options (AACE RP 52R-06, prospective time impact analysis; RP 29R-03 MIP 3.6). The impact is the difference in the project finish and in each milestone between the two runs, in working days of the project calendar.</p>
${r.byEvent.length ? `<h2>Each event alone</h2><table><thead><tr><th>Event</th><th>Finish</th><th class="n">Days</th></tr></thead><tbody>${r.byEvent.map((e) => row([e.event, e.finish, e.delayDays])).join("")}<tr><td>All together</td><td>${esc(r.finish.impacted)}</td><td class="n">${esc(d)}</td></tr></tbody></table><p class="note">${r.overlapDays > 0 ? `The events alone add up to ${esc(r1(r.byEvent.reduce((s, e) => s + e.delayDays, 0)))} days but ${esc(d)} together: ${esc(r.overlapDays)} days are concurrent (the events delay the same path at the same time).` : r.overlapDays < 0 ? `Together they delay more than alone: one event only reaches the finish once another has used the float.` : "The events' delays add up: no overlap."}</p>` : ""}
${r.branches ? branchHtml(r.branches) : ""}
<h2>Fragnet${r.branches ? " (most likely branch of each group)" : ""}</h2><table><thead><tr><th>Activity</th><th>Name</th><th>Kind</th><th class="n">Days</th><th>Start</th><th>Finish</th><th class="n">Float (d)</th><th>Drives the finish</th></tr></thead><tbody>${r.fragnet.map((f) => `<tr><td>${esc(f.code)}</td><td>${esc(f.name)}</td><td>${esc(f.kind)}</td><td class="n">${esc(f.days)}</td><td>${esc(f.start)}</td><td>${esc(f.finish)}</td><td class="n">${esc(f.floatDays)}</td><td>${f.driving ? "yes" : ""}</td></tr>`).join("")}</tbody></table>
${ms.length ? `<h2>Milestones moved</h2><table><thead><tr><th>Milestone</th><th>Name</th><th>Before</th><th>After</th><th class="n">Days</th></tr></thead><tbody>${ms.map((m) => row([m.code, m.name, m.base, m.impacted, m.delayDays])).join("")}</tbody></table>` : "<p>No milestone moved.</p>"}
<h2>Float used</h2><p>${esc(r.summary.activitiesLessFloat)} activities gave up float; ${esc(r.summary.nowCritical)} became critical and ${esc(r.summary.nowNegative)} went negative.</p>
${r.consumed.length ? `<table><thead><tr><th>Activity</th><th>Name</th><th class="n">Float before (d)</th><th class="n">After (d)</th></tr></thead><tbody>${r.consumed.slice(0, 40).map((c) => `<tr><td>${esc(c.code)}</td><td>${esc(c.name)}</td><td class="n">${esc(c.floatBefore)}</td><td class="n">${esc(c.floatAfter)}</td></tr>`).join("")}</tbody></table>${r.consumed.length > 40 ? `<p class="note">${esc(r.consumed.length - 40)} more in the CSV.</p>` : ""}` : ""}
<h2>Driving path after the event</h2><p>${esc(r.drivingPath.join(" > "))}</p>
${r.warnings.length ? `<h2>Notes</h2><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
<p class="note">Made with XER Schedule Check. It models the delay with the schedule's own logic; it does not decide who caused it or whether time is due under the contract. Import the impacted XER into P6 and schedule it to confirm the dates. Not legal, contractual or scheduling advice.</p>
</body></html>`;
}

// a fragnet for the example office fit-out (example.mjs): an owner's change
// to the level 2 MEP layout, and late door hardware approval
export const EXAMPLE_FRAGNET = "Activity ID,Name,Duration,Predecessors,Successors,Not before,Event\nF100,Owner change notice: level 2 MEP layout,0,A1030,,2026-04-08,CO-03 MEP layout\nF110,Redesign level 2 MEP rough-in,12,F100,F120,,CO-03 MEP layout\nF120,Re-approve level 2 MEP drawings,5,F110,A1100,,CO-03 MEP layout\nA1040,,+25,,,,Late hardware approval\n";
