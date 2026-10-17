import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const file = (head, ...rows) => toCsv([head, ...rows]);

test("clean example has no errors or warnings, broken one has both", () => {
  const good = validate(sampleFile());
  assert.deepEqual(good.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(good.summary.rows, 3);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error"));
  assert.ok(bad.findings.some((f) => f.severity === "warning"));
});

test("parser handles quotes, embedded newlines and reports lines", () => {
  const p = parseCsv('a,b\n"x, ""y""","l1\nl2"\nz,w\n');
  assert.deepEqual(p.rows.map((r) => r.cells), [["a", "b"], ['x, "y"', "l1\nl2"], ["z", "w"]]);
  assert.equal(p.rows[2].line, 4);
  assert.equal(parseCsv('a,"open\nb').unterminated, 1);
});

test("custom columns are a note, not an error; near-misses of default fields are warned", () => {
  const r = validate("Email Address,Favorite Color,Mobile,DOB\na@example.com,blue,+16175550101,03/14\n");
  assert.equal(r.findings.filter((f) => f.code === "near-header").length, 2);
  assert.deepEqual(r.summary.customColumns, ["Favorite Color"]);
  assert.equal(r.summary.withPhone, 1);
  assert.equal(closestColumn("Phon Number"), "Phone Number");
});

test("empty file, no email column, unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("First Name,Last Name\nA,B\n")).includes("missing-column"));
  assert.equal(validate('Email Address,Phone Number\n"a,1\n').findings[0].code, "quote");
});

test("duplicate headers once punctuation is ignored", () => {
  assert.ok(codes(validate("Email Address,e-mail address\na@example.com,a@example.com\n")).includes("dup-header"));
});

test("semicolon file is reported and repaired", () => {
  const text = "Email Address;Phone Number\na@example.com;+16175550101\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^Email Address,Phone Number\r\n/);
});

const H = ["Email Address", "First Name", "Phone Number", "Tags"];

test("email validity, case-insensitive duplicates, rows with no email", () => {
  const r = validate(file(H, ["a@example.com", "A", "", ""], ["A@Example.com", "B", "", ""], ["nope", "C", "", ""], ["", "D", "", ""]));
  assert.equal(r.findings.find((f) => f.code === "dup-email").line, 3);
  assert.ok(codes(r).includes("email"));
  assert.equal(r.findings.find((f) => f.code === "no-email").line, 5);
});

test("phone: scientific notation flagged, formatting left alone", () => {
  const r = validate(file(H, ["a@example.com", "", "4.16556E+09", ""], ["b@example.com", "", "+1 (617) 555-0102", ""]));
  assert.equal(r.findings.filter((f) => f.code === "phone-excel").length, 1);
  assert.match(repair(file(H, ["b@example.com", "", "+1 (617) 555-0102", ""])).text, /\+1 \(617\) 555-0102/);
});

test("an unquoted comma in Tags shifts the row and is an error", () => {
  const r = validate("Email Address,Tags,Last Name\na@example.com,vip,wholesale,Smith\n");
  assert.ok(codes(r).includes("extra-cells"));
  assert.ok(!codes(validate('Email Address,Tags,Last Name\na@example.com,"vip,wholesale",Smith\n')).includes("extra-cells"));
});

test("birthday: year flagged, mixed orders flagged, never rewritten", () => {
  const head = ["Email Address", "Birthday"];
  assert.ok(codes(validate(file(head, ["a@example.com", "03/14/1990"]))).includes("birthday-year"));
  assert.ok(codes(validate(file(head, ["a@example.com", "03/14"], ["b@example.com", "14/03"]))).includes("birthday-mixed"));
  assert.ok(codes(validate(file(head, ["a@example.com", "03/04"]))).includes("birthday-ambiguous"));
  assert.ok(codes(validate(file(head, ["a@example.com", "March 14"]))).includes("birthday"));
  const fixed = repair(file(head, [" a@example.com ", "03/14/1990"]));
  assert.match(fixed.text, /03\/14\/1990/);
});

test("mixed date formats in a date-like custom column", () => {
  const head = ["Email Address", "Signup Date"];
  assert.ok(codes(validate(file(head, ["a@example.com", "2026-03-04"], ["b@example.com", "15/04/2026"]))).includes("date-mixed"));
  assert.ok(codes(validate(file(head, ["a@example.com", "03/04/2026"]))).includes("date-ambiguous"));
});

test("consent and status values are never created or changed by any fix", () => {
  const head = ["Email Address", "Marketing Consent"];
  const input = file(head, [" a@example.com ", "Y"], ["b@example.com", ""]);
  const out = repair(input);
  assert.match(out.text, /,Y\r\n/);
  assert.match(out.text, /b@example.com,\r\n/);
  assert.ok(codes(validate(input)).includes("consent-note"));
});

test("safe fixes: trim email, header spelling; email alias header is accepted", () => {
  const out = repair("email address,First Name\n  a@example.com ,Ada\n");
  assert.match(out.text, /^Email Address,First Name\r\na@example.com,Ada\r\n$/);
  assert.equal(out.changes.length, 2);
  assert.ok(!codes(validate("Email\na@example.com\n")).includes("missing-column"));
  assert.equal(repair("").error, "The file is empty.");
});

test("findings CSV round-trips and COLUMNS are all default fields", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,code,title,detail/);
  for (const c of COLUMNS) assert.ok(sampleFile().split("\r\n")[0].includes(c), c);
});
