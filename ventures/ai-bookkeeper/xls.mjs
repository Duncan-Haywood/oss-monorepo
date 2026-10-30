// Legacy Excel (.xls, BIFF8) bank exports as CSV text, for the statement reader.
// An .xls is an OLE2 compound file holding a "Workbook" stream of BIFF records.
// This reads the compound file's sector chains, then the records: the shared
// string table (with its CONTINUE splits), number formats and cell formats (to
// tell dates from numbers), and the cell records, and writes the busiest sheet
// as CSV in the same shape as xlsx.mjs. Nothing is uploaded and there is no
// dependency. BIFF5 (Excel 5/95/97 "Book" streams) are read too: byte strings in the
// workbook's code page, no shared string table. Password-protected ones are refused.
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
const u32 = (b, o) => i32(b, o) >>> 0;
const f64 = (b, o) => new DataView(b.buffer, b.byteOffset + o, 8).getFloat64(0, true);

export const looksLikeXls = (b) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

const ENDCHAIN = 0xfffffffe, FREE = 0xffffffff;

// The named stream of an OLE2 compound file, as one byte array.
export function oleStream(b, want = ["Workbook", "Book"]) {
  b = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (!looksLikeXls(b)) throw new Error("not an Excel 97-2003 (.xls) file");
  const shift = u16(b, 30), mshift = u16(b, 32);
  if ((shift !== 9 && shift !== 12) || mshift !== 6) throw new Error("this compound file header is damaged"); // a wild sector size once made the FAT walk allocate gigabytes
  const ss = 1 << shift, mss = 1 << mshift;
  const nFatSect = u32(b, 44), dirStart = u32(b, 48), cutoff = u32(b, 56), miniStart = u32(b, 60), nMini = u32(b, 64), difStart = u32(b, 68), nDif = u32(b, 72);
  const sector = (n) => b.subarray((n + 1) * ss, (n + 2) * ss);
  const per = ss / 4;
  const fatIds = [];
  for (let i = 0; i < 109 && fatIds.length < nFatSect; i++) { const v = u32(b, 76 + i * 4); if (v !== FREE) fatIds.push(v); }
  let d = difStart;
  const nSect = Math.floor(b.length / ss);
  for (let i = 0; i < nDif && i <= nSect && d < nSect; i++) { // a sector id past the file ends the walk; a bad count cannot spin
    const s = sector(d);
    for (let j = 0; j < per - 1 && fatIds.length < nFatSect; j++) { const v = u32(s, j * 4); if (v !== FREE) fatIds.push(v); }
    d = u32(s, ss - 4);
  }
  const fat = [];
  for (const id of fatIds) { const s = sector(id); for (let j = 0; j < per; j++) fat.push(u32(s, j * 4)); }
  const chain = (start, table) => { const out = []; for (let n = start, g = 0; n < ENDCHAIN && g < table.length + 1; n = table[n], g++) out.push(n); return out; };
  const read = (start) => { const parts = chain(start, fat).map(sector); const o = new Uint8Array(parts.length * ss); parts.forEach((p, i) => o.set(p, i * ss)); return o; };

  const dir = read(dirStart);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nlen = u16(dir, o + 64);
    if (!nlen || nlen > 64 || dir[o + 66] === 0) continue; // a name is at most 32 UTF-16 units; a wild length made this loop spin
    let name = ""; for (let i = 0; i < nlen / 2 - 1; i++) name += String.fromCharCode(u16(dir, o + i * 2));
    entries.push({ name, type: dir[o + 66], start: u32(dir, o + 116), size: u32(dir, o + 120) });
  }
  const root = entries.find((e) => e.type === 5);
  const hit = want.map((w) => entries.find((e) => e.type === 2 && e.name === w)).find(Boolean);
  if (!hit) throw new Error(entries.some((e) => e.name === "EncryptedPackage") ? "this workbook is password-protected" : "this compound file has no Excel workbook stream");
  if (hit.size >= cutoff) return read(hit.start).subarray(0, hit.size);
  // small streams live in the mini stream, a chain of 64-byte sectors inside the root's data
  const miniFat = [];
  for (const id of chain(miniStart, fat).slice(0, nMini)) { const s = sector(id); for (let j = 0; j < per; j++) miniFat.push(u32(s, j * 4)); }
  const store = read(root.start);
  const ids = chain(hit.start, miniFat);
  const o = new Uint8Array(ids.length * mss);
  ids.forEach((n, i) => o.set(store.subarray(n * mss, (n + 1) * mss), i * mss));
  return o.subarray(0, hit.size);
}

// BIFF records as { id, data }; CONTINUE (0x3c) records are kept separate so the string table can walk them.
function* records(w) {
  for (let p = 0; p + 4 <= w.length;) {
    const id = u16(w, p), len = u16(w, p + 2);
    yield { id, data: w.subarray(p + 4, p + 4 + len), at: p };
    p += 4 + len;
  }
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateCode = (code) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, ""));

// RK numbers: 30 bits of a double (or an integer), optionally divided by 100.
function rk(v) {
  let x;
  if (v & 2) x = v >> 2;
  else { const b = new Uint8Array(8); new DataView(b.buffer).setUint32(4, (v & 0xfffffffc) >>> 0, true); x = f64(b, 0); }
  return v & 1 ? x / 100 : x;
}

// Strings of a BIFF8 shared string table, which may be split across CONTINUE records
// (each continuation of a string repeats a one-byte "compressed" flag).
function readSst(chunks) {
  const total = u32(chunks[0], 4), strings = [];
  let ci = 0, p = 8, cur = chunks[0];
  while (strings.length < total && (p < cur.length || ci + 1 < chunks.length)) {
    if (p >= cur.length) { cur = chunks[++ci]; p = 0; }
    const len = u16(cur, p), flags = cur[p + 2]; p += 3;
    let runs = 0, ext = 0;
    if (flags & 8) { runs = u16(cur, p); p += 2; }
    if (flags & 4) { ext = u32(cur, p); p += 4; }
    let wide = flags & 1, s = "", left = len;
    while (left > 0) {
      if (p >= cur.length) { if (ci + 1 >= chunks.length) break; cur = chunks[++ci]; p = 0; wide = cur[p++] & 1; }
      const avail = Math.floor((cur.length - p) / (wide ? 2 : 1)), n = Math.min(left, avail);
      for (let i = 0; i < n; i++) s += String.fromCharCode(wide ? u16(cur, p + i * 2) : cur[p + i]);
      p += n * (wide ? 2 : 1); left -= n;
      if (n === 0) break;
    }
    // rich-text run table (4 bytes each) and phonetic data; they too may straddle a record boundary
    let skip = runs * 4 + ext;
    while (skip > 0) { if (p >= cur.length) { if (ci + 1 >= chunks.length) break; cur = chunks[++ci]; p = 0; } const n = Math.min(skip, cur.length - p); p += n; skip -= n; }
    strings.push(s);
  }
  return strings;
}

// A BIFF8 unicode string with a 2-byte length (LABEL, FORMAT, string results).
function xlString(d, p, lenBytes = 2) {
  const len = lenBytes === 2 ? u16(d, p) : d[p]; p += lenBytes;
  const flags = d[p++]; let runs = 0, ext = 0;
  if (flags & 8) { runs = u16(d, p); p += 2; }
  if (flags & 4) { ext = u32(d, p); p += 4; }
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(flags & 1 ? u16(d, p + i * 2) : d[p + i]);
  return { s, end: p + (flags & 1 ? len * 2 : len) + runs * 4 + ext };
}

function serialToIso(v, epoch1904) {
  const d = new Date(Date.UTC(1899, 11, 30) + (Math.floor(v) + (epoch1904 ? 1462 : 0)) * 86400000);
  return d.toISOString().slice(0, 10);
}
const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// BIFF5 strings are bytes in the workbook's ANSI code page (CODEPAGE record), not UTF-16.
const decodeBytes = (d, p, n, page) => {
  try { return new TextDecoder(page === 1252 || !page ? "windows-1252" : `windows-${page}`).decode(d.subarray(p, p + n)); }
  catch { return new TextDecoder("windows-1252").decode(d.subarray(p, p + n)); }
};

export function xlsToCsv(bytes) {
  const w = oleStream(bytes);
  let biff5 = false, codepage = 1252;
  let sstChunks = null, epoch1904 = false;
  const formats = new Map(), xfFmt = [], sheets = [];
  let sheet = null, depth = 0;
  const put = (r, c, v) => { if (!sheet) return; (sheet.rows[r] ??= [])[c] = v; if (v !== "") sheet.cells++; };
  let isDate = [];
  const num = (xf, v) => (isDate[xf] && Number.isFinite(v) ? serialToIso(v, epoch1904) : String(+Number(v).toPrecision(12)));
  const recs = [...records(w)];
  // pass 1: globals (formats, xfs, date mode, string table)
  for (let i = 0; i < recs.length; i++) {
    const { id, data } = recs[i];
    if (id === 0x0809) { depth++; if (depth === 1) { const v = data.length >= 4 ? u16(data, 0) : 0; if (v === 0x500) biff5 = true; else if (v !== 0x600) throw new Error("only Excel 5.0 to 2003 (BIFF5 and BIFF8) workbooks are read; save this one as .xlsx or CSV"); } }
    if (id === 0x0042) codepage = u16(data, 0);
    if (id === 0x002f) throw new Error("this workbook is password-protected");
    if (id === 0x0022) epoch1904 = u16(data, 0) === 1;
    if (id === 0x041e) formats.set(u16(data, 0), biff5 ? decodeBytes(data, 3, data[2], codepage) : xlString(data, 2).s);
    if (id === 0x00e0) xfFmt.push(u16(data, 2));
    if (id === 0x00fc) { const chunks = [data]; while (recs[i + 1]?.id === 0x003c) chunks.push(recs[++i].data); sstChunks = chunks; }
    if (id === 0x000a) { if (depth) depth--; if (!depth) break; }
  }
  isDate = xfFmt.map((f) => BUILTIN_DATE.has(f) || (formats.has(f) && isDateCode(formats.get(f))));
  const strings = sstChunks ? readSst(sstChunks) : [];
  // pass 2: the sheet substreams
  depth = 0;
  for (let i = 0; i < recs.length; i++) {
    const { id, data } = recs[i];
    if (id === 0x0809) {
      depth++;
      const type = u16(data, 2);
      if (depth === 1 && type === 0x10) { sheet = { rows: [], cells: 0 }; sheets.push(sheet); }
      else if (depth === 1) sheet = null;
      continue;
    }
    if (id === 0x000a) { depth = Math.max(0, depth - 1); if (!depth) { sheet = null; } continue; }
    if (!sheet || depth !== 1) continue;
    switch (id) {
      case 0x027e: put(u16(data, 0), u16(data, 2), num(u16(data, 4), rk(i32(data, 6)))); break;
      case 0x00bd: { // MULRK
        const r = u16(data, 0), c0 = u16(data, 2), c1 = u16(data, data.length - 2);
        for (let c = c0, p = 4; c <= c1; c++, p += 6) put(r, c, num(u16(data, p), rk(i32(data, p + 2))));
        break;
      }
      case 0x0203: put(u16(data, 0), u16(data, 2), num(u16(data, 4), f64(data, 6))); break;
      case 0x00fd: put(u16(data, 0), u16(data, 2), strings[u32(data, 6)] ?? ""); break;
      case 0x0204: put(u16(data, 0), u16(data, 2), biff5 ? decodeBytes(data, 8, u16(data, 6), codepage) : xlString(data, 6).s); break;
      case 0x0205: put(u16(data, 0), u16(data, 2), data[7] === 0 ? (data[6] ? "TRUE" : "FALSE") : ""); break;
      case 0x0006: { // FORMULA: the cached result; a string result follows in a STRING record
        const r = u16(data, 0), c = u16(data, 2);
        if (data[12] === 0xff && data[13] === 0xff) {
          if (data[6] === 0 && recs[i + 1]?.id === 0x0207) { const sd = recs[++i].data; put(r, c, biff5 ? decodeBytes(sd, 2, u16(sd, 0), codepage) : xlString(sd, 0).s); }
          else if (data[6] === 1) put(r, c, data[8] ? "TRUE" : "FALSE");
        } else put(r, c, num(u16(data, 4), f64(data, 6)));
        break;
      }
      default:
    }
  }
  const best = sheets.reduce((a, s) => (!a || s.cells > a.cells ? s : a), null);
  if (!best || !best.cells) throw new Error("this workbook has no cells with data");
  const width = Math.max(...best.rows.filter(Boolean).map((r) => r.length));
  const lines = [];
  for (const r of best.rows) { if (!r) continue; lines.push(Array.from({ length: width }, (_, i) => csvCell(r[i] ?? "")).join(",")); }
  return lines.join("\n") + "\n";
}
