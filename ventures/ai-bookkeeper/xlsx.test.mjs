import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { xlsxToCsv, xlsxToCsvSync, looksLikeXlsx, zipEntries } from "./xlsx.mjs";
import { readStatement } from "./bank.mjs";
import { statementTextFromFile } from "./ocr.mjs";

// A minimal zip writer (CRC left at 0: the reader does not check it).
function zip(files, { store = false } = {}) {
  const chunks = [], dir = [];
  let off = 0;
  const h = (n, fill) => { const b = Buffer.alloc(n); fill(b); return b; };
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = store ? raw : deflateRawSync(raw), nm = Buffer.from(name), method = store ? 0 : 8;
    const local = h(30, (b) => { b.writeUInt32LE(0x04034b50, 0); b.writeUInt16LE(method, 8); b.writeUInt32LE(data.length, 18); b.writeUInt32LE(raw.length, 22); b.writeUInt16LE(nm.length, 26); });
    chunks.push(local, nm, data);
    dir.push(h(46, (b) => { b.writeUInt32LE(0x02014b50, 0); b.writeUInt16LE(method, 10); b.writeUInt32LE(data.length, 20); b.writeUInt32LE(raw.length, 24); b.writeUInt16LE(nm.length, 28); b.writeUInt32LE(off, 42); }), nm);
    off += 30 + nm.length + data.length;
  }
  const d = Buffer.concat(dir);
  const end = h(22, (b) => { b.writeUInt32LE(0x06054b50, 0); b.writeUInt16LE(Object.keys(files).length, 10); b.writeUInt32LE(d.length, 12); b.writeUInt32LE(off, 16); });
  return new Uint8Array(Buffer.concat([...chunks, d, end]));
}
const book = (sheet, extra = {}) => zip({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": extra.wb ?? "<workbook/>", "xl/styles.xml": extra.styles ?? "<styleSheet/>", ...(extra.ss ? { "xl/sharedStrings.xml": extra.ss } : {}), "xl/worksheets/sheet1.xml": sheet }, extra);

const real = readFileSync(new URL("./fixtures/generic-statement.xlsx", import.meta.url));

test("a workbook written by openpyxl reads to CSV: busiest sheet, dates as ISO, quotes kept", async () => {
  assert.ok(looksLikeXlsx(real));
  const csv = await xlsxToCsv(real);
  assert.match(csv, /^Account statement,,,\n/);
  assert.match(csv, /2026-01-05,"ADOBE ""CREATIVE CLOUD"", monthly",-59.99,3397.76\n/);
  assert.doesNotMatch(csv, /nothing here/);
  assert.equal(xlsxToCsvSync(real), csv);
});

test("the statement reader finds the header under a preamble and chains the balances", async () => {
  const r = readStatement(await xlsxToCsv(real));
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows.map((x) => x.cents), [250000, -4235, -5999, -120000]);
  assert.equal(r.rows[0].date, "2026-01-02");
  assert.deepEqual(r.problems, []);
});

test("statementTextFromFile reads an .xlsx path, and a file with a wrong extension too", () => {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-"));
  const p = join(dir, "export.dat");
  writeFileSync(p, real);
  assert.match(statementTextFromFile(p), /^Account statement/);
  assert.equal(readStatement(statementTextFromFile(p)).rows.length, 4);
});

test("shared strings with entities and rich runs, inline strings, booleans, sparse columns", async () => {
  const ss = '<sst><si><t>Date</t></si><si><r><t>Pay</t></r><r><t xml:space="preserve">ee &amp; co</t></r></si><si><t>Amount</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2" t="inlineStr"><is><t>2026-02-01</t></is></c><c r="B2" t="s"><v>1</v></c><c r="C2"><v>-12.299999999999999</v></c></row></sheetData></worksheet>';
  assert.equal(await xlsxToCsv(book(sheet, { ss })), "Date,,Amount\n2026-02-01,Payee & co,-12.3\n");
});

test("custom date formats and the 1904 epoch", async () => {
  const styles = '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>46023</v></c><c r="B1" s="0"><v>46023</v></c></row></sheetData></worksheet>';
  assert.equal(await xlsxToCsv(book(sheet, { styles })), "2026-01-01,46023\n");
  const wb = '<workbook><workbookPr date1904="1"/></workbook>';
  assert.equal(await xlsxToCsv(book(sheet, { styles, wb })), "2030-01-02,46023\n");
});

test("stored (uncompressed) entries read, and non-workbooks are refused clearly", async () => {
  const sheet = '<worksheet><sheetData><row><c><v>5</v></c><c t="b"><v>1</v></c></row></sheetData></worksheet>';
  assert.equal(await xlsxToCsv(book(sheet, { store: true })), "5,TRUE\n");
  await assert.rejects(() => xlsxToCsv(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])), /not a zip/);
  await assert.rejects(() => xlsxToCsv(zip({ "a.txt": "hi" })), /not an Excel workbook/);
  assert.equal(zipEntries(zip({ "a.txt": "hi" })).size, 1);
});
