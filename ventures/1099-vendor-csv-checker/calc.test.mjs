import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseCsv, parseMoney, tinProblem, readyCsv, maskedFindingsCsv, sampleCsv, sampleBrokenCsv, maskTin, NEC_THRESHOLD } from "./calc.mjs";

const titles = (r) => r.findings.map((f) => f.title);

test("parseCsv handles quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
});

test("parseMoney reads dollars, parentheses and rejects text", () => {
  assert.equal(parseMoney("$1,234.50"), 123450);
  assert.equal(parseMoney("(600.00)"), -60000);
  assert.equal(parseMoney(""), null);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("thresholds: $600 for 2025, $2,000 for 2026", () => {
  assert.equal(NEC_THRESHOLD[2025], 600);
  assert.equal(NEC_THRESHOLD[2026], 2000);
  const csv = "name,tin,address,city,state,zip,amount\nA Co Smith,84-3456789,1 St,Town,VT,05401,1500\n";
  assert.equal(analyze(csv, { year: 2025 }).summary.needing1099, 1);
  assert.equal(analyze(csv, { year: 2026 }).summary.needing1099, 0);
});

test("exactly at the threshold counts; a cent under does not", () => {
  const mk = (a) => `name,tin,address,city,state,zip,amount\nZed,84-3456789,1 St,Town,VT,05401,${a}\n`;
  assert.equal(analyze(mk("2000.00")).summary.needing1099, 1);
  assert.equal(analyze(mk("1999.99")).summary.needing1099, 0);
});

test("tinProblem catches the usual keying faults", () => {
  assert.equal(tinProblem(""), "missing");
  assert.match(tinProblem("12-345678"), /8 digits/);
  assert.match(tinProblem("111-11-1111"), /repeated/);
  assert.match(tinProblem("123-45-6789"), /sample/);
  assert.match(tinProblem("000-41-7706"), /area/);
  assert.match(tinProblem("666-41-7706"), /area/);
  assert.match(tinProblem("934-41-7706"), /area/);
  assert.match(tinProblem("412-00-7706"), /group/);
  assert.match(tinProblem("412-55-0000"), /serial/);
  assert.match(tinProblem("12-34567AB9"), /letters/);
  assert.equal(tinProblem("84-3456789"), null);
  assert.equal(tinProblem("412-55-1928"), null);
});

test("SSN-only rules are not applied to an EIN-shaped entry", () => {
  assert.equal(tinProblem("93-4417706"), null);
});

test("sample file is clean of errors and excludes card payments", () => {
  const r = analyze(sampleCsv());
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(titles(r).includes("Card payments excluded"));
  const hosting = r.vendors.find((v) => v.name === "Cloud Hosting Co");
  assert.equal(hosting.needs1099, false);
  assert.equal(r.summary.needing1099, 5);
});

test("broken sample surfaces missing TIN, short TIN, bad state, ZIP, duplicates and name conflicts", () => {
  const r = analyze(sampleBrokenCsv());
  const t = titles(r);
  for (const x of ["No TIN on a reportable vendor", "TIN does not look valid", "State is not a USPS code", "ZIP looks wrong", "Address is blank", "Vendor listed more than once", "One TIN, different names", "Possible corporation"]) assert.ok(t.includes(x), x);
});

test("duplicate vendor rows are added together before the threshold", () => {
  const csv = "name,tin,address,city,state,zip,amount\nA B,84-3456789,1 St,T,VT,05401,1200\nA B,84-3456789,1 St,T,VT,05401,900\n";
  const r = analyze(csv);
  assert.equal(r.vendors.length, 1);
  assert.equal(r.vendors[0].cents, 210000);
  assert.equal(r.summary.needing1099, 1);
});

test("missing TIN message quotes backup withholding at 24%", () => {
  const csv = "name,tin,address,city,state,zip,amount\nJo Q,,1 St,T,VT,05401,5000\n";
  const f = analyze(csv).findings.find((x) => x.title === "No TIN on a reportable vendor");
  assert.match(f.detail, /24%/);
  assert.match(f.detail, /\$1,200\.00/);
});

test("missing required columns is an error that stops analysis", () => {
  const r = analyze("foo,bar\n1,2\n");
  assert.ok(r.findings.some((f) => /No name column/.test(f.title)));
  assert.equal(r.vendors.length, 0);
});

test("header aliases are recognised", () => {
  const r = analyze("Payee,Tax ID,Street,City,ST,Postal Code,YTD Paid\nQ Z,84-3456789,1 St,T,VT,05401,3000\n");
  assert.equal(r.summary.needing1099, 1);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
});

test("outputs: ready CSV carries full TIN, findings CSV never does", () => {
  const r = analyze(sampleBrokenCsv());
  assert.match(readyCsv(analyze(sampleCsv())), /412551928/);
  const masked = maskedFindingsCsv(r);
  assert.doesNotMatch(masked, /412-?55-?1928|623-?41-?7706|123456789/);
  assert.equal(maskTin("412551928"), "***-**-1928");
});

test("findings never print a full TIN", () => {
  const r = analyze(sampleBrokenCsv());
  for (const f of r.findings) assert.doesNotMatch(f.detail + f.title, /\d{3}-\d{2}-\d{4}|\b\d{9}\b/);
});

test("card column: ACH and check count as direct payments, anything else as card", () => {
  const mk = (m) => `name,tin,address,city,state,zip,amount,method\nZed Q,84-3456789,1 St,T,VT,05401,5000,${m}\n`;
  assert.equal(analyze(mk("ACH")).summary.needing1099, 1);
  assert.equal(analyze(mk("Check")).summary.needing1099, 1);
  assert.equal(analyze(mk("Visa")).summary.needing1099, 0);
});
