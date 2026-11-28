// Writes an Excel workbook (.xlsx) with no library: the ZIP is built by hand with stored (not
// deflated) entries, which every reader accepts. Text cells are inline strings, so values such as item
// number "01" or "1.10" stay as written; number cells carry a "#,##0.00" format. The reader in
// ../sov-import/xlsx.ts reads these files back (the tests round-trip through it).

export type XlsxCell = string | { number: number } | null;

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = (CRC_TABLE[(c ^ (b[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP archive of stored entries, in the order given. */
export function zipStored(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  // 1980-01-01 00:00, the earliest DOS date: the files carry no meaningful time.
  const dosTime = 0;
  const dosDate = (0 << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const esc = (s: string) =>
  s
    // Characters XML 1.0 cannot carry at all.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * A cell: text, a number (money format unless `format` says otherwise), or a formula saved with its
 * result (`value`), so a reader that does not calculate (this app's own, a GC portal's) still sees
 * the figure. `bold` sets the text or number in bold.
 */
export type XlsxRichCell =
  | XlsxCell
  | { text: string; bold?: boolean }
  | { number: number; format?: "money" | "percent" | "plain"; bold?: boolean }
  | { formula: string; value: number; format?: "money" | "percent" | "plain"; bold?: boolean };

export interface XlsxSheet {
  name: string;
  rows: XlsxRichCell[][];
  widths?: number[];
}

// cellXfs indexes in styles.xml below.
const STYLE = {
  money: 1,
  text: 0,
  bold: 2,
  boldMoney: 3,
  percent: 4,
  boldPercent: 5,
  plain: 0,
  boldPlain: 2,
} as const;

function numberStyle(format: "money" | "percent" | "plain" | undefined, bold: boolean): number {
  const f = format ?? "money";
  if (f === "percent") return bold ? STYLE.boldPercent : STYLE.percent;
  if (f === "plain") return bold ? STYLE.boldPlain : STYLE.plain;
  return bold ? STYLE.boldMoney : STYLE.money;
}

function cellXml(ref: string, v: XlsxRichCell): string {
  if (v === null || v === "") return "";
  const str = (text: string, s: number) =>
    `<c r="${ref}"${s ? ` s="${s}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  if (typeof v === "string") return str(v, STYLE.text);
  if ("text" in v) return v.text === "" ? "" : str(v.text, v.bold ? STYLE.bold : STYLE.text);
  const s = numberStyle("format" in v ? v.format : undefined, "bold" in v && !!v.bold);
  const sAttr = s ? ` s="${s}"` : "";
  if ("formula" in v) {
    if (!Number.isFinite(v.value)) return "";
    return `<c r="${ref}"${sAttr}><f>${esc(v.formula)}</f><v>${v.value}</v></c>`;
  }
  if (!Number.isFinite(v.number)) return "";
  return `<c r="${ref}"${sAttr}><v>${v.number}</v></c>`;
}

/** A sheet name Excel accepts: no \ / ? * [ ] :, at most 31 characters, not blank. */
export function xlsxSheetName(name: string): string {
  return (
    name
      .replace(/[\\/?*[\]:]/g, " ")
      .slice(0, 31)
      .trim() || "Sheet1"
  );
}

/** One worksheet named `sheetName` holding `rows` from A1. Columns get the widths given, if any. */
export function writeXlsx(
  sheetName: string,
  rows: XlsxCell[][],
  widths: number[] = [],
): Uint8Array {
  return writeXlsxBook([{ name: sheetName, rows, widths }]);
}

/** A workbook with the sheets given, in tab order. Sheet names must differ once cleaned. */
export function writeXlsxBook(sheets: XlsxSheet[]): Uint8Array {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet");
  const names = sheets.map((sh) => xlsxSheetName(sh.name));
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    throw new Error("Sheet names must differ");
  const sheetXml = sheets.map((sh) => {
    const body = sh.rows
      .map((row, r) => {
        const cells = row.map((v, c) => cellXml(`${colName(c)}${r + 1}`, v)).join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    const widths = sh.widths ?? [];
    const cols = widths.length
      ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}>${cols}<sheetData>${body}</sheetData></worksheet>`;
  });
  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetEntries = names
    .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const sheetRels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");
  const stylesId = `rId${sheets.length + 1}`;
  // fullCalcOnLoad: Excel and LibreOffice recalculate the formulas on open; the saved results are
  // what this app computed, so the figures agree either way.
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><sheets>${sheetEntries}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="${stylesId}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      "xl/styles.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
    ...sheetXml.map((x, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ];
  return zipStored(files.map(([n, x]) => ({ name: n, data: enc.encode(x) })));
}
