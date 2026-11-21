import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { parseMspdi } from "./mspdi.mjs";
import { schedule } from "./cpm.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText, p6Problems } from "./p6xer.mjs";

// Project deadlines: modelled in the MSPDI reader as Project counts them in
// total slack, and written to P6 as finish-on-or-before constraints when asked.
// a small Project file: a summary, four tasks (one in progress with a Resume,
// one manual), links, a work and a material resource, a text field used as
// a code, and a status date
const WEEK = [1, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`).join("") +
  [2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`).join("");
const task = (uid, id, name, extra = "") => `<Task><UID>${uid}</UID><ID>${id}</ID><Name>${name}</Name><OutlineLevel>${uid === 1 ? 1 : 2}</OutlineLevel>${extra}</Task>`;
const XML = (opts = {}) => `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">
<Title>Clinic Fit-Out</Title><StartDate>2026-03-02T08:00:00</StartDate><FinishDate>2026-04-30T17:00:00</FinishDate>${opts.status === false ? "" : "<StatusDate>2026-03-11T17:00:00</StatusDate>"}<CalendarUID>1</CalendarUID><MinutesPerDay>480</MinutesPerDay>
<ExtendedAttributes><ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>${opts.idAlias || "Area"}</Alias></ExtendedAttribute></ExtendedAttributes>
<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${WEEK}</WeekDays></Calendar></Calendars>
<Tasks>
${task(1, 1, "Level 1", "<Summary>1</Summary><WBS>1</WBS>")}
${task(2, 2, "Demolition", `<WBS>1.1</WBS><Duration>PT40H0M0S</Duration><RemainingDuration>PT0H0M0S</RemainingDuration><PercentComplete>100</PercentComplete><ActualStart>2026-03-02T08:00:00</ActualStart><ActualFinish>2026-03-06T17:00:00</ActualFinish><Start>2026-03-02T08:00:00</Start><Finish>2026-03-06T17:00:00</Finish><ExtendedAttribute><FieldID>188743731</FieldID><Value>${opts.code2 || "L1"}</Value></ExtendedAttribute>`)}
${task(3, 3, "Framing", `<WBS>1.2</WBS><Duration>PT80H0M0S</Duration><RemainingDuration>PT56H0M0S</RemainingDuration><PercentComplete>30</PercentComplete><ActualStart>2026-03-09T08:00:00</ActualStart><Stop>2026-03-10T17:00:00</Stop><Resume>2026-03-16T08:00:00</Resume><Start>2026-03-09T08:00:00</Start><Finish>2026-03-24T17:00:00</Finish><PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink><ExtendedAttribute><FieldID>188743731</FieldID><Value>${opts.code3 || "L1"}</Value></ExtendedAttribute>`)}
${task(4, 4, "Drywall", `<WBS>1.3</WBS><Duration>PT64H0M0S</Duration><Start>2026-03-25T08:00:00</Start><Finish>2026-04-03T17:00:00</Finish><PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>8</LagFormat></PredecessorLink>${opts.code4 ? `<ExtendedAttribute><FieldID>188743731</FieldID><Value>${opts.code4}</Value></ExtendedAttribute>` : ""}`)}
${task(5, 5, "Inspection", `<WBS>1.4</WBS><Duration>PT8H0M0S</Duration><Manual>1</Manual><Start>2026-04-13T08:00:00</Start><Finish>2026-04-13T17:00:00</Finish><PredecessorLink><PredecessorUID>4</PredecessorUID><Type>1</Type></PredecessorLink>`)}
${task(6, 6, "Handover", `<WBS>1.5</WBS><Duration>PT0H0M0S</Duration><Milestone>1</Milestone><Start>2026-04-13T17:00:00</Start><Finish>2026-04-13T17:00:00</Finish><PredecessorLink><PredecessorUID>5</PredecessorUID><Type>1</Type></PredecessorLink>`)}
</Tasks>
<Resources><Resource><UID>0</UID><ID>0</ID></Resource><Resource><UID>1</UID><ID>1</ID><Name>Carpenter</Name><Type>1</Type><Initials>CARP</Initials><MaxUnits>2</MaxUnits></Resource><Resource><UID>2</UID><ID>2</ID><Name>Gypsum board</Name><Type>0</Type></Resource><Resource><UID>3</UID><ID>3</ID><Name>Permit fee</Name><Type>2</Type></Resource></Resources>
<Assignments><Assignment><UID>1</UID><TaskUID>3</TaskUID><ResourceUID>1</ResourceUID><Work>PT160H0M0S</Work><ActualWork>PT48H0M0S</ActualWork><RemainingWork>PT112H0M0S</RemainingWork><Cost>960000</Cost><ActualCost>288000</ActualCost><RemainingCost>672000</RemainingCost></Assignment>
<Assignment><UID>2</UID><TaskUID>4</TaskUID><ResourceUID>2</ResourceUID><Work>PT120H0M0S</Work><Cost>180000</Cost></Assignment>
<Assignment><UID>3</UID><TaskUID>5</TaskUID><ResourceUID>3</ResourceUID><Cost>50000</Cost></Assignment></Assignments>
</Project>`;


// a working-time lag, so the only difference between the two tools is the deadline
const base = () => XML().replace("<LagFormat>8</LagFormat>", "<LagFormat>7</LagFormat>");
const addTo = (text, name, extra) => text.replace(`<Name>${name}</Name>`, `<Name>${name}</Name>${extra}`);
const DL = (d) => `<Deadline>${d}T17:00:00</Deadline>`;
const byName = (T, r) => new Map(T.tables.TASK.map((t) => [t.task_name, r.tasks.get(t.task_id)]));

test("a deadline before the late finish caps it, as Project's total slack does; a later one changes nothing", () => {
  const A0 = parseMspdi(base()), r0 = byName(A0, schedule(A0));
  const early = addTo(base(), "Drywall", DL("2026-04-07"));
  const A1 = parseMspdi(early), r1 = byName(A1, schedule(A1));
  const d0 = r0.get("Drywall"), d1 = r1.get("Drywall");
  assert.equal(d1.ef, d0.ef, "a deadline moves no early date");
  assert.ok(d1.lf < d0.lf, "late finish pulled back to the deadline");
  assert.equal(d0.tf - d1.tf, 24, "three working days of float gone");
  // its predecessor loses the same float through the link
  assert.equal(r0.get("Framing").tf - r1.get("Framing").tf, 24);
  assert.ok(A1.warnings.some((w) => /1 task\(s\) carry a deadline: as in Project/.test(w)));
  const late = addTo(base(), "Drywall", DL("2026-04-24"));
  const A2 = parseMspdi(late), r2 = byName(A2, schedule(A2));
  assert.deepEqual([r2.get("Drywall").lf, r2.get("Drywall").tf], [d0.lf, d0.tf]);
});

test("a missed deadline gives negative float", () => {
  const A = parseMspdi(addTo(base(), "Drywall", DL("2026-03-31")));
  const d = byName(A, schedule(A)).get("Drywall");
  assert.ok(d.tf < 0, `float ${d.tf}`);
});

test("a finished task's deadline is not kept", () => {
  const A = parseMspdi(addTo(base(), "Demolition", DL("2026-03-04")));
  assert.equal(A.tables.TASK.find((t) => t.task_name === "Demolition").deadline_date, undefined);
});

test("off by default: the XER carries no constraint for a deadline, and says how to turn it on", () => {
  const r = p6XerText(addTo(base(), "Drywall", DL("2026-04-07")));
  const t = r.xer.tables.TASK.find((x) => x.task_name === "Drywall");
  assert.deepEqual([t.cstr_type, t.cstr_type2], ["", ""]);
  assert.ok(r.warnings.some((w) => /1 deadline\(s\) not carried: P6 has no deadline field .*--deadlines/.test(w)));
});

test("deadlines: primary with no constraint, secondary beside one, merged with a finish-no-later-than, refused beside must-start-on", () => {
  let text = base();
  text = addTo(text, "Drywall", DL("2026-04-07")); // no constraint -> primary
  text = addTo(text, "Inspection", DL("2026-04-14")); // manual = start on or after -> secondary
  // a finish-no-later-than (Project type 7) and an earlier deadline -> the earlier date
  text = addTo(text, "Framing", `<ConstraintType>7</ConstraintType><ConstraintDate>2026-03-27T17:00:00</ConstraintDate>${DL("2026-03-26")}`);
  text = addTo(text, "Handover", `<ConstraintType>2</ConstraintType><ConstraintDate>2026-04-14T08:00:00</ConstraintDate>${DL("2026-04-15")}`); // must start on
  text = addTo(text, "Demolition", DL("2026-03-04")); // finished
  const r = p6XerText(text, { deadlines: true });
  assert.deepEqual(p6Problems(r.xer.tables), []);
  const T = new Map(r.xer.tables.TASK.map((t) => [t.task_name, t]));
  const c = (n) => [T.get(n).cstr_type, T.get(n).cstr_date, T.get(n).cstr_type2, T.get(n).cstr_date2];
  assert.deepEqual(c("Drywall"), ["CS_MEOB", "2026-04-07 17:00", "", ""]);
  assert.deepEqual(c("Inspection"), ["CS_MSOA", "2026-04-13 08:00", "CS_MEOB", "2026-04-14 17:00"]);
  assert.deepEqual(c("Framing"), ["CS_MEOB", "2026-03-26 17:00", "", ""]);
  assert.deepEqual(c("Handover"), ["CS_MSO", "2026-04-14 08:00", "", ""]);
  assert.deepEqual(c("Demolition"), ["", "", "", ""]);
  const w = r.warnings.join("\n");
  assert.match(w, /3 deadline\(s\) written as finish-on-or-before constraints \(1 as the primary constraint, 1 as the secondary, 1 merged with a finish-no-later-than/);
  assert.match(w, /1 deadline\(s\) not carried: the task has a must-start-on.*6 Handover/);
  assert.match(w, /1 deadline\(s\) on finished tasks not carried/);
  assert.doesNotMatch(w, /P6 has no deadline field/);
});

test("with deadlines on, P6's first run gives the float the MSPDI reader (and Project) give", () => {
  const text = addTo(addTo(base(), "Drywall", DL("2026-04-07")), "Inspection", DL("2026-04-14"));
  const A = parseMspdi(text), ra = schedule(A);
  const on = parseXer(p6XerText(text, { deadlines: true }).text), off = parseXer(p6XerText(text).text);
  const ron = schedule(on), roff = schedule(off);
  let differOff = 0;
  A.tables.TASK.forEach((a, i) => {
    const x = ra.tasks.get(a.task_id);
    const y = ron.tasks.get(on.tables.TASK[i].task_id), z = roff.tasks.get(off.tables.TASK[i].task_id);
    assert.deepEqual([y.ef, y.lf, y.tf], [x.ef, x.lf, x.tf], a.task_name);
    if (z.tf !== x.tf) differOff++;
  });
  assert.ok(differOff >= 2, "without the switch P6's float is larger on the deadline tasks and their predecessors");
});

test("round trip: a secondary finish-on-or-before goes to Project as a deadline and back as the secondary", () => {
  const text = addTo(base(), "Inspection", DL("2026-04-14"));
  const xer = parseXer(p6XerText(text, { deadlines: true }).text);
  const xml = mspdiText(xer).xml;
  assert.match(xml, /<Deadline>2026-04-14T17:00:00<\/Deadline>/);
  const back = p6XerText(xml, { deadlines: true }).xer.tables.TASK.find((t) => t.task_name === "Inspection");
  assert.deepEqual([back.cstr_type2, back.cstr_date2], ["CS_MEOB", "2026-04-14 17:00"]);
});
