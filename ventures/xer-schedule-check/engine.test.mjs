import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, decodeXer, parseDate, formatDate, xerText as writeXer } from "./xer.mjs";
import { Calendar, parseClndrData } from "./calendar.mjs";
import { schedule, drivingPath } from "./cpm.mjs";
import { assess, findingsCsv, scheduleCsv } from "./dcma.mjs";

// A Mon-Fri 08:00-12:00, 13:00-17:00 calendar (8 h/day), with 2025-12-25 off
// (serial 46016) and 2025-12-24 a half day.
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()((0||0(d|46016)())(0||1(d|46015)((0||0(s|08:00|f|12:00)())))))))";

// Build an XER text from table rows.
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

const task = (id, code, hours, extra = {}) => ({
  task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });

function project(tasks, preds, projExtra = {}, optExtra = {}) {
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 00:00", plan_start_date: "2025-12-01 00:00", plan_end_date: "", ...projExtra }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N", ...optExtra }],
    TASK: tasks,
    TASKPRED: preds,
  }));
}

const at = (out, xer, code) => {
  const t = xer.tables.TASK.find((r) => r.task_code === code);
  const r = out.tasks.get(t.task_id);
  return { es: formatDate(r.remES), ef: formatDate(r.ef), ls: formatDate(r.remLS), lf: formatDate(r.lf), tf: r.tf, ff: r.ff };
};

test("parser: tables, CRLF, quoted multi-line values, odd quotes in names, Windows-1252", () => {
  const text = 'ERMHDR\t7.0\t2015-02-14\r\n%T\tTASK\r\n%F\ttask_id\ttask_name\tclndr_data\r\n%R\t1\tInstall 6" drain\t"(0||a()(\r\n  (0||b()())))"\r\n%R\t2\tPour slab\tx\r\n%E\r\n';
  const x = parseXer(text);
  assert.equal(x.version, "7.0");
  assert.equal(x.tables.TASK.length, 2);
  assert.equal(x.tables.TASK[0].task_name, 'Install 6" drain');
  assert.equal(x.tables.TASK[0].clndr_data, "(0||a()(\n  (0||b()())))");
  assert.equal(x.tables.TASK[1].task_name, "Pour slab");
  const bytes = new Uint8Array([...Buffer.from("ERMHDR\t6.0\r\n%T\tTASK\r\n%F\ttask_name\r\n%R\tB\xe9ton\r\n", "latin1")]);
  assert.equal(parseXer(decodeXer(bytes)).tables.TASK[0].task_name, "Béton");
  assert.throws(() => parseXer("hello"), /not an XER file/);
});

test("parser: P6's doubled quotes read as one; xerText writes them back doubled", () => {
  // P6 6.0, 7.0 and 20.12 exports write every " inside a value as "" (unquoted field)
  const text = 'ERMHDR\t7.0\t2015-02-14\r\n%T\tTASK\r\n%F\ttask_id\ttask_name\ttask_code\r\n'
    + '%R\t1\tPrestressing Cables -  0.6""\tA1\r\n'
    + '%R\t2\tReadiness for ICU  ""Controlled Zone""\tA2\r\n'
    + '%R\t3\tInstall 6" drain\t""Q""\r\n%E\r\n';
  const x = parseXer(text);
  assert.deepEqual(x.tables.TASK.map((r) => r.task_name), ['Prestressing Cables -  0.6"', 'Readiness for ICU  "Controlled Zone"', 'Install 6" drain']);
  assert.equal(x.tables.TASK[2].task_code, '"Q"', "a doubled quote that opens the last value does not join the next line");
  assert.equal(x.tables.TASK.length, 3);
  const out = writeXer(x);
  assert.match(out, /0\.6""\t/);
  assert.match(out, /Install 6"" drain/);
  const back = parseXer(out);
  assert.deepEqual(back.tables.TASK, x.tables.TASK);
  // a multi-line value with a quote inside: wrapped and doubled, read back exactly
  const y = { version: "20.12", tables: { CALENDAR: [{ clndr_id: "1", clndr_data: 'line "one"\nline two' }, { clndr_id: "2", clndr_data: "x" }] } };
  assert.deepEqual(parseXer(writeXer(y)).tables.CALENDAR, y.tables.CALENDAR);
});

test("calendar: clndr_data with 0x7F line breaks, holidays, half days, working-time arithmetic", () => {
  const tree = parseClndrData(WEEK.replace(/\)\(/g, ")\x7f\x7f  ("));
  assert.equal(tree.key, "CalendarData");
  const cal = Calendar.fromXer({ clndr_id: "C1", clndr_data: WEEK, day_hr_cnt: "8" });
  const d = (s) => parseDate(s);
  // Monday 2025-12-01 08:00 + 8 h = 17:00 same day; + 12 h crosses the night
  assert.equal(formatDate(cal.addWork(d("2025-12-01 08:00"), 480)), "2025-12-01 17:00");
  assert.equal(formatDate(cal.addWork(d("2025-12-01 08:00"), 720)), "2025-12-02 12:00");
  // Friday 17:00 + 1 h = Monday 09:00; lunch is skipped
  assert.equal(formatDate(cal.addWork(d("2025-12-05 17:00"), 60)), "2025-12-08 09:00");
  assert.equal(formatDate(cal.addWork(d("2025-12-01 11:30"), 60)), "2025-12-01 13:30");
  // Christmas Eve is a half day, Christmas is off
  assert.equal(formatDate(cal.addWork(d("2025-12-24 08:00"), 300)), "2025-12-26 09:00");
  assert.equal(formatDate(cal.subWork(d("2025-12-26 09:00"), 300)), "2025-12-24 08:00");
  assert.equal(cal.workBetween(d("2025-12-22 08:00"), d("2025-12-29 08:00")), (8 * 3 + 4) * 60);
  assert.equal(formatDate(cal.nextStart(d("2025-12-05 17:00"))), "2025-12-08 08:00");
  assert.equal(formatDate(cal.prevEnd(d("2025-12-08 08:00"))), "2025-12-05 17:00");
  assert.equal(formatDate(cal.prevEnd(d("2025-12-26 08:00"))), "2025-12-24 12:00");
});

test("CPM: FS, SS and FF links with lags, float and free float by hand", () => {
  // A (16 h) -> B (8 h) FS; A -> C (24 h) SS lag 8; C -> D (8 h) FF lag 8; B -> D FS
  const x = project(
    [task("1", "A", 16), task("2", "B", 8), task("3", "C", 24), task("4", "D", 8)],
    [link("1", "2", "1"), link("2", "3", "1", "PR_SS", 8), link("3", "4", "3", "PR_FF", 8), link("4", "4", "2")],
  );
  const out = schedule(x);
  assert.deepEqual(at(out, x, "A"), { es: "2025-12-01 08:00", ef: "2025-12-02 17:00", ls: "2025-12-01 08:00", lf: "2025-12-02 17:00", tf: 0, ff: 0 });
  // C starts a day after A starts and runs three days: Tue to Thu
  assert.equal(at(out, x, "C").es, "2025-12-02 08:00");
  assert.equal(at(out, x, "C").ef, "2025-12-04 17:00");
  // D must finish a day after C finishes: Fri 17:00, so it starts Fri 08:00
  assert.equal(at(out, x, "D").ef, "2025-12-05 17:00");
  assert.equal(at(out, x, "D").es, "2025-12-05 08:00");
  // B finishes Wed 17:00 but D does not need it until Fri 08:00: Thursday's
  // 8 h of float, all of it free
  assert.equal(at(out, x, "B").ef, "2025-12-03 17:00");
  assert.equal(at(out, x, "B").lf, "2025-12-04 17:00");
  assert.equal(at(out, x, "B").tf, 8);
  assert.equal(at(out, x, "B").ff, 8);
  assert.equal(at(out, x, "C").tf, 0);
  const path = drivingPath(out, "1").map((id) => out.model.tasks.get(id).code);
  assert.deepEqual(path, ["A", "C", "D"]);
});

test("CPM: constraints, must-finish-by date and negative float", () => {
  const x = project(
    [task("1", "A", 40), task("2", "B", 8, { cstr_type: "CS_MSOA", cstr_date: "2025-12-10 00:00" }), task("3", "Done", 0, { task_type: "TT_FinMile" })],
    [link("1", "3", "1"), link("2", "3", "2")],
    { plan_end_date: "2025-12-09 00:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "B").es, "2025-12-10 08:00");
  assert.equal(at(out, x, "B").ef, "2025-12-10 17:00");
  assert.equal(at(out, x, "Done").ef, "2025-12-10 17:00");
  // must finish by Monday 8 Dec 17:00 (midnight 9 Dec snaps back): B is 16 h late
  assert.equal(at(out, x, "B").tf, -16);
  assert.equal(at(out, x, "Done").tf, -16);
  // A finishes Fri 5 Dec 17:00: one day before the must-finish date
  assert.equal(at(out, x, "A").tf, 8);
});

test("CPM: progress at the data date, retained logic and lag from a finished predecessor", () => {
  // data date Wed 3 Dec 08:00; A finished Tue; cure lag 16 h after A on B;
  // C started Mon with 8 h left, D waits for C (FS)
  const x = project(
    [
      task("1", "A", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-02 17:00", target_drtn_hr_cnt: 16 }),
      task("2", "B", 8),
      task("3", "C", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 24 }),
      task("4", "D", 8),
    ],
    [link("1", "2", "1", "PR_FS", 16), link("2", "4", "3")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "B").es, "2025-12-05 08:00");
  assert.equal(at(out, x, "C").es, "2025-12-03 08:00");
  assert.equal(at(out, x, "C").ef, "2025-12-03 17:00");
  assert.equal(at(out, x, "D").es, "2025-12-04 08:00");
});

test("CPM: retained logic through out-of-sequence progress (SS from started work, finished nodes both ways)", () => {
  // data date Wed 3 Dec 08:00. P (16 h) not started; C started Mon but waits
  // on P (FS), so its 8 h left run Fri. S follows C SS lag 16: the lag from
  // C's actual start is spent, but S waits for C's remaining work (Fri).
  // F finished, though its predecessor P has not: F is a node at P's finish
  // (Thu 17:00) and G (SS lag 8 after F) starts no earlier than that node.
  const x = project(
    [
      task("1", "P", 16),
      task("2", "C", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 16 }),
      task("3", "S", 8),
      task("4", "F", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", target_drtn_hr_cnt: 8 }),
      task("5", "G", 8),
    ],
    [link("1", "2", "1"), link("2", "3", "2", "PR_SS", 16), link("3", "4", "1"), link("4", "5", "4", "PR_SS", 8)],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "C").es, "2025-12-05 08:00");
  assert.equal(at(out, x, "S").es, "2025-12-05 08:00"); // was Wed 3 Dec (actual start + lag)
  assert.equal(at(out, x, "G").es, "2025-12-05 08:00"); // was Wed 3 Dec (data date)
  // backward: the finished node F gets late dates of its own, with no lag
  // back from G, and bounds P's late finish
  const F = out.tasks.get("4");
  assert.equal(formatDate(F.lf), at(out, x, "G").ls);
  assert.ok(out.tasks.get("1").lf <= F.lf);
  assert.equal(at(out, x, "S").tf, 0);
  // the old behaviour is still there as a variant, for comparison runs
  const old = schedule(x, { variant: { ssActivePred: "es", ssDoneNode: false } });
  assert.equal(at(old, x, "S").es, "2025-12-03 08:00");
  assert.equal(at(old, x, "G").es, "2025-12-03 08:00");
});

test("CPM: an SS lag not yet spent at the data date still runs; a finished node takes back only its unspent lag", () => {
  // data date Wed 3 Dec 08:00. C started Mon 08:00 but waits on P (FS), so
  // its 8 h left run Fri. S follows C SS lag 24: 16 h of it ran Mon-Tue, the
  // other 8 h run from C's remaining start (Fri 08:00 + 8 h), so S starts Mon 8.
  // F finished Mon; H follows F FS lag 16. Going back, F's late date is H's
  // late start less the part of the 16 h lag not yet spent at the data date:
  // 8 h of it ran Tue, so 8 h (P6's value on the CCA file,
  // eval/cpm-vs-p6-2026-11-19.md, rules 10, 11 and 17).
  const x = project(
    [
      task("1", "P", 16),
      task("2", "C", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 16 }),
      task("3", "S", 8),
      task("4", "F", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", target_drtn_hr_cnt: 8 }),
      task("5", "H", 8),
    ],
    [link("1", "2", "1"), link("2", "3", "2", "PR_SS", 24), link("3", "5", "4", "PR_FS", 16)],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "C").es, "2025-12-05 08:00");
  assert.equal(at(out, x, "S").es, "2025-12-08 08:00");
  assert.equal(at(out, x, "H").es, "2025-12-04 08:00"); // F's actual finish + 16 h
  assert.equal(at(out, x, "H").ls, "2025-12-08 08:00");
  assert.equal(formatDate(out.tasks.get("4").lf), "2025-12-05 08:00");
  // rule 10 alone: no lag back at all
  assert.equal(formatDate(schedule(x, { variant: { bwDoneLagLeft: false } }).tasks.get("4").lf), "2025-12-08 08:00");
  // the earlier rules, as variants
  const before = schedule(x, { variant: { ssActivePred: "max", bwDoneFS: false } });
  assert.equal(at(before, x, "S").es, "2025-12-05 08:00");
  // (the project then ends Fri 17:00: H's late start Fri 08:00, less the 16 h lag)
  assert.equal(formatDate(before.tasks.get("4").lf), "2025-12-03 08:00");
});

test("CPM: five more P6 rules from the CCA file (lag back into a finished node, assignment work, unspent SS lag, ALAP when started, a future actual start)", () => {
  // Data date Wed 3 Dec 08:00 for all five (eval/cpm-vs-p6-2026-11-19.md, fourth pass).
  // 1. O (8 h, open) -> FS lag 16 -> F (finished) -> FS -> H. Forward, O's lag
  //    reaches F's node, so going back O's late finish is F's late date less 16 h.
  const off = (k) => Object.fromEntries(k.map((n) => [n, false]));
  const one = project(
    [
      task("1", "O", 8),
      task("2", "F", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", target_drtn_hr_cnt: 8 }),
      task("3", "H", 8),
    ],
    [link("1", "2", "1", "PR_FS", 16), link("2", "3", "2")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  assert.equal(at(schedule(one), one, "O").tf, 0);
  assert.equal(at(schedule(one, { variant: off(["bwDoneSuccLag"]) }), one, "O").tf, 16);
  // 2. Z started, no remaining duration, but its labour row runs 16 h more
  //    (restart Wed 08:00, reend Thu 17:00): its late start is 16 h before its late finish.
  const two = parseXer(xerText({
    ...Object.fromEntries(Object.entries(project([], []).tables).filter(([k]) => k !== "TASK" && k !== "TASKPRED")),
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-03 08:00", plan_start_date: "2025-12-01 00:00" }],
    TASK: [task("1", "Z", 0, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 32 }), task("2", "Y", 24), task("3", "W", 40)],
    TASKPRED: [link("1", "2", "1")],
    TASKRSRC: [{ taskrsrc_id: "9", task_id: "1", restart_date: "2025-12-03 08:00", reend_date: "2025-12-04 17:00", rsrc_type: "RT_Labor" }],
  }));
  const z = at(schedule(two), two, "Z");
  // W (40 h) ends the project Tue 9 Dec, so Y may start Fri and Z finish Thu
  assert.equal(z.lf, "2025-12-04 17:00");
  assert.equal(z.ls, "2025-12-03 08:00");
  assert.equal(at(schedule(two, { variant: off(["bwRsrcRemain"]) }), two, "Z").ls, "2025-12-04 17:00");
  // 3. A started Mon 08:00, SS lag 24 to G (finished) -> FS -> J: 16 h of the
  //    lag ran by the data date, so A's remaining work starts 8 h before G's late date.
  const three = project(
    [
      task("1", "A", 40, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 56 }),
      task("2", "G", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", target_drtn_hr_cnt: 8 }),
      task("3", "J", 80),
    ],
    [link("1", "2", "1", "PR_SS", 24), link("2", "3", "2")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const g = formatDate(schedule(three).tasks.get("2").lf);
  const cal = Calendar.fromXer({ clndr_id: "C1", clndr_data: WEEK, day_hr_cnt: "8" });
  assert.equal(at(schedule(three), three, "A").ls, formatDate(cal.nextStart(cal.subWork(parseDate(g), 8 * 60))));
  assert.equal(at(schedule(three, { variant: off(["bwDoneSSLeft"]) }), three, "A").ls, formatDate(cal.nextStart(parseDate(g))));
  // 4. B started, as late as possible: its remaining 8 h move up to its successor's start.
  const four = project(
    [task("1", "B", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 24, cstr_type: "CS_ALAP" }), task("2", "Q", 16), task("3", "R", 8)],
    [link("1", "3", "1"), link("2", "3", "2")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  assert.equal(at(schedule(four), four, "B").es, "2025-12-04 08:00");
  assert.equal(at(schedule(four, { variant: off(["alapActive"]) }), four, "B").es, "2025-12-03 08:00");
  // 5. P's actual start (Fri 5 Dec) is after the data date, so none of its SS
  //    lag of 16 h has run: started successor S waits 16 h from P's remaining start.
  const five = project(
    [task("1", "P", 24, { status_code: "TK_Active", act_start_date: "2025-12-05 08:00", target_drtn_hr_cnt: 24 }), task("2", "S", 8, { status_code: "TK_Active", act_start_date: "2025-12-05 08:00", target_drtn_hr_cnt: 8 })],
    [link("1", "2", "1", "PR_SS", 16)],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  assert.equal(at(schedule(five), five, "S").es, "2025-12-05 08:00");
  assert.equal(at(schedule(five, { variant: off(["activeSSLeft"]) }), five, "S").es, "2025-12-03 08:00");
});

test("CPM: an SF link into a started successor holds the predecessor by the SF lag left unspent (P6 23.12 probes h6s-an, h4s-a)", () => {
  // X (as late as possible) and Y both started Mon 1 Dec; data date Wed 3 Dec
  // 08:00, so 16 h of X's SF lag ran from X's actual start. Y finishes Fri 5
  // Dec 17:00; the project runs to L's finish.
  const off = (k) => Object.fromEntries(k.map((n) => [n, false]));
  const shape = (lag, extra = {}, opt = {}) => project(
    [task("1", "X", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 24, cstr_type: "CS_ALAP", ...extra }),
      task("2", "Y", 24, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 40 }), task("3", "L", 80)],
    [link("1", "2", "1", "PR_SF", lag)],
    { last_recalc_date: "2025-12-03 08:00" }, opt,
  );
  // lag 24 h, 8 h left: X's remaining start may slide to 8 h before Y's finish
  const a = shape(24);
  assert.equal(at(schedule(a), a, "X").es, "2025-12-05 08:00");
  assert.equal(at(schedule(a), a, "X").ef, "2025-12-05 17:00");
  // all of the lag spent: to Y's finish, the next working morning
  const b = shape(16);
  assert.equal(at(schedule(b), b, "X").es, "2025-12-08 08:00");
  // before this rule the link held nothing and X slid to the project's end
  assert.equal(at(schedule(a, { variant: off(["sfActiveSucc"]) }), a, "X").es, "2025-12-16 08:00");
  // late dates: 24 h left of a 40 h lag hold X's late start 24 h before Y's late finish
  const c = shape(40, { cstr_type: "" });
  assert.equal(at(schedule(c), c, "X").ls, "2025-12-12 08:00");
  assert.equal(at(schedule(c, { variant: off(["sfActiveSucc"]) }), c, "X").ls, "2025-12-16 08:00");
  // under progress override an SF link out of started work is met: X slides past it
  const d = shape(24, {}, { sched_progress_override: "Y", sched_retained_logic: "N" });
  assert.equal(at(schedule(d), d, "X").es, "2025-12-16 08:00");
});

test("CPM: a zero-lag SF link into a started successor holds the predecessor's start to the successor's finish, not a minute before", () => {
  // same shape as the SF-lag probes: X (as late as possible) and Y started
  // Mon 1 Dec, data date Wed 08:00, Y finishes Fri 5 Dec 17:00. With no lag
  // there is nothing to spend, so X's remaining start may reach Y's finish:
  // the next working morning, exactly as when a 16 h lag is fully spent
  const x = project(
    [task("1", "X", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 24, cstr_type: "CS_ALAP" }),
      task("2", "Y", 24, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 40 }), task("3", "L", 80)],
    [link("1", "2", "1", "PR_SF", 0)],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const r = at(schedule(x), x, "X");
  assert.equal(r.es, "2025-12-08 08:00");
  assert.equal(r.ef, "2025-12-08 17:00");
  // and its late dates run to the project's end, where Y's late finish is
  assert.equal(r.ls, "2025-12-16 08:00");
  assert.equal(r.ff, 0);
});

test("CPM: out of sequence, an FS link into a started successor bounds the unstarted predecessor's finish, not its start", () => {
  // S started Mon 1 Dec ahead of its FS predecessor P (retained logic); data
  // date Wed 3 Dec 08:00. L (80 h) runs the project to Tue 16 Dec. S's
  // remaining 16 h may start as late as Mon 15 Dec 08:00, so P (8 h) must
  // finish by then: late finish Fri 12 Dec 17:00, late start Fri 08:00.
  const x = project(
    [task("1", "P", 8),
      task("2", "S", 16, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 32 }), task("3", "L", 80)],
    [link("1", "2", "1")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "S").ls, "2025-12-15 08:00");
  assert.equal(at(out, x, "P").lf, "2025-12-12 17:00");
  assert.equal(at(out, x, "P").ls, "2025-12-12 08:00");
});

test("CPM: as late as possible takes up free float; loops are found and reported", () => {
  const x = project(
    [task("1", "A", 8), task("2", "B", 8, { cstr_type: "CS_ALAP" }), task("3", "C", 24), task("4", "End", 0, { task_type: "TT_FinMile" })],
    [link("1", "2", "1"), link("2", "4", "2"), link("3", "4", "3"), link("4", "3", "1")],
  );
  const out = schedule(x);
  assert.equal(at(out, x, "B").ef, "2025-12-04 17:00");
  assert.equal(at(out, x, "B").tf, 0);
  const loopy = project([task("1", "A", 8), task("2", "B", 8), task("3", "C", 8)], [link("1", "2", "1"), link("2", "3", "2"), link("3", "1", "3"), link("4", "3", "1")]);
  const lo = schedule(loopy);
  assert.equal(lo.loops.length, 1);
  assert.equal(lo.loops[0].length, 3);
  // an activity stuck only because it follows a loop is not a loop itself
  const downstream = project([task("1", "A", 8), task("2", "B", 8), task("3", "C", 8), task("4", "D", 8)],
    [link("1", "2", "1"), link("2", "3", "2"), link("3", "1", "3"), link("4", "4", "3")]);
  const dl = schedule(downstream);
  assert.equal(dl.loops.length, 1);
  assert.deepEqual([...dl.loops[0]].sort(), ["1", "2", "3"]);
});

test("CPM: an ALAP milestone stays zero-length even when the file gives it a remaining duration", () => {
  // P6 exports and converted files can carry hours on a milestone; the forward
  // pass ignores them, so ALAP must too (red team 2026-11-24: the milestone test escaped)
  for (const type of ["TT_FinMile", "TT_Mile"]) {
    const x = project(
      [task("1", "A", 8), task("2", "M", 8, { task_type: type, cstr_type: "CS_ALAP" }), task("3", "C", 24), task("4", "End", 0, { task_type: "TT_FinMile" })],
      [link("1", "2", "1"), link("2", "4", "2"), link("3", "4", "3")],
    );
    const m = at(schedule(x), x, "M");
    assert.equal(m.es, m.ef, type);
    assert.equal(m.tf, 0, type);
  }
});

test("DCMA: each point counts what it should on a small schedule", () => {
  const x = project(
    [
      task("1", "Start", 0, { task_type: "TT_Mile" }),
      task("2", "A", 400, { target_end_date: "2025-11-28 17:00" }),
      task("3", "B", 8, { cstr_type: "CS_MSO", cstr_date: "2025-12-15 08:00" }),
      task("4", "C", 8),
      task("5", "Loose", 8),
      task("6", "Finish", 0, { task_type: "TT_FinMile" }),
    ],
    [link("1", "2", "1"), link("2", "3", "2", "PR_FS", -8), link("3", "6", "3", "PR_SS", 16), link("4", "4", "2", "PR_FS", 8), link("5", "6", "4")],
  );
  const r = assess(x);
  const c = Object.fromEntries(r.checks.map((k) => [k.id, k]));
  assert.equal(r.checks.length, 14);
  assert.equal(c[1].count, 1); // Loose has neither predecessor nor successor
  assert.equal(c[1].items[0].code, "Loose");
  assert.equal(c[2].count, 1); // one lead
  assert.equal(c[3].count, 2); // two lags
  assert.equal(c[4].count, 1); // one SS of five
  assert.equal(c[5].count, 1); // Start On
  assert.equal(c[8].count, 1); // A is 50 days
  assert.equal(c[11].count, 1); // A was planned to finish before the data date
  assert.equal(c[11].pass, false);
  assert.equal(c[14].value, 0);
  assert.equal(c[12].pass, true);
  const csv = findingsCsv(r);
  assert.match(csv, /^check,activity,name,detail\n/);
  assert.match(csv, /Logic,Loose,Activity Loose,no predecessor or successor/);
  r.checks[0].items[0].name = "=HYPERLINK(1)";
  assert.match(findingsCsv(r), /,'=HYPERLINK\(1\),/);
});

test("the bundled example parses cleanly and its calendar is the 8-hour one", async () => {
  const { EXAMPLE_XER } = await import("./example.mjs");
  const r = assess(parseXer(EXAMPLE_XER));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.project.code, "OFFICE-FITOUT");
  assert.equal(r.checks.find((c) => c.id === 8).count, 1); // the 50-day procurement
  assert.ok(r.drivingPath.length > 3);
});

test("a calendar that will not parse is reported, not silently replaced", () => {
  const x = project([task("1", "A", 8)], []);
  x.tables.CALENDAR[0].clndr_data = "(0||CalendarData()(";
  const out = schedule(x);
  assert.equal(out.warnings.length >= 1, true);
  assert.match(out.warnings.join(" "), /calendar C1/);
});

test("free float: an open end runs to the project's early finish, not a must-finish date", () => {
  // A 16 h -> B 8 h (finishes 2025-12-03 17:00); C 8 h has no successor.
  // Must finish 2025-12-05 17:00 gives total float, but free float stops at
  // the project's own early finish (P6 24.12: 34 open ends).
  const x = project([task("1", "A", 16), task("2", "B", 8), task("3", "C", 8)], [link("1", "2", "1")], { plan_end_date: "2025-12-05 17:00" });
  const out = schedule(x);
  const c = at(out, x, "C");
  assert.equal(c.tf, 32); // to the must-finish date
  assert.equal(c.ff, 16); // to B's finish, the project's early finish
  assert.equal(at(out, x, "B").ff, 0);
});

test("free float: never negative, not capped at a negative total float", () => {
  // Must finish before the logic can: total float is negative, while A's
  // free float to its successor is still the plain gap (P6 stores no
  // negative free float in 20,127 values).
  const x = project([task("1", "A", 8), task("2", "B", 8), task("3", "D", 40)],
    [link("1", "3", "1"), link("2", "3", "2", "PR_SS", 16)], { plan_end_date: "2025-12-03 17:00" });
  const out = schedule(x);
  const a = at(out, x, "A");
  assert.ok(a.tf < 0);
  assert.equal(a.ff, 8); // D starts 2025-12-03 08:00 (B + 16 h), A finishes 12-01 17:00
});

test("free float: a started predecessor's spent SS lag is not free float; a finished successor counts", () => {
  // A started 2025-11-26 08:00, 8 h left at the data date 2025-12-01. B (SS
  // 16 h) waits only for A's remaining work: the 16 h lag was spent before
  // the data date, so A's free float to B is 0, not -16.
  const x = project([
    task("1", "A", 8, { status_code: "TK_Active", act_start_date: "2025-11-26 08:00" }),
    task("2", "B", 8),
    task("3", "C", 8),
    task("4", "Z", 0, { status_code: "TK_Complete", act_start_date: "2025-11-20 08:00", act_end_date: "2025-11-21 17:00" }),
  ], [link("1", "2", "1", "PR_SS", 16), link("2", "3", "1"), link("3", "4", "3")]);
  const out = schedule(x);
  assert.equal(at(out, x, "B").es, "2025-12-01 08:00");
  assert.equal(at(out, x, "A").ff, 0);
  // C's only successor finished before the data date: the node sits at the
  // data date, behind C, so C has no free float (it would push that node)
  assert.equal(at(out, x, "C").ff, 0);
});

test("robust inputs: no data date, no PROJECT table, calendars with no work pattern", () => {
  const text = xerText({
    CALENDAR: [{ clndr_id: "C8", clndr_name: "Eight", day_hr_cnt: 8, clndr_data: "" }, { clndr_id: "C10", clndr_name: "Ten", day_hr_cnt: 10, clndr_data: "" }],
    TASK: [
      { task_id: "1", task_code: "A", task_type: "TT_Task", status_code: "TK_NotStart", clndr_id: "C8", remain_drtn_hr_cnt: 16, early_start_date: "2025-12-01 08:00" },
      { task_id: "2", task_code: "B", task_type: "TT_Task", status_code: "TK_NotStart", clndr_id: "C10", remain_drtn_hr_cnt: 10 },
    ],
    TASKPRED: [{ task_pred_id: "1", task_id: "2", pred_task_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 }],
  });
  const x = parseXer(text);
  const out = schedule(x);
  const r = (id) => out.tasks.get(id);
  // counted from the earliest stored date, on a Mon-Fri 08:00-17:00 week
  assert.equal(formatDate(r("1").ef), "2025-12-02 17:00");
  // B's 10 h day (08-12, 13-19) still works at 17:00: 2 h there, 8 h next day
  assert.equal(formatDate(r("2").remES), "2025-12-02 17:00");
  assert.equal(formatDate(r("2").ef), "2025-12-03 17:00");
  assert.ok(out.warnings.some((w) => /no data date/.test(w)));
  assert.ok(out.warnings.some((w) => /stores no work pattern/.test(w)));
  const rep = assess(x);
  assert.equal(rep.project.open, 2);
  assert.equal(Calendar.weekdays(4).weekMinutes, 5 * 240);
});

test("schedule CSV: one row per open activity with recomputed and stored float", () => {
  const x = project([task("1", "A", 16, { total_float_hr_cnt: 0, free_float_hr_cnt: 0, early_end_date: "2025-12-02 17:00" }), task("2", "=B", 8, { total_float_hr_cnt: 5 })],
    [link("1", "2", "1")]);
  const csv = scheduleCsv(assess(x)).trim().split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[0], /^activity,name,status,early start/);
  assert.match(csv[1], /^A,Activity A,NotStart,2025-12-01 08:00,2025-12-02 17:00,.*,0,0,0,0,2025-12-02 17:00,0,0,yes$/);
  assert.match(csv[2], /^'=B,.*,no$/); // formula-like code written as text; stored float 5 h disagrees
});

test("calendar data: a day key outside 1-7 is ignored, and a clock time past 24:00 is refused", () => {
  // only a day numbered 8: no working week at all
  const eight = "(0||CalendarData()((0||DaysOfWeek()((0||8()((0||0(s|08:00|f|17:00)())))))))";
  const cal = Calendar.fromXer({ clndr_id: "C8", clndr_data: eight, day_hr_cnt: "8" });
  assert.equal(cal.weekMinutes, 0);
  assert.equal(cal.works, false);
  const at = (t) => `(0||CalendarData()((0||DaysOfWeek()((0||2()((0||0(s|08:00|f|${t})())))))))`;
  assert.equal(Calendar.fromXer({ clndr_id: "C9", clndr_data: at("24:00"), day_hr_cnt: "16" }).weekMinutes, 16 * 60);
  for (const bad of ["100:00", "008:00", "25:00", "24:30", "17:60"]) assert.throws(() => Calendar.fromXer({ clndr_id: "C9", clndr_data: at(bad), day_hr_cnt: "8" }), /bad time/, bad);
});

test("expected finish: sets the remaining duration, absorbs a predecessor's slip, ignored once passed, off without the option", () => {
  // A 5 d -> B 10 d (expected finish Fri 2025-12-19 17:00) -> C 5 d
  const tasks = (bHours, bExp) => [task("1", "A", 40), task("2", "B", bHours, { expect_end_date: bExp }), task("3", "C", 40)];
  const preds = [link("1", "2", "1"), link("2", "3", "2")];
  const on = project(tasks(80, "2025-12-19 17:00"), preds, {}, { sched_use_expect_end_flag: "Y" });
  // B starts Mon 12-08 08:00: 2 weeks of stored work would end 12-19, the expected finish agrees
  assert.equal(at(schedule(on), on, "B").ef, "2025-12-19 17:00");
  // the stored remaining is wrong (200 h): the expected finish still sets it
  const wrong = project(tasks(200, "2025-12-19 17:00"), preds, {}, { sched_use_expect_end_flag: "Y" });
  const w = schedule(wrong);
  assert.equal(at(w, wrong, "B").ef, "2025-12-19 17:00");
  // C: 5 d from Mon 12-22 (12-24 a half day, 12-25 off)
  assert.equal(at(w, wrong, "C").ef, "2025-12-30 12:00");
  assert.equal(w.expected.get("2").to, 80 * 60);
  // option off: the stored 200 h stands
  const offFile = project(tasks(200, "2025-12-19 17:00"), preds);
  assert.equal(at(schedule(offFile), offFile, "B").ef, "2026-01-13 12:00");
  assert.notEqual(at(schedule(wrong, { expectedFinish: false }), wrong, "B").ef, "2025-12-19 17:00");
  // A slips 3 d: B still finishes on its expected finish, so C does not move
  const base = schedule(on);
  const slip = schedule(on, { delay: { taskId: "1", minutes: 3 * 8 * 60 } });
  assert.equal(at(slip, on, "B").ef, "2025-12-19 17:00");
  assert.equal(at(slip, on, "C").ef, at(base, on, "C").ef);
  // the critical path test's delay on B itself goes on top of the expected
  // finish: 10 d to 12-19, then 3 d more (12-24 a half day, 12-25 off)
  assert.equal(at(schedule(on, { delay: { taskId: "2", minutes: 3 * 8 * 60 } }), on, "B").ef, "2025-12-26 12:00");
  // without the rule the slip reaches C
  assert.notEqual(at(schedule(on, { expectedFinish: false, delay: { taskId: "1", minutes: 3 * 8 * 60 } }), on, "C").ef, at(base, on, "C").ef);
  // expected finish before B can start: ignored, the stored 80 h stand
  const past = project(tasks(80, "2025-12-03 17:00"), preds, {}, { sched_use_expect_end_flag: "Y" });
  assert.equal(at(schedule(past), past, "B").ef, "2025-12-19 17:00");
  // the assessment lists both kinds and the report ranks them medium
  const a = assess(on);
  const e = a.extra.find((x) => x.id === "expected-finish");
  assert.equal(e.count, 1);
  assert.match(e.items[0].why, /finishes on its expected finish 2025-12-19 17:00: remaining duration set to 10 d/);
  assert.equal(a.project.settings.expectedFinish, true);
  const ep = assess(past).extra.find((x) => x.id === "expected-finish");
  assert.match(ep.items[0].why, /not after where its remaining work starts.*ignored/);
  assert.equal(assess(offFile).extra.find((x) => x.id === "expected-finish"), undefined);
});

test("free float: an activity with an expected finish has none, as P6 stores (24.12 file, 23 of 23)", () => {
  // B 5 d, expected finish Fri 12-05 17:00 -> C; A 10 d -> C, so C waits
  // for A (Mon 12-15) and B has a 5 d gap to C
  const x = project([task("1", "A", 80), task("2", "B", 40, { expect_end_date: "2025-12-05 17:00" }), task("3", "C", 8)],
    [link("1", "3", "1"), link("2", "3", "2")], {}, { sched_use_expect_end_flag: "Y" });
  assert.equal(at(schedule(x), x, "B").ef, "2025-12-05 17:00");
  assert.equal(at(schedule(x), x, "B").ff, 0);
  assert.equal(at(schedule(x), x, "B").tf, 40); // total float is still the gap
  // rule off, expected finishes off, or the option off: the plain 5 d gap
  assert.equal(at(schedule(x, { variant: { ffExpected: false } }), x, "B").ff, 40);
  assert.equal(at(schedule(x, { expectedFinish: false }), x, "B").ff, 40);
  const off = project([task("1", "A", 80), task("2", "B", 40, { expect_end_date: "2025-12-05 17:00" }), task("3", "C", 8)],
    [link("1", "3", "1"), link("2", "3", "2")]);
  assert.equal(at(schedule(off), off, "B").ff, 40);
});

test("CPM: a finished node's unspent FS/FF lag comes back off its late date, to finished and open successors (rule 17)", () => {
  // Data date Wed 3 Dec 08:00. F finished Tue 17:00 -> FS lag 24 -> D (also
  // finished) -> FS -> H (8 h, open). 0 h of F's lag ran by the data date
  // (Tue 17:00 to Wed 08:00 is off), so F's late date is D's less 24 h.
  // E finished Mon 08:00 -> FF lag 8 -> H: Mon 08:00-17:00 spent it all, so no lag.
  const x = project(
    [
      task("1", "F", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-02 17:00", target_drtn_hr_cnt: 16 }),
      task("2", "D", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-02 17:00", target_drtn_hr_cnt: 16 }),
      task("3", "H", 8),
      task("4", "E", 0, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 08:00", target_drtn_hr_cnt: 0 }),
      task("5", "W", 40),
    ],
    [link("1", "2", "1", "PR_FS", 24), link("2", "3", "2"), link("3", "3", "4", "PR_FF", 8)],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  // W (40 h) ends the project Tue 9 Dec 17:00; H may start Tue 08:00
  assert.equal(at(out, x, "H").ls, "2025-12-09 08:00");
  assert.equal(formatDate(out.tasks.get("2").lf), "2025-12-09 08:00");
  assert.equal(formatDate(out.tasks.get("1").lf), "2025-12-04 08:00");
  assert.equal(formatDate(out.tasks.get("4").lf), "2025-12-09 17:00");
  const old = schedule(x, { variant: { bwDoneLagLeft: false } });
  assert.equal(formatDate(old.tasks.get("1").lf), "2025-12-09 08:00");
});

test("red team 2026-11-24: a started predecessor's SS lag does not pull its late start earlier", () => {
  // A started Mon with 8 h left; SS lag 16 to B (not started) -> FS -> End, and
  // a longer parallel C -> End gives B float. P6 (bwSSActivePred "rem"): A's
  // remaining work may start as late as B does, because the part of the lag
  // that ran is behind the data date.
  const x = project(
    [task("1", "A", 8, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", target_drtn_hr_cnt: 24 }), task("2", "B", 16), task("3", "End", 0, { task_type: "TT_FinMile" }), task("4", "C", 40)],
    [link("1", "2", "1", "PR_SS", 16), link("2", "3", "2"), link("3", "3", "4")],
    { last_recalc_date: "2025-12-03 08:00" },
  );
  const out = schedule(x);
  assert.equal(at(out, x, "A").ls, at(out, x, "B").ls);
  assert.notEqual(at(schedule(x, { variant: { bwSSActivePred: false } }), x, "A").ls, at(out, x, "B").ls, "the generic rule subtracts the lag");
});

test("red team 2026-11-24: the driving path starts from the finishing activity even when it has successors", () => {
  // A (40 h) sets the project finish; its only successor B (8 h, SS) ends earlier,
  // so the last activity to finish still has a successor.
  const x = project([task("1", "A", 40), task("2", "B", 8)], [link("1", "2", "1", "PR_SS")]);
  const out = schedule(x);
  assert.deepEqual(drivingPath(out, "1").map((id) => out.model.tasks.get(id).code), ["A"]);
});

test("CPM: a negative duration is taken as 0 and reported, never scheduled to finish before it starts", () => {
  // found by the red team, 2026-11-25: -80 h on a driving activity finished it
  // two weeks before its start and pulled the project finish in, silently
  const tasks = (bHours, bOrig = bHours) => [task("1", "A", 40), task("2", "B", bHours, { target_drtn_hr_cnt: bOrig }), task("3", "C", 40)];
  const preds = [link("1", "2", "1"), link("2", "3", "2")];
  const zero = project(tasks(0), preds);
  const neg = project(tasks(-80, -80), preds);
  const out = schedule(neg);
  const b = at(out, neg, "B");
  assert.ok(b.ef >= b.es, `${b.es} to ${b.ef}`);
  assert.equal(at(out, neg, "C").ef, at(schedule(zero), zero, "C").ef);
  assert.ok(out.warnings.some((w) => /1 remaining duration value is negative and was taken as 0: B \("-80"\)/.test(w)), JSON.stringify(out.warnings));
  assert.ok(out.warnings.some((w) => /1 original duration value is negative/.test(w)));
  // a negative lag is a lead, not an error
  const lead = project(tasks(8), [link("1", "2", "1", "PR_FS", -8), link("2", "3", "2")]);
  assert.ok(!schedule(lead).warnings.some((w) => /negative/.test(w)));
});
