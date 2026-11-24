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
  assert.ok(isXml("\uFEFF  <?xml?>"));
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

// Resource calendars (eval/resource-calendars-2026-11-21.md): Project counts a
// task's duration in the time any of its work resources works, within the
// task's own calendar when it has one, unless the task ignores them.
test("tasks run on their resources' calendars, as Project schedules them", () => {
  const nightDay = (t, w = true) => `<WeekDay><DayType>${t}</DayType><DayWorking>${w ? 1 : 0}</DayWorking>${w ? "<WorkingTimes><WorkingTime><FromTime>18:00:00</FromTime><ToTime>00:00:00</ToTime></WorkingTime></WorkingTimes>" : ""}</WeekDay>`;
  const extraCal = `<Calendar><UID>3</UID><Name>Night</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>${nightDay(1, false)}${nightDay(2)}${nightDay(3)}${nightDay(4)}${nightDay(5)}${nightDay(6)}${nightDay(7, false)}</WeekDays></Calendar>
    <Calendar><UID>4</UID><Name>Day crew</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><WeekDays></WeekDays></Calendar>`;
  const tasks = [
    { uid: 2, name: "Day crew", h: 16 },
    { uid: 3, name: "Night crew", h: 12 },
    { uid: 4, name: "Both crews", h: 24 },
    { uid: 5, name: "Night crew, resource calendars ignored", h: 8 },
    { uid: 6, name: "Material only", h: 8 },
    { uid: 7, name: "Night crew on a Saturday calendar", h: 6, cal: 2 },
  ];
  let xml = project({ status: "2024-03-04T08:00:00", tasks, extraCal });
  xml = xml.replace("<IgnoreResourceCalendar>", "").replace(/(<UID>5<\/UID>)/, "$1<IgnoreResourceCalendar>1</IgnoreResourceCalendar>");
  const res = (uid, cal, type = 1) => `<Resource><UID>${uid}</UID><Name>R${uid}</Name><Type>${type}</Type><CalendarUID>${cal}</CalendarUID></Resource>`;
  const asg = (t, r) => `<Assignment><TaskUID>${t}</TaskUID><ResourceUID>${r}</ResourceUID><Units>1</Units></Assignment>`;
  xml = xml.replace("</Project>", `<Resources>${res(1, 4)}${res(2, 3)}${res(3, 3, 0)}</Resources><Assignments>${asg(2, 1)}${asg(3, 2)}${asg(4, 1)}${asg(4, 2)}${asg(5, 2)}${asg(6, 3)}${asg(7, 2)}</Assignments></Project>`);
  const x = parseMspdi(xml);
  const cal = (uid) => x.tables.TASK.find((t) => t.task_id === String(uid)).clndr_id;
  // a resource calendar with nothing of its own is its base calendar
  assert.equal(cal(2), "1");
  assert.equal(cal(5), "1");
  assert.equal(cal(6), "1");
  assert.equal(cal(3), "3");
  assert.notEqual(cal(4), "1");
  assert.notEqual(cal(4), "3");
  assert.ok(x.warnings.some((w) => /2 task\(s\) scheduled on their resources' calendars/.test(w)), x.warnings.join("\n"));
  const out = schedule(x).tasks;
  const ef = (uid) => formatDate(out.get(String(uid)).ef);
  assert.equal(ef(2), "2024-03-05 17:00");
  // 6 h a night: Monday and Tuesday nights
  assert.equal(ef(3), "2024-03-06 00:00");
  // day and night: 14 h on Monday, then 8 h of Tuesday's day and 2 h of its night
  assert.equal(ef(4), "2024-03-05 20:00");
  assert.equal(ef(5), "2024-03-04 17:00");
  // a day calendar and a night crew share no time: the task's own calendar
  assert.equal(cal(7), "2");
  assert.equal(ef(7), "2024-03-04 15:00");
  assert.ok(x.warnings.some((w) => /share no working time/.test(w)));
});

test("an in-progress task's remaining work restarts at Project's Resume date", () => {
  const tasks = [{ uid: 2, name: "Pour, stopped for rain", h: 16, rem: 12, pct: 25, actStart: "2024-03-04T08:00:00" }, { uid: 3, name: "Strip", h: 8, links: [link(2)] }];
  const ef = (xml) => { const out = schedule(parseMspdi(xml)).tasks; return [formatDate(out.get("2").ef), formatDate(out.get("3").ef)]; };
  const xml = project({ tasks });
  // no Resume: the remaining 12 h run from the data date (the first start)
  assert.deepEqual(ef(xml), ["2024-03-05 12:00", "2024-03-06 12:00"]);
  const resumed = xml.replace("<ActualStart>2024-03-04T08:00:00</ActualStart>", "<ActualStart>2024-03-04T08:00:00</ActualStart><Resume>2024-03-06T08:00:00</Resume>");
  assert.equal(parseMspdi(resumed).tables.TASK.find((t) => t.task_id === "2").resume_date, "2024-03-06 08:00");
  assert.deepEqual(ef(resumed), ["2024-03-07 12:00", "2024-03-08 12:00"]);
  // a status date after the Resume date still holds the work back to it
  const late = resumed.replace("<CalendarUID>1</CalendarUID><MinutesPerDay>", "<StatusDate>2024-03-07T08:00:00</StatusDate><CalendarUID>1</CalendarUID><MinutesPerDay>");
  assert.deepEqual(ef(late), ["2024-03-08 12:00", "2024-03-12 12:00"]);
});

test("Project text fields read as activity codes; per-task notes and Activity ID are not", () => {
  const task = (uid, extra) => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>T${uid}</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration>${extra}</Task>`;
  const ea = (fid, v) => `<ExtendedAttribute><FieldID>${fid}</FieldID><Value>${v}</Value></ExtendedAttribute>`;
  const tasks = Array.from({ length: 25 }, (_, i) => task(i + 1, ea("188743731", `A${i}`) + ea("188743734", i % 2 ? "North" : "South") + ea("188743737", `note ${i}`) + (i < 5 ? ea("188743997", "Civil") : "")));
  const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><StartDate>2026-01-05T08:00:00</StartDate><ExtendedAttributes><ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>Activity ID</Alias></ExtendedAttribute><ExtendedAttribute><FieldID>188743734</FieldID><FieldName>Text2</FieldName><Alias>Zone</Alias></ExtendedAttribute></ExtendedAttributes><Tasks>${tasks.join("")}</Tasks></Project>`;
  const r = parseMspdi(xml);
  assert.deepEqual(r.tables.ACTVTYPE.map((t) => t.actv_code_type), ["Zone", "Text11"]);
  assert.deepEqual(r.tables.ACTVCODE.filter((c) => c.actv_code_type_id === r.tables.ACTVTYPE[0].actv_code_type_id).map((c) => c.short_name), ["North", "South"]);
  assert.equal(r.tables.TASKACTV.length, 30);
  assert.ok(r.warnings.some((w) => /different value on every task.*Text3/.test(w)));
});

// Red-team guards (2026-11-21): each test below fails with one seeded fault
// that the rest of this suite let through.
test("adjacent CDATA sections join (how a writer escapes ]]> inside one)", () => {
  const x = parseXml(`<a><b><![CDATA[x]]]]><![CDATA[>y]]></b></a>`);
  assert.equal(x.children[0].children[0].text, "x]]>y");
});

test("a task on two resource calendars works the union of their hours", () => {
  const long = (t, w = true) => `<WeekDay><DayType>${t}</DayType><DayWorking>${w ? 1 : 0}</DayWorking>${w ? "<WorkingTimes><WorkingTime><FromTime>07:00:00</FromTime><ToTime>18:00:00</ToTime></WorkingTime></WorkingTimes>" : ""}</WeekDay>`;
  const extraCal = `<Calendar><UID>3</UID><Name>Long days</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>${long(1, false)}${long(2)}${long(3)}${long(4)}${long(5)}${long(6)}${long(7, false)}</WeekDays></Calendar>
    <Calendar><UID>4</UID><Name>Day crew</Name><IsBaseCalendar>0</IsBaseCalendar><BaseCalendarUID>1</BaseCalendarUID><WeekDays></WeekDays></Calendar>`;
  let xml = project({ status: "2024-03-04T08:00:00", tasks: [{ uid: 2, name: "Both crews", h: 21 }], extraCal });
  const res = (uid, cal) => `<Resource><UID>${uid}</UID><Name>R${uid}</Name><Type>1</Type><CalendarUID>${cal}</CalendarUID></Resource>`;
  const asg = (t, r) => `<Assignment><TaskUID>${t}</TaskUID><ResourceUID>${r}</ResourceUID><Units>1</Units></Assignment>`;
  xml = xml.replace("</Project>", `<Resources>${res(1, 4)}${res(2, 3)}</Resources><Assignments>${asg(2, 1)}${asg(2, 2)}</Assignments></Project>`);
  // 08:00-12:00 + 13:00-17:00 inside 07:00-18:00 is 07:00-18:00: 10 h on Monday, 11 h on Tuesday
  assert.equal(formatDate(schedule(parseMspdi(xml)).tasks.get("2").ef), "2024-03-05 18:00");
});

test("with no status date, a task started before the project start sets the data date", () => {
  const x = parseMspdi(project({ tasks: [{ uid: 2, name: "Early", h: 16, rem: 8, pct: 50, actStart: "2024-03-01T08:00:00", start: "2024-03-01T08:00:00" }] }));
  assert.equal(x.tables.PROJECT[0].last_recalc_date, "2024-03-01 08:00");
  assert.ok(x.warnings.some((w) => /earliest task start/.test(w)), x.warnings.join("\n"));
});

test("a blank text-field value is no activity code", () => {
  const t = (uid, v) => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>T${uid}</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration><ExtendedAttribute><FieldID>188743734</FieldID><Value>${v}</Value></ExtendedAttribute></Task>`;
  const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><StartDate>2026-01-05T08:00:00</StartDate><ExtendedAttributes><ExtendedAttribute><FieldID>188743734</FieldID><FieldName>Text2</FieldName><Alias>Zone</Alias></ExtendedAttribute></ExtendedAttributes><Tasks>${t(1, "North")}${t(2, " ")}${t(3, "South")}${t(4, "North")}</Tasks></Project>`;
  const r = parseMspdi(xml);
  assert.deepEqual(r.tables.ACTVCODE.map((c) => c.short_name).sort(), ["North", "South"]);
  assert.equal(r.tables.TASKACTV.length, 3);
});

test("a split task's gap is added to its span and moves with it (eval/split-tasks-2026-11-21.md)", () => {
  const tp = (s, f, h, type = 1) => `<TimephasedData><Type>${type}</Type><Start>${s}</Start><Finish>${f}</Finish><Unit>2</Unit>${h === null ? "" : `<Value>PT${h}H0M0S</Value>`}</TimephasedData>`;
  // Formwork, 16 h, saved as Monday's work, a split on Tuesday, Wednesday's work
  const rows = tp("2024-03-04T08:00:00", "2024-03-04T17:00:00", 8) + tp("2024-03-04T17:00:00", "2024-03-05T17:00:00", 0) + tp("2024-03-05T17:00:00", "2024-03-06T17:00:00", 8);
  const asg = (t, r, body) => `<Assignment><TaskUID>${t}</TaskUID><ResourceUID>${r}</ResourceUID><Units>1</Units>${body}</Assignment>`;
  const build = (tasks, asgs) => project({ tasks }).replace("</Project>", `<Assignments>${asgs}</Assignments></Project>`);
  const ef = (xml) => { const out = schedule(parseMspdi(xml)).tasks; return ["2", "3"].map((id) => formatDate(out.get(id).ef)); };
  const tasks = [{ uid: 2, name: "Formwork", h: 16, finish: "2024-03-06T17:00:00" }, { uid: 3, name: "Pour", h: 8, links: [link(2)] }];
  // no timephased rows: 16 h end Tuesday
  assert.deepEqual(ef(build(tasks, "")), ["2024-03-05 17:00", "2024-03-06 17:00"]);
  const split = build(tasks, asg(2, -65535, rows));
  const x = parseMspdi(split);
  assert.equal(x.tables.TASK.find((t) => t.task_id === "2").split_gaps, "2024-03-04 17:00|2024-03-05 17:00");
  assert.ok(x.warnings.some((w) => /1 split task/.test(w)), x.warnings.join("\n"));
  // the split's 8 working hours (Tuesday) push the finish to Wednesday and Pour to Thursday
  assert.deepEqual(ef(split), ["2024-03-06 17:00", "2024-03-07 17:00"]);
  // a zero row while another assignment works is no gap
  const busy = tp("2024-03-04T08:00:00", "2024-03-06T17:00:00", 24);
  assert.deepEqual(ef(build(tasks, asg(2, -65535, rows) + asg(2, 1, busy))), ["2024-03-05 17:00", "2024-03-06 17:00"]);
  // rows with no value (non-working time) are no gap
  const nonwork = tp("2024-03-04T08:00:00", "2024-03-04T17:00:00", 8) + tp("2024-03-04T17:00:00", "2024-03-05T08:00:00", null) + tp("2024-03-05T08:00:00", "2024-03-05T17:00:00", 8);
  assert.equal(parseMspdi(build(tasks, asg(2, -65535, nonwork))).tables.TASK.find((t) => t.task_id === "2").split_gaps, undefined);
  // pushed a day by a new predecessor, the split keeps its 8 working hours
  const moved = [{ uid: 1, name: "Strip", h: 8 }, { ...tasks[0], links: [link(1)] }, tasks[1]];
  assert.deepEqual(ef(build(moved, asg(2, -65535, rows))), ["2024-03-07 17:00", "2024-03-08 17:00"]);
  // in progress with Resume after the split: the split is behind it and adds nothing
  const active = [{ ...tasks[0], rem: 8, pct: 50, actStart: "2024-03-04T08:00:00" }, tasks[1]];
  const resumed = build(active, asg(2, -65535, rows)).replace("<ActualStart>2024-03-04T08:00:00</ActualStart>", "<ActualStart>2024-03-04T08:00:00</ActualStart><Resume>2024-03-06T08:00:00</Resume>");
  assert.deepEqual(ef(resumed), ["2024-03-06 17:00", "2024-03-07 17:00"]);
});

// Red-team guards (2026-11-24): each test below fails with one seeded fault
// in mspdi.mjs that the rest of the suite let through.
test("a file with no Title or Name gets a readable project name; Name alone loses its .xml", () => {
  const bare = (head) => `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">${head}<StartDate>2026-01-05T08:00:00</StartDate><Tasks><Task><UID>1</UID><ID>1</ID><Name>T1</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration></Task></Tasks></Project>`;
  assert.equal(parseMspdi(bare("")).tables.PROJECT[0].proj_short_name, "Microsoft Project schedule");
  assert.equal(parseMspdi(bare("<Name>Tower B.xml</Name>")).tables.PROJECT[0].proj_short_name, "Tower B");
});

test("Project's critical slack limit, in days, becomes P6's critical float in hours on the file's day length", () => {
  const xml = project({ tasks: BASE }).replace("<MinutesPerDay>480</MinutesPerDay>", "<MinutesPerDay>480</MinutesPerDay><CriticalSlackLimit>2</CriticalSlackLimit>");
  assert.equal(parseMspdi(xml).tables.PROJECT[0].critical_drtn_hr_cnt, "16");
  assert.equal(parseMspdi(project({ tasks: BASE })).tables.PROJECT[0].critical_drtn_hr_cnt, "0");
});

test("an outline level-2 task after a plain level-1 task is not filed under an earlier summary", () => {
  // malformed outline (Project would not save it, but a hand-edited or
  // third-party export can): S > A, then plain task T at level 1, then U at 2
  const x = parseMspdi(project({ tasks: [
    { uid: 1, name: "S", summary: true }, { uid: 2, name: "A", level: 2 },
    { uid: 3, name: "T" }, { uid: 4, name: "U", level: 2 },
  ] }));
  const wbs = (uid) => x.tables.TASK.find((t) => t.task_id === String(uid)).wbs_id;
  assert.notEqual(wbs(4), wbs(2));
  assert.equal(wbs(4), wbs(3));
});

test("a text field is an activity code up to 20 tasks with distinct values; from 21 it reads as per-task notes", () => {
  const task = (uid, v) => `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>T${uid}</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration><ExtendedAttribute><FieldID>188743734</FieldID><Value>${v}</Value></ExtendedAttribute></Task>`;
  const file = (n) => `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><StartDate>2026-01-05T08:00:00</StartDate><Tasks>${Array.from({ length: n }, (_, i) => task(i + 1, `Room ${i}`)).join("")}</Tasks></Project>`;
  assert.deepEqual(parseMspdi(file(20)).tables.ACTVTYPE.map((t) => t.actv_code_type), ["Text2"]);
  const many = parseMspdi(file(21));
  assert.equal(many.tables.ACTVTYPE?.length ?? 0, 0);
  assert.ok(many.warnings.some((w) => /different value on every task.*Text2/.test(w)));
});
