import { test } from "node:test";
import assert from "node:assert/strict";
import { readTemplate, matchColumns, parseOverrides, parseIds, payrollRows, fillTemplate, splitCsvLine } from "./payroll-export.mjs";
import { punch } from "./timeclock.mjs";
import { handler, emptyState } from "./hub.mjs";
import { serve } from "./hub-worker.mjs";

const fieldOf = (headers, ov) => matchColumns(headers, ov).map((c) => c.field ?? (c.value != null ? `=${c.value}` : null));

test("the header row: separator, quotes and a byte-order mark", () => {
  assert.deepEqual(readTemplate('﻿"Employee ID","Last, First",Regular Hours\r\n1,2,3').headers, ["Employee ID", "Last, First", "Regular Hours"]);
  assert.equal(readTemplate("Name\tRegular Hours\tOvertime Hours").sep, "\t");
  assert.equal(readTemplate("Name;Regular Hours;Overtime Hours").sep, ";");
  assert.match(readTemplate("\n \n").error, /empty/);
  assert.deepEqual(splitCsvLine('a,"b ""c""",d'), ["a", 'b "c"', "d"]);
});

test("column names match by spelling; generic words and code columns are never guessed", () => {
  // Spellings seen in hours-import layouts; the hub matches names, it does not assume any provider's layout.
  assert.deepEqual(fieldOf(["Employee ID", "First Name", "Last Name", "Regular Hours", "Overtime Hours", "Double Overtime Hours", "Sick Hours"]),
    ["employee_id", "first_name", "last_name", "regular_hours", "overtime_hours", "double_hours", "leave_hours"]);
  assert.deepEqual(fieldOf(["Co Code", "Batch ID", "File #", "Reg Hours", "O/T Hours", "Hours 3 Code", "Hours 3 Amount"]),
    [null, null, "employee_id", "regular_hours", "overtime_hours", null, null]);
  // A word match inside a longer header, most specific first: double time is not read as overtime.
  assert.deepEqual(fieldOf(["Overtime (1.5x) Hrs", "Double Time 2x", "PTO Taken", "Job Code", "Hours"]),
    ["overtime_hours", "double_hours", "leave_hours", null, "regular_hours"]);
});

test("overrides choose a field, blank a column or fix a value; bad lines are reported", () => {
  const ov = parseOverrides('Co Code = "ABC"\nBatch ID = "1"\nHours = blank\nWorker Ref = employee_id\nOops = salary\nno equals');
  assert.equal(ov.errors.length, 2);
  assert.deepEqual(fieldOf(["Co Code", "Batch ID", "Hours", "Worker Ref"], ov.map), ["=ABC", "=1", "blank", "employee_id"]);
  assert.deepEqual([...parseIds("Ana Ruiz = 000123\nBen, 7\n\nCleo\t42").entries()], [["Ana Ruiz", "000123"], ["Ben", "7"], ["Cleo", "42"]]);
});

test("the filled file: template order, zeros blank by default, IDs kept as typed, leave in the week only", () => {
  const pay = [{ name: "Ana Ruiz", regularH: 40, overtimeH: 5, doubleH: 0, mealPremiumDays: 0, regularRate: 18, gross: 855 }, { name: "Ben", regularH: 12.25, overtimeH: 0, doubleH: 0, mealPremiumDays: 0, regularRate: null, gross: null }];
  const rows = payrollRows(pay, { weekStart: "2026-11-16", ids: parseIds("Ana Ruiz = 000123"), leaveUses: [{ person: "Cleo", date: "2026-11-18", hours: 4 }, { person: "Cleo", date: "2026-11-23", hours: 8 }, { person: "Ben", date: "2026-11-15", hours: 3 }] });
  const f = fillTemplate("Last Name,First Name,Employee ID,Regular Hours,Overtime Hours,Sick Hours,Pay Rate,Pay Period End", rows);
  assert.equal(f.csv, "Last Name,First Name,Employee ID,Regular Hours,Overtime Hours,Sick Hours,Pay Rate,Pay Period End\r\n" +
    "Ruiz,Ana,000123,40.00,5.00,,18.00,2026-11-22\r\n,Ben,,12.25,,,,2026-11-22\r\n,Cleo,,,,4.00,,2026-11-22\r\n");
  assert.ok(f.warnings.some((w) => /No payroll ID for Ben, Cleo/.test(w)));
  const z = fillTemplate("Name\tRegular Hours\tOvertime Hours", rows, { zeros: "zero" });
  assert.equal(z.csv.split("\r\n")[2], "Ben\t12.25\t0.00");
  // Overtime with no column for it is called out, not silently dropped.
  assert.ok(fillTemplate("Name,Regular Hours", rows).warnings.some((w) => /overtime/.test(w)));
  // A name typed as a formula is defused.
  const evil = payrollRows([{ name: "=HYPERLINK(1)", regularH: 1, overtimeH: 0, doubleH: 0 }], { weekStart: "2026-11-16" });
  assert.match(fillTemplate("Name,Hours", evil).csv, /\r\n'=HYPERLINK\(1\),1\.00/);
});

const WEEK = { weekStart: "2026-11-16", people: [{ name: "Ana Ruiz", hours: 40 }], assignments: [0, 1, 2, 3, 4].map((d) => ({ person: "Ana Ruiz", slot: { day: d, startMin: 540, endMin: 1080, label: "", role: "" } })) };

test("hub: save a template once, then download the week filled from the timesheet", async () => {
  const state = emptyState(), s = {};
  for (let d = 16; d <= 20; d++) { punch(s, "Ana Ruiz", "in", Date.parse(`2026-11-${d}T09:00:00Z`)); punch(s, "Ana Ruiz", "out", Date.parse(`2026-11-${d}T18:00:00Z`)); }
  state.punches = s.punches; state.punchSeq = s.punchSeq; state.weekStart = "2026-11-16";
  state.published = { ...structuredClone(WEEK), at: "2026-11-15T12:00:00.000Z", unfilled: 0, staffText: "name, wage, max hours\nAna Ruiz, 18, 50", shiftsText: "" };
  let saves = 0;
  const hub = handler(state, () => saves++, { ADMIN_KEY: "adm", TEAM_TOKEN: "tm" }, () => Date.parse("2026-11-21T12:00:00Z"), null);
  const get = (p) => serve(hub, new Request("https://hub.example" + p));
  assert.equal((await get("/admin/payroll.csv?key=adm")).status, 404);
  assert.equal((await get("/admin/payroll?key=tm")).status, 401);
  const body = new URLSearchParams({ week: "2026-11-16", header: "Co Code,File #,Reg Hours,O/T Hours\n", ids: "Ana Ruiz = 0042", overrides: 'Co Code = "XYZ"' });
  const r = await serve(hub, new Request("https://hub.example/admin/payroll-template?key=adm", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
  assert.equal(r.status, 303); assert.equal(saves, 1);
  assert.equal(state.payrollTemplate.header, "Co Code,File #,Reg Hours,O/T Hours");
  const page = await (await get("/admin/payroll?key=adm&week=2026-11-16")).text();
  assert.match(page, /Download the filled template/); assert.match(page, /Every column is filled/);
  const csv = await (await get("/admin/payroll.csv?key=adm&week=2026-11-16")).text();
  assert.equal(csv, "Co Code,File #,Reg Hours,O/T Hours\r\nXYZ,0042,40.00,5.00\r\n"); // 45 h worked, federal: 40 + 5
  assert.match(await (await get("/admin/timesheet?key=adm")).text(), /Fill your payroll service&#39;s template|Fill your payroll service's template/);
  // A pasted data dump instead of a header row is refused.
  const big = new URLSearchParams({ header: Array.from({ length: 300 }, (_, i) => "c" + i).join(",") });
  const bad = await serve(hub, new Request("https://hub.example/admin/payroll-template?key=adm", { method: "POST", body: big, headers: { "content-type": "application/x-www-form-urlencoded" } }));
  assert.match(decodeURIComponent(bad.headers.get("location")), /Not saved/);
});
