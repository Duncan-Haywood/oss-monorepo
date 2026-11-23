import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePmxml, isPmxml, pmxmlToXer, workPeriods, pmDate } from "./pmxml.mjs";
import { parseSchedule, parseXml } from "./mspdi.mjs";
import { parseXer, decodeXer, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";

// A hand-made P6 XML file in the shape P6 writes: Monday to Friday 08:00-12:00
// and 13:00-17:00 written as P6 writes them (last minute, 11:59 and 16:59),
// a holiday on Monday 2024-03-11, data date Monday 2024-03-04 08:00.
const hours = (d) => `<StandardWorkHours><DayOfWeek>${d}</DayOfWeek>${d === "Sunday" || d === "Saturday" ? "" : "<WorkTime><Start>08:00:00</Start><Finish>11:59:00</Finish></WorkTime><WorkTime><Start>13:00:00</Start><Finish>16:59:00</Finish></WorkTime>"}</StandardWorkHours>`;
const act = (o) => `<Activity><ActualFinishDate${o.af ? `>${o.af}</ActualFinishDate>` : ' xsi:nil="true" />'}<ActualStartDate${o.as ? `>${o.as}</ActualStartDate>` : ' xsi:nil="true" />'}
  <CalendarObjectId>100</CalendarObjectId><Id>${o.code}</Id><Name>${o.name}</Name><ObjectId>${o.id}</ObjectId><PhysicalPercentComplete>${o.pct ?? 0}</PhysicalPercentComplete>
  <PlannedDuration>${o.h}</PlannedDuration><RemainingDuration>${o.rem ?? o.h}</RemainingDuration><ProjectObjectId>7</ProjectObjectId>
  <PrimaryConstraintType${o.cstr ? `>${o.cstr}</PrimaryConstraintType>` : ' xsi:nil="true" />'}<PrimaryConstraintDate${o.cdate ? `>${o.cdate}</PrimaryConstraintDate>` : ' xsi:nil="true" />'}
  <RemainingEarlyStartDate${o.res ? `>${o.res}</RemainingEarlyStartDate>` : ' xsi:nil="true" />'}<RemainingEarlyFinishDate${o.ree ? `>${o.ree}</RemainingEarlyFinishDate>` : ' xsi:nil="true" />'}
  <RemainingLateFinishDate${o.rle ? `>${o.rle}</RemainingLateFinishDate>` : ' xsi:nil="true" />'}
  <Status>${o.status}</Status><Type>${o.type || "Task Dependent"}</Type><WBSObjectId>${o.wbs ?? 21}</WBSObjectId>
  ${o.code === "A1020" ? "<Code><TypeObjectId>50</TypeObjectId><ValueObjectId>51</ValueObjectId></Code><UDF><TypeObjectId>60</TypeObjectId><DoubleValue>12.5</DoubleValue></UDF>" : ""}</Activity>`;
const rel = (id, p, s, type = "Finish to Start", lag = 0) => `<Relationship><Lag>${lag}</Lag><ObjectId>${id}</ObjectId><PredecessorActivityObjectId>${p}</PredecessorActivityObjectId><PredecessorProjectObjectId>7</PredecessorProjectObjectId><SuccessorActivityObjectId>${s}</SuccessorActivityObjectId><SuccessorProjectObjectId>7</SuccessorProjectObjectId><Type>${type}</Type></Relationship>`;

export const PMXML = `<?xml version="1.0" encoding="UTF-8"?>
<!-- hand-made test file -->
<APIBusinessObjects xmlns="http://xmlns.oracle.com/Primavera/P6/V23.12/API/BusinessObjects" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Calendar><HoursPerDay>8.0</HoursPerDay><HoursPerWeek>40</HoursPerWeek><IsDefault>1</IsDefault><Name>5 day &amp; holidays</Name><ObjectId>100</ObjectId><Type>Global</Type>
    <StandardWorkWeek>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(hours).join("")}</StandardWorkWeek>
    <HolidayOrExceptions><HolidayOrException><Date>2024-03-11T00:00:00</Date></HolidayOrException></HolidayOrExceptions></Calendar>
  <Resource><CalendarObjectId>100</CalendarObjectId><Id>CARP</Id><Name>Carpenters</Name><ObjectId>300</ObjectId><ResourceType>Labor</ResourceType></Resource>
  <ActivityCodeType><Name>Area</Name><ObjectId>50</ObjectId><Scope>Global</Scope></ActivityCodeType>
  <ActivityCode><CodeTypeObjectId>50</CodeTypeObjectId><CodeValue>N</CodeValue><Color>#0000FF</Color><Description>North wing</Description><ObjectId>51</ObjectId></ActivityCode>
  <UDFType><DataType>Double</DataType><ObjectId>60</ObjectId><SubjectArea>Activity</SubjectArea><Title>Pessimistic Duration</Title></UDFType>
  <Project>
    <ActivityDefaultCalendarObjectId>100</ActivityDefaultCalendarObjectId><DataDate>2024-03-04T08:00:00</DataDate><Id>FITOUT</Id><Name>Office fit-out</Name>
    <MustFinishByDate>2024-03-15T17:00:00</MustFinishByDate><ObjectId>7</ObjectId><PlannedStartDate>2024-03-01T08:00:00</PlannedStartDate>
    <ScheduleOptions><ComputeTotalFloatType>Finish Float = Late Finish - Early Finish</ComputeTotalFloatType><CriticalActivityPathType>Longest Path</CriticalActivityPathType>
      <OutOfSequenceScheduleType>Retained Logic</OutOfSequenceScheduleType><RelationshipLagCalendar>Predecessor Activity Calendar</RelationshipLagCalendar><UseExpectedFinishDates>1</UseExpectedFinishDates></ScheduleOptions>
    <WBS><Code>1</Code><Name>Build</Name><ObjectId>20</ObjectId><ProjectObjectId>7</ProjectObjectId><ParentObjectId>7</ParentObjectId><SequenceNumber>1</SequenceNumber></WBS>
    <WBS><Code>1.1</Code><Name>Fit-out</Name><ObjectId>21</ObjectId><ProjectObjectId>7</ProjectObjectId><ParentObjectId>20</ParentObjectId><SequenceNumber>2</SequenceNumber></WBS>
    ${act({ id: 1000, code: "A1000", name: "Notice to proceed", type: "Start Milestone", status: "Completed", h: 0, as: "2024-03-01T08:00:00", af: "2024-03-01T08:00:00", wbs: 20 })}
    ${act({ id: 1010, code: "A1010", name: "Survey", status: "In Progress", h: 24, rem: 16, pct: 0.333, as: "2024-03-01T08:00:00", res: "2024-03-04T08:00:00", ree: "2024-03-05T17:00:00", rle: "2024-03-08T17:00:00" })}
    ${act({ id: 1020, code: "A1020", name: "Framing", status: "Not Started", h: 16, res: "2024-03-06T08:00:00", ree: "2024-03-07T17:00:00", rle: "2024-03-13T17:00:00" })}
    ${act({ id: 1030, code: "A1030", name: "Board", status: "Not Started", h: 24, cstr: "Start On or After", cdate: "2024-03-05T08:00:00", res: "2024-03-07T08:00:00", ree: "2024-03-12T17:00:00", rle: "2024-03-15T17:00:00" })}
    ${act({ id: 1040, code: "A1040", name: "Handover", type: "Finish Milestone", status: "Not Started", h: 0, res: "2024-03-12T17:00:00", ree: "2024-03-12T17:00:00", rle: "2024-03-15T17:00:00" })}
    ${rel(1, 1000, 1010)}${rel(2, 1010, 1020)}${rel(3, 1020, 1030, "Start to Start", 8)}${rel(4, 1030, 1040)}${rel(5, 1020, 1040)}
    <ResourceAssignment><ActivityObjectId>1020</ActivityObjectId><ObjectId>900</ObjectId><PlannedUnits>32</PlannedUnits><RemainingUnits>32</RemainingUnits><PlannedUnitsPerTime>2</PlannedUnitsPerTime><ResourceObjectId>300</ResourceObjectId><ResourceType>Labor</ResourceType><PlannedCost>1600</PlannedCost></ResourceAssignment>
  </Project>
</APIBusinessObjects>`;

test("isPmxml tells P6 XML from Microsoft Project XML and XER", () => {
  assert.ok(isPmxml(PMXML));
  assert.ok(isPmxml('\uFEFF<?xml version="1.0"?><APIBusinessObjects></APIBusinessObjects>'));
  assert.ok(!isPmxml('<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"></Project>'));
  assert.ok(!isPmxml("ERMHDR\t20.12\n"));
});

test("WorkTime finishes P6 writes as the last minute read as the period's end", () => {
  const node = parseXml("<D><WorkTime><Start>08:00:00</Start><Finish>11:59:00</Finish></WorkTime><WorkTime><Start>13:00:00</Start><Finish>16:59:00</Finish></WorkTime><WorkTime><Start>22:00:00</Start><Finish>23:59:00</Finish></WorkTime></D>").children[0];
  assert.deepEqual(workPeriods(node), [["08:00", "12:00"], ["13:00", "17:00"], ["22:00", "24:00"]]);
  // a finish already on the hour stays as written
  assert.deepEqual(workPeriods(parseXml("<D><WorkTime><Start>07:00:00</Start><Finish>15:00:00</Finish></WorkTime></D>").children[0]), [["07:00", "15:00"]]);
  assert.equal(pmDate("2024-03-04T08:00:00"), "2024-03-04 08:00");
  assert.equal(pmDate(""), "");
});

test("tables in XER's shape, names and value forms", () => {
  const x = parsePmxml(PMXML);
  assert.equal(x.format, "pmxml");
  assert.equal(x.version, "23.12");
  const T = x.tables;
  assert.deepEqual(T.PROJECT.map((p) => [p.proj_id, p.proj_short_name, p.last_recalc_date, p.plan_end_date, p.critical_path_type]), [["7", "FITOUT", "2024-03-04 08:00", "2024-03-15 17:00", "CT_DrivPath"]]);
  assert.equal(T.SCHEDOPTIONS[0].sched_float_type, "FT_FF");
  assert.equal(T.SCHEDOPTIONS[0].sched_retained_logic, "Y");
  assert.equal(T.SCHEDOPTIONS[0].sched_calendar_on_relationship_lag, "rcal_Predecessor");
  assert.equal(T.CALENDAR[0].default_flag, "Y");
  assert.equal(T.CALENDAR[0].clndr_name, "5 day & holidays");
  assert.match(T.CALENDAR[0].clndr_data, /\(0\|\|2\(\)\(\(0\|\|0\(s\|08:00\|f\|12:00\)\(\)\)\(0\|\|1\(s\|13:00\|f\|17:00\)\(\)\)\)\)/);
  assert.match(T.CALENDAR[0].clndr_data, /d\|45362/); // 2024-03-11 as P6's day serial
  // the project node an XER keeps, with the WBS under it
  const node = T.PROJWBS.find((w) => w.proj_node_flag === "Y");
  assert.equal(node.wbs_short_name, "FITOUT");
  assert.match(node.wbs_id, /^\d+$/);
  assert.equal(T.PROJWBS.find((w) => w.wbs_id === "20").parent_wbs_id, node.wbs_id);
  assert.equal(T.PROJWBS.find((w) => w.wbs_id === "21").parent_wbs_id, "20");
  const a = Object.fromEntries(T.TASK.map((t) => [t.task_code, t]));
  assert.equal(a.A1000.task_type, "TT_Mile");
  assert.equal(a.A1040.task_type, "TT_FinMile");
  assert.equal(a.A1010.status_code, "TK_Active");
  assert.equal(a.A1010.phys_complete_pct, "33.3");
  assert.equal(a.A1010.remain_drtn_hr_cnt, "16");
  assert.equal(a.A1030.cstr_type, "CS_MSOA");
  assert.equal(a.A1030.cstr_date, "2024-03-05 08:00");
  assert.equal(a.A1020.early_start_date, "2024-03-06 08:00");
  assert.equal(a.A1020.restart_date, "2024-03-06 08:00");
  assert.equal(a.A1020.late_end_date, "2024-03-13 17:00");
  assert.equal(a.A1000.early_start_date, "");
  assert.deepEqual(T.TASKPRED.find((r) => r.task_pred_id === "3"), { task_pred_id: "3", task_id: "1030", pred_task_id: "1020", proj_id: "7", pred_proj_id: "7", pred_type: "PR_SS", lag_hr_cnt: "8", comments: "" });
  assert.equal(T.TASKRSRC[0].target_qty, "32");
  assert.equal(T.RSRC[0].rsrc_type, "RT_Labor");
  assert.equal(T.ACTVCODE[0].color, "0000FF"); // XER keeps the colour without "#" (MPXJ refuses one with it)
  assert.deepEqual(T.TASKACTV, [{ task_id: "1020", actv_code_type_id: "50", actv_code_id: "51", proj_id: "7" }]);
  assert.equal(T.UDFTYPE[0].logical_data_type, "FT_FLOAT_2_DECIMALS");
  assert.equal(T.UDFVALUE[0].udf_number, "12.5");
  assert.ok(x.warnings.some((w) => /stores no total float/.test(w)));
});

test("the schedule from P6 XML: the dates P6 stored, worked by hand", () => {
  const x = parseSchedule(PMXML);
  assert.equal(x.format, "pmxml");
  const s = schedule(x);
  const r = (code) => s.tasks.get(x.tables.TASK.find((t) => t.task_code === code).task_id);
  assert.equal(formatDate(r("A1010").ef), "2024-03-05 17:00");
  assert.equal(formatDate(r("A1020").es), "2024-03-06 08:00");
  assert.equal(formatDate(r("A1020").ef), "2024-03-07 17:00");
  assert.equal(formatDate(r("A1030").es), "2024-03-07 08:00");
  assert.equal(formatDate(r("A1030").ef), "2024-03-12 17:00"); // over the Monday holiday
  assert.equal(formatDate(r("A1040").ef), "2024-03-12 17:00");
  // the must-finish-by date (Friday 15th) leaves three working days of float
  // on the chain; A1020's late finish is its late start (held by the SS link
  // to A1030) plus its 16 h, as P6 computes it
  for (const c of ["A1010", "A1020", "A1030", "A1040"]) assert.equal(r(c).tf, 24, c);
  assert.equal(formatDate(r("A1020").lf), "2024-03-13 17:00");
  assert.equal(formatDate(r("A1040").lf), "2024-03-15 17:00");
  // every open activity's stored early and late finish equals the recomputed one
  for (const t of x.tables.TASK.filter((t) => t.status_code !== "TK_Complete")) {
    assert.equal(formatDate(r(t.task_code).ef), t.early_end_date, t.task_code);
    assert.equal(formatDate(r(t.task_code).lf), t.late_end_date, t.task_code);
  }
  // and the DCMA assessment runs on it as on an XER
  const a = assess(x);
  assert.equal(a.checks.length, 14);
});

test("written back as an XER: parseXer reads the same tables and schedule", () => {
  const x = parsePmxml(PMXML);
  const back = pmxmlToXer(x);
  assert.equal(back.encoding, "windows-1252");
  assert.match(back.text, /^ERMHDR\t23\.12\t/);
  const y = parseXer(decodeXer(back.bytes));
  // xerText writes every field any row has, so a field one row lacks comes back as ""
  const fill = (rows) => { const ks = [...new Set(rows.flatMap((r) => Object.keys(r)))]; return rows.map((r) => Object.fromEntries(ks.map((k) => [k, r[k] ?? ""]))); };
  for (const k of ["PROJECT", "CALENDAR", "PROJWBS", "TASK", "TASKPRED", "TASKRSRC", "ACTVCODE", "UDFVALUE"]) assert.deepEqual(y.tables[k], fill(x.tables[k]), k);
  const a = schedule(x), b = schedule(y);
  for (const [id, r] of a.tasks) assert.deepEqual([r.es, r.ef, r.lf, r.tf], [b.tasks.get(id).es, b.tasks.get(id).ef, b.tasks.get(id).lf, b.tasks.get(id).tf], id);
  // dropping links (the redundant-logic cleaned file)
  const less = pmxmlToXer(x, { dropLinks: ["5"] });
  assert.equal(less.removed, 1);
  assert.equal(parseXer(less.text).tables.TASKPRED.length, 4);
});

test("Microsoft Project XML still reads as Microsoft Project XML", () => {
  const ms = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>x</Name><StartDate>2024-03-04T08:00:00</StartDate><Calendars/><Tasks/></Project>`;
  assert.equal(parseSchedule(ms).format, "mspdi");
});

test("CLI: --to-xer writes the XER, and the assessment runs on a P6 XML file", () => {
  const dir = mkdtempSync(join(tmpdir(), "pmxml-"));
  const xml = join(dir, "fitout.xml"), xer = join(dir, "fitout.xer");
  writeFileSync(xml, PMXML);
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [cli, xml, "--to-xer", xer], { encoding: "utf8" });
  assert.match(out, /1 project\(s\), 5 activities, 5 relationships, 1 calendars, 1 resource assignments \(windows-1252\)/);
  assert.equal(parseXer(decodeXer(readFileSync(xer))).tables.TASK.length, 5);
  const r = JSON.parse(execFileSync(process.execPath, [cli, xml, "--json"], { encoding: "utf8" }));
  assert.equal(r.checks.length, 14);
  // an XER given to --to-xer is refused with a reason
  assert.throws(() => execFileSync(process.execPath, [cli, xer, "--to-xer", join(dir, "again.xer")], { stdio: "pipe" }), /already an XER/);
});

test("the page offers the conversion for P6 XML files and counts it", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="pmxml-xer"/);
  assert.match(html, /record\("converted_to_xer"\)/);
  assert.match(html, /P6 XER file \(\.xer\), P6 XML \(\.xml\) or Microsoft Project XML \(\.xml\)/);
});
