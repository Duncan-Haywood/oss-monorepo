// Reads the JPEG previews cameras embed in their raw files, plus the shooting
// metadata a culler needs (camera, lens, exposure, capture time, orientation).
//
// Works in the browser and in Node on a Uint8Array; no dependencies. Nothing
// here decodes raw sensor data: every raw format below carries a camera-made
// JPEG (often full size), and reading that is what makes culling hundreds of
// raws fast. ShootFlow's Python readers (src/shootflow/*.py) do the real
// development.
//
// Formats: TIFF-based raws (NEF, NRW, ARW, SR2, CR2, DNG, PEF, ORF, RW2, SRW,
// ERF, 3FR, IIQ, RWL, DCR, KDC), Canon CR3 (ISO BMFF boxes), Fujifilm RAF
// (header pointer), and plain JPEG. When the structured pointers give no
// usable JPEG, a byte scan for JPEG streams is the fallback.

const RAW_EXT = /\.(nef|nrw|arw|srf|sr2|cr2|cr3|crw|dng|pef|orf|rw2|raw|rwl|srw|raf|erf|3fr|fff|iiq|mos|dcr|kdc|mef|mrw|x3f|jpe?g)$/i;

export function isCandidateFile(name) {
  return RAW_EXT.test(name || "");
}

// ---------------------------------------------------------------- byte views

// While readRaw runs, every byte range the parser looks at is noted here, so
// readRawFile can fetch just those ranges from a File instead of the whole
// raw (25-60 MB each; the structure and preview headers are a few hundred kB).
let NEED = null;
const need = (o, len) => { if (NEED && o >= 0 && len > 0) NEED.push([o, len]); };

function makeView(bytes, little) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length;
  return {
    bytes,
    little,
    n,
    u8: (o) => (o >= 0 && o < n ? bytes[o] : 0),
    u16: (o) => (o >= 0 && o + 2 <= n ? dv.getUint16(o, little) : 0),
    u32: (o) => (o >= 0 && o + 4 <= n ? dv.getUint32(o, little) : 0),
    i32: (o) => (o >= 0 && o + 4 <= n ? dv.getInt32(o, little) : 0),
  };
}

const be16 = (b, o) => (b[o] << 8) | b[o + 1];
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function ascii(b, o, len) {
  need(o, len);
  let s = "";
  for (let i = 0; i < len && o + i < b.length; i++) {
    const c = b[o + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ---------------------------------------------------------------- JPEG

// Walks a JPEG's marker segments from `start`. Returns its frame size and kind
// (baseline/progressive decode in every browser; lossless SOF3, used for raw
// sensor data inside CR2 and DNG, does not) and, when `length` is unknown,
// finds the end by scanning the entropy-coded data for EOI.
export function probeJpeg(b, start, length) {
  const end = length ? Math.min(b.length, start + length) : b.length;
  if (start < 0 || start + 4 > end || b[start] !== 0xff || b[start + 1] !== 0xd8) return null;
  let p = start + 2;
  let width = 0, height = 0, sof = -1, orientation = 0, exif = null;
  while (p + 4 <= end) {
    need(p, 4);
    if (b[p] !== 0xff) return null;
    let m = b[p + 1];
    while (m === 0xff && p + 2 < end) { p++; m = b[p + 1]; }
    if (m === 0xd9) return null; // EOI before any scan
    if (m >= 0xd0 && m <= 0xd7) { p += 2; continue; }
    const segLen = be16(b, p + 2);
    if (segLen < 2) return null;
    need(p, segLen + 6);
    if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      sof = m;
      height = be16(b, p + 5);
      width = be16(b, p + 7);
    } else if (m === 0xe1 && !exif && b[p + 4] === 0x45 && b[p + 5] === 0x78 && b[p + 6] === 0x69 && b[p + 7] === 0x66) {
      exif = { offset: p + 10, length: segLen - 8 };
    }
    if (m === 0xda) {
      p += 2 + segLen;
      break;
    }
    p += 2 + segLen;
  }
  if (sof < 0 || !width || !height) return null;
  let jpegEnd;
  if (length) {
    jpegEnd = end;
  } else {
    jpegEnd = -1;
    for (let q = p; q + 1 < end; q++) {
      if (b[q] !== 0xff) continue;
      const m = b[q + 1];
      if (m === 0x00 || m === 0xff || (m >= 0xd0 && m <= 0xd7)) continue;
      if (m === 0xd9) { jpegEnd = q + 2; break; }
      // Another marker inside the scan area (DHT/SOS of a progressive JPEG):
      // skip its segment.
      if (m === 0xc4 || m === 0xda || m === 0xdb || m === 0xdd || (m >= 0xe0 && m <= 0xef) || m === 0xfe) {
        q += 1 + be16(b, q + 2);
        continue;
      }
      break;
    }
    if (jpegEnd < 0) return null;
  }
  const decodable = sof === 0xc0 || sof === 0xc1 || sof === 0xc2;
  return { offset: start, length: jpegEnd - start, width, height, sof, decodable, exif };
}

// ---------------------------------------------------------------- TIFF / EXIF

const T = {
  ImageWidth: 0x100, ImageLength: 0x101, Compression: 0x103, Photometric: 0x106,
  Make: 0x10f, Model: 0x110, StripOffsets: 0x111, Orientation: 0x112, StripByteCounts: 0x117,
  SubIFDs: 0x14a, JpegOffset: 0x201, JpegLength: 0x202, DateTime: 0x132,
  ExifIFD: 0x8769, ExposureTime: 0x829a, FNumber: 0x829d, ISO: 0x8827,
  DateTimeOriginal: 0x9003, SubSecTimeOriginal: 0x9291, FocalLength: 0x920a, LensModel: 0xa434,
  BodySerial: 0xa431, MakerNote: 0x927c, RW2JpgFromRaw: 0x2e, RW2ISO: 0x17,
  DNGVersion: 0xc612, UniqueCameraModel: 0xc614,
};

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];

function readIfd(v, ifdOff, base = 0) {
  const tags = new Map();
  const at = base + ifdOff;
  need(at, 2);
  const count = v.u16(at);
  need(at + 2, count * 12 + 4);
  if (!count || count > 1000 || at + 2 + count * 12 > v.n) return { tags, next: 0 };
  for (let i = 0; i < count; i++) {
    const e = at + 2 + i * 12;
    const tag = v.u16(e), type = v.u16(e + 2), cnt = v.u32(e + 4);
    const size = (TYPE_SIZE[type] || 1) * cnt;
    const valueAt = size <= 4 ? e + 8 : base + v.u32(e + 8);
    tags.set(tag, { type, count: cnt, at: valueAt, size });
  }
  return { tags, next: v.u32(at + 2 + count * 12) };
}

function tagNums(v, t) {
  if (!t) return [];
  const out = [];
  const n = Math.min(t.count, 4096);
  need(t.at, Math.min(t.size, 4096 * 8));
  for (let i = 0; i < n; i++) {
    switch (t.type) {
      case 1: case 7: out.push(v.u8(t.at + i)); break;
      case 3: case 8: out.push(v.u16(t.at + i * 2)); break;
      case 4: case 9: case 13: out.push(v.u32(t.at + i * 4)); break;
      case 5: { const d = v.u32(t.at + i * 8 + 4); out.push(d ? v.u32(t.at + i * 8) / d : 0); break; }
      case 10: { const d = v.i32(t.at + i * 8 + 4); out.push(d ? v.i32(t.at + i * 8) / d : 0); break; }
      default: return out;
    }
  }
  return out;
}
const tagNum = (v, t) => tagNums(v, t)[0];
const tagStr = (v, t) => (t && t.type === 2 ? ascii(v.bytes, t.at, t.count) : undefined);

function tiffHeader(b, at = 0) {
  const o0 = b[at], o1 = b[at + 1];
  let little;
  if (o0 === 0x49 && o1 === 0x49) little = true;
  else if (o0 === 0x4d && o1 === 0x4d) little = false;
  else return null;
  const v = makeView(b, little);
  const magic = v.u16(at + 2);
  // 42 TIFF; 0x4f52/0x5352 Olympus ORF; 0x55 Panasonic RW2.
  if (magic !== 42 && magic !== 0x4f52 && magic !== 0x5352 && magic !== 0x55) return null;
  return { v, magic, first: v.u32(at + 4) };
}

// Fills `meta` from one IFD's tags (only fields not already set).
function absorb(meta, v, tags) {
  const set = (k, val) => { if (val !== undefined && val !== "" && meta[k] === undefined) meta[k] = val; };
  set("make", tagStr(v, tags.get(T.Make)));
  set("model", tagStr(v, tags.get(T.Model)));
  const or = tagNum(v, tags.get(T.Orientation));
  if (or >= 1 && or <= 8) set("orientation", or);
  set("exposureTime", tagNum(v, tags.get(T.ExposureTime)));
  set("fNumber", tagNum(v, tags.get(T.FNumber)));
  set("iso", tagNum(v, tags.get(T.ISO)));
  set("focalLength", tagNum(v, tags.get(T.FocalLength)));
  set("lens", tagStr(v, tags.get(T.LensModel)));
  set("serial", tagStr(v, tags.get(T.BodySerial)));
  const dto = tagStr(v, tags.get(T.DateTimeOriginal));
  if (dto) {
    set("captured", dto);
    const sub = tagStr(v, tags.get(T.SubSecTimeOriginal));
    if (sub) set("subsec", sub);
  }
}

// Walks a TIFF structure (IFD chain, SubIFDs, EXIF IFD) at `base`, collecting
// metadata and JPEG candidates. `abs` maps offsets inside an embedded TIFF
// (e.g. JPEG APP1) back to the file.
function walkTiff(b, base, meta, cands, opts = {}) {
  const h = tiffHeader(b, base);
  if (!h) return null;
  const { v } = h;
  const seen = new Set();
  const visit = (off, depth, kind) => {
    if (!off || depth > 4 || seen.has(off) || base + off >= b.length) return;
    seen.add(off);
    const { tags, next } = readIfd(v, off, base);
    if (!tags.size) return;
    absorb(meta, v, tags);
    if (tags.has(T.DNGVersion)) meta.dng = true;
    // RW2 keeps ISO in its own tag 0x17.
    if (h.magic === 0x55 && meta.iso === undefined) {
      const iso = tagNum(v, tags.get(T.RW2ISO));
      if (iso) meta.iso = iso;
    }
    if (!opts.metaOnly) {
      const jo = tagNum(v, tags.get(T.JpegOffset)), jl = tagNum(v, tags.get(T.JpegLength));
      if (jo && jl) cands.push({ offset: base + jo, length: jl, source: `${kind} JPEGInterchangeFormat` });
      const comp = tagNum(v, tags.get(T.Compression));
      const photo = tagNum(v, tags.get(T.Photometric));
      if ((comp === 6 || comp === 7) && photo !== 32803 && photo !== 34892) {
        const so = tagNums(v, tags.get(T.StripOffsets)), sc = tagNums(v, tags.get(T.StripByteCounts));
        if (so.length === 1 && sc.length === 1 && so[0] && sc[0]) {
          cands.push({ offset: base + so[0], length: sc[0], source: `${kind} strip` });
        }
      }
      if (h.magic === 0x55) {
        const jr = tags.get(T.RW2JpgFromRaw);
        if (jr && jr.size > 4) cands.push({ offset: jr.at, length: jr.size, source: "RW2 JpgFromRaw" });
      }
      // Olympus keeps its preview in the maker note's CameraSettings IFD.
      const mn = tags.get(T.MakerNote);
      if (mn) olympusPreview(b, mn.at, mn.size, cands);
    }
    const sub = tags.get(T.SubIFDs);
    if (sub) for (const s of tagNums(v, sub)) visit(s, depth + 1, "SubIFD");
    const ex = tags.get(T.ExifIFD);
    if (ex) visit(tagNum(v, ex), depth + 1, "EXIF");
    if (next && kind !== "EXIF") visit(next, depth, `IFD${seen.size}`);
  };
  visit(h.first, 0, "IFD0");
  return h;
}

function olympusPreview(b, at, size, cands) {
  if (size < 16) return;
  need(at, Math.min(size, 1 << 16));
  const head = ascii(b, at, 10);
  if (head === "OLYMP" || (head.startsWith("OLYMP") && b[at + 5] === 0)) {
    // Older bodies: "OLYMP\0" + byte order, IFD at +8, offsets from the TIFF
    // start; the preview is tag 0x88/0x89 (start, length) or 0x81 (data).
    const v = makeView(b, b[at + 6] !== 0x4d);
    const { tags } = readIfd(v, at + 8, 0);
    const start = tagNum(v, tags.get(0x88)), len = tagNum(v, tags.get(0x89));
    if (start && len) cands.push({ offset: start, length: len, source: "Olympus maker note" });
    const data = tags.get(0x81);
    if (data && data.size > 4) cands.push({ offset: data.at, length: data.size, source: "Olympus maker note" });
    return;
  }
  // "OLYMPUS\0II\x03\0" (IFD at +12) or "OM SYSTEM\0\0\0II\x04\0" (IFD at
  // +16); offsets relative to the maker note's start.
  let ifdAt;
  if (head.startsWith("OLYMPUS")) ifdAt = 12;
  else if (head.startsWith("OM SYSTEM")) ifdAt = 16;
  else return;
  const little = b[at + ifdAt - 4] === 0x49;
  const v = makeView(b, little);
  const top = readIfd(v, ifdAt, at);
  const cs = top.tags.get(0x2020);
  if (!cs) return;
  const csOff = cs.type === 13 || cs.type === 4 ? v.u32(cs.at) : cs.at - at;
  const inner = readIfd(v, csOff, at);
  const valid = tagNum(v, inner.tags.get(0x100));
  const start = tagNum(v, inner.tags.get(0x101)), len = tagNum(v, inner.tags.get(0x102));
  if (valid !== 0 && start && len) cands.push({ offset: at + start, length: len, source: "Olympus maker note" });
}

// ---------------------------------------------------------------- CR3

const UUID_CANON = "85c0b687820f11e08111f4ce462b6a48";
const UUID_PRVW = "eaf42b5e1c984b88b9fbb7dc406e4d16";

function hex(b, o, n) {
  let s = "";
  for (let i = 0; i < n; i++) s += b[o + i].toString(16).padStart(2, "0");
  return s;
}

function* boxes(b, start, end) {
  let p = start;
  while (p + 8 <= end) {
    need(p, 32);
    let size = be32(b, p);
    const type = ascii(b, p + 4, 4);
    let head = 8;
    if (size === 1) { size = be32(b, p + 8) * 2 ** 32 + be32(b, p + 12); head = 16; }
    else if (size === 0) size = end - p;
    if (size < head || p + size > end) return;
    let uuid = null;
    if (type === "uuid") { uuid = hex(b, p + head, 16); head += 16; }
    if (type !== "mdat") need(p, Math.min(size, 1 << 20));
    yield { type, uuid, start: p, body: p + head, end: p + size };
    p += size;
  }
}

function readCr3(b, meta, cands) {
  for (const top of boxes(b, 0, b.length)) {
    if (top.type === "moov") {
      for (const box of boxes(b, top.body, top.end)) {
        if (box.uuid === UUID_CANON) {
          for (const c of boxes(b, box.body, box.end)) {
            if (/^CMT[1-4]$/.test(c.type)) walkTiff(b, c.body, meta, cands, { metaOnly: true });
            if (c.type === "THMB") {
              // version/flags(4) w(2) h(2) size(4) ...JPEG
              const len = be32(b, c.body + 8);
              cands.push({ offset: c.body + 16, length: len, source: "CR3 THMB" });
            }
          }
        } else if (box.type === "trak") {
          const t = cr3Track(b, box);
          if (t) cands.push({ ...t, source: "CR3 track" });
        }
      }
    } else if (top.uuid === UUID_PRVW) {
      // 8 bytes, then a PRVW box: size, 'PRVW', ver(4), ?(2) w(2) h(2) ?(2) len(4) JPEG
      for (const pb of boxes(b, top.body + 8, top.end)) {
        if (pb.type === "PRVW") {
          const len = be32(b, pb.body + 12);
          cands.push({ offset: pb.body + 16, length: len, source: "CR3 PRVW" });
        }
      }
    }
  }
}

function cr3Track(b, trak) {
  const find = (box, path) => {
    if (!path.length) return box;
    for (const c of boxes(b, box.body, box.end)) if (c.type === path[0]) return find(c, path.slice(1));
    return null;
  };
  const stbl = find(trak, ["mdia", "minf", "stbl"]);
  if (!stbl) return null;
  let size = 0, offset = 0;
  for (const c of boxes(b, stbl.body, stbl.end)) {
    if (c.type === "stsz") {
      size = be32(b, c.body + 4);
      if (!size && be32(b, c.body + 8) > 0) size = be32(b, c.body + 12);
    } else if (c.type === "co64") {
      offset = be32(b, c.body + 8) * 2 ** 32 + be32(b, c.body + 12);
    } else if (c.type === "stco") {
      offset = be32(b, c.body + 8);
    }
  }
  // probeJpeg checks the SOI; checking it here would hide the candidate from
  // readRawFile before its bytes are fetched.
  if (!size || !offset || offset + 2 > b.length) return null;
  return { offset, length: size };
}

// ---------------------------------------------------------------- scan fallback

function scanJpegs(b, limit = 24) {
  const found = [];
  for (let i = 0; i + 4 < b.length && found.length < limit; i++) {
    if (b[i] !== 0xff || b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue;
    const j = probeJpeg(b, i, 0);
    if (j && j.decodable) {
      found.push({ offset: i, length: j.length, source: "scan" });
      i += Math.max(0, j.length - 1);
    }
  }
  return found;
}

// ---------------------------------------------------------------- entry

function detectFormat(b, name) {
  if (b.length >= 16 && ascii(b, 0, 16) === "FUJIFILMCCD-RAW") return "RAF";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp" && ascii(b, 8, 4) === "crx") return "CR3";
  if (b[0] === 0xff && b[1] === 0xd8) return "JPEG";
  const h = tiffHeader(b, 0);
  if (h) {
    if (h.magic === 0x55) return "RW2";
    if (h.magic !== 42) return "ORF";
    if (b[8] === 0x43 && b[9] === 0x52) return "CR2";
    const ext = (name || "").split(".").pop().toUpperCase();
    return ext && ext.length <= 4 ? ext : "TIFF";
  }
  return null;
}

/**
 * Reads one file's bytes. Returns
 *   { format, meta: {make, model, lens, iso, exposureTime, fNumber, focalLength,
 *     captured, subsec, orientation, serial},
 *     preview: {offset, length, width, height, source, ownOrientation?} | null,
 *     previews: [...every decodable candidate, largest first] }
 * The caller slices bytes[preview.offset, +preview.length] into a JPEG blob.
 */
export function readRaw(bytes, name = "") {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const format = detectFormat(b, name);
  const meta = {};
  const cands = [];
  if (format === "RAF") {
    cands.push({ offset: be32(b, 84), length: be32(b, 88), source: "RAF header" });
  } else if (format === "CR3") {
    readCr3(b, meta, cands);
  } else if (format === "JPEG") {
    cands.push({ offset: 0, length: b.length, source: "file" });
  } else if (format) {
    walkTiff(b, 0, meta, cands);
  }

  let previews = [];
  const seen = new Set();
  const consider = (list) => {
    for (const c of list) {
      if (!c.length || c.offset < 0 || c.offset + c.length > b.length || seen.has(c.offset)) continue;
      seen.add(c.offset);
      need(c.offset, Math.min(c.length, PREVIEW_HEAD));
      const j = probeJpeg(b, c.offset, c.length);
      if (j && j.decodable) previews.push({ offset: c.offset, length: c.length, width: j.width, height: j.height, source: c.source, exif: j.exif });
    }
  };
  consider(cands);
  // Fall back to a scan when the pointers found nothing or only a thumbnail.
  if (format && format !== "JPEG" && (!previews.length || Math.max(...previews.map((p) => p.width)) < 640)) {
    consider(scanJpegs(b));
  }
  previews.sort((a, b2) => b2.width * b2.height - a.width * a.height);

  // Metadata the container lacked may sit in the preview's own EXIF (RAF,
  // RW2's JpgFromRaw). Orientation from the raw container wins: previews are
  // often stored unrotated with no tag of their own.
  const rawOrientation = meta.orientation;
  for (const p of previews) {
    if (p.exif) {
      const pm = {};
      walkTiff(b, p.exif.offset, pm, [], { metaOnly: true });
      for (const [k, val] of Object.entries(pm)) if (meta[k] === undefined) meta[k] = val;
      if (rawOrientation === undefined && pm.orientation) meta.orientation = pm.orientation;
      // Browsers apply a JPEG's own orientation tag when they decode it, so
      // the page must not rotate such a preview again.
      p.ownOrientation = pm.orientation || 0;
    }
  }
  if (!meta.orientation) meta.orientation = 1;
  previews = previews.map(({ exif, ...rest }) => rest);
  return { format, meta, preview: previews[0] || null, previews };
}

// ---------------------------------------------------------------- reading a File sparsely

const PREVIEW_HEAD = 1 << 16;   // first bytes of each candidate JPEG (markers, EXIF)
const BLOCK = 1 << 16;          // fetch granularity
const SPARSE_MIN = 4 << 20;     // files under this are read whole

/**
 * readRaw for a File or Blob, fetching only the byte ranges the parser looks
 * at: a head, then whatever IFDs, boxes, maker notes and preview headers it
 * points to, pass by pass until nothing new is asked for. A raw's sensor data
 * is never read. When the pointers give no preview of 640 px or more (the
 * case where readRaw byte-scans), the whole file is read and the result is
 * exactly readRaw's. Returns readRaw's result plus `bytesRead` and `passes`.
 */
export async function readRawFile(file, { head = 1 << 18 } = {}) {
  const size = file.size;
  const whole = async () => {
    const r = readRaw(new Uint8Array(await file.arrayBuffer()), file.name);
    return { ...r, bytesRead: size, passes: 0, sparse: false };
  };
  if (size < SPARSE_MIN) return whole();
  // A zero-filled buffer the size of the file, so every offset the parser
  // computes stays valid; only fetched blocks are filled.
  const buf = new Uint8Array(size);
  const have = new Uint8Array(Math.ceil(size / BLOCK));
  let bytesRead = 0;
  const load = async (ranges) => {
    const want = new Set();
    for (const [o, len] of ranges) {
      const a = Math.max(0, Math.floor(o / BLOCK)), z = Math.min(have.length - 1, Math.floor((Math.min(size, o + len) - 1) / BLOCK));
      for (let k = a; k <= z; k++) if (!have[k]) want.add(k);
    }
    const ks = [...want].sort((x, y) => x - y);
    for (let i = 0; i < ks.length;) {
      let j = i;
      while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1) j++;
      const from = ks[i] * BLOCK, to = Math.min(size, (ks[j] + 1) * BLOCK);
      buf.set(new Uint8Array(await file.slice(from, to).arrayBuffer()), from);
      for (let k = ks[i]; k <= ks[j]; k++) have[k] = 1;
      bytesRead += to - from;
      i = j + 1;
    }
    return ks.length;
  };
  await load([[0, head]]);
  let r = null, passes = 0;
  for (; passes < 16; passes++) {
    NEED = [];
    let asked;
    try { r = readRaw(buf, file.name); } finally { asked = NEED; NEED = null; }
    if (!(await load(asked.filter(([o]) => o < size)))) break;
  }
  if (passes === 16 || !r || !r.preview || r.preview.source === "scan" || r.preview.width < 640) return whole();
  return { ...r, bytesRead, passes: passes + 1, sparse: true };
}

// ---------------------------------------------------------------- helpers for the page

/** "YYYY:MM:DD HH:MM:SS" (+ subsec) to milliseconds since the epoch, local-agnostic. */
export function captureMillis(meta) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(meta.captured || "");
  if (!m || +m[1] < 1900 || +m[2] < 1 || +m[3] < 1) return null; // "0000:00:00" = clock never set
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const sub = meta.subsec ? Number(`0.${String(meta.subsec).replace(/\D/g, "")}`) * 1000 : 0;
  return ms + (Number.isFinite(sub) ? Math.round(sub) : 0);
}

/**
 * Groups frames into bursts: consecutive frames (by capture time, same body)
 * no more than `gapMs` apart. Returns an array of burst ids, parallel to `items`.
 */
export function groupBursts(items, gapMs = 1500) {
  const order = items
    .map((it, i) => ({ i, t: it.t, body: it.body || "" }))
    .sort((a, b) => (a.body < b.body ? -1 : a.body > b.body ? 1 : (a.t ?? Infinity) - (b.t ?? Infinity)));
  const ids = new Array(items.length).fill(-1);
  let id = -1, prev = null;
  for (const o of order) {
    if (o.t == null) { ids[o.i] = ++id; prev = null; continue; }
    if (!prev || prev.body !== o.body || o.t - prev.t > gapMs) id++;
    ids[o.i] = id;
    prev = o;
  }
  return ids;
}

/**
 * Sharpness of a greyscale image (Float32Array or Uint8ClampedArray, w x h):
 * the variance of the 4-neighbour Laplacian in each cell of a grid x grid
 * split, reported as the highest cell (the subject rarely fills the frame)
 * and the median cell. Higher is sharper; only comparable between frames of
 * the same scene and preview size.
 */
export function sharpness(grey, w, h, grid = 4) {
  const cells = [];
  const cw = Math.floor(w / grid), ch = Math.floor(h / grid);
  if (cw < 8 || ch < 8) return { peak: 0, median: 0 };
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let s = 0, s2 = 0, n = 0;
      const x0 = Math.max(1, gx * cw), x1 = Math.min(w - 1, (gx + 1) * cw);
      const y0 = Math.max(1, gy * ch), y1 = Math.min(h - 1, (gy + 1) * ch);
      for (let y = y0; y < y1; y++) {
        const r = y * w;
        for (let x = x0; x < x1; x++) {
          const l = grey[r + x - 1] + grey[r + x + 1] + grey[r + x - w] + grey[r + x + w] - 4 * grey[r + x];
          s += l; s2 += l * l; n++;
        }
      }
      cells.push(n ? s2 / n - (s / n) ** 2 : 0);
    }
  }
  const sorted = [...cells].sort((a, b) => a - b);
  return { peak: sorted[sorted.length - 1], median: sorted[Math.floor(sorted.length / 2)] };
}

// ---------------------------------------------------------------- XMP sidecars

const LABELS = { 6: "Red", 7: "Yellow", 8: "Green", 9: "Blue" };
export const LABEL_KEYS = LABELS;

function xmlEscape(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * An XMP sidecar Lightroom Classic, Bridge, Capture One and darktable read on
 * import: xmp:Rating (-1 = rejected, 0-5 stars) and xmp:Label (colour name).
 */
export function xmpSidecar({ rating = 0, rejected = false, label = "" }) {
  const r = rejected ? -1 : Math.max(0, Math.min(5, rating | 0));
  const lab = label ? ` xmp:Label="${xmlEscape(label)}"` : "";
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="ShootFlow cull">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmp:Rating="${r}"${lab}/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

/** Sidecar file name: "IMG_1.xmp" (Adobe, Capture One) or "IMG_1.CR3.xmp" (darktable, digiKam). */
export function sidecarName(fileName, style = "adobe") {
  if (style === "darktable") return `${fileName}.xmp`;
  const dot = fileName.lastIndexOf(".");
  return `${dot > 0 ? fileName.slice(0, dot) : fileName}.xmp`;
}

// ---------------------------------------------------------------- stored ZIP

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A stored (uncompressed) ZIP of [{name, data: string | Uint8Array}]. */
export function zipStored(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cenSize + 22);
  let p = 0;
  for (const part of [...parts, ...central, end]) { out.set(part, p); p += part.length; }
  return out;
}
