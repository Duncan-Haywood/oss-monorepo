import test from "node:test";
import assert from "node:assert/strict";
import { decodeLosslessJpeg, findMosaic, decodeMosaic, developMosaic, srgbFromCamera, gainMap, readOpcodes } from "./rawmosaic.mjs";
import { readRaw } from "./rawpreview.mjs";

// ---------------------------------------------------------------- a lossless JPEG encoder for the tests

function predict(p, out, i, x, y, row, nf, initial) {
  if (y === 0) return x === 0 ? initial : out[i - nf];
  if (x === 0) return out[i - row];
  const ra = out[i - nf], rb = out[i - row], rc = out[i - row - nf];
  return [ra, ra, rb, rc, ra + rb - rc, ra + ((rb - rc) >> 1), rb + ((ra - rc) >> 1), (ra + rb) >> 1][p];
}

/** Encodes samples (interleaved, width x height x nf) as SOF3 with one 5-bit-per-category Huffman table. */
function encodeLj92(samples, width, height, nf, { predictor = 1, precision = 16 } = {}) {
  const bytes = [0xff, 0xd8];
  const seg = (m, body) => bytes.push(0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body);
  // DHT: 17 symbols (categories 0..16), all of length 5.
  const counts = new Array(16).fill(0); counts[4] = 17;
  seg(0xc4, [0x00, ...counts, ...Array.from({ length: 17 }, (_, k) => k)]);
  const sof = [precision, height >> 8, height & 255, width >> 8, width & 255, nf];
  for (let c = 0; c < nf; c++) sof.push(c + 1, 0x11, 0);
  seg(0xc3, sof);
  const sos = [nf];
  for (let c = 0; c < nf; c++) sos.push(c + 1, 0x00);
  sos.push(predictor, 0, 0);
  seg(0xda, sos);
  let acc = 0, n = 0;
  const put = (v, len) => {
    for (let k = len - 1; k >= 0; k--) {
      acc = (acc << 1) | ((v >> k) & 1); n++;
      if (n === 8) { bytes.push(acc); if (acc === 0xff) bytes.push(0); acc = 0; n = 0; }
    }
  };
  const row = width * nf, mask = (1 << precision) - 1, initial = 1 << (precision - 1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < nf; c++) {
    const i = y * row + x * nf + c;
    let d = (samples[i] - predict(predictor, samples, i, x, y, row, nf, initial)) & mask;
    if (d >= 32768) d -= 65536;
    if (d === -32768) { put(16, 5); continue; }
    const s = d === 0 ? 0 : 32 - Math.clz32(Math.abs(d));
    put(s, 5);
    if (s) put(d < 0 ? d - 1 + (1 << s) : d, s);
  }
  if (n) put(0x7f, 8 - n);
  bytes.push(0xff, 0xd9);
  return Uint8Array.from(bytes);
}

function noise(n, seed = 7, max = 4095) {
  let s = seed;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; out[i] = (s >>> 8) % (max + 1); }
  return out;
}

test("lossless JPEG: every predictor, one and two components, round-trips exactly", () => {
  for (const nf of [1, 2]) {
    for (let p = 1; p <= 7; p++) {
      const w = 13, h = 9;
      const s = noise(w * h * nf, p * 31 + nf);
      const j = decodeLosslessJpeg(encodeLj92(s, w, h, nf, { predictor: p }));
      assert.equal(j.width, w); assert.equal(j.height, h); assert.equal(j.components, nf);
      assert.deepEqual(Array.from(j.samples), Array.from(s), `predictor ${p}, ${nf} component(s)`);
    }
  }
});

test("lossless JPEG: 0xFF bytes in the entropy data are unstuffed", () => {
  const s = new Uint16Array(64).fill(65535); // many 1 bits, so 0xFF bytes appear
  s[0] = 0; s[10] = 32768;
  const enc = encodeLj92(s, 8, 8, 1);
  assert.ok(enc.some((b, i) => b === 0xff && enc[i + 1] === 0 && i > 20));
  assert.deepEqual(Array.from(decodeLosslessJpeg(enc).samples), Array.from(s));
});

test("lossless JPEG: lossy and malformed streams are refused", () => {
  assert.throws(() => decodeLosslessJpeg(Uint8Array.from([0, 1, 2])), /SOI/);
  assert.throws(() => decodeLosslessJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 2])), /lossy/);
});

// ---------------------------------------------------------------- a small DNG writer

function dng({ width = 16, height = 12, pattern = [0, 1, 1, 2], dim = [2, 2], cfa, compression = 1, tile = null,
  black = [64], white = 4095, neutral = [0.5, 1, 0.8], matrix = null, activeArea = null, crop = null, opcodes2 = null, orientation = 1 }) {
  // Tag list: [tag, type, values] ; type 3 SHORT, 4 LONG, 5 RATIONAL, 10 SRATIONAL, 1 BYTE, 7 UNDEFINED.
  const data = [];
  let chunks;
  if (compression === 1) {
    const b = new Uint8Array(width * height * 2);
    const v = new DataView(b.buffer);
    cfa.forEach((x, i) => v.setUint16(2 * i, x, true));
    chunks = [b];
  } else {
    const [tw, th] = tile;
    chunks = [];
    for (let ty = 0; ty < height; ty += th) for (let tx = 0; tx < width; tx += tw) {
      const t = new Uint16Array(tw * th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const sy = Math.min(height - 1, ty + y), sx = Math.min(width - 1, tx + x);
        t[y * tw + x] = cfa[sy * width + sx];
      }
      chunks.push(encodeLj92(t, tw / 2, th, 2));
    }
  }
  const raw = [
    [254, 4, [0]], [256, 4, [width]], [257, 4, [height]], [258, 3, [16]], [259, 3, [compression]], [262, 3, [32803]], [277, 3, [1]],
    [33421, 3, dim], [33422, 1, pattern], [50714, 5, black], [50717, 4, [white]],
  ];
  if (compression === 1) raw.push([273, 4, ["CHUNK0"]], [278, 4, [height]], [279, 4, [chunks[0].length]]);
  else raw.push([322, 4, [tile[0]]], [323, 4, [tile[1]]], [324, 4, chunks.map((_, k) => `CHUNK${k}`)], [325, 4, chunks.map((c) => c.length)]);
  if (dim[0] * dim[1] > 1 && black.length > 1) raw.push([50713, 3, [2, 2]]);
  if (activeArea) raw.push([50829, 4, activeArea]);
  if (crop) raw.push([50719, 4, crop.slice(0, 2)], [50720, 4, crop.slice(2)]);
  if (opcodes2) raw.push([51009, 7, Array.from(opcodes2)]);
  const ifd0 = [[254, 4, [1]], [271, 2, "Test"], [274, 3, [orientation]], [50706, 1, [1, 4, 0, 0]], [50728, 5, neutral], [330, 4, ["RAWIFD"]]];
  if (matrix) ifd0.push([50721, 10, matrix], [50778, 3, [21]]);

  // Layout: header, IFD0, raw IFD, then out-of-line values, then chunks.
  const out = [];
  const u8 = (n) => { const b = new Uint8Array(n); out.push(b); return b; };
  const size = (type) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 })[type];
  const ifdLen = (tags) => 2 + 12 * tags.length + 4;
  let pos = 8 + ifdLen(ifd0) + ifdLen(raw);
  const extra = [];
  const place = (len) => { const at = pos; pos += len + (len & 1); return at; };
  const fix = [];
  const build = (tags, at) => {
    tags.sort((a, b) => a[0] - b[0]);
    const b = new Uint8Array(ifdLen(tags));
    const v = new DataView(b.buffer);
    v.setUint16(0, tags.length, true);
    tags.forEach(([tag, type, vals], i) => {
      const e = 2 + 12 * i;
      const count = typeof vals === "string" ? vals.length + 1 : vals.length;
      v.setUint16(e, tag, true); v.setUint16(e + 2, type, true); v.setUint32(e + 4, count, true);
      const len = count * size(type);
      const body = new Uint8Array(len);
      const bv = new DataView(body.buffer);
      if (typeof vals === "string") for (let k = 0; k < vals.length; k++) body[k] = vals.charCodeAt(k);
      else vals.forEach((x, k) => {
        if (typeof x === "string") { fix.push({ name: x, bytes: body, at: k * 4 }); return; }
        if (type === 1 || type === 7) body[k] = x;
        else if (type === 3) bv.setUint16(2 * k, x, true);
        else if (type === 4) bv.setUint32(4 * k, x, true);
        else { const den = 1000000; bv.setInt32(8 * k, Math.round(x * den), true); bv.setInt32(8 * k + 4, den, true); }
      });
      if (len <= 4) { b.set(body, e + 8); fix.forEach((f) => { if (f.bytes === body) { f.bytes = b; f.at += e + 8; } }); }
      else { const off = place(len); v.setUint32(e + 8, off, true); extra.push([off, body]); }
    });
    return [at, b];
  };
  const [a0, b0] = build(ifd0, 8);
  const [a1, b1] = build(raw, 8 + ifdLen(ifd0));
  const chunkAt = chunks.map((c) => place(c.length));
  const file = new Uint8Array(pos);
  file.set([0x49, 0x49, 42, 0, 8, 0, 0, 0]);
  file.set(b0, a0); file.set(b1, a1);
  for (const [off, body] of extra) file.set(body, off);
  chunks.forEach((c, k) => file.set(c, chunkAt[k]));
  // Resolve the named offsets now everything has a place.
  const where = (name) => (name === "RAWIFD" ? a1 : chunkAt[Number(name.slice(5))]);
  for (const f of fix) {
    const base = f.bytes === b0 ? a0 : f.bytes === b1 ? a1 : extra.find(([, body]) => body === f.bytes)[0];
    new DataView(file.buffer).setUint32(base + f.at, where(f.name), true);
  }
  return file;
}

// A flat grey scene: every R, G and B sensel at its own level.
function flat(width, height, levels, pattern = [0, 1, 1, 2]) {
  const cfa = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cfa[y * width + x] = levels[pattern[(y % 2) * 2 + (x % 2)]];
  return cfa;
}

test("uncompressed and lossless-JPEG tiled DNGs give the same sensels", () => {
  const width = 16, height = 12;
  const cfa = noise(width * height, 3);
  const a = dng({ width, height, cfa });
  const b = dng({ width, height, cfa, compression: 7, tile: [8, 8] });
  const ma = decodeMosaic(findMosaic(a)), mb = decodeMosaic(findMosaic(b));
  assert.deepEqual(Array.from(ma.data), Array.from(cfa));
  assert.deepEqual(Array.from(mb.data), Array.from(cfa));
  // The page's own reader sees a DNG with no JPEG preview.
  const r = readRaw(a, "t.dng");
  assert.equal(r.preview, null);
  assert.equal(r.meta.dng, true);
});

test("a neutral grey comes out neutral, with AsShotNeutral as white balance", () => {
  // Camera RGB of grey is (0.5, 1, 0.8) x level: a camera that sees red at half strength.
  const cfa = flat(16, 12, [64 + 1000, 64 + 2000, 64 + 1600]);
  const p = developMosaic(dng({ cfa, neutral: [0.5, 1, 0.8] }));
  assert.equal(p.width, 8); assert.equal(p.height, 6);
  const [r, g, b] = p.rgba;
  assert.ok(Math.abs(r - g) <= 1 && Math.abs(b - g) <= 1, `grey came out ${r},${g},${b}`);
});

test("the CFA phase counts from ActiveArea, and DefaultCrop keeps it", () => {
  // A BGGR sensor area starting at row 1: the pattern is relative to the active area.
  const width = 18, height = 13;
  const levels = [64 + 3000, 64 + 600, 64 + 300]; // a red scene
  const inner = flat(16, 12, levels, [0, 1, 1, 2]);
  const cfa = new Uint16Array(width * height).fill(64);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) cfa[(y + 1) * width + x + 2] = inner[y * 16 + x];
  const p = developMosaic(dng({ width, height, cfa, activeArea: [1, 2, 13, 18], crop: [1, 1, 14, 10], neutral: [1, 1, 1] }));
  // Linear 0.744 / 0.149 / 0.074 of white, lifted 3.5x to put the scene near white:
  // red clips, green 0.52 (sRGB 190), blue 0.26 (sRGB 140). A wrong phase swaps them.
  const [r, g, b] = p.rgba;
  assert.ok(r === 255 && Math.abs(g - 190) <= 4 && Math.abs(b - 140) <= 4, `red scene came out ${r},${g},${b}`);
});

test("clipped highlights stay white instead of turning magenta", () => {
  // Green at the white level, red and blue below it: white balance would lift R and B past G.
  const cfa = flat(16, 12, [3000, 4095, 2500]);
  const p = developMosaic(dng({ cfa, neutral: [0.5, 1, 0.6], black: [0] }));
  const [r, g, b] = p.rgba;
  assert.deepEqual([r, g, b], [255, 255, 255]);
});

test("srgbFromCamera: an identity-like matrix maps white to white", () => {
  // ColorMatrix = XYZ->sRGB-linear's inverse: the camera *is* sRGB.
  const m = srgbFromCamera([3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(m[i][j] - (i === j ? 1 : 0)) < 1e-3);
});

function gainMapOpcode({ top = 0, left = 0, bottom, right, rowPitch = 1, colPitch = 1, gains, pv, ph }) {
  const n = pv * ph;
  const b = new Uint8Array(4 + 16 + 76 + 4 * n);
  const v = new DataView(b.buffer);
  v.setUint32(0, 1); v.setUint32(4, 9); v.setUint32(8, 0x01030000); v.setUint32(12, 0); v.setUint32(16, 76 + 4 * n);
  const p = 20;
  [top, left, bottom, right, 0, 1, rowPitch, colPitch, pv, ph].forEach((x, k) => v.setUint32(p + 4 * k, x));
  [pv > 1 ? 1 / (pv - 1) : 0, ph > 1 ? 1 / (ph - 1) : 0, 0, 0].forEach((x, k) => v.setFloat64(p + 40 + 8 * k, x));
  v.setUint32(p + 72, 1);
  gains.forEach((g, k) => v.setFloat32(p + 76 + 4 * k, g));
  return b;
}

test("GainMap: bilinear between map points, clamped at the ends", () => {
  const op = readOpcodes(gainMapOpcode({ bottom: 10, right: 10, pv: 2, ph: 2, gains: [1, 2, 3, 4] }), 0, 4 + 16 + 76 + 16);
  assert.equal(op.length, 1); assert.equal(op[0].name, "GainMap");
  const g = gainMap(op[0].params, 10, 10);
  assert.equal(g.at(0, 0), 1);
  assert.ok(Math.abs(g.at(0, 5) - 1.5) < 1e-6);   // x = 5/10 of the width: halfway between 1 and 2
  assert.ok(Math.abs(g.at(5, 0) - 2) < 1e-6);     // halfway between 1 and 3
});

test("a GainMap in OpcodeList2 lifts the corner it covers", () => {
  const cfa = flat(16, 12, [64 + 1000, 64 + 1000, 64 + 1000]);
  const ops = gainMapOpcode({ bottom: 12, right: 16, pv: 2, ph: 2, gains: [1, 1, 1, 2] });
  const plain = developMosaic(dng({ cfa, neutral: [1, 1, 1] }));
  const lifted = developMosaic(dng({ cfa, neutral: [1, 1, 1], opcodes2: ops }));
  assert.match(lifted.notes.join(" "), /GainMap applied/);
  const at = (p, x, y) => p.rgba[4 * (y * p.width + x) + 1];
  // Same top-left; brighter bottom-right (exposure lift is per image, so compare ratios).
  assert.ok(at(lifted, 7, 5) / at(lifted, 0, 0) > at(plain, 7, 5) / at(plain, 0, 0) + 0.1);
});

test("files that are not DNG mosaics are refused", () => {
  assert.equal(findMosaic(new Uint8Array([0xff, 0xd8, 0xff])), null);
  assert.throws(() => developMosaic(new Uint8Array(16)), /no CFA image/);
});
