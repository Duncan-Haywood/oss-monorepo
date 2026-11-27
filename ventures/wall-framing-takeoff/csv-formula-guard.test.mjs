// CSV injection (CWE-1236): a cell that starts with = + - @ tab or CR runs as a formula when the export is
// opened in a spreadsheet. Each exporter that writes a name a user typed must defuse it, and leave plain numbers alone.
import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "./engine.mjs";
import { budgetCsv } from "./budget.mjs";
import { schedule, sampleSchedule, scheduleCsv } from "./schedule.mjs";

const EVIL = '=HYPERLINK("http://x","pay")';

test("engine toCsv defuses a formula in an order label and keeps numbers plain", () => {
  const csv = toCsv({ ok: true, orders: [{ size: "2x4", lines: [{ length: 96, qty: 3, label: EVIL }], bars: [] }], cuts: [] });
  const row = csv.split("\n")[1];
  assert.ok(row.endsWith(`"'=HYPERLINK(""http://x"",""pay"")"`), row);
  assert.match(row, /^order,2x4,96,/);
});

test("budgetCsv defuses a formula in an item and keeps a negative amount numeric", () => {
  const csv = budgetCsv({ lines: [{ section: "framing", item: "@SUM(A1)", qty: 1, unit: "ea", unitPrice: 2, amount: -2, source: "+cmd" }], materials: 2, tax: 0, taxRate: 0, contingency: 0, contingencyRate: 0, labor: 0, total: 2 });
  assert.equal(csv.split("\n")[1], "framing,'@SUM(A1),1,ea,2,-2,'+cmd");
});

test("scheduleCsv defuses a formula in an activity name", () => {
  const input = sampleSchedule();
  input.activities[0].name = EVIL;
  const s = schedule(input);
  assert.ok(s.ok, JSON.stringify(s.errors));
  const csv = scheduleCsv(s);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""pay"")"`), csv);
  assert.ok(!/(^|,)"?=/m.test(csv), csv);
});
