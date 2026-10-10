import { test } from "node:test";
import assert from "node:assert/strict";
import { annualTax, categoryFor, monthIndex, dueDate, parseVehicles, plan, sampleInput, toCsv } from "./calc.mjs";

test("annual tax follows the IRS table: $100 at 55,000, +$22 per 1,000, $550 above 75,000", () => {
  assert.equal(annualTax(54999), 0);
  assert.equal(annualTax(55000), 100);
  assert.equal(annualTax(55999), 100);
  assert.equal(annualTax(56000), 122);
  assert.equal(annualTax(74999), 518);
  assert.equal(annualTax(75000), 540);
  assert.equal(annualTax(75001), 550);
  assert.equal(annualTax(80000), 550);
});

test("logging trucks pay 75% of the standard rate", () => {
  assert.equal(annualTax(55000, true), 75);
  assert.equal(annualTax(75000, true), 405);
  assert.equal(annualTax(90000, true), 412.5);
});

test("categories run A to V", () => {
  assert.equal(categoryFor(55000), "A");
  assert.equal(categoryFor(56500), "B");
  assert.equal(categoryFor(75000), "U");
  assert.equal(categoryFor(75001), "V");
  assert.equal(categoryFor(40000), null);
});

test("months parse as names or calendar numbers, July first", () => {
  assert.equal(monthIndex("Jul"), 0);
  assert.equal(monthIndex("july"), 0);
  assert.equal(monthIndex("7"), 0);
  assert.equal(monthIndex("1"), 6);
  assert.equal(monthIndex("june"), 11);
  assert.equal(monthIndex("zzz"), -1);
});

test("due date is the last day of the month after first use, across the year end", () => {
  assert.equal(dueDate(0, 2026), "2026-08-31");
  assert.equal(dueDate(5, 2026), "2027-01-31");
  assert.equal(dueDate(6, 2026), "2027-02-28");
  assert.equal(dueDate(11, 2026), "2027-07-31");
});

test("partial-period tax prorates by whole months left", () => {
  const r = plan({ vehicles: "A, 55000, Aug\nB, 80000, Jun\nC, 80000, Jul", periodStartYear: 2026 });
  assert.equal(r.rows[0].owed, 91.67);
  assert.equal(r.rows[1].owed, 45.83);
  assert.equal(r.rows[2].owed, 550);
  assert.equal(r.total, 687.5);
});

test("suspended vehicles owe nothing but are category W and still listed", () => {
  const r = plan({ vehicles: "Spare, 80000, Jul, standard, 4000\nFarm, 80000, Jul, agricultural, 7000\nBusy, 80000, Jul, standard, 6000" });
  assert.equal(r.rows[0].owed, 0);
  assert.equal(r.rows[0].category, "W");
  assert.equal(r.rows[1].owed, 0);
  assert.equal(r.rows[2].owed, 550);
});

test("under 55,000 lb is not taxable", () => {
  const r = plan({ vehicles: "Box, 26000, Jul" });
  assert.equal(r.total, 0);
  assert.match(r.advice.join(" "), /under 55,000/);
});

test("bad lines produce a line-numbered error, not a crash", () => {
  assert.match(plan({ vehicles: "x" }).error, /Line 1/);
  assert.match(plan({ vehicles: "x, 80000, flarp" }).error, /not a month/);
  assert.match(plan({ vehicles: "x, 80000, Jul, hovercraft" }).error, /type must be/);
  assert.match(plan({ vehicles: "" }).error, /Add at least one/);
  assert.equal(parseVehicles("# comment\n\nA, 60000, Jul").vehicles.length, 1);
});

test("sample runs, mentions e-file threshold only at 25 vehicles, and exports CSV", () => {
  const r = plan(sampleInput());
  assert.equal(r.rows.length, 5);
  assert.ok(r.total > 0);
  assert.doesNotMatch(r.advice.join(" "), /electronic/);
  const many = plan({ vehicles: Array.from({ length: 25 }, (_, i) => `T${i}, 80000, Jul`).join("\n") });
  assert.match(many.advice.join(" "), /electronic/);
  const csv = toCsv(r);
  assert.match(csv, /^vehicle,/);
  assert.match(csv, /total,/);
});

test("cost per mile and next-category nudge", () => {
  const r = plan({ vehicles: "A, 60500, Jul", annualMiles: 10000 });
  assert.equal(r.rows[0].annual, 210);
  assert.equal(r.rows[0].toNext.extra, 22);
  assert.match(r.advice.join(" "), /2\.10 cents per mile/);
});
