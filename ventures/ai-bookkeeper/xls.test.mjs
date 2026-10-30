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

// BIFF5 (Excel 5/95): LibreOffice 24.2 cannot write it, so this workbook is built here from the
// published record layouts ([MS-XLS] and the OpenOffice.org Excel file format notes): byte strings in
// code page 1252, LABEL cells, no shared string table, a date-formatted NUMBER, in an OLE2 "Book" stream.
function biff5Workbook() {
  const rec = (id, ...bytes) => [id & 255, id >> 8, bytes.length & 255, bytes.length >> 8, ...bytes];
  const le16 = (v) => [v & 255, v >> 8], dbl = (v) => [...new Uint8Array(new Float64Array([v]).buffer)];
  const label = (r, c, s) => rec(0x0204, ...le16(r), ...le16(c), ...le16(0), ...le16(s.length), ...[...s].map((ch) => ch.charCodeAt(0)));
  const number = (r, c, xf, v) => rec(0x0203, ...le16(r), ...le16(c), ...le16(xf), ...dbl(v));
  const bof = (type) => rec(0x0809, ...le16(0x500), ...le16(type), ...le16(0x1fe), ...le16(0x7cc));
  const xf = (fmt) => rec(0x00e0, ...le16(0), ...le16(fmt), 0, 0, 0, 0, 0, 0, 0, 0);
  const rows = [["Date", "Description", "Amount"], [46024, "Caf\xe9 Rivi\xe8re", 2500.5], [46025, "Rent", -1200]];
  const sheet = [...bof(0x10), ...label(0, 0, "Date"), ...label(0, 1, "Description"), ...label(0, 2, "Amount")];
  rows.slice(1).forEach(([d, s, a], i) => sheet.push(...number(i + 1, 0, 1, d), ...label(i + 1, 1, s), ...number(i + 1, 2, 0, a)));
  sheet.push(...rec(0x000a));
  const book = [...bof(0x05), ...rec(0x0042, ...le16(1252)), ...xf(0), ...xf(14), ...rec(0x000a), ...sheet];
  while (book.length < 4200) book.push(0); // past the 4096-byte cutoff: stored in regular sectors, as Excel does for real files
  const nData = Math.ceil(book.length / 512), out = new Uint8Array(512 * (3 + nData)), dv = new DataView(out.buffer);
  out.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  dv.setUint16(24, 0x3e, true); dv.setUint16(26, 3, true); dv.setUint16(28, 0xfffe, true); dv.setUint16(30, 9, true); dv.setUint16(32, 6, true);
  dv.setUint32(44, 1, true); dv.setUint32(48, 1, true); dv.setUint32(56, 4096, true); dv.setUint32(60, 0xfffffffe, true); dv.setUint32(68, 0xfffffffe, true);
  dv.setUint32(76, 0, true); for (let o = 80; o < 512; o += 4) dv.setUint32(o, 0xffffffff, true);
  const fat = 512; // sector 0: FAT; sector 1: directory; sectors 2..: the stream
  dv.setUint32(fat, 0xfffffffd, true); dv.setUint32(fat + 4, 0xfffffffe, true);
  for (let i = 0; i < nData; i++) dv.setUint32(fat + 8 + i * 4, i === nData - 1 ? 0xfffffffe : 3 + i, true);
  for (let o = fat + 8 + nData * 4; o < fat + 512; o += 4) dv.setUint32(o, 0xffffffff, true);
  const entry = (at, name, type, start, size) => {
    for (let i = 0; i < name.length; i++) dv.setUint16(at + i * 2, name.charCodeAt(i), true);
    dv.setUint16(at + 64, (name.length + 1) * 2, true); out[at + 66] = type; dv.setUint32(at + 116, start, true); dv.setUint32(at + 120, size, true);
  };
  entry(1024, "Root Entry", 5, 0xfffffffe, 0); entry(1152, "Book", 2, 2, book.length);
  out.set(book, 512 * 3);
  return out;
}

test("a BIFF5 (Excel 5/95) workbook reads: byte strings in the code page, date cells, no string table", () => {
  const csv = xlsToCsv(biff5Workbook());
  assert.equal(csv, "Date,Description,Amount\n2026-01-02,Café Rivière,2500.5\n2026-01-03,Rent,-1200\n");
});

test("an unknown BIFF version is still refused", () => {
  const b = biff5Workbook(); b[512 * 3 + 4] = 0x02; // BOF version 0x0200 (BIFF2-style)
  assert.throws(() => xlsToCsv(b), /BIFF5 and BIFF8/);
});

// Found by mutating the binary fixtures (2026-10-29): a directory entry whose name length was wild
// (or a header whose sector size was) made the reader build strings for seconds and allocate hundreds
// of megabytes before failing. Both now stop at once with a plain Error.
test("a damaged compound-file header or directory name length fails fast", () => {
  const fx = new Uint8Array(readFileSync(new URL("./fixtures/generic-statement.xls", import.meta.url)));
  const dv = (b) => new DataView(b.buffer);
  const wildNames = fx.slice();
  const dirAt = (dv(fx).getUint32(48, true) + 1) * 512;
  for (let o = dirAt; o + 128 <= fx.length && o < dirAt + 512; o += 128) dv(wildNames).setUint16(o + 64, 0xffff, true);
  const wildSector = fx.slice(); dv(wildSector).setUint16(30, 31, true);
  for (const bad of [wildNames, wildSector]) {
    const t0 = Date.now();
    assert.throws(() => xlsToCsv(bad), (e) => e.constructor === Error);
    assert.ok(Date.now() - t0 < 500);
  }
});
