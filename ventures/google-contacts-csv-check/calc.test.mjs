import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, splitContacts, sampleFile, sampleBrokenFile, findingsCsv, parseCsv, toCsv, decodeBuffer, canonHeader, closestColumn, COLUMNS } from "./calc.mjs";

const HEAD = "First Name,Last Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Birthday";
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
  for (const re of [/semicolon/, /Unknown column "Phonee 1 - Label"/, /differs from Google/, /scientific notation/, /more than one address/, /not a real date/, /not in year-month-day/, /mailto/, /tel:/, /Exact copy/, /Row is blank/, /four digits for a US/, /is on \d contacts/]) assert.ok(has(r, re), String(re));
});

test("heading spellings land on Google's canonical names", () => {
  assert.equal(canonHeader("Email 1 - Value"), "E-mail 1 - Value");
  assert.equal(canonHeader("e-mail 2 – value"), "E-mail 2 - Value");
  assert.equal(canonHeader("phone 3 - type"), "Phone 3 - Type");
  assert.equal(canonHeader("address 1 - postal code"), "Address 1 - Postal Code");
  assert.equal(canonHeader("first name"), "First Name");
  assert.equal(canonHeader("Mobile"), null);
  assert.equal(canonHeader("E-mail 1 - Colour"), null);
});

test("typo heading names the column it looks like, keeping its number", () => {
  assert.equal(closestColumn("E-mial 2 - Value"), "E-mail 2 - Value");
  const r = validate("First Name,Phone 1 - Valu\nA,555\n");
  assert.match(r.findings.find((f) => /Unknown column/.test(f.title)).detail, /Phone 1 - Value/);
});

test("duplicate columns and mixed layouts are flagged", () => {
  assert.ok(has(validate("First Name,First Name,E-mail 1 - Value\nA,B,a@b.example\n"), /appears twice/, "error"));
  assert.ok(has(validate("First Name,Given Name,E-mail 1 - Value\nA,B,a@b.example\n"), /two Google layouts/, "warning"));
});

test("a file with no usable column is an error", () => {
  assert.ok(has(validate("Mobile,Surname\n1,2\n"), /No name, email, phone or organization column/, "error"));
});

test("several values in a cell use the ::: separator and are checked one by one", () => {
  const ok = validate(file("A,B,Work,a@b.example ::: c@d.example,Mobile,+44 7700 900123,"));
  assert.deepEqual(ok.findings.filter((f) => f.severity !== "info"), []);
  assert.ok(has(validate(file("A,B,Work,\"a@b.example, c@d.example\",Mobile,+44 7700 900123,")), /more than one address/, "error"));
  assert.ok(has(validate(file("A,B,Work,a@b,Mobile,555 0100,")), /does not look like an address/, "warning"));
});

test("phone checks: scientific notation, letters, length", () => {
  assert.ok(has(validate(file("A,B,,,Mobile,4.41175E+11,")), /scientific notation/, "error"));
  assert.ok(has(validate(file("A,B,,,Mobile,call after lunch,")), /contains letters/, "warning"));
  assert.ok(has(validate(file("A,B,,,Mobile,1234567890123456,")), /16 digits/, "warning"));
  assert.ok(!has(validate(file("A,B,,,Work,020 7946 0000 ext 4,")), /contains letters/));
});

test("birthday formats", () => {
  assert.ok(!has(validate(file("A,B,,,,,1988-04-12")), /Birthday/));
  assert.ok(!has(validate(file("A,B,,,,,--09-30")), /Birthday/));
  assert.ok(has(validate(file("A,B,,,,,2023-02-29")), /not a real date/, "error"));
  assert.ok(!has(validate(file("A,B,,,,,2024-02-29")), /not a real date/));
  assert.ok(has(validate(file("A,B,,,,,04/12/1988")), /not in year-month-day/, "warning"));
  assert.ok(has(validate(file("A,B,,,,,April 12")), /not a recognised date/, "warning"));
});

test("rows with nothing to build a contact from, and blank rows", () => {
  const r = validate("First Name,Last Name,E-mail 1 - Value,Notes\n,,,only a note\n,,,\nA,B,a@b.example,\n");
  assert.ok(has(r, /no name, email, phone or organization/, "warning"));
  assert.ok(has(r, /Row is blank/, "warning"));
});

test("shared emails and exact copies are reported, not merged", () => {
  const r = validate(file("A,B,Work,a@b.example,,,", "A,B,Work,a@b.example,,,", "C,D,Work,A@B.example,,,"));
  assert.ok(has(r, /Exact copy/, "warning"));
  assert.ok(has(r, /is on \d contacts/, "warning"));
  const fix = repair(file("A,B,Work,a@b.example,,,", "A,B,Work,a@b.example,,,", "C,D,Work,A@B.example,,,"));
  assert.equal(parseCsv(fix.text).rows.length, 3); // header + two distinct people
});

test("structure: ragged rows, unterminated quote, spreadsheet errors, mojibake, empty", () => {
  assert.ok(has(validate(file("A,B,Work,a@b.example")), /cells, the header has/, "error"));
  assert.ok(has(validate(file("A,B,\"Work,a@b.example,,,")), /never closed/, "error"));
  assert.ok(has(validate(file("A,B,,,,#REF!,")), /Spreadsheet error/, "error"));
  assert.ok(has(validate(file("MÃ¼ller,B,,,,,")), /mis-decoded/, "warning"));
  assert.ok(has(validate(""), /empty/, "error"));
});

test("US postcode that lost its zero is flagged but never rewritten", () => {
  const src = "First Name,Address 1 - Postal Code,Address 1 - Country\nA,2108,USA\n";
  assert.ok(has(validate(src), /four digits for a US/, "warning"));
  assert.match(repair(src).text, /2108/);
  assert.doesNotMatch(repair(src).text, /02108/);
});

test("repair: separator, headings, trims, prefixes, blank and duplicate rows; text untouched", () => {
  const fix = repair(sampleBrokenFile());
  assert.equal(fix.error, "");
  const rows = parseCsv(fix.text).rows.map((r) => r.cells);
  assert.equal(rows[0][2], "E-mail 1 - Value");
  assert.equal(rows[1][3], "4.41175E+11"); // unrecoverable value is left alone
  assert.equal(rows[2][0], "Maya");
  assert.equal(rows[2][2], "maya@harbourcoffee.example");
  assert.equal(rows[3][3], "0113 496 0456");
  assert.equal(rows.length, 5); // header + Maya, Maya, Tom, Sam (one Tom copy and the blank row gone)
  for (const c of ["Separator semicolon → comma", "mailto: prefix removed", "tel: prefix removed", "Blank rows removed", "Exact duplicate rows removed"]) assert.ok(fix.changes.some((x) => x.startsWith(c)), c);
});

test("repair keeps ::: separators and refuses an unterminated file", () => {
  const out = repair(file("A,B,Work,mailto:a@b.example ::: c@d.example,,,"));
  assert.match(out.text, /a@b\.example ::: c@d\.example/);
  assert.match(repair(file("A,B,\"Work")).error, /never closed/);
});

test("repaired sample re-validates without the faults it fixed", () => {
  const again = validate(repair(sampleBrokenFile()).text);
  for (const re of [/semicolon/, /differs from Google/, /mailto/, /tel:/, /Row is blank/, /Exact copy/]) assert.ok(!has(again, re), String(re));
});

test("splitContacts keeps the heading row on every part", () => {
  const rows = Array.from({ length: 5 }, (_, i) => `P${i},Q,Work,p${i}@x.example,,,`);
  const s = splitContacts(file(...rows), 2);
  assert.equal(s.parts.length, 3);
  assert.deepEqual(s.parts.map((p) => p.contacts), [2, 2, 1]);
  for (const p of s.parts) assert.ok(p.text.startsWith(HEAD));
});

test("findingsCsv round-trips through the parser", () => {
  const r = validate(sampleBrokenFile());
  const back = parseCsv(findingsCsv(r)).rows;
  assert.equal(back.length, r.findings.length + 1);
});

test("decodeBuffer and the column list", () => {
  assert.equal(decodeBuffer(new TextEncoder().encode("é")), "é");
  assert.ok(COLUMNS.includes("First Name") && COLUMNS.includes("Group Membership"));
  assert.equal(toCsv([["a,b", "c"]]), '"a,b",c\r\n');
});
