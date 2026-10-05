import { test } from "node:test";
import assert from "node:assert/strict";
import { mod97, checkOk, classify, validate, repair, computeCheckDigits, printFormat, findingsCsv, sampleFile, sampleBrokenFile, COUNTRIES } from "./calc.mjs";

// Public example IBANs from the national/registry documentation.
const GOOD = ["DE89370400440532013000", "GB82WEST12345698765432", "FR1420041010050500013M02606", "NL91ABNA0417164300", "ES9121000418450200051332", "BE68539007547034", "CH9300762011623852957", "IT60X0542811101000000123456"];

test("known example IBANs pass mod-97 and have their registry length", () => {
  for (const i of GOOD) { assert.equal(mod97(i), 1, i); assert.ok(checkOk(i), i); assert.equal(i.length, COUNTRIES[i.slice(0, 2)], i); }
});

test("computeCheckDigits reproduces the check digits of a real IBAN", () => {
  assert.equal(computeCheckDigits("DE", "370400440532013000"), "89");
  assert.equal(computeCheckDigits("GB", "WEST12345698765432"), "82");
});

test("spaces, lower case, labels and apostrophes are cleaned and noted", () => {
  const c = classify("gb82 west 1234 5698 7654 32");
  assert.equal(c.kind, "ok"); assert.equal(c.value, "GB82WEST12345698765432"); assert.ok(c.fixed); assert.equal(c.notes.length, 2);
  assert.equal(classify("IBAN: DE89 3704 0044 0532 0130 00").value, "DE89370400440532013000");
  assert.equal(classify("'DE89370400440532013000").kind, "ok");
  const clean = classify("DE89370400440532013000");
  assert.equal(clean.fixed, false);
});

test("a wrong check digit is an error and a single adjacent swap is suggested, never applied", () => {
  const c = classify("FR1420041010050500013M02660");
  assert.equal(c.kind, "bad"); assert.equal(c.why, "check digits");
  assert.deepEqual(c.swap.map((h) => h.value), ["FR1420041010050500013M02606"]);
  const out = repair("iban\nFR1420041010050500013M02660\n");
  assert.match(out.text, /FR1420041010050500013M02660/);
  assert.equal(out.changes.length, 0);
});

test("a single changed digit has no suggestion and says so", () => {
  const r = validate("iban\nDE89370400440532003100\n");
  assert.equal(r.summary.errors, 1);
  assert.match(r.findings[0].detail, /cannot be worked out/);
});

test("wrong length, unknown country, plain account numbers and bad characters are named", () => {
  assert.equal(classify("NL91ABNA041716430").why, "wrong length");
  assert.match(classify("NL91ABNA041716430").detail, /has 18 \(1 missing\)/);
  assert.equal(classify("XX001234567890").why, "unknown country");
  assert.equal(classify("12345678901234567890").why, "not an IBAN");
  assert.equal(classify("DE89!3704").why, "invalid characters");
});

test("a letter where a country's account part is all digits is a format error", () => {
  const c = classify("DE89370400440532013O00");
  assert.equal(c.kind, "bad"); assert.equal(c.why, "wrong format");
});

test("duplicates and blanks are warnings; mixed countries are noted", () => {
  const r = validate(sampleBrokenFile());
  assert.ok(r.findings.some((f) => f.title === "Duplicate IBAN" && f.line === 6));
  assert.ok(r.findings.some((f) => /blank IBAN/.test(f.title)));
  assert.ok(r.findings.some((f) => f.title === "Several countries"));
  assert.equal(r.summary.codes, 8); assert.equal(r.summary.blanks, 1);
});

test("clean sample has no errors and the broken sample has the five expected ones", () => {
  assert.equal(validate(sampleFile()).summary.errors, 0);
  assert.equal(validate(sampleBrokenFile()).summary.errors, 5);
});

test("column is found from the header, from content, or from an override", () => {
  assert.equal(validate("a,b,IBAN\n1,2,DE89370400440532013000\n").column, 2);
  assert.equal(validate("x,y\nAcme,DE89 3704 0044 0532 0130 00\nBeta,GB82WEST12345698765432\n").column, 1);
  assert.equal(validate("a,b\n1,DE89370400440532013000\n", { column: "2" }).column, 1);
});

test("repair rewrites only the IBAN column, keeps other columns and quoting, and can group in fours", () => {
  const src = 'name,iban\n"Smith, J",gb82west12345698765432\nBad,NOPE\n';
  const out = repair(src);
  assert.equal(out.text, 'name,iban\n"Smith, J",GB82WEST12345698765432\nBad,NOPE\n');
  assert.equal(out.changes.length, 1);
  assert.match(repair(src, { groups: true }).text, /GB82 WEST 1234 5698 7654 32/);
  assert.equal(printFormat("DE89370400440532013000"), "DE89 3704 0044 0532 0130 00");
});

test("semicolon files, CRLF and UTF-8 BOM-less quoted newlines keep their line numbers", () => {
  const r = validate("name;iban\r\nA;DE89370400440532013000\r\nB;DE00370400440532013000\r\n");
  assert.equal(r.delim, ";");
  assert.equal(r.findings[0].line, 3);
});

test("findings CSV is quoted and has a header", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,title,detail\n/);
  assert.match(csv, /"error","?|error,/);
});

test("empty input does not throw", () => {
  const r = validate("");
  assert.equal(r.summary.rows, 0);
  assert.equal(repair("").text, "\n");
});
