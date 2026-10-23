import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { xlsToCsv, looksLikeXls, rkValue } from "./xls.mjs";
import { looksLikeXlsx } from "./xlsx.mjs";
import { readStatement } from "./bank.mjs";
import { statementTextFromFile } from "./ocr.mjs";

// Written by xlwt (BIFF8): 300 rows, so the shared string table runs over CONTINUE records.
const big = readFileSync(new URL("./fixtures/generic-statement.xls", import.meta.url));
// A few cells only: the workbook stream is small enough to live in the OLE mini stream.
const tiny = readFileSync(new URL("./fixtures/tiny-statement.xls", import.meta.url));

test("a 300-row xlwt workbook reads: busiest sheet, unicode text across CONTINUE, dates as ISO, balances chain", () => {
  assert.ok(looksLikeXls(big) && !looksLikeXlsx(big));
  const csv = xlsToCsv(big);
  assert.match(csv, /^Account statement,,,\nAccount,Café Müller Ltd,,\nDate,Description,Amount,Balance\n2026-01-03,Rent – January #4,2500,2500\n/);
  assert.match(csv, /Zażółć gęślą jaźń Sp\. z o\.o\. #\d+/);
  assert.doesNotMatch(csv, /nothing here/);
  const r = readStatement(csv);
  assert.equal(r.rows.length, 300);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rows[0].cents, 250000);
});

test("a small workbook from the mini stream: dates, negative decimals, booleans", () => {
  assert.equal(xlsToCsv(tiny), "Datum,Omschrijving,Bedrag\n2026-02-03,Koffie – Zürich,-4.5\n2026-02-04,Salaris,1200\nn/a,TRUE,\n");
});

test("RK numbers: integers, hundredths, doubles", () => {
  assert.equal(rkValue((5 << 2) | 2), 5);
  assert.equal(rkValue(((-7 << 2) | 2) >>> 0), -7);
  assert.equal(rkValue((12345 << 2) | 3), 123.45);
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, 1.5);
  assert.equal(rkValue(dv.getUint32(0)), 1.5);
});

test("statementTextFromFile reads an .xls by content, whatever the extension", () => {
  const p = join(mkdtempSync(join(tmpdir(), "xls-")), "export.dat");
  writeFileSync(p, big);
  assert.equal(readStatement(statementTextFromFile(p)).rows.length, 300);
});

test("refusals are named: not OLE, OLE without a workbook", () => {
  assert.throws(() => xlsToCsv(new Uint8Array(600)), /not an Excel 97-2003/);
  const broken = new Uint8Array(big); broken.fill(0, 512, 1024);
  assert.throws(() => xlsToCsv(broken));
});
