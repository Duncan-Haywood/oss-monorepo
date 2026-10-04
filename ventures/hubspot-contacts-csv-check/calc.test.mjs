import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, duplicateGroups, duplicatesCsv, sampleFile, sampleBrokenFile, findingsCsv, parseCsv, toCsv, dateShape, decodeBuffer, PROPERTIES } from "./calc.mjs";

const HEAD = "First Name,Last Name,Email,Phone Number,Lifecycle Stage,Create Date";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const has = (r, re, sev) => r.findings.some((f) => re.test(f.title) && (!sev || f.severity === sev));

test("the clean sample has no errors or warnings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.contacts, 3);
  assert.equal(r.summary.withEmail, 3);
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /will need mapping/, /scientific notation/, /more than one address/, /typo in the domain/, /not a HubSpot stage/, /not one of the default/, /mixes day-first and month-first/, /not a plain number/, /four digits for a US/, /appears on 2 rows/, /contains letters/, /mailto/, /all capitals/]) assert.ok(has(r, re), String(re));
});

test("headings are matched by alias, so E-mail and Mobile are understood", () => {
  const r = validate("E-mail,Mobile,Surname\na@b.example,07700900123,Lee\n");
  assert.ok(!has(r, /No email column/));
  assert.ok(r.summary.mapped.some((m) => /Mobile → Mobile Phone Number/.test(m)));
});

test("an unknown heading is a note, not an error", () => {
  const r = validate("Email,Favourite colour\na@b.example,blue\n");
  assert.ok(has(r, /will need mapping/, "info"));
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
});

test("no email column warns that re-importing duplicates; no identifiers at all is an error", () => {
  assert.ok(has(validate("First Name,Company Name\nA,B\n"), /No email column/, "warning"));
  assert.ok(has(validate("Company Name,City\nA,B\n"), /No email, name or Record ID/, "error"));
  assert.ok(!has(validate("Record ID,Company Name\n1,B\n"), /No email, name or Record ID/));
});

test("email problems", () => {
  const r = validate(file("A,B,a@b,,,", "C,D,\"a@b.example, c@d.example\",,,", "E,F,mailto:e@f.example,,,", "G,H,fine@d.example,,,", "I,J,x@gmial.com,,,"));
  assert.ok(has(r, /does not look like an address/, "error"));
  assert.ok(has(r, /more than one address/, "error"));
  assert.ok(has(r, /mailto/));
  assert.ok(has(r, /typo in the domain/));
  assert.ok(!r.findings.some((f) => /fine@d/.test(f.title)));
});

test("same email on differing rows is a merge warning; identical rows a copy warning", () => {
  const r = validate(file("A,B,x@y.example,,,", "C,D,X@y.example,,,"));
  assert.ok(has(r, /appears on 2 rows/, "warning"));
  const r2 = validate(file("A,B,x@y.example,,,", "A,B,x@y.example,,,"));
  assert.ok(has(r2, /Exact copy/, "warning"));
  assert.ok(!has(r2, /appears on 2 rows/));
  assert.equal(r2.summary.duplicates, 1);
});

test("lifecycle stage accepts labels and internal names, rejects others", () => {
  const r = validate(file("A,B,a@b.example,,Marketing Qualified Lead,", "C,D,c@d.example,,customer,", "E,F,e@f.example,,Hot lead,"));
  assert.equal(r.findings.filter((f) => /not a HubSpot stage/.test(f.title)).length, 1);
});

test("scientific notation phones and over-long digit strings", () => {
  const r = validate(file("A,B,a@b.example,4.41175E+11,,", "C,D,c@d.example,12,,"));
  assert.ok(has(r, /scientific notation/, "error"));
  assert.ok(has(r, /has 2 digits/, "warning"));
});

test("date shapes and mixed columns", () => {
  assert.equal(dateShape("2026-03-04"), "ymd");
  assert.equal(dateShape("14/03/2026"), "dmy");
  assert.equal(dateShape("03/14/2026"), "mdy");
  assert.equal(dateShape("03/04/2026"), "ambiguous");
  assert.equal(dateShape("March 3"), "other");
  const mixed = validate(file("A,B,a@b.example,,,14/03/2026", "C,D,c@d.example,,,03/14/2026"));
  assert.ok(has(mixed, /mixes day-first and month-first/, "error"));
  const amb = validate(file("A,B,a@b.example,,,14/03/2026", "C,D,c@d.example,,,03/04/2026"));
  assert.ok(has(amb, /could be read either way/, "warning"));
  const allAmb = validate(file("A,B,a@b.example,,,03/04/2026"));
  assert.ok(has(allAmb, /dates are ambiguous/, "info"));
  const text = validate(file("A,B,a@b.example,,,March 3rd"));
  assert.ok(has(text, /not a date HubSpot reads/, "warning"));
});

test("row cell count, spreadsheet errors, unterminated quote, empty file", () => {
  assert.ok(has(validate(file("A,B,a@b.example")), /cells, the header has/, "error"));
  assert.ok(has(validate(file("A,B,#REF!,,,")), /Spreadsheet error value/, "error"));
  assert.ok(has(validate('Email\n"a@b.example\n'), /never closed/, "error"));
  assert.ok(has(validate(""), /empty/, "error"));
  assert.ok(has(validate("Email\n"), /no contacts/, "error"));
});

test("repair trims, strips mailto, lower-cases email, cleans numbers, drops exact duplicates", () => {
  const src = "First Name;Email;Annual Revenue\n Ann ;mailto:ANN@X.EXAMPLE;\"$1,200,000\"\nAnn;ann@x.example;1200000\nBo;bo@x.example;2M\n";
  const r = repair(src);
  assert.equal(r.error, "");
  const rows = parseCsv(r.text).rows.map((x) => x.cells);
  assert.deepEqual(rows, [["First Name", "Email", "Annual Revenue"], ["Ann", "ann@x.example", "1200000"], ["Bo", "bo@x.example", "2M"]]);
  assert.ok(r.changes.some((c) => /Separator semicolon/.test(c)));
  assert.ok(r.changes.some((c) => /Exact duplicate rows removed \(1\)/.test(c)));
});

test("repair never edits a name, phone, postcode or lifecycle stage", () => {
  const src = "First Name,Email,Phone Number,Postal Code,Lifecycle Stage\nMAYA,a@b.example,4.41E+11,2108,Hot lead\n";
  const rows = parseCsv(repair(src).text).rows.map((x) => x.cells);
  assert.deepEqual(rows[1], ["MAYA", "a@b.example", "4.41E+11", "2108", "Hot lead"]);
});

test("repair refuses an unterminated file", () => {
  assert.match(repair('Email\n"x').error, /never closed/);
});

test("duplicate groups list every row sharing an email", () => {
  const src = file("A,B,x@y.example,,,", "C,D,X@Y.example,,,", "E,F,z@y.example,,,");
  const g = duplicateGroups(src);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].lines, [2, 3]);
  const csv = parseCsv(duplicatesCsv(src)).rows.map((r) => r.cells);
  assert.equal(csv.length, 3);
  assert.deepEqual(csv[0].slice(0, 2), ["line", "shared_email"]);
  assert.equal(duplicatesCsv(file("A,B,a@b.example,,,")), "");
});

test("csv round trip keeps commas, quotes and newlines", () => {
  const rows = [["a", "b,c", 'd"e', "f\ng"]];
  assert.deepEqual(parseCsv(toCsv(rows)).rows.map((r) => r.cells), rows);
});

test("findings csv has one row per finding; BOM is ignored; buffers decode", () => {
  const r = validate("﻿Email\nnot-an-email\n");
  assert.equal(parseCsv(findingsCsv(r)).rows.length, r.findings.length + 1);
  assert.ok(!has(r, /No email column/));
  assert.equal(decodeBuffer(new TextEncoder().encode("Müller")), "Müller");
});

test("every default property is reachable by its own name", () => {
  const { summary } = validate(PROPERTIES.join(",") + "\n");
  assert.equal(summary.unmapped.length, 0);
});
