import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, decodeXer, parseDate, formatDate } from "./xer.mjs";
import { Calendar, parseClndrData } from "./calendar.mjs";
import { schedule, drivingPath } from "./cpm.mjs";
import { assess, findingsCsv } from "./dcma.mjs";

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
