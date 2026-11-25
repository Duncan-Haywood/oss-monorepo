// Pay application workbook: an .xlsx with live formulas, in this tool's own layout (an "Application" summary sheet
// and a lettered "Continuation sheet"), either blank as a reusable template or filled from a computed application.
// Most subcontractors already bill from a spreadsheet; this gives them one whose totals cannot drift, with spare rows
// that the sums already cover. It is not the AIA G702/G703 form and copies none of its wording.
//
// No dependencies: a stored (uncompressed) zip writer and SpreadsheetML written by hand. Strings are inline strings,
// so text a user typed (a description starting with "=") stays text and is never read as a formula. Formulas carry
// cached values computed here, so a previewer that does not recalculate (a phone's file preview) still shows the
// numbers; the workbook asks Excel and LibreOffice to recalculate on open.

import { FORMAT_NOTE, parsePercent } from "./calc.mjs";

const enc = new TextEncoder();
let CRC_TABLE = null;
export function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name, data: string | Uint8Array }] -> Uint8Array, a zip with every entry stored.
export function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// XML 1.0 cannot hold most C0 controls or lone surrogates, even escaped; a pasted cell can carry one, so drop them.
export const xmlText = (s) => String(s ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Cell styles, by index into cellXfs below.
const S = { text: 0, bold: 1, money: 2, pct: 3, boldMoney: 4, head: 5, title: 6, note: 7, boldPct: 8, input: 9, inputPct: 10 };
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;(#,##0.00)"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF54503F"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE8D8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="10" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="10" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/></cellXfs></styleSheet>`;

export const colName = (i) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

// A cell is null (empty), a string, a number, or { v, f, s } (f: formula without "=", v: its cached value).
function cellXml(cell, ref) {
  if (cell == null) return "";
  const c = typeof cell === "object" ? cell : { v: cell };
  const s = c.s ? ` s="${c.s}"` : "";
  if (c.f != null) {
    const f = `<f>${xmlText(c.f)}</f>`;
    if (typeof c.v === "number") return `<c r="${ref}"${s}>${f}<v>${c.v}</v></c>`;
    return `<c r="${ref}"${s} t="str">${f}<v>${xmlText(c.v ?? "")}</v></c>`;
  }
  if (typeof c.v === "number") return Number.isFinite(c.v) ? `<c r="${ref}"${s}><v>${c.v}</v></c>` : "";
  if (c.v == null || c.v === "") return s ? `<c r="${ref}"${s}/>` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(c.v)}</t></is></c>`;
}

function sheetXml(rows, { widths = [], freezeRow = 0, landscape = false, merges = [] } = {}) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const pane = freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const data = rows.map((r, i) => {
    const cells = (r || []).map((c, j) => cellXml(c, `${colName(j)}${i + 1}`)).join("");
    return cells ? `<row r="${i + 1}">${cells}</row>` : "";
  }).join("");
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${mergeXml}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="${landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export const CONT = "Continuation sheet";
const CREF = `'${CONT}'!`;
export const FIRST_LINE_ROW = 11; // 1-based: rows 1-8 header and rates, 9 column letters, 10 headings
export const SPARE_ROWS = 10;
export const TEMPLATE_ROWS = 30;
export const HEADINGS = ["Item", "Description of work", "Type (CO = change order)", "Scheduled value", "From previous applications", "This period", "Materials presently stored", "Completed and stored to date (E+F+G)", "% complete (H / D)", "Balance to finish (D - H)", "Line's own retainage % (blank = rates above)", "Retainage"];

const dollarsOf = (cents) => Math.round(cents) / 100;

// result: compute()'s output, or null for a blank template. settings: the page's settings (project, contractor, ...).
// Returns { sheets: [{ name, rows, ... }], lastLineRow, totalRow } so tests can read cells without unzipping.
export function workbookModel(result, settings = {}) {
  const filled = !!(result && result.summary && !(result.errors || []).length);
  const lines = filled ? result.lines : [];
  const m = filled ? result.summary : null;
  const n = filled ? lines.length + SPARE_ROWS : TEMPLATE_ROWS;
  const first = FIRST_LINE_ROW, last = first + n - 1, totalRow = last + 1;
  const workRate = filled ? m.workRateBp / 10000 : 0.1;
  // compute() applies a reduction to the work rate only; stored materials keep their own rate, which defaults to
  // the base rate entered (not the reduced one).
  const storedRateBp = !filled ? 1000
    : String(settings.storedRetainagePct ?? "").trim() !== "" ? parsePercent(settings.storedRetainagePct) : parsePercent(settings.retainagePct ?? "10");
  const storedRate = storedRateBp / 10000;

  const c = [];
  c[0] = [{ v: "Continuation sheet", s: S.title }];
  c[1] = [{ v: "Project", s: S.bold }, settings.project || ""];
  c[2] = [{ v: "Application no.", s: S.bold }, settings.applicationNo || ""];
  c[3] = [{ v: "Period to", s: S.bold }, settings.periodTo || ""];
  c[4] = [{ v: "Contractor", s: S.bold }, settings.contractor || ""];
  c[5] = [{ v: "Retainage on work", s: S.bold }, { v: workRate, s: S.inputPct }, { v: filled && m.reduced ? "Reduced rate in effect: the job passed the completion point you entered." : "Shaded cells are inputs.", s: S.note }];
  c[6] = [{ v: "Retainage on stored materials", s: S.bold }, { v: storedRate, s: S.inputPct }];
  c[7] = [{ v: "Type CO in column C on each change order line; a deductive change order is a negative scheduled value. Add lines in the spare rows: every total already covers them.", s: S.note }];
  c[8] = HEADINGS.map((_, i) => ({ v: colName(i), s: S.head }));
  c[9] = HEADINGS.map((h) => ({ v: h, s: S.head }));

  for (let i = 0; i < n; i++) {
    const r = first + i, l = lines[i];
    const cents = (k) => (l ? dollarsOf(l[k]) : null);
    const own = l && l.own != null ? l.own / 10000 : null;
    c[r - 1] = [
      l ? l.item : null,
      l ? l.desc : null,
      l && l.isCo ? "CO" : null,
      { v: cents("c"), s: S.input },
      { v: cents("d"), s: S.input },
      { v: cents("e"), s: S.input },
      { v: cents("f"), s: S.input },
      { f: `E${r}+F${r}+G${r}`, v: l ? dollarsOf(l.g) : 0, s: S.money },
      { f: `IF(D${r}=0,"",H${r}/D${r})`, v: l && l.pct != null ? l.c !== 0 ? l.g / l.c : "" : "", s: S.pct },
      { f: `D${r}-H${r}`, v: l ? dollarsOf(l.balance) : 0, s: S.money },
      { v: own, s: S.inputPct },
      { f: `ROUND((E${r}+F${r})*IF(K${r}="",$B$6,K${r}),2)+ROUND(G${r}*IF(K${r}="",$B$7,K${r}),2)`, v: l ? dollarsOf(l.ret) : 0, s: S.money },
    ];
  }
  const sumCol = (col, v) => ({ f: `SUM(${col}${first}:${col}${last})`, v, s: S.boldMoney });
  const tot = (k) => (filled ? dollarsOf(lines.reduce((a, l) => a + l[k], 0)) : 0);
  c[totalRow - 1] = [null, { v: "Totals", s: S.bold }, null, sumCol("D", filled ? dollarsOf(m.contractToDate) : 0), sumCol("E", tot("d")), sumCol("F", tot("e")), sumCol("G", tot("f")), sumCol("H", filled ? dollarsOf(m.completed) : 0),
    { f: `IF(D${totalRow}=0,"",H${totalRow}/D${totalRow})`, v: filled && m.contractToDate !== 0 ? m.completed / m.contractToDate : "", s: S.boldPct },
    sumCol("J", filled ? dollarsOf(m.contractToDate - m.completed) : 0), null, sumCol("L", filled ? dollarsOf(m.retainage) : 0)];
  c[totalRow + 1] = [{ v: FORMAT_NOTE, s: S.note }];

  const rng = (col) => `${CREF}$${col}$${first}:$${col}$${last}`;
  const v = (k) => (filled ? dollarsOf(m[k]) : 0);
  const a = [];
  a[0] = [{ v: "Application for payment", s: S.title }];
  a[1] = [{ v: "Project", s: S.bold }, null, settings.project || ""];
  a[2] = [{ v: "Billed to", s: S.bold }, null, settings.owner || ""];
  a[3] = [{ v: "From (contractor)", s: S.bold }, null, settings.contractor || ""];
  a[4] = [{ v: "Application no.", s: S.bold }, null, settings.applicationNo || ""];
  a[5] = [{ v: "Period to", s: S.bold }, null, settings.periodTo || ""];
  const L = (row, no, label, f, val, style = S.money) => { a[row - 1] = [no, label, f == null ? { v: val, s: S.input } : { f, v: val, s: style }]; };
  L(8, "1.", "Original contract sum", `SUMIF(${rng("C")},"<>CO",${rng("D")})`, v("original"));
  L(9, "2.", "Net change by change orders", `SUMIF(${rng("C")},"CO",${rng("D")})`, v("changes"));
  L(10, "3.", "Contract sum to date (1 + 2)", "C8+C9", v("contractToDate"));
  L(11, "4.", "Total completed and stored to date (column H total)", `${CREF}H${totalRow}`, v("completed"));
  L(12, "5.", "Retainage (column L total)", `${CREF}L${totalRow}`, v("retainage"));
  L(13, "6.", "Total earned less retainage (4 - 5)", "C11-C12", v("earnedLess"));
  L(14, "7.", "Less previous certificates for payment (from your last application)", null, v("previous"));
  L(15, "8.", "Current payment due (6 - 7)", "C13-C14", v("due"), S.boldMoney);
  L(16, "9.", "Balance to finish, including retainage (3 - 6)", "C10-C13", v("balanceToFinish"));
  a[18] = [null, { v: "Prepared by (name and date)", s: S.bold }, null];
  a[19] = [null, { v: "Amount certified by the owner or its representative, if different from line 8", s: S.bold }, { v: null, s: S.input }];
  a[21] = [null, { v: `${FORMAT_NOTE} A worksheet for you to check against your contract before you send it; not legal, tax or accounting advice. Retainage is rounded to the cent per line, as on the page that made this file.`, s: S.note }];
  a[22] = [null, { v: "Made free at marisstella.app/pay-application-generator. Nothing you typed left your device.", s: S.note }];

  return {
    filled, lastLineRow: last, totalRow,
    sheets: [
      { name: "Application", rows: a, widths: [5, 70, 18], merges: ["B22:C22", "B23:C23"] },
      { name: CONT, rows: c, widths: [9, 36, 12, 15, 15, 15, 15, 17, 11, 15, 15, 14], freezeRow: 10, landscape: true },
    ],
  };
}

export function workbookXlsx(result, settings = {}) {
  const model = workbookModel(result, settings);
  const { sheets } = model;
  const ids = sheets.map((_, i) => i + 1);
  const printTitles = `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="1">${CREF}$9:$10</definedName></definedNames>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ids.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xmlText(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${printTitles}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh.rows, sh) })),
  ];
  return zipStore(files);
}
