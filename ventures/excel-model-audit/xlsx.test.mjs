import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { readWorkbook, zipEntries, colToNum, numToCol, decodeXml } from "./xlsx.mjs";
import { zipStore, crc32, buildXlsx } from "./xlsxwrite.mjs";

test("column letters convert both ways", () => {
  assert.equal(colToNum("A"), 1); assert.equal(colToNum("Z"), 26); assert.equal(colToNum("AA"), 27); assert.equal(colToNum("XFD"), 16384);
  for (const n of [1, 26, 27, 52, 702, 703, 16384]) assert.equal(colToNum(numToCol(n)), n);
});

test("CRC-32 matches the published check value", () => {
  // The standard check value: CRC-32 of the ASCII string "123456789" is 0xCBF43926.
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("XML entities and Excel's _xHHHH_ escapes decode", () => {
  assert.equal(decodeXml("A1&lt;&gt;B1&amp;&quot;x&quot;&#65;_x000D_"), 'A1<>B1&"x"A\r');
});

test("a deflated workbook with shared strings, shared formulas and prefixed tags reads", async () => {
  const wb = `<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="P&amp;L" sheetId="1" r:id="rId1"/><x:sheet name="Hid" sheetId="2" state="veryHidden" r:id="rId2"/></x:sheets><x:definedNames><x:definedName name="Rate">'P&amp;L'!$B$1</x:definedName></x:definedNames><x:calcPr iterate="1"/></x:workbook>`;
  const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/s1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/s2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const sst = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Rate</t></si><si><r><t>Rev</t></r><r><t xml:space="preserve">enue</t></r><rPh><t>ignored</t></rPh></si></sst>`;
  const s1 = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:cols><x:col min="4" max="5" hidden="1"/></x:cols><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1"><x:v>0.2</x:v></x:c></x:row><x:row r="2" hidden="1"><x:c r="A2" t="s"><x:v>1</x:v></x:c><x:c r="B2"><x:f t="shared" ref="B2:D2" si="0">A3*Rate</x:f><x:v>2</x:v></x:c><x:c r="C2"><x:f t="shared" si="0"/><x:v>4</x:v></x:c><x:c r="D2" t="e"><x:f t="shared" si="0"/><x:v>#VALUE!</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
  const s2 = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`;
  const files = [["[Content_Types].xml", "<Types/>"], ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`], ["xl/workbook.xml", wb], ["xl/_rels/workbook.xml.rels", rels], ["xl/sharedStrings.xml", sst], ["xl/worksheets/s1.xml", s1], ["xl/worksheets/s2.xml", s2]];
  // Re-pack every part deflated (method 8), as Excel writes them.
  const stored = zipStore(files);
  const entries = zipEntries(stored);
  assert.equal(entries.size, files.length);
  const deflated = deflatedZip(files);
  const book = await readWorkbook(deflated);
  assert.deepEqual(book.sheets.map((s) => [s.name, s.state]), [["P&L", "visible"], ["Hid", "veryHidden"]]);
  const cells = book.sheets[0].cells;
  const at = (r, c) => cells.get(r * 16384 + c);
  assert.equal(at(1, 1).v, "Rate");
  assert.equal(at(2, 1).v, "Revenue");
  assert.equal(at(2, 2).f, "A3*Rate");
  assert.equal(at(2, 3).sharedSi, "0");
  assert.equal(at(2, 4).kind, "error");
  assert.ok(book.sheets[0].hiddenRows.has(2));
  assert.deepEqual(book.sheets[0].hiddenCols, [[4, 5]]);
  assert.equal(book.iterate, true);
  assert.deepEqual(book.names.map((n) => [n.name, n.text]), [["Rate", "'P&L'!$B$1"]]);
});

test("an old .xls and a non-ZIP file are refused with a reason", async () => {
  const xls = new Uint8Array(600); xls.set([0xd0, 0xcf, 0x11, 0xe0]);
  await assert.rejects(readWorkbook(xls), /old binary \.xls/);
  await assert.rejects(readWorkbook(new TextEncoder().encode("a,b,c\n1,2,3\n")), /Not an \.xlsx file/);
});

test("the writer's workbooks read back cell for cell", async () => {
  const book = await readWorkbook(buildXlsx({ sheets: [{ name: "S", cells: { A1: 3, B1: "=A1*2", C1: "x<y", D1: { f: "1/0", e: "#DIV/0!" } } }] }));
  const at = (c) => book.sheets[0].cells.get(16384 + c);
  assert.equal(at(1).v, 3); assert.equal(at(2).f, "A1*2"); assert.equal(at(3).v, "x<y"); assert.equal(at(4).v, "#DIV/0!");
});

function deflatedZip(files) {
  const te = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const raw = te.encode(text), data = deflateRawSync(raw), nb = te.encode(name), crc = crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nb);
    offset += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, e]));
}
