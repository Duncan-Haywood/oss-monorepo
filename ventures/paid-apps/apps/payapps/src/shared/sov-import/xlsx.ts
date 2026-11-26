// Reads an Excel workbook (.xlsx) into plain grids of cell text, with no library: the ZIP is read by hand and
// inflated with the platform's DecompressionStream (browsers, Workers and Node 18+ all have it). Ported from the
// public pay-application generator (oss-monorepo ventures/pay-application-generator/sheet.mjs, MIT, same owner).
// Only what a workbook needs: stored or deflated entries, no ZIP64, no encryption.

export type Grid = string[][];
export interface Sheet {
  name: string;
  /** grid[i] is spreadsheet row i + 1; grid[i][c] is column c (0 = A). Missing cells are "". */
  grid: Grid;
}

export class ImportError extends Error {}

const u16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u32 = (b: Uint8Array, o: number) =>
  ((b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16) | ((b[o + 3] ?? 0) << 24)) >>> 0;

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The entries of a ZIP file, each read on demand. */
export function unzip(input: ArrayBuffer | Uint8Array): Map<string, () => Promise<Uint8Array>> {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (b.length < 22 || u32(b, 0) !== 0x04034b50) {
    if (b.length >= 8 && u32(b, 0) === 0xe011cfd0)
      throw new ImportError(
        "This is an old .xls workbook. Open it in Excel and save it as .xlsx or CSV, then choose that file.",
      );
    throw new ImportError("This file is not an .xlsx workbook.");
  }
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0)
    throw new ImportError(
      "The workbook looks cut off (no ZIP directory). Save it again and retry.",
    );
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder();
  const files = new Map<string, () => Promise<Uint8Array>>();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new ImportError("The workbook's ZIP directory is damaged.");
    const flags = u16(b, p + 8);
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1)
      throw new ImportError(
        "This workbook is password-protected. Save an unprotected copy, or save the sheet as CSV.",
      );
    if (csize === 0xffffffff || local === 0xffffffff)
      throw new ImportError(
        "This workbook is too large to read here (ZIP64). Save the schedule of values on its own as CSV.",
      );
    files.set(name, async () => {
      if (u32(b, local) !== 0x04034b50)
        throw new ImportError(`The workbook entry ${name} is damaged.`);
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const data = b.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new ImportError(`The workbook entry ${name} uses a compression this page cannot read.`);
    });
  }
  return files;
}

const codePoint = (n: number) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "�");
export function xmlText(s: string): string {
  return s
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_m, e: string) =>
      e === "lt"
        ? "<"
        : e === "gt"
          ? ">"
          : e === "amp"
            ? "&"
            : e === "quot"
              ? '"'
              : e === "apos"
                ? "'"
                : codePoint(
                    e[1] === "x"
                      ? Number.parseInt(e.slice(2), 16)
                      : Number.parseInt(e.slice(1), 10),
                  ),
    )
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) =>
      String.fromCharCode(Number.parseInt(h, 16)),
    );
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m?.[1] !== undefined ? xmlText(m[1]) : null;
};
interface Tag {
  attrs: string;
  body: string;
}
const tags = (xml: string, name: string): Tag[] =>
  [
    ...xml.matchAll(
      new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${name}>)`, "g"),
    ),
  ].map((m) => ({ attrs: m[1] ?? "", body: m[2] ?? "" }));
const texts = (xml: string) =>
  tags(xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, ""), "t")
    .map((t) => xmlText(t.body))
    .join("");

/** "A" -> 0, "AB12" -> 27; null when the reference has no column letters. */
export function colIndex(ref: string): number | null {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m?.[1]) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}
/** 0 -> "A", 27 -> "AB". */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Marker for a formula cell saved without its result (files written by libraries that do not calculate). */
export const UNCALCULATED = "#UNCALCULATED";

// Number formats that show a percentage: built-in 9 and 10, or a custom code with % outside quotes.
function percentStyles(stylesXml: string | null): boolean[] {
  if (!stylesXml) return [];
  const custom = new Map(
    tags(stylesXml, "numFmt").map((t) => [
      attr(t.attrs, "numFmtId"),
      attr(t.attrs, "formatCode") ?? "",
    ]),
  );
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(stylesXml);
  if (!xfs?.[1]) return [];
  return tags(xfs[1], "xf").map((t) => {
    const id = attr(t.attrs, "numFmtId");
    if (id === "9" || id === "10") return true;
    const code = custom.get(id);
    return !!code && /%/.test(code.replace(/"[^"]*"/g, ""));
  });
}

const tidy = (x: number) => String(Math.round(x * 1e6) / 1e6);

function readSheetXml(xml: string, shared: string[], pctStyle: boolean[]): Grid {
  const grid: Grid = [];
  let rowSeq = 0;
  for (const row of tags(xml, "row")) {
    const r = Number(attr(row.attrs, "r")) || rowSeq + 1;
    rowSeq = r;
    if (r > 100_000) break;
    const cells: string[] = [];
    let colSeq = -1;
    for (const c of tags(row.body, "c")) {
      const ref = attr(c.attrs, "r");
      const col = (ref ? colIndex(ref) : null) ?? colSeq + 1;
      colSeq = col;
      if (col > 200) continue;
      const t = attr(c.attrs, "t");
      const s = Number(attr(c.attrs, "s") ?? 0);
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(c.body)?.[1];
      let out = "";
      if (t === "s") out = v !== undefined ? (shared[Number(v)] ?? "") : "";
      else if (t === "inlineStr") out = texts(c.body);
      else if (t === "str" || t === "e") out = v !== undefined ? xmlText(v) : "";
      else if (t === "b") out = v === undefined ? "" : v === "1" ? "TRUE" : "FALSE";
      else if (v === undefined && /<(?:\w+:)?f\b/.test(c.body)) out = UNCALCULATED;
      else if (v !== undefined) {
        const n = Number(v);
        out = !Number.isFinite(n) ? xmlText(v) : pctStyle[s] ? `${tidy(n * 100)}%` : tidy(n);
      }
      cells[col] = out;
    }
    grid[r - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(grid, (x) => x ?? []);
}

/** Every worksheet in the workbook, in tab order. */
export async function readXlsx(input: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const files = unzip(input);
  const get = async (name: string) => {
    const f = files.get(name);
    return f ? new TextDecoder().decode(await f()) : null;
  };
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new ImportError("This file is not an Excel workbook (no xl/workbook.xml).");
  const rels = (await get("xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map(
    tags(rels, "Relationship").map((t) => [attr(t.attrs, "Id"), attr(t.attrs, "Target")]),
  );
  const sst = await get("xl/sharedStrings.xml");
  const shared = sst ? tags(sst, "si").map((si) => texts(si.body)) : [];
  const pct = percentStyles(await get("xl/styles.xml"));
  const sheets: Sheet[] = [];
  for (const sh of tags(wb, "sheet")) {
    const target = targets.get(attr(sh.attrs, "r:id"));
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await get(path);
    if (xml)
      sheets.push({ name: attr(sh.attrs, "name") ?? path, grid: readSheetXml(xml, shared, pct) });
  }
  if (!sheets.length) throw new ImportError("No worksheets found in this workbook.");
  return sheets;
}
