import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseQif, dateOrder, qifDateParts, normalizeAmount, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const NOW = { now: new Date("2024-06-01T00:00:00Z") };
const titles = (r) => r.findings.map((f) => f.title);

test("the clean sample has no errors or warnings and proves month/day order", () => {
  const r = validate(sampleFile(), NOW);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.transactions, 3);
  assert.deepEqual(r.summary.types, ["Bank"]);
  assert.ok(titles(r).includes("Dates are month/day/year"));
});

test("the broken sample reports each planted fault with a line number", () => {
  const r = validate(sampleBrokenFile(), NOW);
  const by = (t) => r.findings.find((f) => f.title.startsWith(t));
  assert.equal(by("No !Type").line, 1);
  assert.equal(by("Dates mix").severity, "error");
  assert.equal(by("Amount not readable").line, 26);
  assert.equal(by("Last record has no closing").line, 29);
  assert.equal(r.findings.filter((f) => f.title.startsWith("Split amounts")).length, 2);
  assert.ok(by("Looks like a repeat"));
});

test("date order is proven only by dates that can be read one way", () => {
  const rec = (d) => ({ fields: { D: d } });
  assert.equal(dateOrder([rec("13/01/2024"), rec("02/03/2024")]).order, "dmy");
  assert.equal(dateOrder([rec("01/13/2024")]).order, "mdy");
  assert.equal(dateOrder([rec("03/04/2024")]).order, "unknown");
  assert.equal(dateOrder([rec("13/01/2024"), rec("01/13/2024")]).order, "mixed");
});

test("all-ambiguous dates warn instead of guessing", () => {
  const r = validate("!Type:Bank\nD03/04/2024\nT-1\nPA\n^\n", NOW);
  assert.ok(titles(r).includes("Date order cannot be told from the file"));
});

test("date formats: slashes, dots, apostrophe years", () => {
  assert.deepEqual(qifDateParts("31.12.2024"), { a: 31, b: 12, y: 2024, twoDigit: false });
  assert.equal(qifDateParts("1/ 5'24").y, 2024);
  assert.equal(qifDateParts("1/5/99").y, 1999);
  assert.equal(qifDateParts("2024-01-05"), null);
});

test("amount normalisation never guesses", () => {
  assert.equal(normalizeAmount("-42,10").fixed, "-42.10");
  assert.equal(normalizeAmount("(18.00)").fixed, "-18.00");
  assert.equal(normalizeAmount("1,234.50").fixed, "1234.50");
  assert.equal(normalizeAmount("1.234,56").fixed, "1234.56");
  assert.equal(normalizeAmount("12,5,0"), null);
});

test("US thousands commas are legal QIF and are not flagged or rewritten", () => {
  const q = "!Type:Bank\nD01/13/2024\nT1,200.00\nPA\n^\n";
  assert.ok(!titles(validate(q, NOW)).includes("Amount is not a plain decimal"));
  assert.ok(!repair(q).changes.length);
});

test("an OFX file is sent to the OFX tool, not misread", () => {
  const r = validate("OFXHEADER:100\n<OFX>\n</OFX>", NOW);
  assert.match(r.findings[0].title, /OFX/);
  assert.equal(r.summary.errors, 1);
  assert.equal(repair("<OFX></OFX>").changes.length, 0);
});

test("splits that add up are fine; splits that do not are an error", () => {
  const ok = "!Type:Bank\nD01/13/2024\nT-100.00\nPA\nSX\n$-60.00\nSY\n$-40.00\n^\n";
  assert.ok(!titles(validate(ok, NOW)).some((t) => /Split/.test(t)));
  const bad = ok.replace("$-40.00", "$-30.00");
  assert.ok(titles(validate(bad, NOW)).includes("Split amounts do not add up to the total"));
});

test("repair adds the closing ^, fixes amounts, and leaves unprovable things named", () => {
  const r = repair(sampleBrokenFile(), { assumeType: "Bank" });
  const after = validate(r.text, NOW);
  assert.ok(!titles(after).includes("Last record has no closing ^"));
  assert.ok(!titles(after).includes("No !Type: header"));
  assert.ok(!titles(after).includes("Amount is not a plain decimal"));
  assert.ok(titles(after).includes("Amount not readable"), "a garbage amount is not guessed");
  assert.ok(titles(after).includes("Dates mix day-first and month-first"), "mixed dates are not resolved");
});

test("repair does not add a !Type header unless asked", () => {
  assert.ok(!repair("D01/13/2024\nT-1\nPA\n^\n").text.startsWith("!Type"));
});

test("convertDates rewrites to a four-digit year only when the order is proven or chosen", () => {
  const q = "!Type:Bank\nD13/01/24\nT-1\nPA\n^\nD02/03/24\nT-2\nPB\n^\n";
  const r = repair(q, { convertDates: "mdy" });
  assert.match(r.text, /D01\/13\/2024/);
  assert.match(r.text, /D03\/02\/2024/);
  const amb = "!Type:Bank\nD03/04/24\nT-1\nPA\n^\n";
  assert.equal(repair(amb, { convertDates: "mdy" }).text, amb, "unprovable order is left alone");
  assert.match(repair(amb, { convertDates: "dmy", order: "mdy" }).text, /D04\/03\/2024/);
  const mixed = "!Type:Bank\nD13/01/2024\nT-1\nPA\n^\nD01/13/2024\nT-1\nPA\n^\n";
  assert.equal(repair(mixed, { convertDates: "mdy", order: "mdy" }).text, mixed);
});

test("repair keeps CRLF and is idempotent on a clean file", () => {
  const crlf = sampleBrokenFile().replace(/\n/g, "\r\n");
  assert.ok(!/[^\r]\n/.test(repair(crlf, { assumeType: "Bank" }).text));
  assert.equal(repair(sampleFile()).text, sampleFile());
  assert.deepEqual(repair(sampleFile()).changes, []);
});

test("a final record with no ^ is still counted", () => {
  assert.equal(parseQif("!Type:Bank\nD1/2/2024\nT-5\nPA").records.length, 1);
});

test("findings export as CSV with quoting", () => {
  const csv = findingsCsv(validate(sampleBrokenFile(), NOW));
  assert.match(csv, /^severity,line,problem,detail,auto_fixable\r\n/);
  assert.match(csv, /"No !Type: header"/);
});

test("Windows-1252 bytes decode instead of becoming replacement characters", () => {
  assert.equal(decodeBuffer(new Uint8Array([0x43, 0x61, 0x66, 0xe9]).buffer), "Café");
});
