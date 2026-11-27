// A minimal .xlsx writer for test fixtures: real deflate, real ZIP directory, CRC-32 filled in.
// Copied from apps/payapps/src/shared/sov-import/sov-import.test.ts (2026-11-26).
import { colName } from "../../src/shared/xlsx";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = (CRC[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
async function deflate(bytes: Uint8Array) {
  const s = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function zip(entries: Record<string, string>, store = false) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = enc.encode(text);
    const data = store ? raw : await deflate(raw);
    const nm = enc.encode(name);
    const crc = crc32(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, store ? 0 : 8, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, raw.length, true);
    h.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(10, store ? 0 : 8, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, raw.length, true);
    c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, data);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((a, x) => a + x.length, 0);
  const n = Object.keys(entries).length;
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, n, true);
  e.setUint16(10, n, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)] as BlobPart[];
  return new Uint8Array(await new Blob(all).arrayBuffer());
}
export type Cell =
  | string
  | number
  | null
  | { f: string; v?: number }
  | { err: string }
  | { inline: string };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export async function workbook(sheets: Record<string, Record<number, Cell[]>>, store = false) {
  const shared: string[] = [];
  const si = (s: string) => {
    let i = shared.indexOf(s);
    if (i < 0) {
      i = shared.length;
      shared.push(s);
    }
    return i;
  };
  const files: Record<string, string> = {};
  const names = Object.keys(sheets);
  names.forEach((name, n) => {
    const rows = Object.entries(sheets[name] ?? {})
      .map(
        ([r, cells]) =>
          `<row r="${r}">${cells
            .map((v, c) => {
              const ref = `${colName(c)}${r}`;
              if (v === null || v === "") return "";
              if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
              if (typeof v === "string") return `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
              if ("f" in v)
                return `<c r="${ref}"><f>${esc(v.f)}</f>${v.v === undefined ? "" : `<v>${v.v}</v>`}</c>`;
              if ("err" in v) return `<c r="${ref}" t="e"><v>${esc(v.err)}</v></c>`;
              return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    files[`xl/worksheets/sheet${n + 1}.xml`] =
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  files["xl/workbook.xml"] =
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((nm, n) => `<sheet name="${esc(nm)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join("")}</sheets></workbook>`;
  files["xl/_rels/workbook.xml.rels"] =
    `<?xml version="1.0"?><Relationships>${names.map((_nm, n) => `<Relationship Id="rId${n + 1}" Target="worksheets/sheet${n + 1}.xml"/>`).join("")}</Relationships>`;
  files["xl/sharedStrings.xml"] =
    `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;
  return zip(files, store);
}
