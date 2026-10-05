import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDigitOk, computeCheck, classify, validate, repair, parseTable, isbn10Ok, isbn10To13, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

test("check digit: known real codes validate and a changed digit does not", () => {
  for (const g of ["036000291452", "4006381333931", "9780306406157", "96385074", "00012345678905"]) assert.ok(checkDigitOk(g), g);
  assert.ok(!checkDigitOk("036000291453"));
  assert.equal(computeCheck("03600029145"), 2);
});

test("zero padding never changes validity", () => {
  assert.ok(checkDigitOk("0" + "036000291452"));
  assert.ok(checkDigitOk("00" + "036000291452"));
});

test("ISBN-10 validates and converts to ISBN-13", () => {
  assert.ok(isbn10Ok("0306406152"));
  assert.ok(!isbn10Ok("0306406153"));
  assert.equal(isbn10To13("0306406152"), "9780306406157");
});

test("leading zeros lost by a spreadsheet are restored only when the check digit agrees", () => {
  assert.deepEqual(classify("12345678905").value, "012345678905");
  assert.equal(classify("12345678906").kind, "bad");
  assert.equal(classify("36000291452").value, "036000291452");
});

test("Excel scientific notation: recoverable only when digits survive", () => {
  assert.equal(classify("3.60003E+11").kind, "sci-lost");
  assert.equal(classify("4.006381333931E+12").value, "4006381333931");
  assert.equal(classify("8.90E+11").kind, "sci-lost");
});

test("trailing .0, spaces, hyphens, apostrophes and equals-quote wrappers are cleaned", () => {
  assert.equal(classify("4006381333931.0").value, "4006381333931");
  assert.equal(classify("4006 3813 33931").value, "4006381333931");
  assert.equal(classify("0-36000-29145-2").value, "036000291452");
  assert.equal(classify("'036000291452").value, "036000291452");
  assert.equal(classify('="036000291452"').value, "036000291452");
});

test("letters and over-long numbers are errors", () => {
  assert.equal(classify("ABC123").kind, "bad");
  assert.equal(classify("123456789012345").why, "too long");
});

test("column choice prefers a barcode-named header, else the most numeric column", () => {
  const a = validate("name,UPC Code,price\nx,036000291452,3\n");
  assert.equal(a.column, 1);
  const b = validate("name,price,thing\nx,3,036000291452\ny,4,4006381333931\n");
  assert.equal(b.column, 2);
  const c = validate("036000291452\n4006381333931\n");
  assert.equal(c.hasHeader, false);
  assert.equal(c.summary.valid, 2);
});

test("duplicates, restricted prefixes, placeholders and blanks are reported with line numbers", () => {
  const r = validate("gtin\n036000291452\n036000291452\n2000000000008\n000000000000\n\n4006381333931\n");
  const titles = r.findings.map((f) => `${f.line}:${f.title}`);
  assert.ok(titles.some((t) => t.startsWith("3:Duplicate")));
  assert.ok(titles.some((t) => t.startsWith("4:Restricted prefix")));
  assert.ok(titles.some((t) => t.startsWith("5:All zeros")));
  assert.equal(r.summary.errors, 1);
});

test("a 12-digit UPC and its EAN-13 form count as duplicates", () => {
  const r = validate("gtin\n036000291452\n0036000291452\n");
  assert.ok(r.findings.some((f) => f.title === "Duplicate code"));
});

test("a single adjacent transposition is suggested, never applied", () => {
  const r = validate("gtin\n036000291425\n");
  const f = r.findings.find((x) => x.title === "Check digit does not match");
  assert.match(f.detail, /adjacent swaps would validate/);
  const one = validate("gtin\n4006381333913\n").findings[0];
  assert.match(one.detail, /4006381333931/);
  assert.match(repair("gtin\n036000291425\n").text, /036000291425/);
});

test("repair rewrites only fixable cells in the chosen column and leaves the rest alone", () => {
  const { text, changes } = repair(sampleBrokenFile());
  assert.equal(changes.length, 2);
  assert.match(text, /B-1,Steel water bottle,012345678905/);
  assert.match(text, /B-3,Cotton tote,3\.60003E\+11/);
  assert.match(text, /B-4,Notebook,9780306406157/);
});

test("excel-safe output wraps codes so a spreadsheet keeps the zeros", () => {
  const { text } = repair("gtin\n12345678905\n", { excelSafe: true });
  assert.match(text, /=""012345678905""/);
});

test("quoted cells, tabs and semicolons parse", () => {
  assert.equal(parseTable('a;b\n"x;y";3\n').delim, ";");
  assert.equal(parseTable('a\tb\n1\t2\n').rows.length, 2);
  assert.equal(parseTable('a,b\n"x ""q"" y",3\n').rows[1].cells[0], 'x "q" y');
});

test("samples behave as described", () => {
  assert.equal(validate(sampleFile()).summary.errors, 0);
  const s = validate(sampleBrokenFile()).summary;
  assert.ok(s.errors >= 3 && s.fixable === 2);
});

test("findings CSV quotes and decodes UTF-16 files", () => {
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,title,detail/);
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."gtin\n"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "gtin\n");
});

test("20,000 rows validate quickly", () => {
  const rows = ["gtin"];
  for (let i = 0; i < 20000; i++) { const b = String(100000000000 + i).padStart(11, "0"); rows.push(b + computeCheck(b)); }
  const t = Date.now();
  const r = validate(rows.join("\n"));
  assert.equal(r.summary.errors, 0);
  assert.ok(Date.now() - t < 3000);
});
