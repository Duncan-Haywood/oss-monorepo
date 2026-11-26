import { test } from "node:test";
import assert from "node:assert/strict";
import { readXlsx, findSchedule, pickSheet, retainageChecks, unzip, colIndex, colName, xmlText } from "./sheet.mjs";
import { compute, parseCsv } from "./calc.mjs";

// ---- a minimal .xlsx writer for fixtures: real deflate, real ZIP directory, CRC-32 filled in ----
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function deflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function zip(entries, { store = false } = {}) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text), data = store ? raw : await deflate(raw), nm = enc.encode(name), crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, store ? 0 : 8, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, raw.length, true); h.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(10, store ? 0 : 8, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, raw.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, data); central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(entries).length, true); e.setUint16(10, Object.keys(entries).length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Uint8Array(await new Blob([...parts, ...central, new Uint8Array(e.buffer)]).arrayBuffer());
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// rows: { rowNumber: [cell, ...] } where a cell is a string (shared string), a number, { f, v } (formula with cached
// value), { pct: 0.1 } (percent-formatted number), or { inline: "text" }.
async function workbook(sheets, { store = false, refs = true } = {}) {
  const shared = [], si = (s) => { let i = shared.indexOf(s); if (i < 0) { i = shared.length; shared.push(s); } return i; };
  const files = {};
  const names = Object.keys(sheets);
  names.forEach((name, n) => {
    const rows = Object.entries(sheets[name]).map(([r, cells]) => `<row r="${r}">${cells.map((v, c) => {
      const ref = refs ? `${colName(c)}${r}` : null;
      if (v === null || v === undefined || v === "") return "";
      if (typeof v === "number") return `<c${ref ? ` r="${ref}"` : ""}><v>${v}</v></c>`;
      if (v.pct !== undefined) return `<c${ref ? ` r="${ref}"` : ""} s="1"><v>${v.pct}</v></c>`;
      if (v.f !== undefined) return `<c${ref ? ` r="${ref}"` : ""}><f>${esc(v.f)}</f>${v.v === undefined ? "" : `<v>${v.v}</v>`}</c>`;
      if (v.err !== undefined) return `<c${ref ? ` r="${ref}"` : ""} t="e"><v>${esc(v.err)}</v></c>`;
      if (v.inline !== undefined) return `<c${ref ? ` r="${ref}"` : ""} t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
      return `<c${ref ? ` r="${ref}"` : ""} t="s"><v>${si(v)}</v></c>`;
    }).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${n + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files["[Content_Types].xml"] = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`;
  files["xl/workbook.xml"] = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((nm, n) => `<sheet name="${esc(nm)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((nm, n) => `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n + 1}.xml"/>`).join("")}</Relationships>`;
  files["xl/sharedStrings.xml"] = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  files["xl/styles.xml"] = `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="9" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  return zip(files, { store });
}

// A continuation sheet laid out the way contractors keep one in Excel: a title block, a two-row header with the
// usual long column names, a row of column letters, a division heading, a subtotal, a change-order section and a
// totals row, with to-date, percent, balance and retainage columns computed by formulas.
const G703 = {
  1: ["CONTINUATION SHEET"],
  2: ["Application No:", null, 4],
  3: ["Period To:", null, "2026-10-31"],
  5: ["ITEM", "DESCRIPTION OF WORK", "SCHEDULED", "WORK COMPLETED", null, "MATERIALS PRESENTLY STORED", "TOTAL COMPLETED AND STORED TO DATE", "%", "BALANCE TO FINISH", "RETAINAGE"],
  6: ["NO.", null, "VALUE", "FROM PREVIOUS APPLICATION (D + E)", "THIS PERIOD", "(NOT IN D OR E)", "(D+E+F)", "(G ÷ C)", "(C - G)", "(IF VARIABLE RATE)"],
  7: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
  8: [null, "DIVISION 01 - GENERAL"],
  9: [1, "General conditions", 48000, 24000, 6000, 0, { f: "SUM(D9:F9)", v: 30000 }, { pct: 0.625 }, { f: "C9-G9", v: 18000 }, { f: "G9*0.1", v: 3000 }],
  10: [2, "Demolition", 22000, 22000, 0, 0, { f: "SUM(D10:F10)", v: 22000 }, { pct: 1 }, { f: "C10-G10", v: 0 }, { f: "G10*0.1", v: 2200 }],
  11: [null, "Subtotal Division 01", 70000, 46000, 6000, 0, 52000],
  12: [null, "DIVISION 06 - WOOD"],
  13: [3, "Framing", 86000, 60000, { f: "86000*0.2325581395", v: 19999.999997 }, 0, { f: "SUM(D13:F13)", v: 80000 }, { pct: 0.93 }, { f: "C13-G13", v: 6000 }, { f: "G13*0.1", v: 8000 }],
  14: [4, "Electrical rough-in", 64000, 20000, 16000, 8000, 44000, { pct: 0.6875 }, 20000, 4400],
  15: [null, "CHANGE ORDERS"],
  16: ["1", "Added egress window", 7800, 0, 7800, 0, { f: "SUM(D16:F16)", v: 7800 }, { pct: 1 }, 0, 780],
  17: ["2", "Deduct owner-supplied fixtures", -3500, 0, -3500, 0, { f: "SUM(D17:F17)", v: -3500 }, { pct: 1 }, 0, -350],
  19: [null, "GRAND TOTALS", { f: "SUM(C9:C17)", v: 224300 }, 126000, 46300, 8000, 180300, null, 44000, 18030],
};

test("column letters and names round-trip, XML entities decode", () => {
  assert.equal(colIndex("A1"), 0); assert.equal(colIndex("J19"), 9); assert.equal(colIndex("AA3"), 26);
  for (const n of [0, 9, 25, 26, 51, 52, 701, 702]) assert.equal(colIndex(colName(n) + "1"), n);
  assert.equal(xmlText("A &amp; B &lt;C&gt; &#8212; &#x2014; _x000D_"), "A & B <C> — — \r");
});

test("reads a real-layout continuation sheet out of an .xlsx", async () => {
  const sheets = await readXlsx(await workbook({ "G702": { 1: ["APPLICATION AND CERTIFICATE FOR PAYMENT"], 3: ["Original contract sum", null, 220000] }, "G703": G703 }));
  assert.deepEqual(sheets.map((s) => s.name), ["G702", "G703"]);
  assert.equal(sheets[1].grid[8][1], "General conditions"); // row 9
  assert.equal(sheets[1].grid[8][7], "62.5%"); // percent-formatted cell
  const r = pickSheet(sheets);
  assert.ok(!r.error, r.error);
  assert.match(r.header, /sheet "G703", row 5-6/);
  assert.deepEqual(r.lines.map((l) => l.desc), ["General conditions", "Demolition", "Framing", "Electrical rough-in", "Added egress window", "Deduct owner-supplied fixtures"]);
  assert.deepEqual(r.lines.map((l) => l.isCo), [false, false, false, false, true, true]);
  assert.equal(r.lines[2].e, 2000000); // formula result rounded to the cent
  assert.ok(r.notes.some((n) => /1 amount was carried to more than two decimals/.test(n)));
  assert.ok(r.notes.some((n) => /1 subtotal row was skipped/.test(n)));
  assert.deepEqual(r.checks, [], JSON.stringify(r.checks));

  const res = compute(r.csv, { retainagePct: "10" });
  assert.deepEqual(res.errors, []);
  assert.equal(res.summary.original, 22000000);
  assert.equal(res.summary.changes, 430000);
  assert.equal(res.summary.completed, 18030000);
  assert.equal(res.summary.retainage, 1803000);
  assert.deepEqual(retainageChecks(r, res), []);
});

test("catches a typed-over total, a short SUM range and a retainage that disagrees", async () => {
  const bad = structuredClone(G703);
  bad[14][6] = 40000; // typed over: 20000 + 16000 + 8000 is 44000
  bad[19][4] = 42000; // SUM missed the change-order lines: 46300 is right
  bad[9][9] = 1500; // 5% held on this line while the rates entered say 10%
  const r = pickSheet(await readXlsx(await workbook({ "Sheet1": bad })));
  assert.ok(!r.error, r.error);
  const titles = r.checks.map((c) => c.title);
  assert.ok(titles.some((t) => /Electrical rough-in \(cell G14\).*\$40,000\.00.*\$44,000\.00/.test(t)), titles.join("\n"));
  assert.ok(titles.some((t) => /Totals row \(cell E19\).*this period total is \$42,000\.00.*\$46,300\.00/.test(t)), titles.join("\n"));
  assert.ok(titles.some((t) => /Totals row \(cell G19\)/.test(t)), "the to-date total no longer matches either");
  const ret = retainageChecks(r, compute(r.csv, { retainagePct: "10" }));
  assert.equal(ret.length, 1);
  assert.match(ret[0].title, /General conditions: the sheet holds \$1,500\.00 retainage, the rates entered here give \$3,000\.00/);
});

test("a stored (uncompressed) workbook, inline strings and no styles or shared strings still read", async () => {
  const sheet = { 1: [{ inline: "Item" }, { inline: "Description" }, { inline: "Scheduled Value" }, { inline: "Previous" }, { inline: "This Period" }], 2: [1, { inline: "Concrete & rebar" }, 1000, 0, 250.5] };
  const r = pickSheet(await readXlsx(await workbook({ "Pay App": sheet }, { store: true })));
  assert.ok(!r.error, r.error);
  assert.equal(r.lines[0].desc, "Concrete & rebar");
  assert.match(r.csv, /^Item,Description,Type,Scheduled value,Previous,This period,Stored\n1,Concrete & rebar,,1000\.00,0\.00,250\.50,0\.00$/);
});

test("Excel errors in a billing cell stop the import with the cell named", async () => {
  const sheet = { 1: ["Description", "Scheduled value", "Previous", "This period"], 2: ["Framing", 1000, { err: "#REF!" }, 0] };
  const r = pickSheet(await readXlsx(await workbook({ S: sheet })));
  assert.match(r.error, /Framing \(cell C2\) shows the Excel error #REF!/);
});

test("not a workbook, an old .xls, and a workbook with no schedule each say what to do", async () => {
  assert.throws(() => unzip(new TextEncoder().encode("Item,Description\n1,x")), /not an \.xlsx workbook/);
  const xls = new Uint8Array(64); xls.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  assert.throws(() => unzip(xls), /old \.xls workbook.*save it as \.xlsx or CSV/);
  const r = pickSheet(await readXlsx(await workbook({ Notes: { 1: ["Hello"] }, Other: { 2: ["Nothing", "here"] } })));
  assert.match(r.error, /None of the 2 sheets/);
});

test("a CSV saved from an Excel G703 with its title block is found too", () => {
  const csv = [
    "CONTINUATION SHEET,,,,,,",
    "Project: Example,,,,,,",
    ",,,,,,",
    "ITEM NO.,DESCRIPTION OF WORK,SCHEDULED VALUE,FROM PREVIOUS APPLICATION,THIS PERIOD,MATERIALS PRESENTLY STORED,TOTAL COMPLETED AND STORED TO DATE",
    "A,B,C,D,E,F,G",
    "1,Site work,\"$10,000.00\",\"$4,000.00\",\"$1,000.00\",$ -,\"$5,000.00\"",
    "2,Paving,\"$5,000.00\",$ -,\"$2,500.00\",$ -,\"$2,500.00\"",
    "CO-1,Extra striping,$750.00,$ -,$750.00,$ -,$750.00",
    "TOTAL,,\"$15,750.00\",\"$4,000.00\",\"$4,250.00\",$ -,\"$8,250.00\"",
  ].join("\n");
  assert.match(compute(csv).errors[0], /No scheduled value column/); // the plain reader needs the header first
  const r = findSchedule(parseCsv(csv));
  assert.ok(!r.error, r.error);
  assert.equal(r.lines.length, 3);
  assert.deepEqual(r.checks, []);
  const res = compute(r.csv, { retainagePct: "5" });
  assert.equal(res.summary.original, 1500000);
  assert.equal(res.summary.changes, 75000);
  assert.equal(res.summary.completed, 825000);
});

// Real files from other writers (fixtures/README.md).
import { readFileSync } from "node:fs";
const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

test("a workbook saved by LibreOffice: the continuation sheet is found, totals and retainage agree", async () => {
  const r = pickSheet(await readXlsx(fixture("libreoffice-g703.xlsx")));
  assert.ok(!r.error, r.error);
  assert.match(r.header, /sheet "Continuation Sheet", row 4-5/);
  assert.equal(r.lines.length, 5);
  assert.deepEqual(r.checks, []);
  const res = compute(r.csv, { retainagePct: "10" });
  assert.equal(res.summary.contractToDate, 24905075);
  assert.equal(res.summary.completed, 13912525);
  assert.deepEqual(retainageChecks(r, res), []);
  const at10 = retainageChecks(r, compute(r.csv, { retainagePct: "5" }));
  assert.equal(at10.length, 5, "every line's sheet retainage is 10%, so 5% disagrees on each");
});

test("a workbook written without calculation: lines still read, totals said to be unchecked, not zero", async () => {
  const r = pickSheet(await readXlsx(fixture("openpyxl-uncalculated.xlsx")));
  assert.ok(!r.error, r.error);
  assert.equal(r.lines.length, 5);
  assert.deepEqual(r.checks, []);
  assert.ok(r.notes.some((n) => /totals row is formulas with no saved results/.test(n)));
});

test("an uncalculated formula in a billing column stops with the reason, rather than reading as zero", async () => {
  const sheet = { 1: ["Description", "Scheduled value", "Previous", "This period"], 2: ["Framing", 1000, 0, { f: "B2*0.5" }] };
  const r = pickSheet(await readXlsx(await workbook({ S: sheet })));
  assert.match(r.error, /Framing \(cell D2\) is a formula with no saved result/);
});

test("commas are read by shape: thousands, an EU decimal comma, and anything else refused", () => {
  const csv = ["Description,Scheduled value,Previous,This period", '"Framing","1,234.50","29,99","1.000,25"'].join("\n");
  const r = findSchedule(parseCsv(csv));
  assert.ok(!r.error, r.error);
  assert.deepEqual([r.lines[0].c, r.lines[0].d, r.lines[0].e], [123450, 2999, 100025]);
  const bad = findSchedule(parseCsv(["Description,Scheduled value,Previous,This period", '"Framing","12,34,5",0,0'].join("\n")));
  assert.match(bad.error, /Framing \(row 2\) is not a dollar amount/);
});

// workbook.mjs writes the page's own .xlsx (PR #18769); this reader must take it back unchanged, own rates included.
import { workbookXlsx } from "./workbook.mjs";
import { sampleList, SAMPLE_SETTINGS } from "./calc.mjs";

test("the page's own downloaded workbook reads back to the same application", async () => {
  const csv = sampleList().replace("Item,Description,Scheduled value,Previous,This period,Stored", "Item,Description,Scheduled value,Previous,This period,Stored,Retainage")
    .split("\n").map((l, n) => (n === 0 ? l : l + (n === 3 ? ",5" : ","))).join("\n");
  const r = compute(csv, SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const imp = pickSheet(await readXlsx(workbookXlsx(r, SAMPLE_SETTINGS)));
  assert.ok(!imp.error, imp.error);
  assert.match(imp.header, /sheet "Continuation sheet"/);
  assert.deepEqual(imp.checks, []);
  assert.ok(imp.notes.some((n) => /own rate/.test(n)));
  const back = compute(imp.csv, SAMPLE_SETTINGS);
  assert.deepEqual(back.errors, []);
  for (const k of ["original", "changes", "completed", "retainage", "due"]) assert.equal(back.summary[k], r.summary[k], k);
  assert.deepEqual(retainageChecks(imp, back), []);
  assert.match(pickSheet(await readXlsx(workbookXlsx(null, {}))).error, /blank template/);
});

test("the portfolio's own free template: labels and a note above the header are not glued onto the Item column", async () => {
  const r = pickSheet(await readXlsx(fixture("pay-app-guides-example.xlsx")));
  assert.ok(!r.error, r.error);
  assert.match(r.header, /sheet "Continuation sheet", row 8$/);
  assert.deepEqual(r.lines.map((l) => [l.item, l.isCo, l.own, l.c]), [
    ["1", false, "", 1200000],
    ["2", false, "", 4000000],
    ["3", false, "", 6000000],
    ["4", false, "", 3800000],
    ["CO-1", true, "", 850000],
  ]);
  assert.ok(!r.notes.some((n) => /per-line retainage/.test(n)), "no column is read as a per-line retainage rate");
});

// Red team 2026-11-25: the highest code point is a real character, not a replacement mark.
test("xmlText keeps U+10FFFF and replaces anything above it", () => {
  assert.equal(xmlText("&#x10FFFF;"), String.fromCodePoint(0x10ffff));
  assert.equal(xmlText("&#x110000;"), "�");
});

test("cells written without an r attribute (some exporters omit it) fill columns from A", async () => {
  const sheet = { 1: ["Item", "Description", "Scheduled value", "Previous", "This period"], 2: [1, "Concrete", 1000, 0, 250] };
  const sheets = await readXlsx(await workbook({ "Sheet1": sheet }, { refs: false }));
  assert.deepEqual(sheets[0].grid[0], ["Item", "Description", "Scheduled value", "Previous", "This period"]);
  const r = pickSheet(sheets);
  assert.ok(!r.error, r.error);
  assert.equal(r.lines[0].desc, "Concrete");
  assert.equal(r.lines[0].c, 100000);
});

test("a three-column table's A B C letter row under the header is skipped, not read as a line", () => {
  const r = findSchedule(parseCsv("Description,Scheduled value,Previous\nA,B,C\nFraming,1000,400"));
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.lines.map((l) => l.desc), ["Framing"]);
});

test("a typed-over to-date total two cents off is caught; one cent of rounding is not", () => {
  const head = "Description,Scheduled value,Previous,This period,Stored,Total completed and stored\n";
  const two = findSchedule(parseCsv(head + "Framing,1000,400,100,0,500.02"));
  assert.ok(two.checks.some((c) => /Framing.*total completed and stored is \$500\.02/.test(c.title)), JSON.stringify(two.checks));
  const one = findSchedule(parseCsv(head + "Framing,1000,400,100,0,500.01"));
  assert.ok(!one.checks.some((c) => /total completed and stored is/.test(c.title)), JSON.stringify(one.checks));
});
