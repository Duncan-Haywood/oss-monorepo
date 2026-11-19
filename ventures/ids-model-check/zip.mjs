// Reads an .ifczip: a zip archive holding one IFC model (.ifc or .ifcxml).
// Runs in Node and the browser; the caller passes the raw-deflate inflater
// (node:zlib's inflateRawSync in Node, DecompressionStream("deflate-raw") in a
// browser), so this file imports nothing.
//
// zipEntries(bytes) -> [{ name, method, size, csize, offset }]
// await unzipModel(bytes, inflateRaw) -> { name, text }
//   Picks the first .ifc, then .ifcxml/.xml, entry (folders and __MACOSX
//   skipped). Stored (0) and deflate (8) entries, zip64 sizes and offsets
//   (.NET writes them even for small files); no encryption.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;
const MAX32 = 0xffffffff;

export function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

export function zipEntries(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip archive (no end-of-directory record)");
  let count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  if (p === MAX32 || count === 0xffff) {
    // zip64 end-of-directory locator sits just before the classic record.
    const loc = eocd - 20;
    if (loc < 0 || u32(bytes, loc) !== 0x07064b50) throw new Error("zip64 archive without its locator");
    const z = u64(bytes, loc + 8);
    if (u32(bytes, z) !== 0x06064b50) throw new Error("zip64 end-of-directory record is damaged");
    count = u64(bytes, z + 32);
    p = u64(bytes, z + 48);
  }
  const out = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("zip central directory is damaged");
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    let csize = u32(bytes, p + 20);
    let size = u32(bytes, p + 24);
    const nlen = u16(bytes, p + 28);
    const xlen = u16(bytes, p + 30);
    const clen = u16(bytes, p + 32);
    let offset = u32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    // zip64 extra field (0x0001): the 64-bit values, in this order, of those
    // fields set to 0xFFFFFFFF above.
    for (let x = p + 46 + nlen, end = x + xlen; x + 4 <= end; ) {
      const tag = u16(bytes, x), len = u16(bytes, x + 2);
      if (tag === 1) {
        let q = x + 4;
        if (size === MAX32) { size = u64(bytes, q); q += 8; }
        if (csize === MAX32) { csize = u64(bytes, q); q += 8; }
        if (offset === MAX32) { offset = u64(bytes, q); q += 8; }
      }
      x += 4 + len;
    }
    out.push({ name, method, size, csize, offset, encrypted: !!(flags & 1) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export function pickModel(entries) {
  const files = entries.filter((e) => !e.name.endsWith("/") && !/(^|\/)__MACOSX\//.test(e.name) && !/(^|\/)\._/.test(e.name));
  return files.find((e) => /\.ifc$/i.test(e.name)) || files.find((e) => /\.(ifcxml|xml)$/i.test(e.name)) || null;
}

// { name, text }, or { name, bytes } (the unpacked file) with opts.bytes.
export async function unzipModel(bytes, inflateRaw, opts = {}) {
  const entries = zipEntries(bytes);
  const e = pickModel(entries);
  if (!e) throw new Error(`no .ifc or .ifcxml file in the archive (found: ${entries.map((x) => x.name).join(", ") || "nothing"})`);
  const data = await readEntry(bytes, e, inflateRaw);
  return opts.bytes ? { name: e.name, bytes: data } : { name: e.name, text: new TextDecoder().decode(data) };
}

// One entry's unpacked bytes (stored or deflate).
export async function readEntry(bytes, e, inflateRaw) {
  if (e.encrypted) throw new Error(`${e.name} is encrypted`);
  const o = e.offset;
  if (u32(bytes, o) !== 0x04034b50) throw new Error("zip local header is damaged");
  const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28);
  const raw = bytes.subarray(start, start + e.csize);
  let data;
  if (e.method === 0) data = raw;
  else if (e.method === 8) data = await inflateRaw(raw);
  else throw new Error(`${e.name} uses zip method ${e.method}; only stored and deflate are read`);
  if (data.length !== e.size) throw new Error(`${e.name} unpacked to ${data.length} bytes, the archive says ${e.size}`);
  return data;
}

// Browser inflater, for the page.
export async function inflateRawStream(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
