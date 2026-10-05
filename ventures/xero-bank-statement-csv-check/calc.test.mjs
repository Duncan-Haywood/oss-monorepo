import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, parseCsv, parseDate, dateOrder, normalizeAmount, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer, detectDelimiter } from "./calc.mjs";

const NOW = { now: new Date("2024-06-01T00:00:00Z") };
const titles = (r) => r.findings.map((f) => f.title);

test("the clean sample has no errors or warnings and proves day/month order", () => {
  const r = validate(sampleFile(), NOW);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
  assert.equal(r.summary.transactions, 3);
  assert.ok(titles(r).includes("Dates are DD/MM/YYYY"));
});

test("the broken sample reports each planted fault", () => {
  const r = validate(sampleBrokenFile(), NOW);
  const t = titles(r);
  assert.ok(t.includes("3 rows above the header"));
  assert.ok(t.includes("Money in and money out are in separate columns"));
  assert.ok(t.includes("Dates mix day-first and month-first"));
  assert.ok(t.some((x) => x.startsWith("Looks like a repeat")));
  assert.equal(r.findings.find((f) => f.title === "Row has no amount").line, 10);
  assert.equal(r.summary.delimiter, ";");
});

test("the delimiter comes from the header, not from a title line above it", () => {
  assert.equal(detectDelimiter("Account: 1\nDate;Amount\n"), ",");
  const r = validate("Account: 1, 2, 3\nDate;Amount;Payee\n05/01/2024;-5.00;Cafe\n", NOW);
  assert.equal(r.summary.delimiter, ";");
  assert.equal(r.summary.transactions, 1);
});

test("a file with no date/amount header is rejected, not guessed", () => {
  const r = validate("a,b,c\n1,2,3\n", NOW);
  assert.equal(r.summary.errors, 1);
  assert.match(r.findings[0].title, /No header row/);
});

test("date order is proven only by dates that can be read one way", () => {
  const d = (s) => parseDate(s);
  assert.equal(dateOrder([d("13/01/2024"), d("02/03/2024")]).order, "dmy");
  assert.equal(dateOrder([d("01/13/2024")]).order, "mdy");
  assert.equal(dateOrder([d("03/04/2024")]).order, "unknown");
  assert.equal(dateOrder([d("13/01/2024"), d("01/13/2024")]).order, "mixed");
  assert.equal(dateOrder([d("2024-03-04"), d("5 Jan 2024")]).order, "unknown");
});

test("all-ambiguous dates warn instead of guessing", () => {
  const r = validate("Date,Amount\n03/04/2024,-1\n", NOW);
  assert.ok(titles(r).includes("Date order cannot be told from the file"));
});

test("date formats: slash, dot, ISO, text month", () => {
  assert.deepEqual(parseDate("31.12.2024"), { a: 31, b: 12, y: 2024, kind: "num", twoDigit: false });
  assert.deepEqual(parseDate("2024-12-31"), { a: 12, b: 31, y: 2024, kind: "iso", twoDigit: false });
  assert.deepEqual(parseDate("5 Jan 2024"), { a: 5, b: 1, y: 2024, kind: "text", twoDigit: false });
  assert.equal(parseDate("5/1/99").y, 1999);
  assert.equal(parseDate("Jan 5"), null);
});

test("amount normalisation never guesses", () => {
  assert.equal(normalizeAmount("-42,10").fixed, "-42.10");
  assert.equal(normalizeAmount("(18.00)").fixed, "-18.00");
  assert.equal(normalizeAmount("1,234.50").fixed, "1234.50");
  assert.equal(normalizeAmount("1.234,56").fixed, "1234.56");
  assert.equal(normalizeAmount("$12.50").fixed, "12.50");
  assert.equal(normalizeAmount("12.50 DR").fixed, "-12.50");
  assert.equal(normalizeAmount("12,5,0"), null);
  assert.equal(normalizeAmount("-5.00").fixed, null);
});

test("debit and credit columns are merged with money out negative", () => {
  const f = "Date,Description,Debit,Credit\n05/01/2024,Cafe,5.00,\n06/01/2024,Refund,,25.50\n";
  const r = repair(f);
  assert.deepEqual(r.text.trim().split("\r\n"), ["*Date,*Amount,Description", "05/01/2024,-5.00,Cafe", "06/01/2024,25.50,Refund"]);
  assert.ok(r.changes.some((c) => c.startsWith("Merged Debit and Credit")));
});

test("repair drops rows above the header, blanks and unknown columns, and renames to Xero's names", () => {
  const r = repair("Title\nDate,Amount,Narrative,Balance\n\n05/01/2024,-5,Cafe,10\n");
  assert.equal(r.text, "*Date,*Amount,Description\r\n05/01/2024,-5,Cafe\r\n");
  assert.equal(r.changes.length, 4);
});

test("dates are rewritten only in a proven or confirmed order", () => {
  const f = "Date,Amount\n13/01/2024,-1\n05/02/2024,-2\n";
  assert.match(repair(f, { dateFormat: "YYYY-MM-DD" }).text, /2024-01-13,-1\r\n2024-02-05,-2/);
  const amb = "Date,Amount\n03/04/2024,-1\n";
  assert.match(repair(amb, { dateFormat: "YYYY-MM-DD" }).text, /03\/04\/2024/);
  assert.match(repair(amb, { dateFormat: "YYYY-MM-DD", order: "dmy" }).text, /2024-04-03/);
  const mixed = "Date,Amount\n13/01/2024,-1\n01/13/2024,-2\n";
  assert.match(repair(mixed, { dateFormat: "YYYY-MM-DD" }).text, /13\/01\/2024/);
});

test("scientific notation, Excel errors and ragged rows are flagged", () => {
  const r = validate("Date,Amount,Reference\n05/01/2024,-5,1.2345E+11\n06/01/2024,-5,#REF!\n07/01/2024,-5\n", NOW);
  const t = titles(r);
  assert.ok(t.includes("Number in scientific notation"));
  assert.ok(t.includes("Excel error value in a cell"));
  assert.ok(t.includes("Row has a different number of cells than the header"));
});

test("an unclosed quote is an error with its line", () => {
  const r = validate('Date,Amount,Payee\n05/01/2024,-5,"Cafe\n06/01/2024,-6,X\n', NOW);
  assert.equal(r.findings.find((f) => f.title.startsWith("A quoted field")).line, 2);
});

test("quoted fields keep commas and track physical lines", () => {
  const p = parseCsv('a,b\n"x, y","l1\nl2"\nz,w\n');
  assert.equal(p.rows[1].cells[0], "x, y");
  assert.equal(p.rows[2].line, 4);
});

test("future dates and impossible dates", () => {
  const r = validate("Date,Amount\n31/02/2024,-1\n01/12/2030,-1\n", NOW);
  const t = titles(r);
  assert.ok(t.includes("Impossible date"));
  assert.ok(t.includes("1 date in the future"));
});

test("findings CSV quotes fields", () => {
  const out = findingsCsv({ findings: [{ severity: "error", line: 2, title: 'a "b"', detail: "c, d", fixable: true }] });
  assert.match(out, /"a ""b""","c, d",yes/);
});

test("decodeBuffer handles UTF-8 BOM, UTF-16 and Windows-1252", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), "A");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), "A");
  assert.equal(decodeBuffer(new Uint8Array([0x43, 0x61, 0x66, 0xe9])), "Café");
});
