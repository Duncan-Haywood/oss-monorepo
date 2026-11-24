// BigTIFF DNGs and the Olympus compacts' packed ORF, as the cull page reads
// them (site/rawpreview.mjs for the preview, site/rawmosaic.mjs for a preview
// developed from the sensor data). Checked on real files in
// eval/cull-orf-compacts-2026-11-24.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "./rawpreview.mjs";
import { findMosaic, decodeMosaic, developMosaic, GENERIC_SRGB_FROM_CAMERA } from "./rawmosaic.mjs";

// ---------------------------------------------------------------- a small TIFF / BigTIFF writer

const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8, 16: 8, 18: 8 };

/**
 * ifds: { name: [[tag, type, values], ...] }, written in order, the first as
 * IFD0. A value "@name" is the offset of that IFD or blob; blobs: { name:
 * Uint8Array } are appended. Returns { bytes, at: { name: offset } }.
 */
function writeTiff(ifds, blobs = {}, { big = false, magic = big ? 43 : 42, little = true, align = {} } = {}) {
  const entry = big ? 20 : 12, head = big ? 8 : 2, tail = big ? 8 : 4, inline = big ? 8 : 4;
  const at = {};
  let pos = big ? 16 : 8;
  const names = Object.keys(ifds);
  ifds = Object.fromEntries(names.map((n) => [n, ifds[n].slice().sort((a, b) => a[0] - b[0])]));
  for (const n of names) { at[n] = pos; pos += head + entry * ifds[n].length + tail; }
  // Out-of-line values after the IFDs, then blobs.
  const extras = [];
  for (const n of names) for (const [, type, vals] of ifds[n]) {
    const len = (typeof vals === "string" ? vals.length + 1 : vals.length) * SIZE[type];
    if (len > inline) { extras.push(pos); pos += len + (len & 1); } else extras.push(-1);
  }
  for (const [n, b] of Object.entries(blobs)) {
    if (align[n]) pos = Math.ceil(pos / align[n]) * align[n];
    at[n] = pos; pos += b.length;
  }
  const out = new Uint8Array(pos);
  const v = new DataView(out.buffer);
  out.set(little ? [0x49, 0x49] : [0x4d, 0x4d]);
  v.setUint16(2, magic, little);
  if (big) { v.setUint16(4, 8, little); v.setUint16(6, 0, little); v.setBigUint64(8, BigInt(at[names[0]]), little); }
  else v.setUint32(4, at[names[0]], little);
  const resolve = (x) => (typeof x === "string" && x.startsWith("@") ? at[x.slice(1)] : x);
  const put = (o, type, x) => {
    x = resolve(x);
    if (type === 1 || type === 7 || type === 2) out[o] = x;
    else if (type === 3) v.setUint16(o, x, little);
    else if (type === 4) v.setUint32(o, x, little);
    else if (type === 16 || type === 18) v.setBigUint64(o, BigInt(x), little);
    else if (type === 5) { v.setUint32(o, Math.round(x * 10000), little); v.setUint32(o + 4, 10000, little); }
    else if (type === 10) { v.setInt32(o, Math.round(x * 10000), little); v.setInt32(o + 4, 10000, little); }
  };
  let k = 0;
  names.forEach((n, idx) => {
    const tags = ifds[n];
    const o = at[n];
    if (big) v.setBigUint64(o, BigInt(tags.length), little); else v.setUint16(o, tags.length, little);
    tags.forEach(([tag, type, vals], i) => {
      const e = o + head + entry * i;
      const arr = typeof vals === "string" ? [...vals].map((c) => c.charCodeAt(0)).concat(0) : vals;
      v.setUint16(e, tag, little); v.setUint16(e + 2, type, little);
      if (big) v.setBigUint64(e + 4, BigInt(arr.length), little); else v.setUint32(e + 4, arr.length, little);
      const len = arr.length * SIZE[type];
      const where = extras[k++];
      const base = len > inline ? where : e + (big ? 12 : 8);
      if (len > inline) { if (big) v.setBigUint64(e + 12, BigInt(where), little); else v.setUint32(e + 8, where, little); }
      arr.forEach((x, i) => put(base + i * SIZE[type], type, x));
    });
    void idx; // next-IFD pointers stay 0: other IFDs are reached by tag (330, 34665)
  });
  for (const [n, b] of Object.entries(blobs)) out.set(b, at[n]);
  return { bytes: out, at };
}

// A marker-valid baseline JPEG of w x h (frame walk only, not decodable pixels).
function jpeg(w, h) {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]);
}

// ---------------------------------------------------------------- BigTIFF

for (const little of [true, false]) {
  test(`BigTIFF DNG (${little ? "II" : "MM"}): preview from a SubIFD strip, metadata from IFD0`, () => {
    const j = jpeg(1024, 768);
    const { bytes, at } = writeTiff({
      ifd0: [[254, 4, [1]], [271, 2, "PENTAX"], [272, 2, "PENTAX K-x"], [274, 3, [6]], [50706, 1, [1, 4, 0, 0]], [330, 18, ["@prev"]]],
      prev: [[254, 4, [1]], [256, 4, [1024]], [257, 4, [768]], [259, 3, [7]], [262, 3, [6]], [273, 16, ["@jpg"]], [279, 16, [j.length]]],
    }, { jpg: j }, { big: true, little });
    const r = readRaw(bytes, "pano.dng");
    assert.equal(r.format, "DNG");
    assert.equal(r.meta.make, "PENTAX");
    assert.equal(r.meta.model, "PENTAX K-x");
    assert.equal(r.meta.orientation, 6);
    assert.equal(r.meta.dng, true);
    assert.deepEqual([r.preview.width, r.preview.height, r.preview.offset, r.preview.length], [1024, 768, at.jpg, j.length]);
  });
}

test("BigTIFF with a bad header (offset size not 8) is not read", () => {
  const { bytes } = writeTiff({ ifd0: [[271, 2, "X"]] }, {}, { big: true });
  new DataView(bytes.buffer).setUint16(4, 4, true);
  assert.equal(readRaw(bytes, "x.dng").preview, null);
  assert.equal(findMosaic(bytes), null);
});

test("BigTIFF DNG mosaic: uncompressed CFA developed like a classic DNG", () => {
  const w = 8, h = 6;
  const cfa = new Uint8Array(w * h * 2);
  const dv = new DataView(cfa.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dv.setUint16(2 * (y * w + x), 1000 + y * 10 + x, true);
  const tags = (big) => ({
    ifd0: [[254, 4, [1]], [271, 2, "Test"], [50706, 1, [1, 4, 0, 0]], [50728, 5, [0.5, 1, 0.8]], [330, big ? 18 : 4, ["@raw"]]],
    raw: [[254, 4, [0]], [256, 4, [w]], [257, 4, [h]], [258, 3, [16]], [259, 3, [1]], [262, 3, [32803]], [277, 3, [1]],
      [33421, 3, [2, 2]], [33422, 1, [0, 1, 1, 2]], [50714, 4, [64]], [50717, 4, [4095]],
      [273, big ? 16 : 4, ["@cfa"]], [278, 4, [h]], [279, big ? 16 : 4, [cfa.length]]],
  });
  const big = writeTiff(tags(true), { cfa }, { big: true }).bytes;
  const classic = writeTiff(tags(false), { cfa }).bytes;
  const a = decodeMosaic(findMosaic(big)), b = decodeMosaic(findMosaic(classic));
  assert.deepEqual([a.width, a.height], [w, h]);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
  assert.equal(a.data[3 * w + 5], 1035);
  const da = developMosaic(big), db = developMosaic(classic);
  assert.deepEqual(Array.from(da.rgba), Array.from(db.rgba));
});

// ---------------------------------------------------------------- Olympus compacts' packed ORF

/** 12-bit MSB-first packing of one row. */
function pack12(vals) {
  const out = new Uint8Array((vals.length * 3) / 2);
  for (let i = 0, p = 0; i < vals.length; i += 2, p += 3) {
    out[p] = vals[i] >> 4;
    out[p + 1] = ((vals[i] & 15) << 4) | (vals[i + 1] >> 8);
    out[p + 2] = vals[i + 1] & 255;
  }
  return out;
}

/**
 * An "IIRS" ORF as the C-5050 Zoom writes it: the TIFF height is odd, the
 * camera stores one more (odd) row; even rows, then odd rows from the next
 * 2048-byte boundary. Returns { bytes, sensels, width, height }.
 */
function orf({ width = 8, tiffHeight = 5, pattern = [2, 1, 1, 0], red = 350, blue = 412, sensel = (x, y) => (y * 131 + x * 17) % 4096, thumb = null } = {}) {
  const height = tiffHeight + (tiffHeight & 1);
  const sensels = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) sensels[y * width + x] = sensel(x, y);
  const rowBytes = (width * 3) / 2;
  const half = (height + 1) >> 1;
  const evenLen = half * rowBytes;
  const fieldGap = Math.ceil(evenLen / 2048) * 2048;
  const data = new Uint8Array(fieldGap + (height >> 1) * rowBytes);
  for (let y = 0; y < height; y++) {
    const row = pack12(Array.from(sensels.subarray(y * width, (y + 1) * width)));
    data.set(row, y & 1 ? fieldGap + (y >> 1) * rowBytes : (y >> 1) * rowBytes);
  }
  // The maker note: "OLYMP\0" + "II" + 3, 0, then an IFD whose offsets count from the TIFF header.
  const note = new Uint8Array(8 + 2 + 2 * 12 + 4);
  note.set([0x4f, 0x4c, 0x59, 0x4d, 0x50, 0, 0x49, 0x49, 3, 0]);
  const { bytes, at } = writeTiff({
    ifd0: [[256, 4, [width]], [257, 4, [tiffHeight]], [258, 3, [16]], [259, 3, [1]], [262, 3, [32803]],
      [271, 2, "OLYMPUS OPTICAL CO.,LTD"], [272, 2, "C5050Z"], [273, 4, ["@data"]], [277, 3, [1]], [278, 4, [tiffHeight]],
      [279, 4, [(width * tiffHeight * 3) / 2]], [34665, 4, ["@exif"]]],
    exif: [[0x9003, 2, "2003:05:01 10:00:00"], [37500, 7, Array.from(note)], [0xa302, 7, [0, 2, 0, 2, ...pattern]]],
  }, { data, ...(thumb ? { thumb } : {}) }, { magic: 0x5352, align: { data: 2048 } });
  // Write the maker note's IFD in place (inside the EXIF value), offsets from the file start.
  const exifAt = at.exif;
  const v = new DataView(bytes.buffer);
  // Find the maker note's value bytes: "OLYMP\0" (Make's "OLYMPUS" does not match).
  let mn = -1;
  for (let i = exifAt; i < bytes.length - 6; i++) if (String.fromCharCode(...bytes.subarray(i, i + 5)) === "OLYMP" && bytes[i + 5] === 0) { mn = i; break; }
  const ifd = mn + 8;
  v.setUint16(ifd, 2, true);
  const ent = (k, tag, val) => { const e = ifd + 2 + 12 * k; v.setUint16(e, tag, true); v.setUint16(e + 2, 3, true); v.setUint32(e + 4, 2, true); v.setUint16(e + 8, val, true); v.setUint16(e + 10, 256, true); };
  ent(0, 0x1017, red); ent(1, 0x1018, blue);
  v.setUint32(ifd + 2 + 24, 0, true);
  return { bytes, sensels, width, height, at };
}

test("ORF packed, interlaced: every sensel read, including the row past the TIFF's strips", () => {
  const o = orf({ width: 10, tiffHeight: 7 });
  const m = findMosaic(o.bytes);
  assert.ok(m && m.orf, "found as a packed ORF");
  const mos = decodeMosaic(m);
  assert.deepEqual([mos.width, mos.height], [10, 8]);
  assert.deepEqual(Array.from(mos.data), Array.from(o.sensels));
});

test("ORF packed: white balance from RedBalance/BlueBalance, a typical sensor's matrix", () => {
  const o = orf({ red: 350, blue: 412, sensel: () => 1000 });
  const d = developMosaic(o.bytes);
  assert.deepEqual(d.wb.map((x) => +x.toFixed(4)), [+(350 / 256).toFixed(4), 1, +(412 / 256).toFixed(4)]);
  assert.equal(d.colour, "generic");
  assert.deepEqual(d.M, GENERIC_SRGB_FROM_CAMERA);
  for (const r of GENERIC_SRGB_FROM_CAMERA) assert.ok(Math.abs(r[0] + r[1] + r[2] - 1) < 0.002, "rows keep a neutral neutral");
  // The CFA phase is the EXIF pattern (B G / G R here): a red-only scene comes out red.
  const red = orf({ sensel: (x, y) => (y % 2 === 1 && x % 2 === 1 ? 2000 : 0), red: 256, blue: 256 });
  const p = developMosaic(red.bytes).rgba;
  assert.ok(p[0] > 200 && p[1] < 60 && p[2] < 60, `red scene came out ${p[0]},${p[1]},${p[2]}`);
});

test("ORF packed: the small thumbnail is still the embedded preview; other ORF layouts are not mosaics here", () => {
  const t = jpeg(160, 120);
  const o = orf({ thumb: t });
  const r = readRaw(o.bytes, "P1010001.ORF");
  assert.equal(r.format, "ORF");
  assert.deepEqual([r.preview.width, r.preview.height], [160, 120]);
  // A strip that is not 12 bits per sensel (an Olympus-compressed body) is left to its embedded JPEG.
  const c = orf();
  const v = new DataView(c.bytes.buffer);
  // Shorten StripByteCounts so the strip is no longer 12 bits per sensel.
  const ifd0 = c.at.ifd0;
  for (let k = 0; k < v.getUint16(ifd0, true); k++) {
    const e = ifd0 + 2 + 12 * k;
    if (v.getUint16(e, true) === 279) v.setUint32(e + 8, v.getUint32(e + 8, true) - 5, true);
  }
  assert.equal(findMosaic(c.bytes), null);
});
