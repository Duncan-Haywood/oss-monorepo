import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { redundantLogic, redundantText, redundantCsv, redundantTableHtml, withoutLinks, dropLinksText } from "./redundant.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day), no holidays.
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
const SEVEN = "(0||CalendarData()((0||DaysOfWeek()((0||1()((0||0(s|08:00|f|16:00)())))(0||2()((0||0(s|08:00|f|16:00)())))(0||3()((0||0(s|08:00|f|16:00)())))(0||4()((0||0(s|08:00|f|16:00)())))(0||5()((0||0(s|08:00|f|16:00)())))(0||6()((0||0(s|08:00|f|16:00)())))(0||7()((0||0(s|08:00|f|16:00)())))))(0||Exceptions()())))";
function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const task = (id, hours, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra });
let linkN = 0;
const link = (succ, pred, type = "PR_FS", lag = 0, id = null) => ({ task_pred_id: id || `L${++linkN}`, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
function text(tasks, preds) {
  return xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }, { clndr_id: "C7", default_flag: "N", clndr_name: "Seven day", day_hr_cnt: 8, clndr_data: SEVEN }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    PROJWBS: [{ wbs_id: "10", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST" }, { wbs_id: "11", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "WORK" }],
    TASK: tasks, TASKPRED: preds,
  });
}
const ids = (list) => list.map((x) => x.id).sort();

test("A -> C is redundant over A -> B -> C (FS, no lag), and deleting it changes no date", () => {
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 0, "bc"), link("C", "A", "PR_FS", 0, "ac")];
  const xer = parseXer(text([task("A", 16), task("B", 8), task("C", 8)], preds));
  const r = redundantLogic(xer);
  assert.deepEqual(ids(r.redundant), ["ac"]);
  const x = r.redundant[0];
  assert.equal(x.sure, true);
  assert.equal(x.kind, "implied");
  assert.deepEqual(x.via.map((v) => v.id), ["ab", "bc"]);
  assert.equal(r.summary.checked, 3);
  const a = schedule(xer), b = schedule(withoutLinks(xer, ["ac"]));
  for (const [id, ra] of a.tasks) for (const f of ["es", "ef", "ls", "lf", "tf", "ff"]) assert.equal(b.tasks.get(id)[f], ra[f], `${id} ${f}`);
});

test("lag: a link with more lag than the other path carries it, and is not redundant", () => {
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 8, "bc"), link("C", "A", "PR_FS", 16, "ac")];
  const r = redundantLogic(parseXer(text([task("A", 8), task("B", 8), task("C", 8)], preds)));
  assert.equal(r.redundant.length, 0);
  assert.deepEqual(ids(r.lagCarrying), ["ac"]);
  assert.equal(r.lagCarrying[0].otherPathLagHours, 8);
  // with 16 h on the path it is implied again
  const preds2 = [link("B", "A", "PR_FS", 8, "ab"), link("C", "B", "PR_FS", 8, "bc"), link("C", "A", "PR_FS", 16, "ac")];
  const r2 = redundantLogic(parseXer(text([task("A", 8), task("B", 8), task("C", 8)], preds2)));
  assert.deepEqual(ids(r2.redundant), ["ac"]);
  assert.equal(r2.redundant[0].sure, true, "every lag on one calendar");
});

test("relationship types: FS implies SS and FF on the same pair; SS does not imply FS", () => {
  // A FS B and A SS B: start of B >= finish of A >= start of A
  let r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_FS", 0, "fs"), link("B", "A", "PR_SS", 0, "ss")])));
  assert.deepEqual(ids(r.redundant), ["ss"]);
  // A FS B and A FF B: finish of B >= start of B >= finish of A
  r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_FS", 0, "fs"), link("B", "A", "PR_FF", 0, "ff")])));
  assert.deepEqual(ids(r.redundant), ["ff"]);
  // A SS B and A FF B imply neither each other nor more
  r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_SS", 0, "ss"), link("B", "A", "PR_FF", 0, "ff")])));
  assert.equal(r.redundant.length, 0);
  // SF from A to B is implied by A SS B (start of B, then its finish)
  r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_SS", 0, "ss"), link("B", "A", "PR_SF", 0, "sf")])));
  assert.deepEqual(ids(r.redundant), ["sf"]);
});

test("duplicates: of two identical links exactly one is named; of two lags the shorter", () => {
  let r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_FS", 0, "d1"), link("B", "A", "PR_FS", 0, "d2")])));
  assert.deepEqual(ids(r.redundant), ["d2"]);
  assert.equal(r.redundant[0].kind, "duplicate");
  assert.equal(r.summary.duplicates, 1);
  r = redundantLogic(parseXer(text([task("A", 8), task("B", 8)], [link("B", "A", "PR_FS", 0, "short"), link("B", "A", "PR_FS", 8, "long")])));
  assert.deepEqual(ids(r.redundant), ["short"]);
});

test("lags on different calendars: still named, marked to check", () => {
  const preds = [link("B", "A", "PR_FS", 8, "ab"), link("C", "B", "PR_FS", 0, "bc"), link("C", "A", "PR_FS", 8, "ac")];
  const preds2 = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 8, "bc"), link("C", "A", "PR_FS", 8, "ac")];
  const r = redundantLogic(parseXer(text([task("A", 8, { clndr_id: "C7" }), task("B", 8), task("C", 8)], preds2)));
  assert.deepEqual(ids(r.redundant), ["ac"]);
  assert.equal(r.redundant[0].sure, false);
  // same calendar for both lags: sure
  const r2 = redundantLogic(parseXer(text([task("A", 8), task("B", 8), task("C", 8)], preds)));
  assert.equal(r2.redundant[0].sure, true);
});

test("progress: no path through a started activity; links into one, or from a completed one, are not candidates", () => {
  const tasks = [task("A", 8), task("B", 8, { status_code: "TK_Active", act_start_date: "2025-11-28 08:00" }), task("C", 8)];
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 0, "bc"), link("C", "A", "PR_FS", 0, "ac")];
  const r = redundantLogic(parseXer(text(tasks, preds)));
  assert.equal(r.redundant.length, 0, "the path runs through B, which has started");
  assert.equal(r.summary.intoStarted, 1);
  const t2 = [task("A", 0, { status_code: "TK_Complete", act_start_date: "2025-11-20 08:00", act_end_date: "2025-11-21 17:00" }), task("B", 8), task("C", 8)];
  const r2 = redundantLogic(parseXer(text(t2, preds)));
  assert.equal(r2.summary.fromProgress, 2);
  assert.equal(r2.redundant.length, 0);
});

test("level of effort and WBS summary activities are left out", () => {
  const tasks = [task("A", 8), task("L", 8, { task_type: "TT_LOE" }), task("C", 8)];
  const preds = [link("L", "A", "PR_SS", 0, "al"), link("C", "L", "PR_FS", 0, "lc"), link("C", "A", "PR_FS", 0, "ac")];
  const r = redundantLogic(parseXer(text(tasks, preds)));
  assert.equal(r.redundant.length, 0);
  assert.equal(r.summary.skippedSpan, 2);
});

test("deleting every named link at once keeps every date (a chain of redundant links)", () => {
  // A -> B -> C -> D, plus A->C, B->D, A->D: all three extra links redundant together
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 0, "bc"), link("D", "C", "PR_FS", 0, "cd"), link("C", "A", "PR_FS", 0, "ac"), link("D", "B", "PR_FS", 0, "bd"), link("D", "A", "PR_SS", 0, "ad"), link("D", "A", "PR_SS", 80, "ad80")];
  const xer = parseXer(text([task("A", 16), task("B", 8), task("C", 24), task("D", 8)], preds));
  const r = redundantLogic(xer);
  assert.deepEqual(ids(r.redundant), ["ac", "ad", "bd"]);
  // SS +80 h: durations could shrink to zero, so nothing implies 80 h of lag
  assert.deepEqual(ids(r.lagCarrying), ["ad80"]);
  const a = schedule(xer), b = schedule(withoutLinks(xer, ids(r.redundant)));
  for (const [id, ra] of a.tasks) for (const f of ["es", "ef", "ls", "lf", "tf", "ff"]) assert.equal(b.tasks.get(id)[f], ra[f], `${id} ${f}`);
});

test("a loop is reported and its activities left out, the rest checked", () => {
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("A", "B", "PR_FS", 0, "ba"), link("D", "C", "PR_FS", 0, "cd"), link("E", "D", "PR_FS", 0, "de"), link("E", "C", "PR_FS", 0, "ce")];
  const r = redundantLogic(parseXer(text([task("A", 8), task("B", 8), task("C", 8), task("D", 8), task("E", 8)], preds)));
  assert.deepEqual(ids(r.redundant), ["ce"]);
  assert.ok(r.warnings.some((w) => /loop/.test(w)));
});

test("outputs: text, CSV (formula-safe), table, and a cleaned XER byte for byte less the links", () => {
  const preds = [link("B", "A", "PR_FS", 0, "ab"), link("C", "B", "PR_FS", 0, "bc"), link("C", "A", "PR_FS", 0, "ac")];
  const tx = text([task("A", 8, { task_name: "=SUM(1)" }), task("B", 8), task("C", 8)], preds);
  const r = redundantLogic(parseXer(tx));
  assert.match(redundantText(r), /1 of 3 open relationships/);
  const csv = redundantCsv(r);
  assert.match(csv, /^finding,task_pred_id/);
  assert.match(csv, /'=SUM\(1\)/);
  assert.match(redundantTableHtml(r), /<table>/);
  const { text: cleaned, removed } = dropLinksText(tx, ["ac"]);
  assert.equal(removed, 1);
  assert.equal(cleaned.split("\r\n").length, tx.split("\r\n").length - 1);
  assert.ok(!/\tac\t/.test(cleaned) && /\tab\t/.test(cleaned));
  assert.equal(redundantLogic(parseXer(cleaned)).redundant.length, 0);
});

// Oracle: random acyclic networks (one calendar, nothing started) against a
// brute-force longest path over the event graph. A link u -> v is listed when
// another route exists: a path of two or more edges from u to v, or a
// parallel link that beats it (more lag, or the same lag listed first). It is
// redundant when that route's lag is at least its own, else lag-carrying.
function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ENDS = { PR_FS: [1, 0], PR_SS: [0, 0], PR_FF: [1, 1], PR_SF: [0, 1] };
function oracle(nTasks, links) {
  // events 2i (start) and 2i+1 (finish); edges [from, to, w, n]
  const edges = [];
  for (let i = 0; i < nTasks; i++) edges.push([2 * i, 2 * i + 1, 0, -1]);
  links.forEach((l, n) => edges.push([2 * l.p + ENDS[l.type][0], 2 * l.s + ENDS[l.type][1], l.lag, n]));
  const longest = (u, v) => { // longest path u -> v of two or more edges (events are in index order)
    const best = new Array(2 * nTasks).fill(-Infinity), len = new Array(2 * nTasks).fill(0);
    best[u] = 0;
    for (let x = u; x < 2 * nTasks; x++) {
      if (best[x] === -Infinity) continue;
      for (const [f, t, w] of edges) if (f === x && t !== v) { if (best[x] + w > best[t]) best[t] = best[x] + w; }
    }
    let r = -Infinity;
    for (const [f, t, w] of edges) if (t === v && f !== u && best[f] > -Infinity) r = Math.max(r, best[f] + w);
    return r;
  };
  const red = [], lc = [];
  links.forEach((l, n) => {
    const [u, v] = [2 * l.p + ENDS[l.type][0], 2 * l.s + ENDS[l.type][1]];
    let other = longest(u, v);
    edges.forEach(([f, t, w, m]) => { if (m >= 0 && m !== n && f === u && t === v && (w > l.lag || (w === l.lag && m < n))) other = Math.max(other, w); });
    if (other === -Infinity) return;
    (other >= l.lag ? red : lc).push(l.id);
  });
  return { red: red.sort(), lc: lc.sort() };
}

test("random networks: the redundant and lag-carrying lists match a brute-force longest path, all sure on one calendar", () => {
  const rand = rng(20261125);
  const types = Object.keys(ENDS), lags = [0, 0, 0, 8, 16, -8];
  for (let k = 0; k < 150; k++) {
    const nTasks = 4 + Math.floor(rand() * 5);
    const links = [];
    const nLinks = nTasks + Math.floor(rand() * nTasks * 1.5);
    for (let j = 0; j < nLinks; j++) {
      const p = Math.floor(rand() * (nTasks - 1)), s = p + 1 + Math.floor(rand() * (nTasks - 1 - p));
      links.push({ id: `R${k}_${j}`, p, s, type: types[Math.floor(rand() * 4)], lag: lags[Math.floor(rand() * lags.length)] });
    }
    const tasks = Array.from({ length: nTasks }, (_, i) => task(`T${i}`, 8 * (1 + Math.floor(rand() * 4))));
    const preds = links.map((l) => link(`T${l.s}`, `T${l.p}`, l.type, l.lag, l.id));
    const r = redundantLogic(parseXer(text(tasks, preds)));
    const want = oracle(nTasks, links);
    const msg = `network ${k}: ${JSON.stringify(links)}`;
    assert.deepEqual(ids(r.redundant), want.red, msg);
    assert.deepEqual(ids(r.lagCarrying), want.lc, msg);
    assert.ok(r.redundant.every((x) => x.sure), msg);
    assert.equal(r.summary.checked, links.length, msg);
    assert.equal(r.summary.share, Math.round((1000 * want.red.length) / links.length) / 10, msg);
  }
});

test("a zero-lag link on another calendar does not make a lagged link a 'check': only non-zero lags are compared across calendars", () => {
  // A +8h -> C is implied by A +8h -> B, B -> C; B sits on the seven-day calendar but its link carries no lag
  const preds = [link("C", "A", "PR_FS", 8, "ac"), link("B", "A", "PR_FS", 8, "ab"), link("C", "B", "PR_FS", 0, "bc")];
  const r = redundantLogic(parseXer(text([task("A", 8), task("B", 8, { clndr_id: "C7" }), task("C", 8)], preds)));
  assert.deepEqual(ids(r.redundant), ["ac"]);
  assert.equal(r.redundant[0].sure, true);
});
