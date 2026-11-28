// @ts-check
// Builds the free framing takeoff template (Excel) behind
// framing-takeoff-template.html: a wall schedule (one row per wall: length,
// exterior or not, spacing, doors, windows, corners and tees) whose formulas
// estimate layout studs, kings, jacks, cripples, sills, backing, header, sill
// and plate footage, and a lumber order under it with the user's board lengths,
// cull allowance and unit prices.
//
// A spreadsheet can only apply rules of thumb per wall; it cannot see where a
// stud lands next to an opening. So `wallRule` below is the same arithmetic in
// JS, and the page quotes how far those rules are from the counted layout of
// one house (Open House Plans 1, via takeoff-example.mjs). The test pins both.
//
// No library: SpreadsheetML in a stored zip with fixed timestamps, so the same
// input gives the same bytes and the committed files can be checked. The cell,
// zip and style helpers are copied from ventures/pay-app-guides/template.mjs
// (same author) so this venture builds from its own folder.
//
//   node framing-takeoff-template.mjs          rewrites the two .xlsx files next to it
//   node framing-takeoff-template.mjs --check  exits 1 if either committed file is stale

import { crc32 } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// Style ids, in cellXfs order (STYLES below).
export const S = { text: 0, title: 1, head: 2, money: 3, input: 5, inputMoney: 6, totalMoney: 7, bold: 9, flag: 10, note: 11, inputNum: 12, int: 13, dec: 14, totalInt: 15, totalDec: 16 };

/** @param {string} ref @param {any} v @param {number} [style] */
export function cell(ref, v, style = S.text) {
  if (v == null || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (typeof v === "number") return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === "object" && v.f) return `<c r="${ref}" s="${style}"><f>${xml(v.f)}</f></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
/** @param {number} r @param {string[]} cells */
const row = (r, cells) => `<row r="${r}">${cells.join("")}</row>`;
/** @param {any} s */
const num = (s) => (s === "" || s == null ? "" : Number(s));

export const FIRST = 10;           // first wall row
export const WALLS = 40;           // wall rows in the template
export const LAST = FIRST + WALLS - 1;
export const TOTAL = LAST + 1;
export const ORDER = TOTAL + 3;    // order table header row
export const SET = { spacing: "C3", plateLen: "C4", headerLen: "C5", cull: "C6", crippleLen: "C7" };

export const HEADERS = [
  "Wall", "Length, ft", "Exterior (Y/N)", "Stud spacing, in (blank = default)", "Doors", "Door widths, total ft",
  "Windows", "Window widths, total ft", "Corners and tees backed on this wall",
  "Layout studs", "King studs", "Jack studs", "Cripples", "Rough sills", "Backing studs",
  "Header, lineal ft (2 plies)", "Sill, lineal ft", "Bottom plate, lineal ft", "Top plates, lineal ft", "Check",
];
const COLS = "ABCDEFGHIJKLMNOPQRST";

/**
 * The template's per-wall rules, in JS. Every formula in the sheet is this.
 * @param {{length:number, exterior?:boolean, spacing?:number, doors?:number, doorFeet?:number, windows?:number, windowFeet?:number, backed?:number}} w
 * @param {number} [defaultSpacing]
 */
export function wallRule(w, defaultSpacing = 16) {
  const sp = w.spacing || defaultSpacing;
  const L = w.length, d = w.doors ?? 0, df = w.doorFeet ?? 0, n = w.windows ?? 0, wf = w.windowFeet ?? 0;
  const removed = Math.floor(((df + wf) * 12) / sp);
  return {
    studs: Math.ceil((L * 12) / sp) + 1 - removed,
    kings: 2 * (d + n),
    jacks: 2 * (d + n),
    cripples: Math.floor((df * 12) / sp) + 2 * Math.floor((wf * 12) / sp),
    sills: n,
    backing: 2 * (w.backed ?? 0),
    headerFeet: 2 * (df + wf + 0.25 * (d + n)),
    sillFeet: wf,
    bottomFeet: L - df,
    topFeet: 2 * L,
  };
}

/**
 * The whole sheet in JS: wall totals and the order's boards before the cull
 * allowance, with the lineal feet they buy (a precut stud is 92-5/8 in).
 * @param {any[]} walls @param {any} [s]
 */
export function sheetRule(walls, s = {}) {
  const sp = s.spacing ?? 16, plateLen = s.plateLen ?? 16, headerLen = s.headerLen ?? 12, per = s.crippleLen ?? 2;
  const t = { studs: 0, kings: 0, jacks: 0, cripples: 0, sills: 0, backing: 0, headerFeet: 0, sillFeet: 0, bottomFeet: 0, treatedFeet: 0, topFeet: 0 };
  for (const w of walls) {
    const r = wallRule({ ...w, doors: +w.doors || 0, doorFeet: +w.doorFeet || 0, windows: +w.windows || 0, windowFeet: +w.windowFeet || 0, backed: +w.backed || 0 }, sp);
    for (const k of Object.keys(r)) t[k] += r[k];
    if (w.exterior) t.treatedFeet += r.bottomFeet;
  }
  const precut = t.studs + t.kings + t.backing + t.jacks + (per > 0 ? Math.ceil(t.cripples / per) : t.cripples);
  const plateBoards = Math.ceil((t.topFeet + t.bottomFeet - t.treatedFeet) / plateLen);
  const treatedBoards = Math.ceil(t.treatedFeet / plateLen);
  const sillBoards = Math.ceil(t.sillFeet / plateLen);
  const headerBoards = Math.ceil(t.headerFeet / headerLen);
  const boards = precut + plateBoards + treatedBoards + sillBoards + headerBoards;
  const boughtFeet = (precut * 92.625) / 12 + (plateBoards + treatedBoards + sillBoards) * plateLen + headerBoards * headerLen;
  return { ...t, precut, plateBoards, treatedBoards, sillBoards, headerBoards, boards, boughtFeet };
}

/** @param {any} s */
function settingsRows(s) {
  const rows = [];
  rows.push(row(1, [cell("A1", "Framing takeoff (wall schedule and lumber order)", S.title)]));
  const field = (r, label, v, note) => rows.push(row(r, [cell(`A${r}`, label, S.bold), cell(`C${r}`, v, S.inputNum), cell(`D${r}`, note, S.note)]));
  rows.push(row(2, [cell("A2", "Job", S.bold), cell("C2", s.job ?? "", S.input)]));
  field(3, "Default stud spacing, in", num(s.spacing ?? 16), "16 or 24, or 19.2; a wall's own spacing overrides it");
  field(4, "Plate and sill board length, ft", num(s.plateLen ?? 16), "the length your yard sells for plates");
  field(5, "Header board length, ft", num(s.headerLen ?? 12), "headers are cut from these");
  field(6, "Cull and mistake allowance, %", num(s.cull ?? 10), "added to every line of the order");
  field(7, "Cripples cut from one precut stud", num(s.crippleLen ?? 2), "2 is typical for cripples under 3 ft");
  rows.push(row(8, [cell("A8", "Shaded cells are yours. A wall's openings come off its layout studs; each removed stud is a cripple above (doors and windows) and one below (windows). Rules of thumb per wall, not a stud-by-stud layout: check the counts before you order.", S.note)]));
  return rows;
}

/** @param {any[]} walls */
function wallRows(walls) {
  const rows = [row(FIRST - 1, HEADERS.map((h, i) => cell(`${COLS[i]}${FIRST - 1}`, h, S.head)))];
  for (let i = 0; i < WALLS; i++) {
    const r = FIRST + i, w = walls[i] || {};
    const sp = `IF(D${r}="",${SET.spacing.replace("C", "$C$")},D${r})`;
    const blank = (f) => ({ f: `IF(B${r}="","",${f})` });
    rows.push(row(r, [
      cell(`A${r}`, w.name ?? "", S.input),
      cell(`B${r}`, num(w.length), S.inputNum),
      cell(`C${r}`, w.length == null ? "" : w.exterior ? "Y" : "N", S.input),
      cell(`D${r}`, num(w.spacing), S.inputNum),
      cell(`E${r}`, num(w.doors), S.inputNum),
      cell(`F${r}`, num(w.doorFeet), S.inputNum),
      cell(`G${r}`, num(w.windows), S.inputNum),
      cell(`H${r}`, num(w.windowFeet), S.inputNum),
      cell(`I${r}`, num(w.backed), S.inputNum),
      cell(`J${r}`, blank(`ROUNDUP(B${r}*12/${sp},0)+1-ROUNDDOWN((N(F${r})+N(H${r}))*12/${sp},0)`), S.int),
      cell(`K${r}`, blank(`2*(N(E${r})+N(G${r}))`), S.int),
      cell(`L${r}`, blank(`2*(N(E${r})+N(G${r}))`), S.int),
      cell(`M${r}`, blank(`ROUNDDOWN(N(F${r})*12/${sp},0)+2*ROUNDDOWN(N(H${r})*12/${sp},0)`), S.int),
      cell(`N${r}`, blank(`N(G${r})`), S.int),
      cell(`O${r}`, blank(`2*N(I${r})`), S.int),
      cell(`P${r}`, blank(`2*(N(F${r})+N(H${r})+0.25*(N(E${r})+N(G${r})))`), S.dec),
      cell(`Q${r}`, blank(`N(H${r})`), S.dec),
      cell(`R${r}`, blank(`B${r}-N(F${r})`), S.dec),
      cell(`S${r}`, blank(`2*B${r}`), S.dec),
      cell(`T${r}`, { f: `IF(B${r}="",IF(COUNT(E${r}:I${r})>0,"Type the wall length",""),` +
        `IF(N(F${r})+N(H${r})>B${r},"Openings are longer than the wall",` +
        `IF(AND(N(F${r})>0,N(E${r})=0),"Door widths but no doors",` +
        `IF(AND(N(H${r})>0,N(G${r})=0),"Window widths but no windows",""))))` }, S.flag),
    ]));
  }
  const sum = (c) => cell(`${c}${TOTAL}`, { f: `SUM(${c}${FIRST}:${c}${LAST})` }, "JKLMNO".includes(c) || c === "E" || c === "G" || c === "I" ? S.totalInt : S.totalDec);
  rows.push(row(TOTAL, [cell(`A${TOTAL}`, "Totals", S.bold), ...[..."BEFGHIJKLMNOPQRS"].map(sum)]));
  return rows;
}

// The order: [label, pieces-or-feet formula, board length cell or "", boards formula (before allowance)].
/** @param {string} c */
const T = (c) => `${c}${TOTAL}`;
/** @type {[string, string, string, (q: string) => string][]} */
export const ORDER_LINES = [
  ["Precut studs: layout, kings and backing", `${T("J")}+${T("K")}+${T("O")}`, "precut", (q) => q],
  ["Precut studs cut down for jacks", T("L"), "precut", (q) => q],
  ["Precut studs cut down for cripples", T("M"), "precut", (q) => `IF(N($C$7)<=0,${q},ROUNDUP(${q}/$C$7,0))`],
  ["Top plates and interior bottom plates, lineal ft", `${T("S")}+${T("R")}-SUMIF(C${FIRST}:C${LAST},"Y",R${FIRST}:R${LAST})`, "$C$4", (q) => `ROUNDUP(${q}/$C$4,0)`],
  ["Treated bottom plates (exterior walls), lineal ft", `SUMIF(C${FIRST}:C${LAST},"Y",R${FIRST}:R${LAST})`, "$C$4", (q) => `ROUNDUP(${q}/$C$4,0)`],
  ["Rough sills, lineal ft", T("Q"), "$C$4", (q) => `ROUNDUP(${q}/$C$4,0)`],
  ["Header stock, lineal ft (size each header from your span table)", T("P"), "$C$5", (q) => `ROUNDUP(${q}/$C$5,0)`],
];

/** @param {any} s */
function orderRows(s) {
  const prices = s.prices ?? [];
  const rows = [row(ORDER - 1, [cell(`A${ORDER - 1}`, "Lumber order", S.bold)])];
  rows.push(row(ORDER, ["Item", "Pieces or lineal ft", "Board length, ft", "Boards", "Boards with allowance", "Unit price", "Amount"].map((h, i) => cell(`${"ABCDEFG"[i]}${ORDER}`, h, S.head))));
  ORDER_LINES.forEach(([label, qty, len, boards], i) => {
    const r = ORDER + 1 + i;
    rows.push(row(r, [
      cell(`A${r}`, label, S.text),
      cell(`B${r}`, { f: qty }, S.dec),
      cell(`C${r}`, len === "precut" ? "precut stud" : { f: `N(${len})` }, S.int),
      cell(`D${r}`, { f: boards(`B${r}`) }, S.int),
      cell(`E${r}`, { f: `ROUNDUP(D${r}*(1+N($C$6)/100),0)` }, S.int),
      cell(`F${r}`, num(prices[i]), S.inputMoney),
      cell(`G${r}`, { f: `IF(F${r}="","",ROUND(E${r}*F${r},2))` }, S.money),
    ]));
  });
  const end = ORDER + ORDER_LINES.length;
  const tot = end + 1;
  rows.push(row(tot, [cell(`A${tot}`, "Lumber total (priced lines)", S.bold), cell(`G${tot}`, { f: `SUM(G${ORDER + 1}:G${end})` }, S.totalMoney)]));
  const chk = tot + 2;
  rows.push(row(chk, [cell(`A${chk}`, "One stud per foot of wall would say", S.text), cell(`B${chk}`, { f: `ROUNDUP(${T("B")},0)` }, S.int),
    cell(`C${chk}`, "this sheet's full-height studs:", S.note), cell(`D${chk}`, { f: `${T("J")}+${T("K")}+${T("O")}` }, S.int)]));
  [
    "Headers, jacks, spacing and treated plates are your inputs; nothing here is checked against a span table or building code.",
    "These are per-wall rules of thumb. The free takeoff at the link below lays out every stud and packs the order into board lengths.",
    "Not engineering or building-code advice. Check every count against your plans before you order.",
    "Free template from https://marisstella.app/wall-framing-takeoff/framing-takeoff-template.html",
  ].forEach((t, i) => rows.push(row(chk + 2 + i, [cell(`A${chk + 2 + i}`, t, S.note)])));
  return rows;
}

const BASE_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="#,##0"/><numFmt numFmtId="167" formatCode="#,##0.0"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF54503F"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFE8D8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDAD6C8"/></left><right style="thin"><color rgb="FFDAD6C8"/></right><top style="thin"><color rgb="FFDAD6C8"/></top><bottom style="thin"><color rgb="FFDAD6C8"/></bottom><diagonal/></border><border><left/><right/><top style="medium"/><bottom style="double"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="17">`;
const XFS = [
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  `<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>`,
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  `<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>`,
  `<xf numFmtId="164" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>`,
  `<xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
  `<xf numFmtId="165" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="0"/></xf>`,
  `<xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>`,
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  `<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
  `<xf numFmtId="166" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
  `<xf numFmtId="167" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>`,
];
export const STYLES = `${BASE_STYLES}${XFS.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Takeoff" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Takeoff!$${FIRST - 1}:$${FIRST - 1}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Minimal zip writer: stored entries, DOS date 1980-01-01 00:00.
/** @param {[string, string][]} files */
export function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8"), fname = Buffer.from(name, "utf8"), crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(fname.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, fname, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(fname.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, fname);
    offset += 30 + fname.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/** @param {{walls?: any[], settings?: any}} [data] */
export function sheetXml({ walls = [], settings = {} } = {}) {
  const rows = [...settingsRows(settings), ...wallRows(walls), ...orderRows(settings)];
  const widths = [30, 9, 9, 11, 7, 9, 8, 9, 10, 8, 7, 7, 8, 7, 8, 10, 8, 10, 10, 30];
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const pane = `<pane ySplit="${FIRST - 1}" topLeftCell="A${FIRST}" activePane="bottomLeft" state="frozen"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows.join("")}</sheetData><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

/** @param {{walls?: any[], settings?: any}} [data] */
export function buildTemplate(data = {}) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", WORKBOOK],
    ["xl/_rels/workbook.xml.rels", WORKBOOK_RELS],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheetXml(data)],
  ]);
}

/**
 * The example sheet: Open House Plans 1 (CC0, generated), the house the
 * how-to page works, read from its DXF fixture so the sheet and the page
 * cannot drift apart. Each exterior wall backs one corner; tees are backed on
 * the wall they land on (the engine's 2 studs a corner and 2 a tee).
 */
export async function exampleWalls() {
  const { examplePlan } = await import("./takeoff-example.mjs");
  const plan = examplePlan(16);
  let e = 0, n = 0;
  return plan.walls.map((w) => {
    const o = w.openings ?? [];
    const doors = o.filter((x) => x.kind === "door"), windows = o.filter((x) => x.kind === "window");
    const feet = (xs) => Math.round((xs.reduce((s, x) => s + x.width, 0) / 12) * 10000) / 10000;
    return {
      name: w.corner ? `Exterior ${"ABCD"[e++] ?? e}` : `Interior ${++n}`,
      length: w.length / 12, exterior: !!w.corner,
      doors: doors.length || "", doorFeet: doors.length ? feet(doors) : "",
      windows: windows.length || "", windowFeet: windows.length ? feet(windows) : "",
      backed: (w.corner ? 1 : 0) + (w.tees?.length ?? 0) || "",
    };
  });
}

export const EXAMPLE_SETTINGS = { job: "Open House Plans 1 (generated CC0 plan, 34 x 26 ft)", spacing: 16, plateLen: 16, headerLen: 12, cull: 10, crippleLen: 2 };

export const OUTPUTS = {
  "framing-takeoff-template.xlsx": async () => buildTemplate({}),
  "framing-takeoff-example.xlsx": async () => buildTemplate({ walls: await exampleWalls(), settings: EXAMPLE_SETTINGS }),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes("--check");
  let stale = 0;
  for (const [name, build] of Object.entries(OUTPUTS)) {
    const file = new URL(`./${name}`, import.meta.url), bytes = await build();
    if (check) {
      let same = false;
      try { same = Buffer.compare(readFileSync(file), bytes) === 0; } catch {}
      if (!same) { console.error(`${name} is stale: run node framing-takeoff-template.mjs`); stale++; }
    } else { writeFileSync(file, bytes); console.log(`wrote ${name} (${bytes.length} bytes)`); }
  }
  process.exitCode = stale ? 1 : 0;
}
