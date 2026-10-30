import { test } from "node:test";
import assert from "node:assert/strict";
import { importStaffCsv } from "./import-staff.mjs";
import { parseStaff } from "./calc.mjs";

// Invented layouts that mimic common scheduler exports; no real export has been tested.
test("first + last, rate with $, inactive skipped, roles", () => {
  const r = importStaffCsv('First Name,Last Name,Position,Hourly Rate,Status,Email\nAna,Lopez,Server|Bar,$18.50,Active,a@x.com\nBen,"Ng, Jr",Cook,16,Inactive,b@x.com\nCy,Roe,Cook,15,Active,c@x.com');
  assert.equal(r.rows, 2);
  assert.match(r.staffText, /Ana Lopez, 18.5, 40, 0, any, role: Server\/Bar/);
  assert.equal(r.skipped.length, 1);
  assert.deepEqual(r.unknown, ["email"]);
  const p = parseStaff(r.staffText);
  assert.deepEqual(p.errors, []);
  assert.equal(p.staff.length, 2);
});
test("semicolons, hours limits, duplicates and bad rate", () => {
  const r = importStaffCsv("Employee;Wage;Max Hours;Min Hours\nDi;12;25;30\nDi;12;25;0\nEd;abc;10;0");
  assert.match(r.staffText, /Di, 12, 25, 25, any/);
  assert.equal(r.skipped.length, 2);
});
test("missing columns are reported", () => {
  assert.match(importStaffCsv("Email\nx@y.z").notes[0], /No name column/);
  assert.match(importStaffCsv("Name\nAl").notes[0], /wages are set to 0/);
});
