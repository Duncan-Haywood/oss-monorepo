import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const H = "Employee,Date,Start,End,Break Minutes,Regular Hours,Overtime Hours\n";

test("clean example has no errors or warnings, broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.rows, 3);
  assert.equal(good.summary.employees, 2);
  assert.equal(good.summary.totalHours, 23.5);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, embedded newlines and reports lines", () => {
  const p = parseCsv('a,b\n"x, ""y""","l1\nl2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
  assert.equal(closestColumn("Regular Hour"), "Regular Hours");
});

test("empty file, missing columns, unterminated quote, duplicate headers", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("Date,Hours\n2026-09-28,8\n")).includes("missing-column"));
  assert.ok(codes(validate("Employee,Date\nA,2026-09-28\n")).includes("missing-column"));
  assert.equal(validate('Employee,Hours\n"a,1\n').findings[0].code, "quote");
  assert.ok(codes(validate("Employee,Hours,hours\nA,8,8\n")).includes("dup-header"));
});

test("near-miss headers are understood, not reported as unknown", () => {
  const r = validate("Staff,Day,Hrs\nAda,2026-09-28,8\n");
  assert.equal(r.summary.rows, 1);
  assert.deepEqual(r.summary.customColumns, []);
});

test("semicolon file is reported and repaired", () => {
  const text = "Emp;Day;Hrs\nAda;2026-09-28;8\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  const fix = repair(text);
  assert.match(fix.text, /^Employee,Date,Regular Hours\r\n/);
  assert.ok(fix.changes.length >= 2);
});

test("hours: decimal vs h:mm mixing, units, over 24, long day, negative", () => {
  const r = validate(H + "Ada,2026-09-28,,,,8.5,\nBen,2026-09-28,,,,8:30,\n");
  assert.ok(codes(r).includes("hours-mixed"));
  assert.ok(!codes(validate(H + "Ada,2026-09-28,,,,8:30,\nBen,2026-09-28,,,,7:45,\n")).includes("hours-mixed"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,,,,8h,\n")).includes("hours-format"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,,,,28,\n")).includes("hours-over-24"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,,,,18,\n")).includes("hours-long"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,,,,-2,\n")).includes("negative"));
});

test("dates: Excel serial, nonexistent, mixed formats, ambiguity", () => {
  assert.ok(codes(validate(H + "Ada,46294,,,,8,\n")).includes("date-serial"));
  assert.ok(codes(validate(H + "Ada,2026-02-30,,,,8,\n")).includes("date-real"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,,,,8,\nBen,09/29/2026,,,,8,\n")).includes("date-mixed"));
  assert.ok(codes(validate(H + "Ada,03/04/2026,,,,8,\n")).includes("date-ambiguous"));
  assert.ok(codes(validate(H + "Ada,,,,,8,\n")).includes("no-date"));
});

test("duplicate person-day is a warning and is never merged", () => {
  const r = validate(H + "Ada,2026-09-28,,,,4,\nada ,2026-09-28,,,,4,\n");
  assert.ok(codes(r).includes("dup-day"));
  const fix = repair(H + "Ada,2026-09-28,,,,4,\nada ,2026-09-28,,,,4,\n");
  assert.equal(parseCsv(fix.text).rows.length, 3);
});

test("start/end arithmetic, overnight, break, half-filled times", () => {
  assert.deepEqual(codes(validate(H + "Ada,2026-09-28,08:00,16:30,30,8,\n")).filter((c) => c !== "scope-note"), []);
  assert.ok(codes(validate(H + "Ada,2026-09-28,08:00,16:30,30,9,\n")).includes("hours-mismatch"));
  const night = validate(H + "Ada,2026-09-28,22:00,06:00,30,7.5,\n");
  assert.ok(codes(night).includes("overnight"));
  assert.ok(!codes(night).includes("hours-mismatch"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,08:00,,,8,\n")).includes("half-times"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,eight,16:00,,8,\n")).includes("time-format"));
  assert.ok(codes(validate(H + "Ada,2026-09-28,08:00,08:30,60,0.5,\n")).includes("span-negative"));
  assert.ok(!codes(validate(H + "Ada,2026-09-28,8:00 AM,4:30 PM,30,8,\n")).includes("hours-mismatch"));
});

test("weekly over 40 with an empty overtime column is noted only, never filled in", () => {
  let rows = "";
  for (const d of ["28", "29", "30"]) rows += `Ada,2026-09-${d},,,,14,\n`;
  const r = validate(H + rows);
  assert.ok(codes(r).includes("weekly-over-40"));
  assert.equal(r.findings.find((f) => f.code === "weekly-over-40").severity, "info");
});

test("unquoted comma in a name shifts the row and is an error", () => {
  assert.ok(codes(validate(H + "Smith, Jo,2026-09-28,,,,8,\n")).includes("extra-cells"));
});

test("employee: blank, Excel error, scientific-notation id", () => {
  assert.ok(codes(validate(H + ",2026-09-28,,,,8,\n")).includes("no-employee"));
  assert.ok(codes(validate(H + "#REF!,2026-09-28,,,,8,\n")).includes("excel-error"));
  assert.ok(codes(validate(H + "1.2346E+11,2026-09-28,,,,8,\n")).includes("id-excel"));
});

test("safe fixes never change hours, dates, breaks or names", () => {
  const text = H + " Ada ,2026-09-28,08:00,16:30,30,8,\n";
  const fix = repair(text);
  const rows = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.deepEqual(rows[1], ["Ada", "2026-09-28", "08:00", "16:30", "30", "8", ""]);
  assert.equal(repair("").error, "The file is empty.");
  assert.match(repair('Employee,Hours\n"a,1\n').error, /never closed/);
});

test("findings CSV round-trips and CRLF/BOM input is read", () => {
  const r = validate("﻿" + H.replace(/\n/g, "\r\n") + "Ada,2026-09-28,,,,28,\r\n");
  assert.ok(codes(r).includes("hours-over-24"));
  const csv = parseCsv(findingsCsv(r)).rows;
  assert.deepEqual(csv[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.ok(csv.length > 1);
});
