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

test("custom attributes are a note; near-misses of built-in attributes are warned", () => {
  const r = validate("EMAIL,Favorite Color,Mobile,Prenom\na@example.com,blue,+33612345678,Ada\n");
  assert.equal(r.findings.filter((f) => f.code === "near-header").length, 2);
  assert.deepEqual(r.summary.customColumns, ["Favorite Color"]);
  assert.equal(r.summary.withSms, 1);
  assert.equal(closestColumn("FIRSTNAM"), "FIRSTNAME");
});

test("empty file, no EMAIL or SMS column, unterminated quote", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.ok(codes(validate("FIRSTNAME,LASTNAME\nA,B\n")).includes("missing-column"));
  assert.ok(!codes(validate("SMS\n+33612345678\n")).includes("missing-column"));
  assert.equal(validate('EMAIL,SMS\n"a,1\n').findings[0].code, "quote");
});

test("duplicate headers once punctuation is ignored", () => {
  assert.ok(codes(validate("EMAIL,e-mail\na@example.com,a@example.com\n")).includes("dup-header"));
});

test("semicolon file is a warning and is repaired", () => {
  const text = "EMAIL;SMS\na@example.com;+33612345678\n";
  const r = validate(text);
  assert.ok(codes(r).includes("delimiter"));
  assert.equal(r.findings.find((f) => f.code === "delimiter").severity, "warning");
  assert.match(repair(text).text, /^EMAIL,SMS\r\n/);
});

const H = ["EMAIL", "FIRSTNAME", "SMS"];

test("identity: email or SMS is enough, neither is an error with its line", () => {
  const r = validate(file(H, ["a@example.com", "A", ""], ["", "B", "+33612345678"], ["", "C", ""]));
  assert.equal(r.findings.find((f) => f.code === "no-identity").line, 4);
  assert.equal(r.findings.filter((f) => f.code === "no-identity").length, 1);
  assert.equal(r.summary.smsOnly, 1);
});

test("email validity and case-insensitive duplicates", () => {
  const r = validate(file(H, ["a@example.com", "A", ""], ["A@Example.com", "B", ""], ["nope", "C", ""]));
  assert.equal(r.findings.find((f) => f.code === "dup-email").line, 3);
  assert.ok(codes(r).includes("email"));
});

test("SMS: scientific notation, missing country code, too long; formatting left alone", () => {
  const r = validate(file(H, ["a@example.com", "", "3.36123E+10"], ["b@example.com", "", "06 12 34 56 78"], ["c@example.com", "", "+1 (416) 555-0123"], ["d@example.com", "", "+1234567890123456"], ["e@example.com", "", "0033612345678"]));
  assert.equal(r.findings.filter((f) => f.code === "sms-excel").length, 1);
  assert.equal(r.findings.filter((f) => f.code === "sms-country-code").length, 1);
  assert.equal(r.findings.filter((f) => f.code === "sms-country-code")[0].line, 3);
  assert.equal(r.findings.filter((f) => f.code === "sms-length").length, 1);
  const fixed = repair(file(H, ["b@example.com", "", "06 12 34 56 78"]));
  assert.match(fixed.text, /06 12 34 56 78/);
});

test("an unquoted comma shifts the row and is an error", () => {
  const r = validate("EMAIL,LASTNAME,CITY\na@example.com,Smith, Jr,Paris\n");
  assert.ok(codes(r).includes("extra-cells"));
  assert.ok(!codes(validate('EMAIL,LASTNAME,CITY\na@example.com,"Smith, Jr",Paris\n')).includes("extra-cells"));
});

test("mixed date formats in a date-like custom column", () => {
  const head = ["EMAIL", "SIGNUP_DATE"];
  assert.ok(codes(validate(file(head, ["a@example.com", "2026-03-04"], ["b@example.com", "15/04/2026"]))).includes("date-mixed"));
  assert.ok(codes(validate(file(head, ["a@example.com", "03/04/2026"]))).includes("date-ambiguous"));
});

test("consent and status values are never created or changed by any fix", () => {
  const head = ["EMAIL", "Marketing Consent"];
  const input = file(head, [" a@example.com ", "Y"], ["b@example.com", ""]);
  const out = repair(input);
  assert.match(out.text, /,Y\r\n/);
  assert.match(out.text, /b@example.com,\r\n/);
  assert.ok(codes(validate(input)).includes("consent-note"));
});

test("safe fixes: trim email, header spelling; no country code is ever added", () => {
  const out = repair("email,FirstName,sms\n  a@example.com ,Ada, 0612345678 \n");
  assert.match(out.text, /^EMAIL,FIRSTNAME,SMS\r\na@example.com,Ada,0612345678\r\n$/);
  assert.equal(repair("").error, "The file is empty.");
});

test("findings CSV round-trips and COLUMNS are all in the sample header", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,code,title,detail/);
  for (const c of COLUMNS) assert.ok(sampleFile().split("\r\n")[0].includes(c), c);
});
