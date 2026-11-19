// Minimal ZIP reader for GTFS feeds: central directory, stored and deflated
// entries, ZIP64 sizes. No dependencies; inflation uses the platform's
// DecompressionStream("deflate-raw") (every current browser, Node 18+).
// Written from the PKWARE APPNOTE.TXT layout (sections 4.3.7, 4.3.12, 4.3.16,
// 4.5.3); no code borrowed.

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_EOCD64_LOC = 0x07064b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

export function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5) && (bytes[3] === 4 || bytes[3] === 6);
}

function findEocd(dv) {
  const min = Math.max(0, dv.byteLength - 22 - 65535);
  for (let i = dv.byteLength - 22; i >= min; i--) if (dv.getUint32(i, true) === SIG_EOCD) return i;
  return -1;
}

// Lists entries without inflating anything: [{ name, method, compressedSize, size, offset }].
export function listEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(dv);
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record); the file may be truncated");
  let count = dv.getUint16(eocd + 10, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === SIG_EOCD64_LOC) {
      const at = Number(dv.getBigUint64(loc + 8, true));
      if (dv.getUint32(at, true) === SIG_EOCD64) {
        count = Number(dv.getBigUint64(at + 32, true));
        cdOffset = Number(dv.getBigUint64(at + 48, true));
      }
    }
  }
  const out = [];
  let p = cdOffset;
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > dv.byteLength || dv.getUint32(p, true) !== SIG_CEN) throw new Error("zip central directory is damaged");
    const method = dv.getUint16(p + 10, true);
    let compressedSize = dv.getUint32(p + 20, true);
    let size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    let offset = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extended information extra field (header id 0x0001).
    let e = p + 46 + nameLen;
    const end = e + extraLen;
    while (e + 4 <= end) {
      const id = dv.getUint16(e, true), len = dv.getUint16(e + 2, true);
      if (id === 1) {
        let q = e + 4;
        if (size === 0xffffffff) { size = Number(dv.getBigUint64(q, true)); q += 8; }
        if (compressedSize === 0xffffffff) { compressedSize = Number(dv.getBigUint64(q, true)); q += 8; }
        if (offset === 0xffffffff) { offset = Number(dv.getBigUint64(q, true)); q += 8; }
      }
      e += 4 + len;
    }
    out.push({ name, method, compressedSize, size, offset });
    p = end + commentLen;
  }
  return out;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readEntry(bytes, entry) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(entry.offset, true) !== SIG_LOC) throw new Error(`zip entry ${entry.name} is damaged`);
  const nameLen = dv.getUint16(entry.offset + 26, true);
  const extraLen = dv.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error(`zip entry ${entry.name} uses compression method ${entry.method}; only stored (0) and deflate (8) are supported`);
}

// Reads every entry into { name: Uint8Array }. Directory entries are skipped.
export async function readZip(bytes) {
  const files = {};
  for (const e of listEntries(bytes)) {
    if (e.name.endsWith("/")) continue;
    files[e.name] = await readEntry(bytes, e);
  }
  return files;
}

// Builds a stored (uncompressed) zip from { name: string|Uint8Array }: used by
// the tests and the page's example feeds, so they need no binary fixtures.
// `deflate(bytes) -> bytes` (raw DEFLATE), when given, stores entries
// compressed (method 8) instead, so the tests can cover inflation too.
export function writeStoredZip(files, deflate = null) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = typeof body === "string" ? enc.encode(body) : body;
    const crc = crc32(raw);
    const data = deflate ? deflate(raw) : raw;
    const method = deflate ? 8 : 0;
    const loc = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(loc.buffer);
    lv.setUint32(0, SIG_LOC, true); lv.setUint16(4, 20, true); lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    loc.set(nameBytes, 30);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, SIG_CEN, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    parts.push(loc, data); central.push(cen);
    offset += loc.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

let CRC_TABLE;
function crc32(data) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Reads a GTFS zip into { name: text } for checkFeed: .txt and .geojson
// entries, decoded as UTF-8 (a byte-order mark is dropped by the CSV reader).
export async function feedTextsFromZip(bytes) {
  const dec = new TextDecoder("utf-8");
  const out = {};
  for (const e of listEntries(bytes)) {
    if (e.name.endsWith("/") || !/\.(txt|geojson)$/i.test(e.name)) continue;
    out[e.name] = dec.decode(await readEntry(bytes, e));
  }
  return out;
}
