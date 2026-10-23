// Legacy Excel (.xls, BIFF8) bank exports as CSV text, for the statement reader.
// An .xls is an OLE2 compound file holding a "Workbook" stream of BIFF records.
// This reads the sector chains, the shared string table (with its CONTINUE
// splits), the cell records (strings, numbers, RK, MULRK, booleans, formula
// results) and the number formats that make a number a date, then writes the
// busiest sheet as CSV through the same writer as xlsx.mjs. No dependency, nothing
// uploaded. BIFF5 (Excel 5/95) and password-protected files are refused by name.
import { BUILTIN_DATE, isDateCode, serialToIso, sheetsToCsv } from "./xlsx.mjs";

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const END = 0xfffffffe;

export const looksLikeXls = (bytes) => bytes.length > 512 && MAGIC.every((v, i) => bytes[i] === v);

// The named stream of an OLE2 file, as one Uint8Array.
function oleStream(b, wanted) {
  const ss = 1 << u16(b, 30), mss = 1 << u16(b, 32), cutoff = u32(b, 56);
  const sector = (n) => b.subarray(512 + n * ss, 512 + (n + 1) * ss);
  const difat = [];
  for (let i = 0; i < 109; i++) { const v = u32(b, 76 + i * 4); if (v < END) difat.push(v); }
  for (let s = u32(b, 68), k = u32(b, 72); k > 0 && s < END; k--) {
    const d = sector(s);
    for (let i = 0; i < ss / 4 - 1; i++) { const v = u32(d, i * 4); if (v < END) difat.push(v); }
    s = u32(d, ss - 4);
  }
  const fat = [];
  for (const s of difat) { const d = sector(s); for (let i = 0; i < ss / 4; i++) fat.push(u32(d, i * 4)); }
  const chain = (start, table) => { const out = []; for (let s = start, n = 0; s < END && n < table.length + 1; s = table[s], n++) out.push(s); return out; };
  const join = (parts, size) => { const o = new Uint8Array(parts.length * (parts[0]?.length ?? 0)); parts.forEach((p, i) => o.set(p, i * p.length)); return o.subarray(0, size); };
  const dir = join(chain(u32(b, 48), fat).map(sector), Infinity);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = u16(dir, o + 64);
    if (!nl) continue;
    entries.push({ name: new TextDecoder("utf-16le").decode(dir.subarray(o, o + nl - 2)), type: dir[o + 66], start: u32(dir, o + 116), size: u32(dir, o + 120) });
  }
  const hit = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!hit) return null;
  if (hit.size >= cutoff) return join(chain(hit.start, fat).map(sector), hit.size);
  const root = entries.find((e) => e.type === 5);
  const mini = join(chain(root.start, fat).map(sector), root.size);
  const miniFat = [];
  for (const s of chain(u32(b, 60), fat)) { const d = sector(s); for (let i = 0; i < ss / 4; i++) miniFat.push(u32(d, i * 4)); }
  return join(chain(hit.start, miniFat).map((n) => mini.subarray(n * mss, (n + 1) * mss)), hit.size);
}

// Reads a string table whose strings may run across CONTINUE records. At a record
// boundary inside the characters, the next record starts with a fresh flag byte.
class Chunks {
  constructor(c) { this.c = c; this.i = 0; this.o = 0; }
  left() { return this.c[this.i].length - this.o; }
  more() { return this.i < this.c.length - 1; }
  settle() { while (this.left() === 0 && this.more()) { this.i++; this.o = 0; } }
  u8() { this.settle(); return this.c[this.i][this.o++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  skip(n) { while (n > 0) { this.settle(); const k = Math.min(n, this.left()); if (!k) return; this.o += k; n -= k; } }
  chars(n, wide) {
    let out = "";
    while (n > 0) {
      if (this.left() === 0) { if (!this.more()) break; this.i++; this.o = 0; wide = this.u8() & 1; }
      const k = Math.min(n, wide ? this.left() >> 1 : this.left());
      if (!k) break;
      const part = this.c[this.i].subarray(this.o, this.o + (wide ? k * 2 : k));
      out += wide ? new TextDecoder("utf-16le").decode(part) : String.fromCharCode(...part);
      this.o += part.length; n -= k;
    }
    return out;
  }
  string() {
    const cch = this.u16(), flags = this.u8();
    const runs = flags & 8 ? this.u16() : 0, ext = flags & 4 ? this.u32() : 0;
    const s = this.chars(cch, flags & 1);
    this.skip(runs * 4 + ext);
    return s;
  }
}

function records(b) {
  const out = [];
  for (let p = 0; p + 4 <= b.length;) { const id = u16(b, p), len = u16(b, p + 2); out.push({ id, pos: p, d: b.subarray(p + 4, p + 4 + len) }); p += 4 + len; }
  return out;
}

const f64 = (d, o) => new DataView(d.buffer, d.byteOffset + o, 8).getFloat64(0, true);
export function rkValue(rk) {
  let v;
  if (rk & 2) v = rk >> 2;
  else { const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(4, (rk & 0xfffffffc) >>> 0, true); v = dv.getFloat64(0, true); }
  return rk & 1 ? v / 100 : v;
}

export function xlsToCsv(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!looksLikeXls(bytes)) throw new Error("not an Excel 97-2003 (.xls) file");
  const wb = oleStream(bytes, ["Workbook", "Book"]);
  if (!wb) throw new Error("this OLE file has no Excel workbook in it");
  const recs = records(wb);
  const bof = recs[0];
  if (!bof || bof.id !== 0x809) throw new Error("damaged workbook: no BOF record");
  if (u16(bof.d, 0) !== 0x600) throw new Error("this is an Excel 5/95 file (BIFF5); save it as .xlsx or CSV in Excel first");
  const sheets = [], formats = new Map(), xfFmt = [], strings = [];
  let epoch1904 = false;
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.id === 0x0a) break;
    if (r.id === 0x2f) throw new Error("this workbook is password protected; remove the password in Excel and export again");
    if (r.id === 0x22) epoch1904 = u16(r.d, 0) === 1;
    else if (r.id === 0x85) sheets.push({ pos: u32(r.d, 0), hidden: r.d[4] !== 0 });
    else if (r.id === 0x41e) { const c = new Chunks([r.d.subarray(2)]); formats.set(u16(r.d, 0), c.string()); }
    else if (r.id === 0xe0) xfFmt.push(u16(r.d, 2));
    else if (r.id === 0xfc) {
      const parts = [r.d.subarray(8)];
      while (recs[i + 1]?.id === 0x3c) parts.push(recs[++i].d);
      const c = new Chunks(parts), n = u32(r.d, 4);
      for (let k = 0; k < n && (c.left() > 0 || c.more()); k++) strings.push(c.string());
    }
  }
  const isDate = xfFmt.map((id) => BUILTIN_DATE.has(id) || (formats.has(id) && isDateCode(formats.get(id))));
  const out = [];
  for (const sh of sheets) {
    const rows = [];
    let cells = 0, pendingString = null;
    const put = (r, c, v) => {
      if (v === "" || v === undefined) return;
      (rows[r] ??= [])[c] = v; cells++;
    };
    const num = (xf, v) => (isDate[xf] && Number.isFinite(v) ? serialToIso(v, epoch1904) : String(+Number(v).toPrecision(12)));
    let depth = 0;
    for (const r of records(wb.subarray(sh.pos))) {
      const d = r.d;
      if (r.id === 0x809) { depth++; continue; }
      if (r.id === 0x0a) { if (--depth <= 0) break; continue; }
      if (depth !== 1) continue;
      if (r.id === 0xfd) put(u16(d, 0), u16(d, 2), strings[u32(d, 6)] ?? "");
      else if (r.id === 0x203) put(u16(d, 0), u16(d, 2), num(u16(d, 4), f64(d, 6)));
      else if (r.id === 0x27e) put(u16(d, 0), u16(d, 2), num(u16(d, 4), rkValue(u32(d, 6))));
      else if (r.id === 0xbd) {
        const row = u16(d, 0), first = u16(d, 2), last = u16(d, d.length - 2);
        for (let c = first; c <= last; c++) { const o = 4 + (c - first) * 6; put(row, c, num(u16(d, o), rkValue(u32(d, o + 2)))); }
      } else if (r.id === 0x204) put(u16(d, 0), u16(d, 2), new Chunks([d.subarray(6)]).string());
      else if (r.id === 0x205) { if (d[7] === 0) put(u16(d, 0), u16(d, 2), d[6] ? "TRUE" : "FALSE"); }
      else if (r.id === 0x06) {
        const row = u16(d, 0), col = u16(d, 2);
        if (u16(d, 12) === 0xffff) {
          if (d[6] === 0) pendingString = [row, col];
          else if (d[6] === 1) put(row, col, d[8] ? "TRUE" : "FALSE");
        } else put(row, col, num(u16(d, 4), f64(d, 6)));
      } else if (r.id === 0x207 && pendingString) { put(...pendingString, new Chunks([d]).string()); pendingString = null; }
    }
    if (cells) out.push({ cells, rows, hidden: sh.hidden });
  }
  const visible = out.filter((s) => !s.hidden);
  return sheetsToCsv(visible.length ? visible : out);
}
