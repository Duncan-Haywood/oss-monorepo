import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMspdi, parseSchedule, parseXml, durationHours, isXml } from "./mspdi.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { compare } from "./compare.mjs";
import { formatDate } from "./xer.mjs";

const day = (t, w = true) => `<WeekDay><DayType>${t}</DayType><DayWorking>${w ? 1 : 0}</DayWorking>${w ? "<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>" : ""}</WeekDay>`;
const link = (uid, type = 1, lag = 0, fmt = 7) => `<PredecessorLink><PredecessorUID>${uid}</PredecessorUID><Type>${type}</Type><LinkLag>${lag}</LinkLag><LagFormat>${fmt}</LagFormat></PredecessorLink>`;
const task = (o) => `<Task><UID>${o.uid}</UID><ID>${o.id ?? o.uid}</ID><Name>${o.name}</Name><Active>1</Active><Manual>${o.manual ? 1 : 0}</Manual><OutlineLevel>${o.level ?? 1}</OutlineLevel><WBS>${o.uid}</WBS>
  <Summary>${o.summary ? 1 : 0}</Summary><Milestone>${o.mile ? 1 : 0}</Milestone><Start>${o.start || "2024-03-04T08:00:00"}</Start><Finish>${o.finish || "2024-03-04T17:00:00"}</Finish>
  <Duration>PT${o.h ?? 8}H0M0S</Duration><DurationFormat>${o.fmt ?? 7}</DurationFormat><RemainingDuration>PT${o.rem ?? o.h ?? 8}H0M0S</RemainingDuration>
  ${o.actStart ? `<ActualStart>${o.actStart}</ActualStart>` : ""}<PercentComplete>${o.pct ?? 0}</PercentComplete>
  <ConstraintType>${o.cstr ?? 0}</ConstraintType>${o.cdate ? `<ConstraintDate>${o.cdate}</ConstraintDate>` : ""}<CalendarUID>${o.cal ?? -1}</CalendarUID>
  ${o.deadline ? `<Deadline>${o.deadline}</Deadline>` : ""}<TotalSlack>${o.ts ?? 0}</TotalSlack><FreeSlack>0</FreeSlack>
  ${o.bl ? `<Baseline><Number>0</Number><Start>${o.bl[0]}</Start><Finish>${o.bl[1]}</Finish></Baseline>` : ""}${(o.links || []).join("")}</Task>`;

function project({ status = "", tasks, extraCal = "" }) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<!-- a hand-made schedule in Microsoft Project's XML -->
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion><Name>Garage &amp; slab.xml</Name><Title>Garage &amp; slab</Title><LastSaved>2024-03-01T10:00:00</LastSaved>
  <ScheduleFromStart>1</ScheduleFromStart><StartDate>2024-03-04T08:00:00</StartDate><FinishDate>2024-03-22T12:00:00</FinishDate>
  ${status ? `<StatusDate>${status}</StatusDate>` : ""}<CalendarUID>1</CalendarUID><MinutesPerDay>480</MinutesPerDay>
  <Calendars>
    <Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>
      ${day(1, false)}${day(2)}${day(3)}${day(4)}${day(5)}${day(6)}${day(7, false)}
      <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2024-03-11T00:00:00</FromDate><ToDate>2024-03-11T23:59:00</ToDate></TimePeriod></WeekDay>
    </WeekDays></Calendar>
    <Calendar><UID>2</UID><Name>Crew</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><WeekDays>${day(7)}</WeekDays></Calendar>
    ${extraCal}
  </Calendars>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Garage</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    ${tasks.map(task).join("\n    ")}
  </Tasks>
</Project>`;
}

const BASE = [
  { uid: 1, name: "Site work", summary: true },
  { uid: 2, name: "Excavate", level: 2, h: 16, bl: ["2024-03-04T08:00:00", "2024-03-05T17:00:00"] },
  { uid: 3, name: "<![CDATA[Footings <6\" deep>]]>", level: 2, h: 24, links: [link(2, 1, 4800)] },
  { uid: 4, name: "Cure", level: 2, h: 8, links: [link(3, 1, 28800, 8)] },
  { uid: 5, name: "Frame", h: 40, links: [link(4, 3, 50, 19), link(1)] },
  { uid: 6, name: "Handover", mile: true, h: 0, links: [link(5)] },
  { uid: 7, name: "Permit", manual: true, h: 8, start: "2024-03-04T08:00:00", links: [] },
  { uid: 8, name: "Saturday crew", cal: 2, h: 16, links: [link(2)], deadline: "2024-03-08T17:00:00" },
  { uid: 9, name: "Inspect", h: 8, cstr: 7, cdate: "2024-03-21T17:00:00", links: [link(5, 0)] },
];

test("durations and XML basics", () => {
  assert.equal(durationHours("PT8H0M0S"), 8);
  assert.equal(durationHours("PT7H30M0S"), 7.5);
  assert.equal(durationHours("P1DT2H"), 26);
  assert.equal(durationHours("PT-8H0M0S"), -8);
  assert.equal(durationHours(""), null);
  const x = parseXml(`<?xml version="1.0"?><a:Root xmlns:a="x"><B k="v>">1 &lt; 2 &#x26; &#65;</B><C/><D><![CDATA[<raw>]]></D></a:Root>`);
  const root = x.children[0];
  assert.equal(root.name, "Root");
  assert.equal(root.children[0].text, "1 < 2 & A");
  assert.equal(root.children[2].text, "<raw>");
  assert.throws(() => parseXml("<a><b></a>"), /does not close/);
  assert.ok(isXml("﻿  <?xml?>"));
  assert.ok(!isXml("ERMHDR\t8.0"));
  assert.throws(() => parseMspdi("<NotProject/>"), /no <Project>/);
});

test("tables: project, calendars, WBS, tasks and links", () => {
  const x = parseMspdi(project({ tasks: BASE }));
  assert.equal(x.format, "mspdi");
  assert.equal(x.version, "MSPDI 14");
  const P = x.tables.PROJECT[0];
  assert.equal(P.proj_short_name, "Garage & slab");
  assert.equal(P.last_recalc_date, "2024-03-04 08:00"); // no status date: the first start
  assert.equal(P.clndr_id, "1");
  // the derived calendar keeps the base's week and holiday, adds Saturday
  const crew = x.tables.CALENDAR.find((c) => c.clndr_id === "2");
  assert.match(crew.clndr_data, /\(0\|\|7\(\)\(\(0\|\|0\(s\|08:00\|f\|12:00\)/);
  assert.match(crew.clndr_data, /d\|45362/); // 2024-03-11 as a serial day
  assert.deepEqual(x.tables.PROJWBS.map((w) => [w.wbs_id, w.wbs_name]), [["1", "Site work"]]);
  const T = Object.fromEntries(x.tables.TASK.map((t) => [t.task_code, t]));
  assert.equal(T["2"].wbs_id, "1");
  assert.equal(T["5"].wbs_id, "");
  assert.equal(T["3"].task_name, "Footings <6\" deep>");
  assert.equal(T["2"].target_end_date, "2024-03-05 17:00");
  assert.equal(T["6"].task_type, "TT_FinMile");
  assert.equal(T["7"].cstr_type, "CS_MSOA");
  assert.equal(T["9"].cstr_type, "CS_MEOB");
  assert.equal(T["8"].clndr_id, "2");
  assert.equal(T["3"].clndr_id, "1");
  const L = x.tables.TASKPRED;
  assert.equal(L.length, 6); // the link from the summary is left out
  const lag = (s, p) => L.find((r) => r.task_id === s && r.pred_task_id === p);
  assert.equal(lag("3", "2").lag_hr_cnt, "8");
  assert.equal(lag("4", "3").lag_hr_cnt, "48");
  assert.equal(lag("4", "3").lag_calendar, "24h");
  assert.equal(lag("5", "4").lag_hr_cnt, "4"); // 50% of an 8 h predecessor
  assert.equal(lag("5", "4").pred_type, "PR_SS");
  assert.equal(lag("9", "5").pred_type, "PR_FF");
  const w = x.warnings.join("\n");
  assert.match(w, /1 link\(s\) to or from a summary task/);
  assert.match(w, /1 manually scheduled task\(s\).*7 Permit/);
  assert.match(w, /1 task\(s\) carry a deadline/);
  assert.match(w, /1 elapsed lag/);
  assert.match(w, /1 percent lag/);
});

test("the CPM engine schedules it as Project would", () => {
  const x = parseMspdi(project({ tasks: BASE }));
  const r = schedule(x);
  const at = (code) => r.tasks.get(code);
  const f = (m) => formatDate(m);
  assert.equal(f(at("2").ef), "2024-03-05 17:00");
  // a one-day lag, then three days over the 11 March holiday
  assert.equal(f(at("3").ef), "2024-03-12 17:00");
  // 48 elapsed hours after 12 March 17:00 is 14 March 17:00, so Cure runs on the 15th
  assert.equal(f(at("4").remES), "2024-03-15 08:00");
  // start-to-start at 50% of Cure's 8 h: 4 h into the 15th, after the lunch break
  assert.equal(f(at("5").remES), "2024-03-15 13:00");
  assert.equal(f(at("5").ef), "2024-03-22 12:00");
  // the Saturday crew works the 9th, which the standard calendar does not
  assert.equal(f(at("8").ef), "2024-03-07 17:00");
  // finish no later than 21 March pulls Inspect's late finish, so it shows negative float
  assert.ok(at("9").tf < 0);
  // the manual task keeps its start
  assert.equal(f(at("7").remES), "2024-03-04 08:00");
  const rep = assess(x, { result: r });
  assert.equal(rep.project.finish, "2024-03-22 12:00");
  assert.ok(rep.warnings.some((w) => /manually scheduled/.test(w)));
  const hard = rep.checks.find((c) => c.id === 5);
  assert.deepEqual(hard.items.map((i) => i.code), ["9"]);
  // the file says 0 slack on Inspect; the recomputed float disagrees, and is listed
  assert.ok(rep.recompute.items.some((i) => i.code === "9"));
});

test("progress: status date, actual start and remaining duration", () => {
  const tasks = BASE.map((t) => (t.uid === 2 ? { ...t, actStart: "2024-03-04T08:00:00", pct: 50, rem: 8 } : t));
  const x = parseMspdi(project({ status: "2024-03-05T08:00:00", tasks }));
  assert.equal(x.tables.PROJECT[0].last_recalc_date, "2024-03-05 08:00");
  const ex = x.tables.TASK.find((t) => t.task_code === "2");
  assert.equal(ex.status_code, "TK_Active");
  assert.equal(ex.remain_drtn_hr_cnt, "8");
  const r = schedule(x);
  assert.equal(formatDate(r.tasks.get("2").ef), "2024-03-05 17:00");
});

test("two saves compare by Unique ID even after rows are renumbered", () => {
  const a = parseMspdi(project({ tasks: BASE }));
  // the next update: a row inserted at the top renumbers every ID, Frame grows to 6 days
  const moved = BASE.map((t) => ({ ...t, id: t.uid + 1, ...(t.uid === 5 ? { h: 48 } : {}) }));
  const b = parseMspdi(project({ tasks: [{ uid: 20, id: 1, name: "Mobilise", h: 8 }, ...moved] }));
  const c = compare(a, b);
  assert.deepEqual(c.activities.added.map((x) => x.code), ["20"]);
  assert.deepEqual(c.activities.deleted, []);
  assert.ok(c.durations.origChanged.some((x) => x.code === "5"));
});

test("parseSchedule picks the reader from the text", () => {
  assert.equal(parseSchedule(project({ tasks: BASE })).format, "mspdi");
  const xer = parseSchedule("ERMHDR\t19.12\t2024-03-01\n%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1\tP\n%E\n");
  assert.equal(xer.tables.PROJECT[0].proj_short_name, "P");
});

test("recurring and work-week calendars", () => {
  // a calendar from a tool that lists exceptions only under <Exceptions>,
  // plus a work week of ten-hour days for two weeks in March
  const cal = `<Calendar><UID>5</UID><Name>Winter</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${day(1, false)}${day(2)}${day(3)}${day(4)}${day(5)}${day(6)}${day(7, false)}</WeekDays>
    <Exceptions><Exception><TimePeriod><FromDate>2024-03-06T00:00:00</FromDate><ToDate>2024-03-06T23:59:00</ToDate></TimePeriod><Name>Snow</Name><Type>1</Type><DayWorking>0</DayWorking></Exception>
      <Exception><TimePeriod><FromDate>2024-01-01T00:00:00</FromDate><ToDate>2026-01-01T23:59:00</ToDate></TimePeriod><Name>New year</Name><Type>5</Type><Period>1</Period><DayWorking>0</DayWorking></Exception></Exceptions>
    <WorkWeeks><WorkWeek><TimePeriod><FromDate>2024-03-11T00:00:00</FromDate><ToDate>2024-03-22T23:59:00</ToDate></TimePeriod><Name>Long days</Name><WeekDays>
      <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>07:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay></WeekDays></WorkWeek></WorkWeeks></Calendar>`;
  const x = parseMspdi(project({ tasks: [{ uid: 1, name: "Pour", h: 40, cal: 5 }], extraCal: cal }));
  assert.ok(x.warnings.some((w) => /Winter: 1 recurring exception/.test(w)));
  const r = schedule(x);
  // 4th, 5th, (6th snow), 7th, 8th = 32 h, then Monday 11th is a 10 h day: 8 h more ends at 15:00
  assert.equal(formatDate(r.tasks.get("1").ef), "2024-03-11 15:00");
});
