// XER to Excel workbook (excel.mjs): the zip and sheet XML are well formed,
// activities, logic, codes and UDFs land in the right cells, dates are Excel
// serials, long cells are cut and counted, and the CLI writes the file.
// eval/excel-check.py checks the same on six public P6 files with openpyxl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseXer } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { workbookSheets, xerToXlsx, xlsxFromSheets, crc32, xlsxSummary } from "./excel.mjs";

// a minimal zip reader (central directory), enough to check what we wrote
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (dv.getUint32(end, true) !== 0x06054b50) end--;
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(off + 26, true), lxlen = dv.getUint16(off + 28, true);
    const body = bytes.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? new Uint8Array(inflateRawSync(body)) : body;
    assert.equal(data.length, size, name);
    assert.equal(crc32(data), crc, `${name} crc`);
    out.set(name, new TextDecoder().decode(data));
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

// cells of one worksheet's XML as { "A1": value } (numbers as numbers)
function cells(xml) {
  const m = {};
  for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/g)) {
    const t = /<t xml:space="preserve">([\s\S]*?)<\/t>/.exec(c[3]);
    m[c[1]] = t ? t[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") : Number(/<v>(.*?)<\/v>/.exec(c[3])[1]);
    if (/s="2"/.test(c[2])) m[c[1]] = { date: m[c[1]] };
  }
  return m;
}

// the example with a code type, a UDF of each kind, a WBS and an expense planted
function planted() {
  const x = parseXer(EXAMPLE_XER);
  x.tables.PROJWBS = [
    { wbs_id: "1", proj_id: "77", proj_node_flag: "Y", wbs_short_name: "OFFICE-FITOUT", wbs_name: "Office fit-out", parent_wbs_id: "" },
    { wbs_id: "700", proj_id: "77", proj_node_flag: "N", wbs_short_name: "L1", wbs_name: "Level 1", parent_wbs_id: "702" },
    { wbs_id: "702", proj_id: "77", proj_node_flag: "N", wbs_short_name: "INT", wbs_name: "Interiors", parent_wbs_id: "1" },
  ];
  x.tables.ACTVTYPE = [{ actv_code_type_id: "10", actv_code_type: "Responsibility", seq_num: "1", proj_id: "" }];
  x.tables.ACTVCODE = [{ actv_code_id: "100", actv_code_type_id: "10", short_name: "DRY", actv_code_name: "Drywall sub", parent_actv_code_id: "" }];
  x.tables.TASKACTV = [{ task_id: "5013", actv_code_type_id: "10", actv_code_id: "100", proj_id: "77" }];
  x.tables.UDFTYPE = [
    { udf_type_id: "1", table_name: "TASK", udf_type_label: "Cost code", logical_data_type: "FT_TEXT" },
    { udf_type_id: "2", table_name: "TASK", udf_type_label: "Crew size", logical_data_type: "FT_INT" },
    { udf_type_id: "3", table_name: "TASK", udf_type_label: "Permit date", logical_data_type: "FT_END_DATE" },
    { udf_type_id: "4", table_name: "RSRC", udf_type_label: "Day rate", logical_data_type: "FT_MONEY" },
  ];
  x.tables.UDFVALUE = [
    { udf_type_id: "1", fk_id: "5013", udf_text: "09 21 16" },
    { udf_type_id: "2", fk_id: "5013", udf_number: "4" },
    { udf_type_id: "3", fk_id: "5012", udf_date: "2026-05-15 15:30" },
    { udf_type_id: "4", fk_id: "1", udf_number: "900" },
  ];
  x.tables.COSTTYPE = [{ cost_type_id: "5", cost_type: "Materials" }];
  x.tables.PROJCOST = [{ cost_item_id: "1", task_id: "5005", cost_name: "Door hardware", cost_type_id: "5", target_cost: "12000", act_cost: "0", remain_cost: "12000", cost_load_type: "CL_Uniform" }];
  return x;
}

const col = (rows, name) => rows[0].indexOf(name);
const row = (rows, code) => rows.find((r) => r[3] === code);

test("the activities sheet: one row per activity, WBS path, days, logic, codes and UDFs", () => {
  const { sheets, summary } = workbookSheets(planted());
  const act = sheets.find((s) => s.name === "Activities").rows;
  assert.equal(act.length - 1, 22);
  assert.equal(summary.activities, 22);
  const a = row(act, "A1120");
  assert.equal(a[col(act, "WBS Code")], "INT.L1");
  assert.equal(a[col(act, "WBS Name")], "Level 1");
  assert.equal(a[col(act, "Original Duration (d)")], 8);
  assert.equal(a[col(act, "Activity Type")], "Task Dependent");
  assert.equal(a[col(act, "Activity Status")], "Not Started");
  assert.equal(a[col(act, "Responsibility")], "DRY");
  assert.equal(a[col(act, "Cost code")], "09 21 16");
  assert.equal(a[col(act, "Crew size")], 4);
  assert.equal(a[col(act, "Predecessors")], "A1110 FS");
  assert.equal(a[col(act, "Successors")], "A1140 FS");
  // a negative lag on the successor's calendar, in days
  assert.equal(row(act, "A1070")[col(act, "Successors")], "A1090 FS-2d");
  assert.equal(row(act, "A1090")[col(act, "Predecessors")], "A1070 FS-2d");
  // a resource UDF is not an activity column
  assert.equal(col(act, "Day rate"), -1);
  // constraint, and a date UDF as a date
  const i = row(act, "A1110");
  assert.equal(i[col(act, "Primary Constraint")], "Start On");
  assert.ok(i[col(act, "Permit date")].date > 0);
  assert.equal(summary.codeTypes, 1);
  assert.equal(summary.udfs, 3);
});

test("recomputed dates fill the open activities, and Start/Finish when the file stores none", () => {
  const act = workbookSheets(planted()).sheets.find((s) => s.name === "Activities").rows;
  const done = row(act, "M1000"), open = row(act, "A1090");
  assert.equal(done[col(act, "Recomputed Early Start")], null);
  assert.ok(open[col(act, "Recomputed Early Start")].date > 0);
  assert.deepEqual(open[col(act, "Start")], open[col(act, "Recomputed Early Start")]);
  assert.equal(open[col(act, "Recomputed Total Float (d)")], 12);
  // a file the engine cannot schedule keeps its stored columns
  assert.equal(workbookSheets(planted(), { result: null }).sheets.find((s) => s.name === "Activities").rows[1][col(act, "Recomputed Early Start")], null);
});

test("the other sheets resolve ids to names", () => {
  const { sheets } = workbookSheets(planted());
  const get = (n) => sheets.find((s) => s.name === n).rows;
  const rel = get("Relationships");
  assert.equal(rel.length - 1, 25);
  const neg = rel.find((r) => r[0] === "A1070" && r[2] === "A1090");
  assert.deepEqual(neg.slice(4, 7), ["FS", -2, -16]);
  assert.deepEqual(get("WBS").slice(1).map((r) => r[1]), ["INT.L1", "INT"]);
  assert.deepEqual(get("Resources")[2].slice(0, 3), ["DRY", "Drywall crew", "Labor"]);
  const asg = get("Assignments");
  assert.equal(asg.length - 1, 20);
  const a = asg.find((r) => r[0] === "A1030");
  assert.equal(a[col(asg, "Actual Cost")], 4560);
  assert.equal(a[col(asg, "At Completion Cost")], 7600);
  assert.deepEqual(get("Expenses")[1].slice(0, 5), ["A1040", "Procure doors and hardware", "Door hardware", "Materials", 12000]);
  assert.deepEqual(get("Activity codes")[1], ["Responsibility", "DRY", "Drywall sub", "", 1]);
  assert.deepEqual(get("Calendars")[1], ["5 day, 07:00-15:30", "Global", 8, 40, "yes", 22]);
  // no expenses, no Expenses sheet
  assert.ok(!workbookSheets(parseXer(EXAMPLE_XER)).sheets.some((s) => s.name === "Expenses"));
});

test("the .xlsx: a valid zip, every part present, dates as serials, header frozen with a filter", async () => {
  const r = await xerToXlsx(planted(), { raw: true });
  const z = unzip(r.bytes);
  for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) assert.ok(z.has(p), p);
  const names = [...z.get("xl/workbook.xml").matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names.slice(0, 9), ["Read me", "Activities", "Relationships", "WBS", "Resources", "Assignments", "Expenses", "Calendars", "Activity codes"]);
  assert.ok(names.includes("XER TASK") && names.includes("XER UDFVALUE"));
  assert.equal(r.summary.rawTables, Object.keys(planted().tables).length);
  const act = z.get("xl/worksheets/sheet2.xml");
  assert.match(act, /<pane ySplit="1"/);
  assert.match(act, /<autoFilter ref="A1:[A-Z]+23"\/>/);
  const c = cells(act);
  assert.equal(c.D2, "M1000");
  // 2026-03-02 07:00 is Excel serial 46083 + 7/24
  assert.ok(Math.abs(c.M2.date - (46083 + 7 / 24)) < 1e-9, String(c.M2.date));
  // raw tables keep every value as text
  const taskSheet = names.indexOf("XER TASK") + 1;
  const raw = cells(z.get(`xl/worksheets/sheet${taskSheet}.xml`));
  assert.equal(raw.A1, "task_id");
  assert.equal(raw.A2, "5001");
  assert.match(xlsxSummary(r.summary), /^22 activities, 25 relationships/);
});

test("same input, same bytes; stored when no deflate; long cells cut and counted; sheet names safe", async () => {
  const x = planted();
  const a = await xerToXlsx(x), b = await xerToXlsx(x);
  assert.deepEqual(a.bytes, b.bytes);
  const stored = await xerToXlsx(x, { deflate: null });
  assert.ok(stored.bytes.length > a.bytes.length);
  assert.equal(unzip(stored.bytes).get("xl/worksheets/sheet2.xml"), unzip(a.bytes).get("xl/worksheets/sheet2.xml"));
  x.tables.TASK[0].task_name = "x".repeat(40000) + "\u0001<&>";
  const cut = await xerToXlsx(x);
  // M1000's name: its activity row and its two successors' relationship rows
  assert.equal(cut.summary.cut, 3);
  assert.match(cut.warnings.join(" "), /3 cells longer than Excel's 32,767-character limit were cut/);
  // a control character and markup in a name stay well formed
  x.tables.TASK[0].task_name = "Fire \u0001stopping <L1> & \"L2\"";
  const z = unzip((await xerToXlsx(x)).bytes);
  assert.equal(cells(z.get("xl/worksheets/sheet2.xml")).E2, "Fire stopping <L1> & \"L2\"");
  // a table name Excel cannot take as a sheet name
  const odd = parseXer(EXAMPLE_XER);
  odd.tables["A/B:C*D?E[F]G-AND-A-VERY-LONG-TAIL"] = [{ f: "1" }];
  const { sheets } = workbookSheets(odd, { raw: true });
  const name = sheets.at(-1).name;
  assert.ok(name.length <= 31 && !/[:\\/?*[\]]/.test(name), name);
  const bytes = await xlsxFromSheets([{ name: "One", rows: [["a"], [1]] }]);
  assert.ok(unzip(bytes).has("xl/worksheets/sheet1.xml"));
});

test("the CLI writes the workbook and refuses Microsoft Project XML", () => {
  const dir = mkdtempSync(join(tmpdir(), "xer-excel-"));
  writeFileSync(join(dir, "s.xer"), EXAMPLE_XER);
  const cli = new URL("./cli.mjs", import.meta.url).pathname;
  const out = execFileSync(process.execPath, [cli, join(dir, "s.xer"), "--excel", join(dir, "s.xlsx"), "--json"], { encoding: "utf8" });
  assert.equal(JSON.parse(out).summary.activities, 22);
  assert.ok(unzip(new Uint8Array(readFileSync(join(dir, "s.xlsx")))).has("xl/worksheets/sheet2.xml"));
});

test("the page offers the download", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="xlsx-download">Download for Excel \(\.xlsx\)</);
  assert.match(html, /const excelModule = onDemand\(\(\) => import\("\.\/excel\.mjs"\)\)/);
  assert.match(html, /const \{ xerToXlsx, xlsxSummary \} = await excelModule\(\)/);
  assert.match(html, /record\("converted_to_excel"\)/);
});
