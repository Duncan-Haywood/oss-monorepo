import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseRoster, toCsv, EXAMPLE_SHARED, SHARED_DEFAULTS, PAYOUT_REQUIRED } from "./calc.mjs";

const base = { ...SHARED_DEFAULTS, state: "CA", ppy: "26", horizon: "12", burden: "10", target: "", policy: "state" };

test("liability is balance hours x rate, loaded with employer tax when payout is owed", () => {
  const a = analyze({ ...base, roster: "Ann, 20, 50, 2, " });
  assert.equal(a.owed, true);
  assert.ok(Math.abs(a.totals.now - 50 * 20 * 1.1) < 1e-9);
  assert.equal(a.totals.wages, 1000);
});

test("a state off the short list carries no payout load unless the user says always", () => {
  const r = "Ann, 20, 50, 2, ";
  const tx = analyze({ ...base, state: "TX", roster: r });
  assert.equal(tx.owed, false);
  assert.equal(tx.totals.now, 1000);
  assert.ok(tx.warnings.some((w) => /written policy/.test(w)));
  assert.equal(analyze({ ...base, state: "TX", policy: "always", roster: r }).totals.now, 1100);
  assert.equal(analyze({ ...base, state: "CA", policy: "never", roster: r }).totals.now, 1000);
});

test("projection adds accrual per period and stops at the cap", () => {
  const a = analyze({ ...base, horizon: "12", roster: "Ann, 10, 100, 3, 150\nBo, 10, 100, 3, " });
  const ann = a.per.find((r) => r.name === "Ann"), bo = a.per.find((r) => r.name === "Bo");
  assert.equal(ann.future, 150); // 100 + 3*26 = 178, capped at 150
  assert.equal(bo.future, 178);
  assert.ok(Math.abs(ann.monthsToCap - (17 * 12) / 26) < 1e-9); // ceil(50/3)=17 periods
});

test("an employee already over their cap stays put, not pulled down", () => {
  const a = analyze({ ...base, roster: "Ann, 10, 200, 3, 150" });
  assert.equal(a.per[0].capped, true);
  assert.equal(a.per[0].future, 200);
});

test("hours above the target are priced", () => {
  const a = analyze({ ...base, target: "80", burden: "0", roster: "Ann, 10, 100, 0, \nBo, 20, 60, 0, " });
  assert.equal(a.totals.excessHours, 20);
  assert.equal(a.totals.excessValue, 200);
});

test("header line is ignored and bad lines are reported, not silently dropped", () => {
  const w = [];
  const rows = parseRoster("Name, Rate, Balance\nAnn, 20, 5\nBad, x, 5\nNeg, 20, -3", w);
  assert.equal(rows.length, 1);
  assert.equal(w.length, 2);
});

test("quoted names with commas parse", () => {
  const w = [];
  const rows = parseRoster('"Smith, Jo", 20, 5, 1, 10', w);
  assert.equal(rows[0].name, "Smith, Jo");
  assert.equal(rows[0].cap, 10);
});

test("invalid settings fail loudly with a message", () => {
  assert.equal(analyze({ ...base, ppy: "0", roster: "Ann, 20, 5" }).ok, false);
  assert.equal(analyze({ ...base, state: "California", roster: "Ann, 20, 5" }).ok, false);
  assert.equal(analyze({ ...base, roster: "" }).ok, false);
});

test("the example runs, sorts by liability, and exports CSV with a total row", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.equal(a.ok, true);
  assert.equal(a.per[0].name, "Carmen D.");
  assert.ok(a.totals.projected > a.totals.now);
  const csv = toCsv(a);
  assert.match(csv, /^Employee,/);
  assert.match(csv, /TOTAL/);
});

test("rule list is conservative: only states with a statute or controlling case", () => {
  assert.deepEqual(Object.keys(PAYOUT_REQUIRED).sort(), ["CA", "CO", "IL", "MA"]);
});
