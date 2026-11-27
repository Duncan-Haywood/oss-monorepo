// The GC's P6 export read into the job's schedule: a hand-made XER whose every expected value is
// worked out in the comments beside it.
import { describe, expect, it } from "vitest";
import {
  filterXerActivities,
  pickPredecessor,
  readXerSchedule,
  xerDates,
  xerNotes,
  xerSchedule,
} from "./schedule-xer";
import { decodeXer, parseXer } from "./xer";

const T = "\t";
const table = (name: string, fields: string[], rows: string[][]) =>
  [`%T${T}${name}`, `%F${T}${fields.join(T)}`, ...rows.map((r) => `%R${T}${r.join(T)}`)].join(
    "\r\n",
  );

const TASK_FIELDS = [
  "task_id",
  "proj_id",
  "wbs_id",
  "clndr_id",
  "task_code",
  "task_name",
  "task_type",
  "status_code",
  "phys_complete_pct",
  "act_start_date",
  "act_end_date",
  "restart_date",
  "reend_date",
  "early_start_date",
  "early_end_date",
  "target_start_date",
  "target_end_date",
];

const XER = [
  `ERMHDR${T}20.12${T}2026-12-07${T}Project${T}admin${T}admin${T}dbxDatabaseNoName${T}Project Management${T}USD`,
  table(
    "CALENDAR",
    ["clndr_id", "clndr_name", "day_hr_cnt"],
    [
      ["1", "5d x 8h", "8"],
      ["2", "4d x 10h", "10"],
    ],
  ),
  table(
    "PROJECT",
    ["proj_id", "proj_short_name", "last_recalc_date"],
    [
      ["10", "CLINIC", "2026-12-07 00:00"],
      ["20", "OTHER", ""],
    ],
  ),
  table(
    "PROJWBS",
    ["wbs_id", "proj_id", "parent_wbs_id", "proj_node_flag", "wbs_name"],
    [
      ["100", "10", "", "Y", "Riverside Clinic"],
      ["101", "10", "100", "N", "Level 2"],
      ["102", "10", "101", "N", "Electrical"],
    ],
  ),
  table("TASK", TASK_FIELDS, [
    // Complete: the actual dates, 100%.
    [
      "1",
      "10",
      "102",
      "1",
      "E-1000",
      "Rough-in L2",
      "TT_Task",
      "TK_Complete",
      "100",
      "2026-11-02 07:00",
      "2026-11-06 15:00",
      "",
      "",
      "2026-10-26 07:00",
      "2026-10-30 15:00",
      "2026-10-26 07:00",
      "2026-10-30 15:00",
    ],
    // A finish milestone: no start date, so one day on its finish.
    [
      "2",
      "10",
      "102",
      "1",
      "E-1010",
      "Rough-in inspection",
      "TT_FinMile",
      "TK_NotStart",
      "0",
      "",
      "",
      "",
      "2026-11-10 15:00",
      "",
      "2026-11-10 15:00",
      "",
      "",
    ],
    // Started: the actual start, the remaining finish (reend), 45.4% rounds to 45.
    [
      "3",
      "10",
      "102",
      "1",
      "E-1020",
      "Pull wire to LP-2",
      "TT_Task",
      "TK_Active",
      "45.4",
      "2026-11-09 07:00",
      "",
      "",
      "2026-11-20 15:00",
      "",
      "2026-11-19 15:00",
      "",
      "",
    ],
    // Not started, on the 10-hour calendar; a doubled quote in its name.
    [
      "4",
      "10",
      "101",
      "2",
      "E-1030",
      'Trim out 2"" boxes',
      "TT_Task",
      "TK_NotStart",
      "0",
      "",
      "",
      "2026-11-23 07:00",
      "2026-11-25 17:00",
      "2026-11-23 07:00",
      "2026-11-25 17:00",
      "",
      "",
    ],
    [
      "5",
      "10",
      "100",
      "1",
      "LOE-1",
      "Supervision",
      "TT_LOE",
      "TK_Active",
      "10",
      "2026-11-02 07:00",
      "",
      "",
      "2026-12-18 15:00",
      "",
      "",
      "",
      "",
    ],
    [
      "6",
      "10",
      "100",
      "1",
      "E-1040",
      "No dates yet",
      "TT_Task",
      "TK_NotStart",
      "0",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    [
      "7",
      "20",
      "",
      "1",
      "X-1",
      "Other project",
      "TT_Task",
      "TK_NotStart",
      "0",
      "",
      "",
      "",
      "",
      "2026-12-01 07:00",
      "2026-12-02 15:00",
      "",
      "",
    ],
  ]),
  table(
    "TASKPRED",
    ["task_pred_id", "task_id", "pred_task_id", "pred_type", "lag_hr_cnt"],
    [
      ["1", "3", "1", "PR_FS", "0"],
      ["2", "4", "3", "PR_FS", "0"],
      // 20 h on the successor's 10-hour calendar: 2 workdays.
      ["3", "4", "2", "PR_FS", "20"],
      // A lead of 8 h on 10 h days: -0.8 rounds to -1.
      ["4", "4", "1", "PR_SS", "-8"],
    ],
  ),
  "%E",
].join("\r\n");

const bytes = (s: string) => new TextEncoder().encode(s);

describe("readXerSchedule", () => {
  const r = readXerSchedule(bytes(XER));
  if (!r.ok) throw new Error(r.error);

  it("picks the project with the most activities and its data date", () => {
    expect(r.project).toEqual({
      projId: "10",
      shortName: "CLINIC",
      activityCount: 6,
      dataDate: "2026-12-07",
    });
    expect(r.projects.map((p) => p.shortName)).toEqual(["CLINIC", "OTHER"]);
    expect(r.skippedSummary).toBe(1);
    expect(r.skippedNoDates).toBe(1);
  });

  it("reads each activity's days, percent, WBS and links", () => {
    const by = new Map(r.activities.map((a) => [a.code, a]));
    expect([...by.keys()]).toEqual(["E-1000", "E-1020", "E-1010", "E-1030"]);
    expect(by.get("E-1000")).toMatchObject({
      startOn: "2026-11-02",
      finishOn: "2026-11-06",
      percentComplete: 100,
      wbs: "Level 2 / Electrical",
      milestone: false,
    });
    expect(by.get("E-1010")).toMatchObject({
      startOn: "2026-11-10",
      finishOn: "2026-11-10",
      percentComplete: 0,
      milestone: true,
    });
    expect(by.get("E-1020")).toMatchObject({
      startOn: "2026-11-09",
      finishOn: "2026-11-20",
      percentComplete: 45,
    });
    const trim = by.get("E-1030");
    expect(trim?.name).toBe('Trim out 2" boxes');
    expect(trim?.wbs).toBe("Level 2");
    expect(trim?.predecessors).toEqual([
      { code: "E-1020", type: "FS", lagDays: 0 },
      { code: "E-1010", type: "FS", lagDays: 2 },
      { code: "E-1000", type: "SS", lagDays: -1 },
    ]);
  });

  it("reads the other project when asked", () => {
    const other = readXerSchedule(bytes(XER), "20");
    expect(other.ok && other.activities.map((a) => a.code)).toEqual(["X-1"]);
    expect(readXerSchedule(bytes(XER), "99")).toEqual({
      ok: false,
      error: "That project is not in the file",
    });
  });

  it("says in words when the file is not an XER", () => {
    expect(readXerSchedule(bytes("Name,Start\nA,2026-01-01\n"))).toEqual({
      ok: false,
      error: "Not a P6 XER file: no ERMHDR line and no %T tables",
    });
    expect(readXerSchedule(bytes(`ERMHDR${T}20.12\r\n%E\r\n`))).toEqual({
      ok: false,
      error: "The file has no activities (no TASK table)",
    });
  });

  it("keeps the driving finish-to-start link and names the others", () => {
    const trim = r.activities.find((a) => a.code === "E-1030");
    if (!trim) throw new Error("missing");
    // E-1020 finishes Fri 2026-11-20: next workday Mon 11-23. E-1010 finishes Tue 11-10, +1 and a
    // 2-day lag: Fri 11-13. E-1020 drives.
    const all = new Map([
      ["E-1010", "2026-11-10"],
      ["E-1020", "2026-11-20"],
    ]);
    const pred = pickPredecessor(trim, all);
    expect(pred).toEqual({ code: "E-1020", lagDays: 0 });
    expect(xerNotes(trim, pred)).toBe(
      "From the GC's P6 schedule, activity E-1030. WBS: Level 2. Other P6 predecessors: FS E-1010 +2d, SS E-1000 -1d.",
    );
    // Without E-1020 on the job, E-1010 with its lag is the one kept.
    expect(pickPredecessor(trim, new Map([["E-1010", "2026-11-10"]]))).toEqual({
      code: "E-1010",
      lagDays: 2,
    });
    // Only the start-to-start link to an activity on the job: none kept.
    expect(pickPredecessor(trim, new Map([["E-1000", "2026-11-06"]]))).toBeNull();
  });

  it("filters by every word in the ID, name or WBS", () => {
    expect(filterXerActivities(r.activities, "level 2 trim").map((a) => a.code)).toEqual([
      "E-1030",
    ]);
    expect(filterXerActivities(r.activities, "e-10").length).toBe(4);
    expect(filterXerActivities(r.activities, " ").length).toBe(4);
  });
});

describe("xerDates", () => {
  it("falls back from remaining to early to planned dates, and never finishes before it starts", () => {
    expect(
      xerDates({
        status_code: "TK_NotStart",
        target_start_date: "2026-03-02",
        target_end_date: "2026-03-01",
      }),
    ).toEqual({ startOn: "2026-03-02", finishOn: "2026-03-02", percentComplete: 0 });
    // Not complete: 100% physical is held at 99 so it does not read as done.
    expect(
      xerDates({
        status_code: "TK_Active",
        act_start_date: "2026-03-02",
        early_end_date: "2026-03-06",
        phys_complete_pct: "100",
      }),
    ).toEqual({ startOn: "2026-03-02", finishOn: "2026-03-06", percentComplete: 99 });
    expect(xerDates({ status_code: "TK_NotStart" })).toBeNull();
    expect(xerDates({ early_start_date: "not a date" })).toBeNull();
  });
});

describe("parseXer", () => {
  it("decodes a Windows-1252 file and joins a quoted value over lines", () => {
    // "Façade" with ç as the single Windows-1252 byte 0xE7.
    const head = bytes(
      `ERMHDR${T}20.12\r\n%T${T}TASK\r\n%F${T}task_code${T}task_name\r\n%R${T}A1${T}Fa`,
    );
    const tail = bytes(
      `ade\r\n%T${T}CALENDAR\r\n%F${T}clndr_id${T}clndr_data\r\n%R${T}1${T}"(0||1()\r\n(0||2()))"\r\n%E\r\n`,
    );
    const raw = new Uint8Array([...head, 0xe7, ...tail]);
    const x = parseXer(decodeXer(raw));
    expect(x.tables.TASK).toEqual([{ task_code: "A1", task_name: "Façade" }]);
    expect(x.tables.CALENDAR?.[0]?.clndr_data).toBe("(0||1()\n(0||2()))");
    const read = xerSchedule(x);
    expect(read.ok && [read.activities.length, read.skippedNoDates]).toEqual([0, 1]);
  });
});
