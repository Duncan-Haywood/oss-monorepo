// Writes grids of cell text as an Excel workbook (.xlsx), with no library: the parts are plain XML, zipped
// by hand and deflated with the platform's CompressionStream (browsers, Workers and Node 18+ all have it).
// The counterpart of readXlsx in ./xlsx.ts, and written so that readXlsx gives back the same cell text:
//   - "95", "95.00", "0.0975" are written as numbers (Excel can sum them); "95.00" keeps two decimals
//     on screen through the built-in 0.00 format. A number the reader would round (more than six
//     decimals, or one Excel cannot hold exactly) is written as text instead.
//   - "12.5%" is written as 0.125 with a percent format, which the reader turns back into "12.5%".
//   - Everything else is an inline string. An inline string is never a formula, so a name starting
//     with "=" is kept as typed (the CSV export's protective apostrophe is not needed here).
import { colName, type Sheet } from "./xlsx";

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const PERCENT = /^-?(0|[1-9]\d*)(\.\d+)?%$/;
/** Same rounding as the reader's: six decimals. */
const tidy = (x: number) => String(Math.round(x * 1e6) / 1e6);

// Style indexes into cellXfs below.
const S_BOLD = 1;
const S_2DP = 2;
const S_PCT = 3;
const S_PCT_2DP = 4;

/** Whether XML 1.0 can carry this code point at all (tab, newline, CR, and U+0020 up, less U+FFFE/F). */
const xmlAllowed = (c: number) =>
  c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c !== 0xfffe && c !== 0xffff);

const esc = (s: string) =>
  // Characters XML 1.0 cannot carry at all (a pasted control character would corrupt the file).
  Array.from(s, (ch) => (xmlAllowed(ch.codePointAt(0) ?? 0) ? ch : ""))
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One cell's XML, or "" for an empty cell. Exported for tests. */
export function cellXml(ref: string, text: string, header: boolean, asText = false): string {
  if (text === "") return "";
  const plain = header || asText;
  if (!plain && NUMBER.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n) && Number(tidy(n)) === n && Number(text) === Number(tidy(n))) {
      const twoDp = /\.\d\d$/.test(text);
      return `<c r="${ref}"${twoDp ? ` s="${S_2DP}"` : ""}><v>${tidy(n)}</v></c>`;
    }
  }
  if (!plain && PERCENT.test(text)) {
    const pct = Number(text.slice(0, -1));
    const v = pct / 100;
    // The reader gives back tidy(v * 100) + "%": write a number only when that is this text's value.
    if (Number.isFinite(v) && Number(tidy(v * 100)) === pct) {
      const style = text.includes(".") ? S_PCT_2DP : S_PCT;
      return `<c r="${ref}" s="${style}"><v>${String(v)}</v></c>`;
    }
  }
  const t = text.replace(/^'(?=[=+\-@])/, "");
  return `<c r="${ref}" t="inlineStr"${header ? ` s="${S_BOLD}"` : ""}><is><t xml:space="preserve">${esc(t)}</t></is></c>`;
}

function sheetXml(sheet: WriteSheet, headerRow: number | null): string {
  const asText = new Set(sheet.textColumns ?? []);
  const widths: number[] = [];
  const rows: string[] = [];
  sheet.grid.forEach((row, i) => {
    const r = i + 1;
    const cells = row.map((text, c) => {
      widths[c] = Math.max(widths[c] ?? 8, Math.min(60, text.length + 2));
      return cellXml(`${colName(c)}${r}`, text, r === headerRow, asText.has(c));
    });
    const body = cells.join("");
    if (body) rows.push(`<row r="${r}">${body}</row>`);
  });
  const cols = widths.length
    ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const pane =
    headerRow === 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows.join("")}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** A worksheet name Excel accepts: no []:*?/\, at most 31 characters, unique in the workbook. */
export function safeSheetName(name: string, taken: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/^'+|'+$/g, "")
      .trim()
      .slice(0, 31) || "Sheet";
  let out = base;
  for (let n = 2; taken.has(out.toLowerCase()); n++) {
    const tag = ` (${n})`;
    out = base.slice(0, 31 - tag.length) + tag;
  }
  taken.add(out.toLowerCase());
  return out;
}

export interface WriteSheet extends Sheet {
  /** 1-based row printed bold and frozen at the top; null for none. Default 1. */
  headerRow?: number | null;
  /**
   * 0-based columns always written as text: names and descriptions, where "1.50" must come back as
   * "1.50" and not as the number 1.5.
   */
  textColumns?: number[];
}

/** The workbook's parts, by path inside the ZIP. Exported for tests. */
export function workbookParts(sheets: WriteSheet[]): Record<string, string> {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet.");
  const taken = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, taken));
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const parts: Record<string, string> = {
    "[Content_Types].xml": `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map(
        (_s, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`,
    "_rels/.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": STYLES,
  };
  sheets.forEach((s, i) => {
    parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(
      s,
      s.headerRow === undefined ? 1 : s.headerRow,
    );
  });
  return parts;
}

// ---------------------------------------------------------------------------------------------
// ZIP (deflated entries, no ZIP64: a rate card is far below 4 GB)

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = (CRC[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** A ZIP of the given text files. Timestamps are 1980-01-01, so the same input gives the same bytes. */
export async function zipText(entries: Record<string, string>): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const out: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text);
    const data = await deflateRaw(raw);
    const nm = enc.encode(name);
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 8, true);
    local.setUint16(12, 0x0021, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nm.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 8, true);
    dir.setUint16(14, 0x0021, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, nm.length, true);
    dir.setUint32(42, offset, true);
    out.push(new Uint8Array(local.buffer), nm, data);
    central.push(new Uint8Array(dir.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length / 2, true);
  end.setUint16(10, central.length / 2, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  const all = [...out, ...central, new Uint8Array(end.buffer)];
  const bytes = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) {
    bytes.set(b, at);
    at += b.length;
  }
  return bytes;
}

/** The sheets as .xlsx bytes, in the order given. readXlsx reads back the same cell text. */
export async function writeXlsx(sheets: WriteSheet[]): Promise<Uint8Array> {
  return zipText(workbookParts(sheets));
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
