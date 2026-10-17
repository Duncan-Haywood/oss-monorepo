import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, splitInvoices, parseDate, detectOrder, cleanNumber, formatDate, sampleFile, sampleBrokenFile, findingsCsv, parseCsv, toCsv, decodeBuffer } from "./calc.mjs";

const HEAD = "*ContactName,*InvoiceNumber,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,Discount,*AccountCode,*TaxType,Currency";
const file = (...rows) => [HEAD, ...rows].join("\n") + "\n";
const titles = (r, sev) => r.findings.filter((f) => !sev || f.severity === sev).map((f) => f.title);
const has = (r, re) => r.findings.some((f) => re.test(f.title));

test("the clean sample has no errors or warnings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings.filter((f) => f.severity !== "info"), []);
  assert.equal(r.summary.invoices, 2);
  assert.equal(r.summary.lines, 3);
});

test("net per invoice applies quantity and discount", () => {
  const r = validate(sampleFile());
  const inv = r.summary.groups.find((g) => g.number === "INV-1001");
  assert.equal(inv.net, 450 + 3 * 120 * 0.9);
});

test("the broken sample surfaces the faults it is meant to", () => {
  const r = validate(sampleBrokenFile());
  for (const re of [/semicolon/, /Quantity "three"/, /scientific notation/, /Excel serial/, /Due date is before/, /looks like an account name/, /is a rate/, /stray space/, /Email/]) assert.ok(has(r, re), String(re));
});

test("missing required columns and unknown columns are errors", () => {
  const r = validate("*ContactName,*InvoiceNumbr,Foo\nA,1,2\n");
  assert.ok(has(r, /Unknown column "\*?InvoiceNumbr"/));
  assert.ok(r.findings.find((f) => /InvoiceNumbr/.test(f.title)).detail.includes("*InvoiceNumber"));
  assert.ok(has(r, /Required column "\*InvoiceDate" is missing/));
});

test("duplicate column", () => {
  assert.ok(has(validate(HEAD + ",Currency\n"), /appears twice/));
});

test("empty required cell on a later line of an invoice", () => {
  const r = validate(file("A,1,01/10/2026,31/10/2026,x,1,5,,200,Tax Exempt,", "A,1,01/10/2026,31/10/2026,,1,5,,,Tax Exempt,"));
  assert.deepEqual(titles(r, "error").sort(), ["AccountCode is empty", "Description is empty"]);
});

test("lines of one invoice must agree on contact and dates", () => {
  const r = validate(file("A,1,01/10/2026,31/10/2026,x,1,5,,200,T,", "B,1,02/10/2026,31/10/2026,y,1,5,,200,T,"));
  assert.ok(has(r, /ContactName differs/));
  assert.ok(has(r, /InvoiceDate differs/));
});

test("date order is detected and mixed order is an error", () => {
  assert.equal(detectOrder(["27/11/2026", "01/02/2026"]), "dmy");
  assert.equal(detectOrder(["11/27/2026"]), "mdy");
  assert.equal(detectOrder(["27/11/2026", "11/27/2026"]), "mixed");
  assert.equal(detectOrder(["03/04/2026"]), "unknown");
  assert.ok(has(validate(file("A,1,27/11/2026,11/27/2026,x,1,5,,200,T,")), /both day-first and month-first/));
});

test("an ambiguous file gets a note, not an error", () => {
  const r = validate(file("A,1,03/04/2026,05/04/2026,x,1,5,,200,T,"));
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.ok(has(r, /read either way/));
});

test("impossible and unreadable dates", () => {
  const r = validate(file("A,1,31/02/2026,tomorrow,x,1,5,,200,T,"));
  assert.ok(has(r, /not a real date/));
  assert.ok(has(r, /not a date I can read/));
});

test("parseDate handles ISO, names, serials and two-digit years", () => {
  assert.deepEqual(parseDate("2026-10-04").m, 10);
  assert.equal(parseDate("4 Oct 2026").d, 4);
  assert.equal(parseDate("04-Oct-26").y, 2026);
  assert.equal(parseDate("04-Oct-26").twoDigit, true);
  assert.deepEqual([parseDate("46300").y, parseDate("46300").m, parseDate("46300").d], [2026, 10, 5]);
  assert.equal(parseDate("hello"), null);
  assert.equal(parseDate("03/04/2026", "mdy").m, 3);
  assert.equal(parseDate("03/04/2026", "dmy").m, 4);
});

test("formatDate", () => {
  const d = { y: 2026, m: 3, d: 4 };
  assert.equal(formatDate(d, "DD/MM/YYYY"), "04/03/2026");
  assert.equal(formatDate(d, "MM/DD/YYYY"), "03/04/2026");
  assert.equal(formatDate(d, "YYYY-MM-DD"), "2026-03-04");
  assert.equal(formatDate(d, "D MMM YYYY"), "4 Mar 2026");
});

test("cleanNumber only accepts one reasonable reading", () => {
  assert.equal(cleanNumber("$1,299.00").value, "1299.00");
  assert.equal(cleanNumber("12,50").value, "12.50");
  assert.equal(cleanNumber("1.299,50").value, "1299.50");
  assert.equal(cleanNumber("(45.00)").value, "-45.00");
  assert.equal(cleanNumber("45.00-").value, "-45.00");
  assert.equal(cleanNumber("1 299.00").value, "1299.00");
  assert.equal(cleanNumber("100").changed, false);
  assert.equal(cleanNumber("abc").ok, false);
  assert.equal(cleanNumber("").empty, true);
});

test("a comma plus three digits is flagged and never rewritten", () => {
  const input = file("A,1,01/10/2026,31/10/2026,x,1,\"1,234\",,200,T,");
  assert.ok(has(validate(input), /could be 1\.234 or 1234/));
  assert.equal(parseCsv(repair(input).text).rows[1].cells[6], "1,234");
});

test("discount range and fraction hint", () => {
  const r = validate(file("A,1,01/10/2026,31/10/2026,x,1,5,150,200,T,", "A,1,01/10/2026,31/10/2026,y,1,5,0.15,200,T,", "A,1,01/10/2026,31/10/2026,z,1,5,abc,200,T,"));
  assert.ok(has(r, /above 100/));
  assert.ok(has(r, /may be a fraction/));
  assert.ok(has(r, /not a percentage/));
});

test("account code: decimal from Excel, name instead of code", () => {
  const r = validate(file("A,1,01/10/2026,31/10/2026,x,1,5,,200.0,T,", "A,2,01/10/2026,31/10/2026,x,1,5,,Sales Revenue,T,"));
  assert.ok(has(r, /AccountCode "200\.0" has a decimal/));
  assert.ok(has(r, /looks like an account name/));
});

test("invoice numbers differing only by case, and contacts spelled two ways", () => {
  const r = validate(file("Acme Ltd,inv-1,01/10/2026,31/10/2026,x,1,5,,200,T,", "ACME Ltd,INV-1,01/10/2026,31/10/2026,x,1,5,,200,T,"));
  assert.ok(has(r, /differ only by case/));
  assert.ok(has(r, /Contact spelled 2 ways/));
});

test("more than 500 lines warns and split keeps invoices whole", () => {
  const rows = [];
  for (let i = 1; i <= 260; i++) for (let l = 0; l < 3; l++) rows.push(`A,INV-${i},01/10/2026,31/10/2026,line ${l},1,5,,200,T,`);
  const input = file(...rows);
  assert.ok(has(validate(input), /780 lines is more than 500/));
  const { parts, error } = splitInvoices(input, 500);
  assert.equal(error, "");
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.lines <= 500));
  assert.equal(parts[0].lines % 3, 0);
  assert.equal(parts[0].invoices + parts[1].invoices, 260);
  assert.equal(parts[0].lines + parts[1].lines, 780);
  assert.ok(parts[0].text.startsWith("*ContactName"));
});

test("split reports an invoice larger than the limit", () => {
  const rows = Array.from({ length: 6 }, (_, i) => `A,BIG,01/10/2026,31/10/2026,l${i},1,5,,200,T,`);
  assert.match(splitInvoices(file(...rows), 5).error, /BIG/);
});

test("repair: a clean file changes nothing", () => {
  assert.deepEqual(repair(sampleFile()).changes, []);
});

test("repair fixes the mechanical faults and leaves words and digits alone", () => {
  const out = repair(sampleBrokenFile(), { dateFormat: "DD/MM/YYYY" });
  const rows = parseCsv(out.text).rows.map((r) => r.cells);
  assert.equal(rows[0][0], "*ContactName");
  assert.equal(rows[1][7], "1450.00");
  assert.equal(rows[1][9], "200");
  assert.equal(rows[1][11], "GBP");
  assert.equal(rows[1][3], "01/10/2026");
  assert.equal(rows[2][0], "Harbour Coffee Roasters");
  // Untouched: wrong text quantity, account name, tax type, unreadable number, scientific invoice number.
  assert.equal(rows[2][6], "three");
  assert.equal(rows[3][9], "Sales");
  assert.equal(rows[3][10], "20%");
  assert.equal(rows[4][2], "1.00E+12");
  assert.ok(out.changes.some((c) => /moved together/.test(c)));
  assert.ok(out.changes.some((c) => /Separator/.test(c)));
});

test("repair converts an Excel serial date even with no target format, and respects ambiguity", () => {
  const out = repair(file("A,1,46300,03/04/2026,x,1,5,,200,T,"));
  const cells = parseCsv(out.text).rows[1].cells;
  assert.equal(cells[2], "05/10/2026");
  assert.equal(cells[3], "03/04/2026");
  const forced = repair(file("A,1,03/04/2026,05/04/2026,x,1,5,,200,T,"), { dateFormat: "YYYY-MM-DD" });
  assert.equal(parseCsv(forced.text).rows[1].cells[2], "03/04/2026");
  const told = repair(file("A,1,03/04/2026,05/04/2026,x,1,5,,200,T,"), { dateFormat: "YYYY-MM-DD", sourceOrder: "mdy" });
  assert.equal(parseCsv(told.text).rows[1].cells[2], "2026-03-04");
});

test("repair never changes a description", () => {
  const input = file("A,1,01/10/2026,31/10/2026,\"  padded, with comma \",1,5,,200,T,");
  assert.equal(parseCsv(repair(input).text).rows[1].cells[4], "  padded, with comma ");
});

test("round trip: repaired broken sample has fewer warnings", () => {
  const before = validate(sampleBrokenFile()).findings.filter((f) => f.severity !== "info").length;
  const after = validate(repair(sampleBrokenFile(), { dateFormat: "DD/MM/YYYY" }).text).findings.filter((f) => f.severity !== "info").length;
  assert.ok(after < before, `${after} < ${before}`);
});

test("unterminated quote and empty file", () => {
  assert.ok(has(validate("*ContactName\n\"open"), /never closed/));
  assert.ok(repair("*ContactName\n\"open").error);
  assert.ok(has(validate("   "), /empty/));
});

test("spreadsheet error values and wrong cell count", () => {
  const r = validate(file("A,1,01/10/2026,31/10/2026,x,#REF!,5,,200,T,", "A,1,01/10/2026,31/10/2026,x,1,5"));
  assert.ok(has(r, /Spreadsheet error/));
  assert.ok(has(r, /cells, the header has/));
});

test("BOM and utf-8 decoding", () => {
  const buf = new TextEncoder().encode("﻿" + sampleFile());
  assert.equal(validate(decodeBuffer(buf)).findings.filter((f) => f.severity !== "info").length, 0);
});

test("findingsCsv round-trips", () => {
  const out = findingsCsv(validate(sampleBrokenFile()));
  assert.equal(parseCsv(out).rows[0].cells[0], "severity");
  assert.equal(toCsv([["a,b", "c"]]), "\"a,b\",c\r\n");
});
