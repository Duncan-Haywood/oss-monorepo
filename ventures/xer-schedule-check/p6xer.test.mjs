import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { parseMspdi } from "./mspdi.mjs";
import { schedule } from "./cpm.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText, p6Problems, FIELDS } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

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

test("every table carries P6's fields, whole-number ids that resolve, and passes the import rules", () => {
  const r = p6XerText(XML());
  assert.deepEqual(p6Problems(r.xer.tables), []);
  for (const [t, rows] of Object.entries(r.xer.tables)) for (const row of rows) assert.deepEqual(Object.keys(row), FIELDS[t], t);
  assert.deepEqual(Object.keys(r.xer.tables), ["CURRTYPE", "FINTMPL", "OBS", "PROJECT", "CALENDAR", "SCHEDOPTIONS", "PROJWBS", "RSRC", "ACTVTYPE", "ACTVCODE", "TASK", "TASKPRED", "TASKACTV", "TASKRSRC"]);
  assert.match(r.text, /^ERMHDR\t20\.12\t/);
  assert.match(r.text, /%E\r\n$/);
  assert.deepEqual(r.counts, { activities: 5, relationships: 4, wbs: 1, calendars: 1, resources: 2, assignments: 2, codeTypes: 1, udfFields: 0, udfValues: 0, wbsUdfFields: 0, wbsUdfValues: 0, rsrcUdfFields: 0, rsrcUdfValues: 0, notebookTopics: 0, taskNotebooks: 0, wbsNotebooks: 0 });
  assert.equal(r.encoding, "windows-1252");
  assert.equal(r.bytes.length, r.text.length);
});

test("a name that does not fit Windows-1252 saves the file as UTF-8, with a warning", () => {
  const r = p6XerText(XML().replace("<Name>Level 1</Name>", "<Name>Уровень 1</Name>"));
  assert.equal(r.encoding, "utf-8");
  assert.ok(r.warnings.some((w) => /do not fit Windows-1252/.test(w)));
});

test("the WBS hangs under one project node; activity IDs are A + row x 10", () => {
  const T = p6XerText(XML(), { projectId: "CLINIC-01" }).xer.tables;
  const node = T.PROJWBS.find((w) => w.proj_node_flag === "Y");
  assert.equal(node.wbs_short_name, "CLINIC-01");
  assert.equal(node.wbs_name, "Clinic Fit-Out");
  assert.equal(T.PROJECT[0].proj_short_name, "CLINIC-01");
  const l1 = T.PROJWBS.find((w) => w.wbs_name === "Level 1");
  assert.equal(l1.parent_wbs_id, node.wbs_id);
  assert.deepEqual(T.TASK.map((t) => t.task_code), ["A20", "A30", "A40", "A50", "A60"]);
  assert.ok(T.TASK.every((t) => t.wbs_id === l1.wbs_id));
  assert.equal(T.TASK.find((t) => t.task_code === "A60").task_type, "TT_FinMile");
});

test("a text field named Activity ID gives the activity IDs", () => {
  const r = p6XerText(XML({ idAlias: "Activity ID", code2: "DEM-100", code3: "FRM-200", code4: "DRY-300" }));
  assert.deepEqual(r.xer.tables.TASK.map((t) => t.task_code), ["DEM-100", "FRM-200", "DRY-300", "A50", "A60"]);
  assert.ok(!r.xer.tables.ACTVTYPE, "the Activity ID field is not also a code");
  assert.match(r.warnings.join("\n"), /"Activity ID" text field on 3 of 5/);
  // --row-ids ignores the field
  assert.equal(p6XerText(XML({ idAlias: "Activity ID", code2: "DEM-100", code3: "FRM-200" }), { activityIds: "row" }).xer.tables.TASK[0].task_code, "A20");
});

test("progress: actual dates, remaining duration, and Project's Resume as P6's suspend and resume", () => {
  const T = p6XerText(XML()).xer.tables;
  const [dem, frm, dry] = T.TASK;
  assert.equal(dem.status_code, "TK_Complete");
  assert.equal(dem.act_end_date, "2026-03-06 17:00");
  assert.equal(dem.remain_drtn_hr_cnt, "0");
  assert.equal(frm.status_code, "TK_Active");
  assert.equal(frm.remain_drtn_hr_cnt, "56");
  assert.equal(frm.suspend_date, "2026-03-10 17:00");
  assert.equal(frm.resume_date, "2026-03-16 08:00");
  assert.equal(dry.status_code, "TK_NotStart");
  assert.equal(dry.suspend_date, "");
  assert.equal(T.PROJECT[0].last_recalc_date, "2026-03-11 17:00");
});

test("the manual task is held at its typed start; the elapsed lag and cost resource are reported", () => {
  const r = p6XerText(XML());
  const insp = r.xer.tables.TASK.find((t) => t.task_name === "Inspection");
  assert.equal(insp.cstr_type, "CS_MSOA");
  assert.equal(insp.cstr_date, "2026-04-13 08:00");
  const w = r.warnings.join("\n");
  assert.match(w, /1 elapsed lag/);
  assert.match(w, /1 cost resource\(s\) and 1 assignment/);
  assert.match(w, /1 manually scheduled task/);
});

test("resources and assignments keep hours, units and cost", () => {
  const T = p6XerText(XML()).xer.tables;
  const carp = T.RSRC.find((r) => r.rsrc_name === "Carpenter");
  assert.equal(carp.rsrc_type, "RT_Labor");
  assert.equal(carp.rsrc_short_name, "CARP");
  assert.equal(T.RSRC.find((r) => r.rsrc_name === "Gypsum board").rsrc_type, "RT_Mat");
  const a = T.TASKRSRC.find((x) => x.rsrc_id === carp.rsrc_id);
  assert.deepEqual([a.target_qty, a.act_reg_qty, a.remain_qty, a.target_cost, a.act_reg_cost, a.remain_cost, a.cost_per_qty], ["160", "48", "112", "9600", "2880", "6720", "60"]);
  const frm = T.TASK.find((t) => t.task_id === a.task_id);
  assert.equal(frm.task_name, "Framing");
  assert.equal(frm.target_work_qty, "160");
  // material units do not count as labour hours
  assert.equal(T.TASK.find((t) => t.task_name === "Drywall").target_work_qty, "0");
});

test("P6's first schedule run gives the dates the MSPDI reader computes", () => {
  // a working-time lag (an elapsed one is the reported difference above)
  const text = XML().replace("<LagFormat>8</LagFormat>", "<LagFormat>7</LagFormat>");
  const A = parseMspdi(text), B = parseXer(p6XerText(text).text);
  const ra = schedule(A), rb = schedule(B);
  A.tables.TASK.forEach((a, i) => {
    const x = ra.tasks.get(a.task_id), y = rb.tasks.get(B.tables.TASK[i].task_id);
    assert.deepEqual([y.ef, y.lf, y.tf], [x.ef, x.lf, x.tf], a.task_name);
  });
});

test("actual dates after the status date: kept with a status date, moved without one", () => {
  // Demolition finishes 2026-03-06; a status date of 03-04 sits before it
  const early = XML().replace("2026-03-11T17:00:00</StatusDate>", "2026-03-04T17:00:00</StatusDate>");
  const r = p6XerText(early);
  assert.equal(r.xer.tables.PROJECT[0].last_recalc_date, "2026-03-04 17:00");
  assert.match(r.warnings.join("\n"), /actual dates after the status date 2026-03-04 17:00/);
  const none = p6XerText(XML({ status: false }));
  assert.equal(none.xer.tables.PROJECT[0].last_recalc_date, "2026-03-09 08:00");
  assert.ok(!none.warnings.some((w) => w.startsWith("no status date in the file")));
});

test("a code type written as parent.child paths comes back as a P6 code tree; dotted names stay flat", () => {
  // the same leaf (01) under two parents: msproject.mjs writes the whole path
  const T = p6XerText(XML({ code2: "N.01", code3: "S.01", code4: "PA" })).xer.tables;
  const byId = new Map(T.ACTVCODE.map((c) => [c.actv_code_id, c]));
  const leaves = T.TASKACTV.map((a) => byId.get(a.actv_code_id));
  assert.deepEqual(leaves.map((c) => c.short_name), ["01", "01", "PA"]);
  assert.deepEqual(leaves.map((c) => (c.parent_actv_code_id ? byId.get(c.parent_actv_code_id).short_name : "")), ["N", "S", ""]);
  assert.equal(T.ACTVTYPE[0].actv_short_len, "2");
  const flat = p6XerText(XML({ code2: "P.C Footings", code3: "R.C Footings" })).xer.tables;
  assert.deepEqual(flat.ACTVCODE.map((c) => [c.short_name, c.parent_actv_code_id]), [["P.C Footings", ""], ["R.C Footings", ""]]);
});

test("a P6 schedule sent through Project XML comes back with its IDs, links, codes and dates", () => {
  const X = parseXer(EXAMPLE_XER);
  const r = p6XerText(mspdiText(X).xml);
  assert.deepEqual(p6Problems(r.xer.tables), []);
  const B = parseXer(r.text);
  const codes = (T) => T.TASK.map((t) => t.task_code).sort();
  assert.deepEqual(codes(B.tables), codes(X.tables));
  const code = (T) => new Map(T.TASK.map((t) => [t.task_id, t.task_code]));
  const links = (T) => { const c = code(T); return T.TASKPRED.map((l) => `${c.get(l.pred_task_id)}>${c.get(l.task_id)} ${l.pred_type} ${Number(l.lag_hr_cnt)}`).sort(); };
  assert.deepEqual(links(B.tables), links(X.tables));
  for (const t of X.tables.TASK) {
    const b = B.tables.TASK.find((x) => x.task_code === t.task_code);
    assert.equal(b.task_name, t.task_name);
    assert.equal(b.status_code, t.status_code);
    assert.equal(Number(b.remain_drtn_hr_cnt), Number(t.remain_drtn_hr_cnt));
  }
  // Project's scheduling options came back with it
  assert.equal(B.tables.SCHEDOPTIONS[0].sched_calendar_on_relationship_lag, "rcal_Successor");
  assert.equal(B.tables.RSRC.length, 2);
});

test("long names are cut to P6's lengths and repeated IDs made unique", () => {
  const long = "x".repeat(130);
  const r = p6XerText(XML({ idAlias: "Activity ID", code2: "SAME", code3: "SAME" }).replace("<Name>Drywall</Name>", `<Name>${long}</Name>`));
  const T = r.xer.tables;
  assert.equal(T.TASK[2].task_name.length, 120);
  assert.deepEqual(T.TASK.slice(0, 2).map((t) => t.task_code), ["SAME", "SAME-2"]);
  assert.deepEqual(p6Problems(T), []);
});

test("p6Problems names what P6's import would refuse", () => {
  const T = p6XerText(XML()).xer.tables;
  const bad = { ...T, TASK: T.TASK.map((t, i) => (i === 0 ? { ...t, wbs_id: "999" } : i === 1 ? { ...t, task_code: T.TASK[2].task_code } : t)), TASKPRED: [{ ...T.TASKPRED[0], task_pred_id: "x1" }] };
  const p = p6Problems(bad).join("\n");
  assert.match(p, /wbs_id 999 is not in PROJWBS/);
  assert.match(p, /activity ID repeated/);
  assert.match(p, /x1: id is not a whole number/);
});

test("resources with the same Initials get unique P6 resource IDs; p6Problems names a repeat", () => {
  // Project fills Initials with the name's first letter: Carpenter and Crane are both "C"
  const text = XML().replace("<Initials>CARP</Initials>", "<Initials>C</Initials>")
    .replace("<Name>Permit fee</Name><Type>2</Type>", "<Name>Crane</Name><Type>1</Type><Initials>C</Initials>")
    .replace("<Name>Gypsum board</Name><Type>0</Type>", "<Name>Gypsum board</Name><Type>0</Type><Initials>C</Initials>");
  const r = p6XerText(text);
  const T = r.xer.tables;
  assert.deepEqual(T.RSRC.map((x) => [x.rsrc_name, x.rsrc_short_name]), [["Carpenter", "C"], ["Gypsum board", "C-2"], ["Crane", "C-3"]]);
  assert.deepEqual(p6Problems(T), []);
  assert.match(r.warnings.join("\n"), /2 repeated resource ID\(s\)/);
  const bad = { ...T, RSRC: T.RSRC.map((x) => ({ ...x, rsrc_short_name: "C" })) };
  assert.match(p6Problems(bad).join("\n"), /RSRC C: resource ID repeated/);
  // a suffix on a 40-character ID still fits P6's length
  const long = "R".repeat(40);
  const L = p6XerText(text.replaceAll("<Initials>C</Initials>", `<Initials>${long}</Initials>`)).xer.tables;
  assert.deepEqual(L.RSRC.map((x) => x.rsrc_short_name), [long, `${"R".repeat(38)}-2`, `${"R".repeat(38)}-3`]);
  assert.deepEqual(p6Problems(L), []);
});

test("an assignment on a summary task is reported, not dropped silently", () => {
  const text = XML().replace("<Assignment><UID>2</UID>", "<Assignment><UID>9</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Work>PT8H0M0S</Work></Assignment><Assignment><UID>2</UID>");
  const r = p6XerText(text);
  assert.equal(r.counts.assignments, 2);
  assert.match(r.warnings.join("\n"), /1 assignment\(s\) on summary tasks not carried/);
  assert.ok(!p6XerText(XML()).warnings.some((w) => /summary tasks not carried/.test(w)));
});

test("percent complete, units per hour, and remaining work and cost worked out when Project leaves them out", () => {
  const T = p6XerText(XML()).xer.tables;
  assert.deepEqual(T.TASK.map((t) => t.phys_complete_pct), ["100", "30", "0", "0", "0"]);
  // MaxUnits 2 (200%) is two per hour; a resource with none is one
  assert.deepEqual(T.RSRC.map((x) => x.def_qty_per_hr), ["2", "1"]);
  // out-of-range percentages are held to 0..100
  const over = p6XerText(XML().replace("<PercentComplete>30</PercentComplete>", "<PercentComplete>150</PercentComplete>")).xer.tables;
  assert.equal(over.TASK[1].phys_complete_pct, "100");
  const under = p6XerText(XML().replace("<PercentComplete>30</PercentComplete>", "<PercentComplete>-5</PercentComplete>")).xer.tables;
  assert.equal(under.TASK[1].phys_complete_pct, "0");
  // no RemainingWork / RemainingCost: budget less actual, never below zero
  const bare = XML().replace("<RemainingWork>PT112H0M0S</RemainingWork>", "").replace("<RemainingCost>672000</RemainingCost>", "");
  const a = p6XerText(bare).xer.tables.TASKRSRC[0];
  assert.deepEqual([a.remain_qty, a.remain_cost], ["112", "6720"]);
  const overrun = bare.replace("<ActualWork>PT48H0M0S</ActualWork>", "<ActualWork>PT200H0M0S</ActualWork>").replace("<ActualCost>288000</ActualCost>", "<ActualCost>1200000</ActualCost>");
  const o = p6XerText(overrun).xer.tables.TASKRSRC[0];
  assert.deepEqual([o.remain_qty, o.remain_cost], ["0", "0"]);
});

test("a code tree's leaf keeps its description; the parents made for it carry their own segment", () => {
  // a tree needs one leaf under two parents (N.01, S.01)
  const T = p6XerText(XML({ code2: "N.01", code3: "S.01", code4: "N.02" })).xer.tables;
  const name = (path) => {
    const [p, leaf] = path.split(".");
    const parent = T.ACTVCODE.find((c) => c.short_name === p && !c.parent_actv_code_id);
    return [parent.actv_code_name, T.ACTVCODE.find((c) => c.short_name === leaf && c.parent_actv_code_id === parent.actv_code_id).actv_code_name];
  };
  assert.deepEqual(name("N.01"), ["N", "N.01"]);
  assert.deepEqual(name("S.01"), ["S", "S.01"]);
  assert.deepEqual(name("N.02"), ["N", "N.02"]);
});

// Project's Number, Cost and Date fields -> activity UDFs
const CUSTOM = (defs, vals) => XML()
  .replace("</ExtendedAttributes>", `${defs}</ExtendedAttributes>`)
  .replace(/(<UID>(\d)<\/UID><ID>\d<\/ID><Name>[^<]*<\/Name>)/g, (m, head, uid) => `${head}${vals[uid] || ""}`);
const ea = (id, v) => `<ExtendedAttribute><FieldID>${id}</FieldID><Value>${v}</Value></ExtendedAttribute>`;
const def = (id, name, alias) => `<ExtendedAttribute><FieldID>${id}</FieldID><FieldName>${name}</FieldName>${alias ? `<Alias>${alias}</Alias>` : ""}</ExtendedAttribute>`;

test("Project's Number, Cost and Date fields become activity UDFs P6 can import", () => {
  // Number1 "Crew size" (whole), Number2 (no alias, decimals), Cost1 "Allowance", Date1 "Access date"
  const xml = CUSTOM(def("188743767", "Number1", "Crew size") + def("188743768", "Number2") + def("188743786", "Cost1", "Allowance") + def("188743945", "Date1", "Access date"), {
    2: ea("188743767", "4") + ea("188743768", "2.5") + ea("188743786", "1250000"),
    3: ea("188743767", "6") + ea("188743945", "2026-03-20T08:00:00"),
    4: ea("188743768", "0.75"),
  });
  const r = p6XerText(xml);
  const T = r.xer.tables;
  assert.deepEqual(p6Problems(T), []);
  for (const t of ["UDFTYPE", "UDFVALUE"]) for (const row of T[t]) assert.deepEqual(Object.keys(row), FIELDS[t], t);
  // P6's own order: titles with the global tables, values last
  const order = Object.keys(T);
  assert.ok(order.indexOf("UDFTYPE") < order.indexOf("PROJECT"));
  assert.equal(order.at(-1), "UDFVALUE");
  const types = new Map(T.UDFTYPE.map((u) => [u.udf_type_label, u]));
  assert.deepEqual([...types.keys()].sort(), ["Access date", "Allowance", "Crew size", "Number2"]);
  assert.equal(types.get("Crew size").logical_data_type, "FT_INT");
  assert.equal(types.get("Number2").logical_data_type, "FT_FLOAT_2_DECIMALS");
  assert.equal(types.get("Allowance").logical_data_type, "FT_MONEY");
  assert.equal(types.get("Access date").logical_data_type, "FT_START_DATE");
  const code = new Map(T.TASK.map((t) => [t.task_id, t.task_code]));
  const vals = T.UDFVALUE.map((v) => `${code.get(v.fk_id)} ${T.UDFTYPE.find((u) => u.udf_type_id === v.udf_type_id).udf_type_label}=${v.udf_number || v.udf_date}`).sort();
  assert.deepEqual(vals, ["A20 Allowance=12500", "A20 Crew size=4", "A20 Number2=2.5", "A30 Access date=2026-03-20 08:00", "A30 Crew size=6", "A40 Number2=0.75"]);
  assert.deepEqual([r.counts.udfFields, r.counts.udfValues], [4, 6]);
  assert.ok(r.warnings.some((w) => /6 custom field value\(s\) in 4 field\(s\) written as activity user-defined fields/.test(w)));
  // and this tool's XER reader takes them back
  const B = parseXer(r.text).tables;
  assert.equal(B.UDFVALUE.length, 6);
  assert.equal(B.UDFTYPE.length, 4);
});

test("two custom fields with one title get unique UDF titles; p6Problems names UDF faults", () => {
  const r = p6XerText(CUSTOM(def("188743767", "Number1", "Qty") + def("188743768", "Number2", "QTY"), { 2: ea("188743767", "1") + ea("188743768", "2") }));
  assert.deepEqual(r.xer.tables.UDFTYPE.map((u) => u.udf_type_label), ["Qty", "QTY (2)"]);
  assert.deepEqual(p6Problems(r.xer.tables), []);
  const T = r.xer.tables;
  const bad = { ...T, UDFTYPE: T.UDFTYPE.map((u) => ({ ...u, udf_type_label: "Qty" })), UDFVALUE: [...T.UDFVALUE, { ...T.UDFVALUE[0], fk_id: "999" }, { ...T.UDFVALUE[0], udf_number: "1.5" }] };
  const p = p6Problems(bad).join("\n");
  assert.match(p, /title Qty repeated/);
  assert.match(p, /fk_id 999 is not in TASK/);
  assert.match(p, /two values for one activity/);
  assert.match(p, /integer UDF value 1\.5/);
});

test("a P6 schedule's activity UDFs come back as UDFs through Project XML", () => {
  const X = parseXer(EXAMPLE_XER);
  const T = X.tables;
  T.UDFTYPE = [
    { udf_type_id: "50", table_name: "TASK", udf_type_name: "user_field_50", udf_type_label: "Crew", logical_data_type: "FT_INT" },
    { udf_type_id: "51", table_name: "TASK", udf_type_name: "user_field_51", udf_type_label: "Budget", logical_data_type: "FT_MONEY" },
    { udf_type_id: "52", table_name: "TASK", udf_type_name: "user_field_52", udf_type_label: "Access", logical_data_type: "FT_START_DATE" },
  ];
  T.UDFVALUE = T.TASK.slice(0, 4).flatMap((t, i) => [
    { udf_type_id: "50", fk_id: t.task_id, proj_id: t.proj_id, udf_date: "", udf_number: String(i + 2), udf_text: "", udf_code_id: "" },
    { udf_type_id: "51", fk_id: t.task_id, proj_id: t.proj_id, udf_date: "", udf_number: String(1000.25 * (i + 1)), udf_text: "", udf_code_id: "" },
    { udf_type_id: "52", fk_id: t.task_id, proj_id: t.proj_id, udf_date: `2026-05-0${i + 1} 08:00`, udf_number: "", udf_text: "", udf_code_id: "" },
  ]);
  const r = p6XerText(mspdiText(X).xml);
  assert.deepEqual(p6Problems(r.xer.tables), []);
  const read = (T, codeOf) => {
    const label = new Map(T.UDFTYPE.map((u) => [u.udf_type_id, `${u.udf_type_label}:${u.logical_data_type}`]));
    return T.UDFVALUE.map((v) => `${codeOf.get(v.fk_id)} ${label.get(v.udf_type_id)} ${v.udf_date || Number(v.udf_number)}`).sort();
  };
  const B = parseXer(r.text).tables;
  assert.deepEqual(read(B, new Map(B.TASK.map((t) => [t.task_id, t.task_code]))), read(T, new Map(T.TASK.map((t) => [t.task_id, t.task_code]))));
});

test("a P6 schedule's resource UDFs come back as resource UDFs through Project XML", () => {
  const X = parseXer(EXAMPLE_XER);
  const T = X.tables;
  const [r1, r2] = T.RSRC;
  T.UDFTYPE = [
    { udf_type_id: "60", table_name: "RSRC", udf_type_name: "user_field_60", udf_type_label: "Employment", logical_data_type: "FT_TEXT" },
    { udf_type_id: "61", table_name: "RSRC", udf_type_name: "user_field_61", udf_type_label: "Day rate", logical_data_type: "FT_MONEY" },
    { udf_type_id: "62", table_name: "RSRC", udf_type_name: "user_field_62", udf_type_label: "Factor", logical_data_type: "FT_FLOAT_2_DECIMALS" },
    { udf_type_id: "63", table_name: "RSRC", udf_type_name: "user_field_63", udf_type_label: "Induction", logical_data_type: "FT_START_DATE" },
    { udf_type_id: "64", table_name: "TASK", udf_type_name: "user_field_64", udf_type_label: "Employment", logical_data_type: "FT_INT" },
  ];
  const v = (id, fk, o, proj = "") => ({ udf_type_id: id, fk_id: fk, proj_id: proj, udf_date: "", udf_number: "", udf_text: "", udf_code_id: "", ...o });
  T.UDFVALUE = [
    v("60", r1.rsrc_id, { udf_text: "Contractor" }), v("60", r2.rsrc_id, { udf_text: "40" }),
    v("61", r1.rsrc_id, { udf_number: "-12.5" }), v("62", r2.rsrc_id, { udf_number: "0.85" }),
    v("63", r2.rsrc_id, { udf_date: "2026-03-02 08:00" }),
    v("64", T.TASK[0].task_id, { udf_number: "7" }, T.TASK[0].proj_id),
  ];
  const r = p6XerText(mspdiText(X).xml);
  assert.deepEqual(p6Problems(r.xer.tables), []);
  assert.equal(r.counts.rsrcUdfFields, 4);
  assert.equal(r.counts.rsrcUdfValues, 5);
  assert.equal(r.counts.udfFields, 1);
  assert.ok(r.warnings.some((w) => /^5 resource custom field value\(s\) in 4 field\(s\) written as resource user-defined fields \(dates as start-date UDFs\)/.test(w)));
  const read = (T) => {
    const short = new Map(T.RSRC.map((x) => [x.rsrc_id, x.rsrc_short_name]));
    const label = new Map(T.UDFTYPE.filter((u) => u.table_name === "RSRC").map((u) => [u.udf_type_id, `${u.udf_type_label}:${u.logical_data_type}`]));
    return T.UDFVALUE.filter((x) => label.has(x.udf_type_id)).map((x) => `${short.get(x.fk_id)} ${label.get(x.udf_type_id)} ${x.udf_text || x.udf_date || Number(x.udf_number)} [${x.proj_id}]`).sort();
  };
  const B = parseXer(r.text).tables;
  assert.deepEqual(read(B), read(T));
  // the same title on an activity UDF and a resource UDF is allowed (P6 keeps titles unique per subject area)
  assert.deepEqual(B.UDFTYPE.filter((u) => u.udf_type_label === "Employment").map((u) => u.table_name).sort(), ["RSRC", "TASK"]);
  // p6Problems names a resource UDF value on a resource the file lacks
  const bad = structuredClone(r.xer.tables);
  bad.UDFVALUE.find((x) => x.proj_id === "").fk_id = "999";
  assert.ok(p6Problems(bad).some((p) => /fk_id 999 is not in RSRC/.test(p)));
});

// Red-team guards (2026-11-21): each test below fails with one seeded fault
// that the rest of this suite let through.
test("the export date in ERMHDR is a plain YYYY-MM-DD", () => {
  assert.match(p6XerText(XML()).text, /^ERMHDR\t20\.12\t\d{4}-\d\d-\d\d\tProject\t/);
});

test("a summary task with no WBS code gets its place among its siblings as its P6 code", () => {
  const T = p6XerText(XML().replace("<WBS>1</WBS>", "")).xer.tables;
  assert.equal(T.PROJWBS.find((w) => w.wbs_name === "Level 1").wbs_short_name, "1");
});

test("dotted codes with no leaf shared between parents stay flat", () => {
  const T = p6XerText(XML({ code2: "N.01", code3: "S.02" })).xer.tables;
  assert.deepEqual(T.ACTVCODE.map((c) => [c.short_name, c.parent_actv_code_id]), [["N.01", ""], ["S.02", ""]]);
});

test("an Activity ID alias only counts on Text1-Text30", () => {
  // 188744017 is the field id after Text30 (188744016), so not a text field
  const xml = XML({ idAlias: "Activity ID", code2: "DEM-100", code3: "FRM-200", code4: "DRY-300" }).replace(/188743731/g, "188744017");
  assert.deepEqual(p6XerText(xml).xer.tables.TASK.map((t) => t.task_code), ["A20", "A30", "A40", "A50", "A60"]);
});
