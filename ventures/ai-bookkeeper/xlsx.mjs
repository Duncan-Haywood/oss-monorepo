// Excel (.xlsx) bank exports as CSV text, for the statement reader. An .xlsx is a
// zip of XML parts; this reads the zip directory, inflates the parts with the
// platform's deflate-raw (DecompressionStream in a browser, node:zlib in the CLI),
// and writes the busiest worksheet as CSV: shared and inline strings resolved,
// date-formatted numbers turned into YYYY-MM-DD, other numbers kept as written.
// Nothing is uploaded and there is no dependency.
const dec = new TextDecoder("utf-8");
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Entries of a zip: name -> { method, bytes } (still compressed when method is 8).
export function zipEntries(b) {
  b = b instanceof Uint8Array ? b : new Uint8Array(b);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("not a zip file (an .xlsx is one)");
  const n = u16(b, e + 10);
  let p = u32(b, e + 16);
  const out = new Map();
  for (let i = 0; i < n; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("damaged zip directory");
    const method = u16(b, p + 10), csize = u32(b, p + 20), nlen = u16(b, p + 28), xlen = u16(b, p + 30), clen = u16(b, p + 32), lho = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    const start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
    out.set(name, { method, bytes: b.subarray(start, start + csize) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const wanted = (name) => /^xl\/(sharedStrings\.xml|styles\.xml|workbook\.xml|worksheets\/[^/]+\.xml)$/.test(name);
const isXlsx = (z) => z.has("xl/workbook.xml") || z.has("[Content_Types].xml");

async function inflateRawAsync(bytes) {
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot decompress .xlsx files");
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  w.write(bytes).catch(() => {}); w.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export async function xlsxToCsv(bytes) {
  const z = zipEntries(bytes);
  const parts = {};
  for (const [name, f] of z) if (wanted(name)) parts[name] = dec.decode(f.method === 0 ? f.bytes : await inflateRawAsync(f.bytes));
  return partsToCsv(parts, z);
}

// The same for the CLI, where file reading is synchronous.
export function xlsxToCsvSync(bytes) {
  const zlib = globalThis.process?.getBuiltinModule?.("node:zlib");
  if (!zlib) throw new Error("xlsxToCsvSync needs Node 22 or later");
  const z = zipEntries(bytes);
  const parts = {};
  for (const [name, f] of z) if (wanted(name)) parts[name] = dec.decode(f.method === 0 ? f.bytes : zlib.inflateRawSync(f.bytes));
  return partsToCsv(parts, z);
}

export const looksLikeXlsx = (bytes) => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;

const unesc = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, k) => {
  if (k[0] === "#") return String.fromCodePoint(k[1] === "x" || k[1] === "X" ? parseInt(k.slice(2), 16) : +k.slice(1));
  return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[k.toLowerCase()];
});
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join("");
const colIndex = (ref) => { let n = 0; for (const c of ref.match(/^[A-Z]+/)[0]) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateCode = (code) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, ""));

function dateStyles(styles) {
  const codes = new Map([...styles.matchAll(/<numFmt\s[^>]*?numFmtId="(\d+)"[^>]*?formatCode="([^"]*)"/g)].map((m) => [+m[1], unesc(m[2])]));
  const xfs = styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  return [...xfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"/g)].map((m) => { const id = +m[1]; return BUILTIN_DATE.has(id) || (codes.has(id) && isDateCode(codes.get(id))); });
}

function serialToIso(v, epoch1904) {
  const days = Math.floor(v);
  const d = new Date(Date.UTC(1899, 11, 30) + (days + (epoch1904 ? 1462 : 0)) * 86400000);
  return d.toISOString().slice(0, 10);
}

const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function partsToCsv(parts, z) {
  if (!isXlsx(z)) throw new Error("this zip is not an Excel workbook");
  const strings = [...(parts["xl/sharedStrings.xml"] ?? "").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const isDate = dateStyles(parts["xl/styles.xml"] ?? "");
  const epoch1904 = /<workbookPr[^>]*date1904="(1|true)"/.test(parts["xl/workbook.xml"] ?? "");
  let best = null;
  for (const [name, xml] of Object.entries(parts)) {
    if (!name.startsWith("xl/worksheets/")) continue;
    const rows = [];
    let auto = 0, cells = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = /\br="(\d+)"/.exec(rm[1]); const ri = rn ? +rn[1] - 1 : auto; auto = ri + 1;
      const row = [];
      let ci = 0;
      for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = cm[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(at); if (ref) ci = colIndex(ref[1]);
        const t = /\bt="(\w+)"/.exec(at)?.[1] ?? "n", s = /\bs="(\d+)"/.exec(at);
        const body = cm[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let out = "";
        if (t === "inlineStr") out = textOf(body);
        else if (v === undefined) out = "";
        else if (t === "s") out = strings[+v] ?? "";
        else if (t === "str" || t === "e") out = unesc(v);
        else if (t === "b") out = v === "1" ? "TRUE" : "FALSE";
        else if (s && isDate[+s[1]] && Number.isFinite(+v)) out = serialToIso(+v, epoch1904);
        else out = Number.isFinite(+v) ? String(+Number(v).toPrecision(12)) : v;
        if (out !== "") cells++;
        row[ci++] = out;
      }
      rows[ri] = row;
    }
    if (!best || cells > best.cells) best = { cells, rows };
  }
  if (!best || !best.cells) throw new Error("this workbook has no cells with data");
  const width = Math.max(...best.rows.filter(Boolean).map((r) => r.length));
  const lines = [];
  for (const r of best.rows) { if (!r) continue; lines.push(Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(",")); }
  return lines.join("\n") + "\n";
}
