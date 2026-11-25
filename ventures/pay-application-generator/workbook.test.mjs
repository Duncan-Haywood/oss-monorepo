import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, sampleList, SAMPLE_SETTINGS } from "./calc.mjs";
import { workbookModel, workbookXlsx, crc32, FIRST_LINE_ROW, SPARE_ROWS, TEMPLATE_ROWS, CONT } from "./workbook.mjs";

// Read a stored zip back: local headers in order, checking each CRC.
function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nlen));
    const data = bytes.subarray(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size);
    assert.equal(method, 0, `${name} is stored`);
    assert.equal(crc32(data), crc, `${name} CRC`);
    out[name] = new TextDecoder().decode(data);
    p += 30 + nlen + xlen + size;
  }
  return out;
}

const cell = (xml, ref) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
const sample = () => { const s = { ...SAMPLE_SETTINGS }; return { r: compute(sampleList(), s), s }; };

test("crc32 matches the published check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("the filled workbook is a valid package with two sheets and recalculates on open", () => {
  const { r, s } = sample();
  const files = unzip(workbookXlsx(r, s));
  for (const f of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) assert.ok(files[f], f);
  assert.match(files["xl/workbook.xml"], /<sheet name="Application"/);
  assert.match(files["xl/workbook.xml"], new RegExp(`<sheet name="${CONT}"`));
  assert.match(files["xl/workbook.xml"], /fullCalcOnLoad="1"/);
  assert.match(files["xl/workbook.xml"], /_xlnm\.Print_Titles/);
});

test("summary formulas point at the continuation sheet and their cached values are compute()'s figures", () => {
  const { r, s } = sample();
  const m = workbookModel(r, s);
  const last = FIRST_LINE_ROW + r.lines.length + SPARE_ROWS - 1;
  assert.equal(m.lastLineRow, last);
  assert.equal(m.totalRow, last + 1);
  const app = unzip(workbookXlsx(r, s))["xl/worksheets/sheet1.xml"];
  const want = { C8: "original", C9: "changes", C10: "contractToDate", C11: "completed", C12: "retainage", C13: "earnedLess", C14: "previous", C15: "due", C16: "balanceToFinish" };
  for (const [ref, k] of Object.entries(want)) assert.match(cell(app, ref)[1], new RegExp(`<v>${r.summary[k] / 100}</v>`), `${ref} ${k}`);
  assert.match(cell(app, "C8")[1], new RegExp(`SUMIF\\('${CONT}'!\\$C\\$${FIRST_LINE_ROW}:\\$C\\$${last},&quot;&lt;&gt;CO&quot;`));
  assert.match(cell(app, "C15")[1], /<f>C13-C14<\/f>/);
  assert.doesNotMatch(cell(app, "C14")[1], /<f>/, "previous certificates is an input");
});

test("each line's retainage formula uses the line's own rate or the sheet's rates, and caches compute()'s cents", () => {
  const text = "Item,Description,Scheduled value,Previous,This period,Stored,Retainage\n1,A,1000,0,333.33,0,7.5\n2,B,5000,1000,0,2000,";
  const s = { retainagePct: "10", storedRetainagePct: "5" };
  const r = compute(text, s);
  const m = workbookModel(r, s);
  const rows = m.sheets[1].rows;
  assert.equal(rows[5][1].v, 0.1);
  assert.equal(rows[6][1].v, 0.05);
  const l1 = rows[FIRST_LINE_ROW - 1], l2 = rows[FIRST_LINE_ROW];
  assert.equal(l1[10].v, 0.075);
  assert.equal(l1[11].v, 25);
  assert.equal(l2[11].v, 200);
  assert.match(l1[11].f, /ROUND\(\(E11\+F11\)\*IF\(K11="",\$B\$6,K11\),2\)\+ROUND\(G11\*IF\(K11="",\$B\$7,K11\),2\)/);
});

test("a reduced work rate is written as the sheet's work rate; stored keeps the base rate", () => {
  const s = { ...SAMPLE_SETTINGS, reduceAtPct: "20", reducedPct: "5" };
  const r = compute(sampleList(), s);
  assert.equal(r.summary.reduced, true);
  const rows = workbookModel(r, s).sheets[1].rows;
  assert.equal(rows[5][1].v, 0.05);
  assert.equal(rows[6][1].v, 0.1);
  assert.match(rows[5][2].v, /Reduced rate/);
});

test("change orders carry CO in the type column so the SUMIF split matches compute()", () => {
  const { r, s } = sample();
  const rows = workbookModel(r, s).sheets[1].rows;
  const co = r.lines.map((l, i) => [l.isCo, rows[FIRST_LINE_ROW - 1 + i][2]]);
  for (const [isCo, type] of co) assert.equal(type, isCo ? "CO" : null);
});

test("typed text stays text: a description starting with = is an inline string, and XML-illegal characters are dropped", () => {
  const text = "Item,Description,Scheduled value,Previous,This period,Stored\n1,=HYPERLINK(http://x) <b>&\u0007,100,0,10,0";
  const r = compute(text, {});
  const sheet = unzip(workbookXlsx(r, { project: "A & B <c>" }))["xl/worksheets/sheet2.xml"];
  const b = cell(sheet, `B${FIRST_LINE_ROW}`)[0];
  assert.match(b, /t="inlineStr"/);
  assert.doesNotMatch(b, /<f>/);
  assert.match(b, />=HYPERLINK\(http:\/\/x\) &lt;b&gt;&amp;<\/t>/);
  assert.match(sheet, /A &amp; B &lt;c&gt;/);
});

test("the blank template has 30 formula rows, default 10% rates and zero totals", () => {
  const m = workbookModel(null, {});
  assert.equal(m.filled, false);
  assert.equal(m.lastLineRow, FIRST_LINE_ROW + TEMPLATE_ROWS - 1);
  const rows = m.sheets[1].rows;
  assert.equal(rows[5][1].v, 0.1);
  assert.equal(rows[6][1].v, 0.1);
  for (let r = FIRST_LINE_ROW; r <= m.lastLineRow; r++) assert.equal(rows[r - 1][7].f, `E${r}+F${r}+G${r}`);
  assert.equal(rows[m.totalRow - 1][3].f, `SUM(D${FIRST_LINE_ROW}:D${m.lastLineRow})`);
  const files = unzip(workbookXlsx(null, {}));
  assert.match(files["xl/worksheets/sheet1.xml"], /Application for payment/);
});

test("a result with errors gives the blank template rather than a half-filled one", () => {
  const r = compute("Description\nx", {});
  assert.ok(r.errors.length);
  assert.equal(workbookModel(r, {}).filled, false);
});
