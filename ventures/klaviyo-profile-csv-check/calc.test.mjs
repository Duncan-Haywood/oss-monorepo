import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, toCsv, closestColumn, findingsCsv, sampleFile, sampleBrokenFile, COLUMNS } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const file = (head, ...rows) => toCsv([head, ...rows]);
const H = ["Email", "Phone Number", "External ID", "First Name"];

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

test("empty file, no identifier column, unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("First Name,Last Name\nA,B\n")).includes("missing-column"));
  assert.equal(validate('Email,Phone Number\n"a,1\n').findings[0].code, "quote");
});

test("custom columns are a note, not an error; near-misses of standard columns are warned", () => {
  const r = validate("Email,Favorite Color,Phone,Zip Code\na@example.com,blue,+16175550101,02108\n");
  assert.equal(r.findings.filter((f) => f.code === "near-header").length, 2);
  assert.deepEqual(r.summary.customColumns, ["Favorite Color"]);
  assert.ok(!codes(r).includes("unknown-header"));
  assert.equal(r.summary.withPhone, 1);
  assert.equal(closestColumn("Phon Number"), "Phone Number");
});

test("duplicate headers once punctuation is ignored", () => {
  assert.ok(codes(validate("Email,e-mail\na@example.com,a@example.com\n")).includes("dup-header"));
});

test("semicolon file is reported and repaired", () => {
  const text = "Email;Phone Number\na@example.com;+16175550101\n";
  assert.ok(codes(validate(text)).includes("delimiter"));
  assert.match(repair(text).text, /^Email,Phone Number\r\n/);
});

test("email validity and case-insensitive duplicates", () => {
  const r = validate(file(H, ["a@example.com", "", "1", "A"], ["A@Example.com", "", "2", "B"], ["nope", "", "3", "C"]));
  assert.equal(r.findings.find((f) => f.code === "dup-email").line, 3);
  assert.ok(codes(r).includes("email"));
});

test("rows with no identifier; external id alone is enough", () => {
  const r = validate(file(H, ["", "", "", "X"], ["", "", "C-9", "Y"]));
  assert.equal(r.findings.filter((f) => f.code === "no-identifier").length, 1);
  assert.equal(r.findings.find((f) => f.code === "no-identifier").line, 2);
});

test("phone: E.164, punctuation, scientific notation, duplicates; never guesses a country code", () => {
  const r = validate(file(H, ["a@example.com", "6175550101", "", ""], ["b@example.com", "+1 (617) 555-0102", "", ""], ["c@example.com", "4.16556E+09", "", ""], ["d@example.com", "+16175550102", "", ""]));
  assert.ok(codes(r).includes("phone-e164"));
  assert.ok(codes(r).includes("phone-punct"));
  assert.ok(codes(r).includes("phone-excel"));
  assert.ok(codes(r).includes("dup-phone"));
  const fixed = repair(file(H, ["a@example.com", "6175550101", "", ""], ["b@example.com", "+1 (617) 555-0102", "", ""]));
  assert.match(fixed.text, /\+16175550102/);
  assert.match(fixed.text, /6175550101/);
  assert.doesNotMatch(fixed.text, /\+16175550101/);
});

test("latitude, longitude, timezone, image", () => {
  const head = ["Email", "Latitude", "Longitude", "Timezone", "Image"];
  const r = validate(file(head, ["a@example.com", "95", "-71", "America/New_York", "https://x.test/a.png"], ["b@example.com", "42", "430", "EST", "a.png"]));
  assert.equal(r.findings.filter((f) => f.code === "latitude").length, 1);
  assert.equal(r.findings.filter((f) => f.code === "longitude").length, 1);
  assert.equal(r.findings.filter((f) => f.code === "timezone").length, 1);
  assert.equal(r.findings.filter((f) => f.code === "image").length, 1);
});

test("zip: Excel damage flagged, leading zero never added", () => {
  const head = ["Email", "Country", "Zip"];
  const r = validate(file(head, ["a@example.com", "US", "2108"], ["b@example.com", "US", "2108.0"], ["c@example.com", "US", "1.2E+10"]));
  assert.ok(codes(r).includes("zip-zero"));
  assert.ok(codes(r).includes("zip-decimal"));
  assert.ok(codes(r).includes("zip-excel"));
  const fixed = repair(file(head, ["b@example.com", "US", "2108.0"]));
  assert.match(fixed.text, /,2108\r\n/);
});

test("mixed date formats in a date-like custom column", () => {
  const head = ["Email", "Signup Date"];
  const mixed = validate(file(head, ["a@example.com", "2026-03-04"], ["b@example.com", "15/04/2026"]));
  assert.ok(codes(mixed).includes("date-mixed"));
  const amb = validate(file(head, ["a@example.com", "03/04/2026"]));
  assert.ok(codes(amb).includes("date-ambiguous"));
  const iso = validate(file(head, ["a@example.com", "2026-03-04"]));
  assert.ok(!codes(iso).includes("date-mixed") && !codes(iso).includes("date-ambiguous"));
});

test("consent is never created or changed by any fix", () => {
  const head = ["Email", "Marketing Consent"];
  const input = file(head, [" a@example.com ", "Y"], ["b@example.com", ""]);
  const out = repair(input);
  assert.match(out.text, /\r\nY\r\n|,Y\r\n/);
  assert.match(out.text, /b@example.com,\r\n/);
  assert.ok(codes(validate(input)).includes("consent-note"));
});

test("safe fixes: trim email, header capitals; rows with problems are left", () => {
  const out = repair("email,Phone Number\n  a@example.com ,+1 617 555 0101\n");
  assert.match(out.text, /^Email,Phone Number\r\na@example.com,\+16175550101\r\n$/);
  assert.ok(out.changes.length >= 3);
  assert.equal(repair("").error, "The file is empty.");
});

test("findings CSV round-trips and COLUMNS are all standard columns", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,code,title,detail/);
  for (const c of COLUMNS) assert.ok(sampleFile().split("\r\n")[0].includes(c), c);
});
