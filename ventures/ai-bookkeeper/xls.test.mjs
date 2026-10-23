import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { xlsToCsv, looksLikeXls, oleStream } from "./xls.mjs";
import { xlsxToCsvSync } from "./xlsx.mjs";
import { readStatement } from "./bank.mjs";
import { statementTextFromFile } from "./ocr.mjs";

// Both files were written by LibreOffice 24.2 ("MS Excel 97" filter): the first is
// fixtures/generic-statement.xlsx converted (date-formatted cells, a preamble row),
// the second a 300-row CSV whose string table outgrows one BIFF record.
const rd = (n) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const small = rd("generic-statement.xls"), long = rd("long-statement.xls");

test("an .xls written by LibreOffice reads to the same CSV as its .xlsx original", () => {
  assert.ok(looksLikeXls(small));
  assert.equal(xlsToCsv(small), xlsxToCsvSync(rd("generic-statement.xlsx")));
});

test("the statement reader takes it from there: header under a preamble, balances chain", () => {
  const r = readStatement(xlsToCsv(small));
  assert.deepEqual(r.rows.map((x) => x.cents), [250000, -4235, -5999, -120000]);
  assert.equal(r.rows[0].date, "2026-01-02");
  assert.deepEqual(r.problems, []);
});

test("a long sheet: string table split over CONTINUE records, big (non-mini) stream", () => {
  assert.ok(oleStream(long).length > 4096);
  const csv = xlsToCsv(long);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines.length, 301);
  assert.equal(lines[1], "2026-03-01,Payee é0 long description text number 0,487.66,1487.66");
  assert.equal(lines[300], "2026-03-20,Payee é299 long description text number 299,-74.04,229.02");
  const r = readStatement(csv);
  assert.equal(r.rows.length, 300);
});

test("statementTextFromFile reads an .xls path, whatever its extension", () => {
  const p = join(mkdtempSync(join(tmpdir(), "xls-")), "export.dat");
  writeFileSync(p, small);
  assert.match(statementTextFromFile(p), /^Account statement/);
});

test("non-workbooks are refused clearly", () => {
  assert.throws(() => oleStream(new Uint8Array(600)), /not an Excel/);
  const head = small.slice(0, 512); // header only: directory sector missing
  assert.throws(() => xlsToCsv(head));
});
