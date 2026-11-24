// A preview developed from a raw's own sensor data, for the raws that carry
// no JPEG inside (phone DNGs such as the Nexus 5X's and the Pixel bursts in
// Google's HDR+ set) or only a thumbnail (the 2000s Olympus compacts' ORF,
// findOrfMosaic below). The cull page uses it only when rawpreview.mjs finds
// no embedded preview of 640 px or more. TIFF and BigTIFF containers.
//
// What it reads: the full-resolution CFA image (NewSubfileType 0,
// Photometric 32803) stored uncompressed (8 to 16 bits, any packing DNG
// allows) or as lossless JPEG (SOF3, predictors 1-7, any number of
// components, restart markers), in strips or tiles; LinearizationTable,
// BlackLevel (with its repeat pattern and per-row/column deltas), WhiteLevel,
// ActiveArea, DefaultCrop, AsShotNeutral, ColorMatrix1/2, BaselineExposure,
// GainMap in OpcodeList2 (lens shading as phones write it) and
// FixVignetteRadial in OpcodeList3. Other opcodes (the lens-distortion warps,
// bad-pixel lists) are named in `notes` and not run.
//
// What it makes: each CFA repeat block (2 x 2 on Bayer, 6 x 6 on X-Trans)
// averaged into one RGB pixel (a half-size preview on Bayer, no
// interpolation), white-balanced from AsShotNeutral with each channel stopped
// at the sensor's white (a block with a clipped sensel shows white, not
// magenta), turned to sRGB with the dcraw construction (ColorMatrix times
// XYZ-from-sRGB, rows normalised, then inverted), lifted by BaselineExposure
// plus at most 2 stops so the 99.5th-percentile luminance reaches 0.95, then
// sRGB-encoded. A culling preview, not a development: no demosaic, tone
// curve, sharpening or highlight recovery. Checked against shootflow's own
// reader and developer: eval/cull-raw-data-previews-2026-11-24.md.
// MIT licence, part of ShootFlow.

const TAG = {
  NewSubfileType: 254, Width: 256, Height: 257, Bits: 258, Compression: 259, Photometric: 262,
  StripOffsets: 273, Orientation: 274, SamplesPerPixel: 277, RowsPerStrip: 278, StripByteCounts: 279,
  PlanarConfig: 284, TileWidth: 322, TileLength: 323, TileOffsets: 324, TileByteCounts: 325,
  SubIFDs: 330, CFARepeatPatternDim: 33421, CFAPattern: 33422,
  LinearizationTable: 50712, BlackLevelRepeatDim: 50713, BlackLevel: 50714, BlackLevelDeltaH: 50715,
  BlackLevelDeltaV: 50716, WhiteLevel: 50717, DefaultCropOrigin: 50719, DefaultCropSize: 50720,
  ColorMatrix1: 50721, ColorMatrix2: 50722, AsShotNeutral: 50728, BaselineExposure: 50730,
  CalibrationIlluminant1: 50778, CalibrationIlluminant2: 50779, ActiveArea: 50829, OpcodeList2: 51009, OpcodeList3: 51022,
};

const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 };

export class MosaicError extends Error {}

// ---------------------------------------------------------------- TIFF

function tiff(b) {
  if (b.length < 8) return null;
  const little = b[0] === 0x49 && b[1] === 0x49;
  if (!little && !(b[0] === 0x4d && b[1] === 0x4d)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = v.getUint16(2, little);
  // BigTIFF (43): 8-byte offsets, counts and next pointers, 20-byte entries.
  if (magic === 43) {
    if (b.length < 16 || v.getUint16(4, little) !== 8 || v.getUint16(6, little) !== 0) return null;
    return { v, little, magic, big: true, first: Number(v.getBigUint64(8, little)) };
  }
  // 0x5352 ("RS"): the Olympus compacts' ORF, read only for its packed layout (findOrfMosaic).
  if (magic !== 42 && magic !== 0x5352) return null;
  return { v, little, magic, big: false, first: v.getUint32(4, little) };
}

function readIfd(t, off) {
  const { v, little, big } = t;
  const tags = new Map();
  const u64 = (o) => Number(v.getBigUint64(o, little));
  const head = big ? 8 : 2, entry = big ? 20 : 12, tail = big ? 8 : 4, inline = big ? 8 : 4;
  if (off + head > v.byteLength) return { tags, next: 0 };
  const n = big ? u64(off) : v.getUint16(off, little);
  if (n > 4096 || off + head + entry * n + tail > v.byteLength) return { tags, next: 0 };
  for (let i = 0; i < n; i++) {
    const e = off + head + entry * i;
    const type = v.getUint16(e + 2, little);
    const count = big ? u64(e + 4) : v.getUint32(e + 4, little);
    const size = (SIZES[type] || 1) * count;
    const at = size <= inline ? e + (big ? 12 : 8) : big ? u64(e + 12) : v.getUint32(e + 8, little);
    tags.set(v.getUint16(e, little), { type, count, at, size });
  }
  const nx = off + head + entry * n;
  return { tags, next: big ? u64(nx) : v.getUint32(nx, little) };
}

/** Every value of a tag as numbers (rationals divided out). */
function nums(t, tag) {
  if (!tag) return [];
  if (tag.synth) return tag.synth.slice(); // a value stated by a vendor reader (findOrfMosaic), not stored as a TIFF tag
  const { v, little } = t;
  const { type, count, at } = tag;
  if (at + (SIZES[type] || 1) * count > v.byteLength) return [];
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 1: case 7: out[i] = v.getUint8(at + i); break;
      case 6: out[i] = v.getInt8(at + i); break;
      case 3: out[i] = v.getUint16(at + 2 * i, little); break;
      case 8: out[i] = v.getInt16(at + 2 * i, little); break;
      case 4: case 13: out[i] = v.getUint32(at + 4 * i, little); break;
      case 9: out[i] = v.getInt32(at + 4 * i, little); break;
      case 5: { const d = v.getUint32(at + 8 * i + 4, little); out[i] = d ? v.getUint32(at + 8 * i, little) / d : 0; break; }
      case 10: { const d = v.getInt32(at + 8 * i + 4, little); out[i] = d ? v.getInt32(at + 8 * i, little) / d : 0; break; }
      case 11: out[i] = v.getFloat32(at + 4 * i, little); break;
      case 12: out[i] = v.getFloat64(at + 8 * i, little); break;
      case 16: case 18: out[i] = Number(v.getBigUint64(at + 8 * i, little)); break;
      case 17: out[i] = Number(v.getBigInt64(at + 8 * i, little)); break;
      default: out[i] = 0;
    }
  }
  return out;
}

function allIfds(t) {
  const out = [], seen = new Set();
  const visit = (off, depth) => {
    if (!off || depth > 4 || seen.has(off) || off >= t.v.byteLength) return;
    seen.add(off);
    const ifd = readIfd(t, off);
    if (!ifd.tags.size) return;
    out.push(ifd);
    for (const s of nums(t, ifd.tags.get(TAG.SubIFDs))) visit(s, depth + 1);
    if (depth === 0) visit(ifd.next, 0);
  };
  visit(t.first, 0);
  return out;
}

/**
 * Where a DNG keeps its CFA image, or null. Returns the IFD and IFD0 plus
 * the byte ranges of its strips or tiles, so a caller reading a File can
 * fetch just those (`ranges`).
 */
export function findMosaic(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const t = tiff(b);
  if (!t) return null;
  const ifds = allIfds(t);
  if (t.magic === 0x5352) return findOrfMosaic(t, b, ifds);
  if (!ifds.length || !ifds[0].tags.has(50706)) return null; // DNGVersion: only DNGs
  const one = (ifd, tag, dflt) => { const x = nums(t, ifd.tags.get(tag)); return x.length ? x[0] : dflt; };
  const raw = ifds.find((d) => one(d, TAG.NewSubfileType, 0) === 0 && one(d, TAG.Photometric, 0) === 32803);
  if (!raw) return null;
  const tiled = raw.tags.has(TAG.TileOffsets);
  const offs = nums(t, raw.tags.get(tiled ? TAG.TileOffsets : TAG.StripOffsets));
  const lens = nums(t, raw.tags.get(tiled ? TAG.TileByteCounts : TAG.StripByteCounts));
  if (!offs.length || offs.length !== lens.length) return null;
  return { t, b, ifd0: ifds[0], raw, one, tiled, offs, lens, ranges: offs.map((o, i) => [o, lens[i]]) };
}

// ---------------------------------------------------------------- Olympus compacts' ORF

// The 2002-2008 Olympus compacts (C-5050 Zoom, C-8080, SP-350, SP-500 UZ in
// the public samples) write an ORF with magic "IIRS" whose only JPEG is a
// 160 x 120 thumbnail. Their sensor data is 12-bit, packed MSB first, stored
// interlaced: the even rows, then the odd rows from the next 2048-byte
// boundary. When the TIFF height is odd the camera stored one row more, past
// the strips the TIFF lists. The data is already black-subtracted, white is
// 4095, the CFA phase is the EXIF CFAPattern, and the as-shot balance is the
// "OLYMP\0" maker note's RedBalance and BlueBalance (0x1017, 0x1018; green is
// 256). The same layout and tags as shootflow's orf.py, which is checked
// sensel for sensel against LibRaw (eval/olympus-orf-reader-2026-11-14.md).
// Other ORF layouts are not read here: those bodies carry a full-size JPEG.

const ORF_FIELD_ALIGN = 2048;

function findOrfMosaic(t, b, ifds) {
  if (!ifds.length) return null;
  const ifd0 = ifds[0];
  const one = (ifd, tag, dflt) => { const x = nums(t, ifd.tags.get(tag)); return x.length ? x[0] : dflt; };
  const width = one(ifd0, TAG.Width, 0), height0 = one(ifd0, TAG.Height, 0);
  const offs = nums(t, ifd0.tags.get(TAG.StripOffsets)), lens = nums(t, ifd0.tags.get(TAG.StripByteCounts));
  if (!width || !height0 || !offs.length || offs.length !== lens.length) return null;
  const total = lens.reduce((a, x) => a + x, 0);
  if (2 * total !== 3 * width * height0 || one(ifd0, TAG.Compression, 1) !== 1) return null; // not the packed layout
  const height = height0 + (height0 & 1);
  const rowBytes = (width * 3) / 2;
  const half = (height + 1) >> 1;
  const start = offs[0];
  const second = start + Math.ceil((half * rowBytes) / ORF_FIELD_ALIGN) * ORF_FIELD_ALIGN;
  const end = second + (height >> 1) * rowBytes;

  // EXIF CFAPattern (0xA302): 2 x 2 dims as 16-bit values (some writers swap
  // their byte order), then the colours.
  const exifOff = one(ifd0, 34665, 0);
  const exif = exifOff ? readIfd(t, exifOff) : { tags: new Map() };
  const cfa = exif.tags.get(0xa302);
  let pattern = null;
  if (cfa && cfa.size >= 8 && cfa.at + 8 <= b.length) {
    const d1 = t.v.getUint16(cfa.at, t.little), d2 = t.v.getUint16(cfa.at + 2, t.little);
    const e1 = t.v.getUint16(cfa.at, !t.little), e2 = t.v.getUint16(cfa.at + 2, !t.little);
    if ((d1 === 2 && d2 === 2) || (e1 === 2 && e2 === 2)) pattern = Array.from(b.subarray(cfa.at + 4, cfa.at + 8));
  }
  if (!pattern || [...pattern].sort().join() !== "0,1,1,2") return null;

  // White balance from the older maker note: "OLYMP\0", IFD at +8, offsets from the file's TIFF header.
  const notes = [];
  let neutral = null;
  const mn = exif.tags.get(37500);
  if (mn && mn.size > 16 && mn.at + 8 <= b.length && String.fromCharCode(...b.subarray(mn.at, mn.at + 5)) === "OLYMP" && b[mn.at + 5] === 0) {
    const note = readIfd(t, mn.at + 8);
    const red = nums(t, note.tags.get(0x1017))[0], blue = nums(t, note.tags.get(0x1018))[0];
    if (red > 0 && blue > 0) neutral = [256 / red, 1, 256 / blue];
  }
  if (!neutral) notes.push("no Olympus RedBalance/BlueBalance");
  const synth = (x) => ({ synth: x });
  const raw = {
    tags: new Map([
      [TAG.Width, synth([width])], [TAG.Height, synth([height])], [TAG.Bits, synth([12])],
      [TAG.Compression, synth([1])], [TAG.SamplesPerPixel, synth([1])], [TAG.Photometric, synth([32803])],
      [TAG.CFARepeatPatternDim, synth([2, 2])], [TAG.CFAPattern, synth(pattern)],
      [TAG.BlackLevel, synth([0])], [TAG.WhiteLevel, synth([4095])],
    ]),
  };
  const head = { tags: new Map(ifd0.tags) };
  if (neutral) head.tags.set(TAG.AsShotNeutral, synth(neutral));
  return {
    t, b, ifd0: head, raw, one, tiled: false, offs, lens, orf: { start, second, width, height, rowBytes, end },
    ranges: [[start, end - start]], notes,
  };
}

function decodeOrfInterlaced(m) {
  const { b } = m;
  const { start, second, width, height, rowBytes, end } = m.orf;
  if (end > b.length) throw new MosaicError(`interlaced ORF data runs past the end of the file (${end} > ${b.length} bytes)`);
  const data = new Uint16Array(width * height);
  const half = (height + 1) >> 1;
  for (let r = 0; r < height; r++) {
    let p = (r & 1 ? second + (r >> 1) * rowBytes : start + (r >> 1) * rowBytes);
    let o = r * width;
    for (let x = 0; x + 1 < width; x += 2, p += 3) {
      const a = b[p], c = b[p + 1], d = b[p + 2];
      data[o++] = (a << 4) | (c >> 4);
      data[o++] = ((c & 15) << 8) | d;
    }
    if (width & 1) data[o] = (b[p] << 4) | (b[p + 1] >> 4);
  }
  return { width, height, data };
}

// ---------------------------------------------------------------- lossless JPEG

function huffLut(counts, symbols) {
  // A 16-bit lookup: entry = (code length << 8) | symbol, 0 for no code.
  const lut = new Uint16Array(1 << 16);
  let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) {
      const sym = symbols[k++];
      const shift = 16 - len;
      const from = code << shift, to = (code + 1) << shift;
      if (to > 1 << 16) throw new MosaicError("bad Huffman table");
      lut.fill((len << 8) | sym, from, to);
      code++;
    }
    code <<= 1;
  }
  return lut;
}

/**
 * Decodes one lossless JPEG (ITU T.81 process 14, as DNG uses it). Returns
 * { width, height, components, samples } with samples interleaved per row.
 */
export function decodeLosslessJpeg(b, start = 0, end = b.length) {
  if (b[start] !== 0xff || b[start + 1] !== 0xd8) throw new MosaicError("lossless JPEG does not start with SOI");
  let pos = start + 2;
  const tables = [];
  let precision = 0, width = 0, height = 0, comps = [], restart = 0;
  while (pos + 4 <= end) {
    if (b[pos] !== 0xff) throw new MosaicError("corrupt lossless JPEG marker stream");
    const marker = b[pos + 1];
    if (marker === 0xff) { pos++; continue; }
    const len = (b[pos + 2] << 8) | b[pos + 3];
    const body = pos + 4;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) throw new MosaicError("lossy JPEG sensor data (lossy DNG) is not read");
    if (marker === 0xc3) {
      precision = b[body]; height = (b[body + 1] << 8) | b[body + 2]; width = (b[body + 3] << 8) | b[body + 4];
      const nf = b[body + 5];
      comps = [];
      for (let i = 0; i < nf; i++) {
        comps.push(b[body + 6 + 3 * i]);
        if (b[body + 7 + 3 * i] !== 0x11) throw new MosaicError("subsampled lossless JPEG is not read");
      }
    } else if (marker === 0xc4) {
      let q = body;
      while (q < pos + 2 + len) {
        const tcth = b[q];
        const counts = b.subarray(q + 1, q + 17);
        let n = 0; for (const c of counts) n += c;
        if (tcth >> 4 === 0) tables[tcth & 15] = huffLut(counts, b.subarray(q + 17, q + 17 + n));
        q += 17 + n;
      }
    } else if (marker === 0xdd) {
      restart = (b[body] << 8) | b[body + 1];
    } else if (marker === 0xda) {
      const ns = b[body];
      if (!width || ns !== comps.length) throw new MosaicError("lossless JPEG scan before its frame, or a partial scan");
      const luts = [];
      for (let i = 0; i < ns; i++) {
        const lut = tables[b[body + 2 + 2 * i] >> 4];
        if (!lut) throw new MosaicError("lossless JPEG uses an undefined Huffman table");
        luts.push(lut);
      }
      const predictor = b[body + 1 + 2 * ns];
      const pt = b[body + 3 + 2 * ns] & 15;
      const samples = scan(b, pos + 2 + len, end, width, height, luts, predictor, precision, pt, restart);
      return { width, height, components: ns, samples };
    }
    pos += 2 + len;
  }
  throw new MosaicError("lossless JPEG has no scan");
}

function scan(b, pos, end, width, height, luts, predictor, precision, pt, restart) {
  const nf = luts.length;
  const row = width * nf;
  const out = new Uint16Array(row * height);
  let acc = 0, nbits = 0, p = pos;
  const fill = () => {
    while (nbits <= 24) {
      let byte = 0;
      if (p < end) {
        byte = b[p];
        if (byte === 0xff) {
          const nx = p + 1 < end ? b[p + 1] : 0;
          if (nx === 0) p += 2; else byte = 0; // a marker: feed zeros, leave it
        } else p++;
      }
      acc = ((acc << 8) | byte) >>> 0;
      nbits += 8;
    }
  };
  const bits = (n) => {
    if (nbits < n) fill();
    nbits -= n;
    return (acc >>> nbits) & ((1 << n) - 1);
  };
  const diff = (lut) => {
    if (nbits < 16) fill();
    const e = lut[(acc >>> (nbits - 16)) & 0xffff];
    if (!e) throw new MosaicError("bad Huffman code in lossless JPEG");
    nbits -= e >> 8;
    const s = e & 0xff;
    if (s === 0) return 0;
    if (s === 16) return 32768;
    const v = bits(s);
    return v < 1 << (s - 1) ? v - (1 << s) + 1 : v;
  };
  const initial = 1 << (precision - pt - 1);
  const mask = (1 << precision) - 1;
  let mcu = 0, lineStart = 0; // the line where the scan or the last restart began
  for (let y = 0; y < height; y++) {
    const o = y * row;
    for (let x = 0; x < width; x++) {
      if (restart && mcu && mcu % restart === 0) {
        // Skip to the RSTn marker and past it; predictors start over.
        nbits = 0; acc = 0;
        while (p + 1 < end && !(b[p] === 0xff && b[p + 1] >= 0xd0 && b[p + 1] <= 0xd7)) p++;
        p += 2;
        lineStart = y;
      }
      for (let c = 0; c < nf; c++) {
        const i = o + x * nf + c;
        let pred;
        if (y === lineStart) pred = x === 0 ? initial : out[i - nf];
        else if (x === 0) pred = out[i - row];
        else {
          const ra = out[i - nf], rb = out[i - row], rc = out[i - row - nf];
          switch (predictor) {
            case 1: pred = ra; break;
            case 2: pred = rb; break;
            case 3: pred = rc; break;
            case 4: pred = ra + rb - rc; break;
            case 5: pred = ra + ((rb - rc) >> 1); break;
            case 6: pred = rb + ((ra - rc) >> 1); break;
            case 7: pred = (ra + rb) >> 1; break;
            default: pred = ra;
          }
        }
        out[i] = (pred + diff(luts[c])) & mask;
      }
      mcu++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the CFA image

function unpack(b, at, len, bits, little, count, rowSamples, out, outAt) {
  if (bits === 16) {
    const v = new DataView(b.buffer, b.byteOffset + at, Math.min(len, count * 2));
    const n = Math.min(count, v.byteLength >> 1);
    for (let i = 0; i < n; i++) out[outAt + i] = v.getUint16(2 * i, little);
    return;
  }
  if (bits === 8) { for (let i = 0; i < count && i < len; i++) out[outAt + i] = b[at + i]; return; }
  // DNG packs other depths most-significant bit first, rows starting on a byte.
  let p = at, acc = 0, nb = 0;
  const stop = at + len;
  for (let i = 0; i < count; i++) {
    if (i % rowSamples === 0) nb = 0;
    while (nb < bits) { acc = ((acc << 8) | (p < stop ? b[p] : 0)) >>> 0; p++; nb += 8; }
    nb -= bits;
    out[outAt + i] = (acc >>> nb) & ((1 << bits) - 1);
    acc &= (1 << nb) - 1;
  }
}

/**
 * The CFA image's sensels as stored: { width, height, data: Uint16Array }.
 * Uncompressed or lossless-JPEG strips and tiles; one sample per pixel.
 */
export function decodeMosaic(m) {
  if (m.orf) return decodeOrfInterlaced(m);
  const { t, b, raw, one, tiled, offs, lens } = m;
  const width = one(raw, TAG.Width, 0), height = one(raw, TAG.Height, 0);
  const bits = one(raw, TAG.Bits, 16), comp = one(raw, TAG.Compression, 1);
  if (one(raw, TAG.SamplesPerPixel, 1) !== 1) throw new MosaicError("a CFA image with more than one sample per pixel");
  if (!width || !height) throw new MosaicError("CFA image has no size");
  if (comp !== 1 && comp !== 7) throw new MosaicError(`CFA compression ${comp} is not read`);
  const data = new Uint16Array(width * height);
  const cw = tiled ? one(raw, TAG.TileWidth, 0) : width;
  const ch = tiled ? one(raw, TAG.TileLength, 0) : one(raw, TAG.RowsPerStrip, height);
  if (!cw || !ch) throw new MosaicError("CFA tiles have no size");
  const across = tiled ? Math.ceil(width / cw) : 1;
  const tmp = new Uint16Array(cw * ch);
  for (let k = 0; k < offs.length; k++) {
    const at = offs[k], len = lens[k];
    if (at + len > b.length) throw new MosaicError("CFA data lies outside the file");
    const x0 = (k % across) * cw, y0 = Math.floor(k / across) * ch;
    if (y0 >= height) break;
    tmp.fill(0);
    if (comp === 1) {
      unpack(b, at, len, bits, t.little, cw * Math.min(ch, height - y0), cw, tmp, 0);
    } else {
      const j = decodeLosslessJpeg(b, at, at + len);
      // DNG splits a tile's row across JPEG components (2 per row is common);
      // in raster order the samples are the tile's own.
      const n = Math.min(j.samples.length, tmp.length);
      if (j.width * j.components !== cw && j.samples.length !== cw * ch) {
        // A JPEG whose rows are a whole multiple of the tile's: lay it out flat.
        if (j.samples.length % cw) throw new MosaicError(`lossless tile ${j.width}x${j.height}x${j.components} does not fit a ${cw}x${ch} tile`);
      }
      tmp.set(j.samples.subarray(0, n));
    }
    const w = Math.min(cw, width - x0), h = Math.min(ch, height - y0);
    for (let y = 0; y < h; y++) data.set(tmp.subarray(y * cw, y * cw + w), (y0 + y) * width + x0);
  }
  return { width, height, data };
}

// ---------------------------------------------------------------- opcodes

const OPCODE_NAMES = {
  1: "WarpRectilinear", 2: "WarpFisheye", 3: "FixVignetteRadial", 4: "FixBadPixelsConstant", 5: "FixBadPixelsList",
  6: "TrimBounds", 7: "MapTable", 8: "MapPolynomial", 9: "GainMap", 10: "DeltaPerRow", 11: "DeltaPerColumn",
  12: "ScalePerRow", 13: "ScalePerColumn", 14: "WarpRectilinear2",
};

/** A DNG opcode list (always big-endian): [{ id, name, flags, params: DataView }]. */
export function readOpcodes(b, at, size) {
  const out = [];
  if (!size || at + size > b.length || size < 4) return out;
  const v = new DataView(b.buffer, b.byteOffset + at, size);
  const n = v.getUint32(0);
  let p = 4;
  for (let i = 0; i < n && p + 16 <= size; i++) {
    const id = v.getUint32(p), flags = v.getUint32(p + 8), len = v.getUint32(p + 12);
    if (p + 16 + len > size) break;
    out.push({ id, name: OPCODE_NAMES[id] || `opcode ${id}`, flags, params: new DataView(v.buffer, v.byteOffset + p + 16, len) });
    p += 16 + len;
  }
  return out;
}

/**
 * A GainMap's gain at each row and column of an h x w stage-2 image, laid out
 * so a sensel's gain is four lookups: the DNG SDK's placement (map point i at
 * origin + i * spacing of the image size, clamped at the ends, bilinear,
 * rows first). Returns null for a malformed map.
 */
export function gainMap(params, h, w) {
  if (params.byteLength < 76) return null;
  const u = (k) => params.getUint32(4 * k), d = (o) => params.getFloat64(o);
  const g = {
    top: u(0), left: u(1), bottom: u(2), right: u(3), plane: u(4), planes: u(5), rowPitch: u(6), colPitch: u(7),
    pv: u(8), ph: u(9), sv: d(40), sh: d(48), ov: d(56), oh: d(64), mp: params.getUint32(72),
  };
  const n = g.pv * g.ph * g.mp;
  if (!n || params.byteLength < 76 + 4 * n || g.rowPitch < 1 || g.colPitch < 1 || g.bottom <= g.top || g.right <= g.left) return null;
  if ((g.pv > 1 && !(g.sv > 0)) || (g.ph > 1 && !(g.sh > 0))) return null;
  g.gains = new Float32Array(n);
  for (let i = 0; i < n; i++) g.gains[i] = params.getFloat32(76 + 4 * i);
  const axis = (size, origin, spacing, points) => {
    const i0 = new Int32Array(size), i1 = new Int32Array(size), f = new Float32Array(size);
    for (let k = 0; k < size; k++) {
      if (points === 1) continue;
      const x = (k / size - origin) / spacing;
      if (x <= 0) { i0[k] = i1[k] = 0; }
      else if (x >= points - 1) { i0[k] = i1[k] = points - 1; }
      else { i0[k] = Math.floor(x); i1[k] = i0[k] + 1; f[k] = x - i0[k]; }
    }
    return { i0, i1, f };
  };
  g.rows = axis(h, g.ov, g.sv, g.pv);
  g.cols = axis(w, g.oh, g.sh, g.ph);
  g.at = (y, x) => {
    const { rows, cols, gains, ph, mp } = g;
    const a = rows.i0[y], b2 = rows.i1[y], fy = rows.f[y], c = cols.i0[x], e = cols.i1[x], fx = cols.f[x];
    const top = gains[(a * ph + c) * mp] * (1 - fx) + gains[(a * ph + e) * mp] * fx;
    const bot = gains[(b2 * ph + c) * mp] * (1 - fx) + gains[(b2 * ph + e) * mp] * fx;
    return top * (1 - fy) + bot * fy;
  };
  return g;
}

/** FixVignetteRadial's gain function on a w x h stage-3 image (DNG 1.7.1 placement of the centre). */
export function vignetteRadial(params, w, h) {
  if (params.byteLength < 56) return null;
  const k = [0, 1, 2, 3, 4].map((i) => params.getFloat64(8 * i));
  const cx = params.getFloat64(40), cy = params.getFloat64(48);
  if (!k.every((x) => isFinite(x) && Math.abs(x) < 1e6) || !(cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1)) return null;
  const ci = cx * (w - 1), cj = cy * (h - 1);
  const m = Math.hypot(Math.max(ci, w - 1 - ci), Math.max(cj, h - 1 - cj)) || 1;
  return (x, y) => {
    const dx = (x + 0.5 - (ci + 0.5)) / m, dy = (y + 0.5 - (cj + 0.5)) / m;
    const r2 = dx * dx + dy * dy;
    return 1 + r2 * (k[0] + r2 * (k[1] + r2 * (k[2] + r2 * (k[3] + r2 * k[4]))));
  };
}

// ---------------------------------------------------------------- colour

const XYZ_FROM_SRGB = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

function mul3(a, b2) {
  return a.map((r) => [0, 1, 2].map((j) => r[0] * b2[0][j] + r[1] * b2[1][j] + r[2] * b2[2][j]));
}

export function inverse3(m) {
  const [[a, b2, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b2 * B + c * C;
  if (!det || !isFinite(det)) return null;
  return [
    [A / det, -(b2 * i - c * h) / det, (b2 * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b2 * g) / det, (a * e - b2 * d) / det],
  ];
}

/** sRGB-from-camera (after white balance), dcraw's construction; identity when the file has no usable matrix. */
export function srgbFromCamera(colorMatrix) {
  if (!colorMatrix || colorMatrix.length !== 9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const cm = [colorMatrix.slice(0, 3), colorMatrix.slice(3, 6), colorMatrix.slice(6, 9)];
  const camFromSrgb = mul3(cm, XYZ_FROM_SRGB);
  for (const r of camFromSrgb) {
    const s = r[0] + r[1] + r[2];
    if (!s) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let j = 0; j < 3; j++) r[j] /= s;
  }
  return inverse3(camFromSrgb) || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
}

// D65, D55, daylight, fine weather, cloudy, shade, D75: the illuminants that
// make a matrix the better choice for a daylight-balanced preview.
const DAYLIGHT = new Set([1, 9, 10, 11, 20, 21, 22]);

function pickMatrix(m) {
  const { t, ifd0, raw, one } = m;
  const get = (tag) => { const x = nums(t, raw.tags.get(tag)); return x.length ? x : nums(t, ifd0.tags.get(tag)); };
  const m1 = get(TAG.ColorMatrix1), m2 = get(TAG.ColorMatrix2);
  const i1 = one(raw, TAG.CalibrationIlluminant1, one(ifd0, TAG.CalibrationIlluminant1, 0));
  const i2 = one(raw, TAG.CalibrationIlluminant2, one(ifd0, TAG.CalibrationIlluminant2, 0));
  const ok = (x) => x.length === 9;
  if (ok(m2) && (i2 === 21 || (DAYLIGHT.has(i2) && i1 !== 21) || !ok(m1))) return { matrix: m2, illuminant: i2 };
  if (ok(m1)) return { matrix: m1, illuminant: i1 };
  return { matrix: null, illuminant: 0 };
}

// ---------------------------------------------------------------- colour from the camera's own JPEG

const srgbDecode = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  return lut;
})();

function solve3(A, y) {
  // A 3 x 3 symmetric system by Cramer's rule; null when singular.
  const inv = inverse3(A);
  if (!inv) return null;
  return [0, 1, 2].map((i) => inv[i][0] * y[0] + inv[i][1] * y[1] + inv[i][2] * y[2]);
}

/**
 * A camera-to-sRGB matrix for a raw that states none (the Olympus compacts'
 * ORF), fitted to the camera's own small JPEG of the same frame: each block
 * of the white-balanced camera image is averaged over the JPEG pixel it falls
 * in, the JPEG is decoded to linear sRGB, and each output row is the least
 * squares fit of that channel on camera R, G, B, then scaled to sum to 1 so a
 * neutral stays neutral (white balance stays the camera's). Pixels near black,
 * near white or clipped in the raw are left out. The camera's tone curve is
 * not modelled, so the fit is a culling preview's colour, not a profile.
 * Returns { matrix, used } or { matrix: null, reason }.
 */
export function fitToReference(img, clip, w, h, wb, ref, { mode = "constrained" } = {}) {
  const rw = ref.width, rh = ref.height;
  if (!rw || !rh || ref.rgba.length < rw * rh * 4) return { matrix: null, reason: "no reference pixels" };
  // The JPEG must show the same frame: the same shape within 3%.
  const ar = w / h, rar = rw / rh;
  if (Math.abs(ar / rar - 1) > 0.03) return { matrix: null, reason: `reference is ${rw}x${rh}, not this frame's shape` };
  const lo = mode === "free" ? 8 : 40, hi = mode === "free" ? 245 : 215;
  const cams = [], outs = [];
  for (let j = 0; j < rh; j++) {
    const y0 = Math.floor((j * h) / rh), y1 = Math.max(y0 + 1, Math.floor(((j + 1) * h) / rh));
    for (let i = 0; i < rw; i++) {
      const q = (j * rw + i) * 4;
      const R = ref.rgba[q], G = ref.rgba[q + 1], B = ref.rgba[q + 2];
      if (Math.min(R, G, B) < lo || Math.max(R, G, B) > hi) continue;
      const x0 = Math.floor((i * w) / rw), x1 = Math.max(x0 + 1, Math.floor(((i + 1) * w) / rw));
      let c0 = 0, c1 = 0, c2 = 0, n = 0, bad = false;
      for (let y = y0; y < y1 && !bad; y++) for (let x = x0; x < x1; x++) {
        const k = y * w + x;
        if (clip[k]) { bad = true; break; }
        c0 += img[3 * k] * wb[0]; c1 += img[3 * k + 1] * wb[1]; c2 += img[3 * k + 2] * wb[2]; n++;
      }
      if (bad || !n) continue;
      const c = [c0 / n, c1 / n, c2 / n];
      if (Math.max(...c) >= 1 || Math.min(...c) <= 0) continue;
      cams.push(c); outs.push([srgbDecode[R], srgbDecode[G], srgbDecode[B]]);
    }
  }
  const used = cams.length;
  if (used < 0.1 * rw * rh) return { matrix: null, reason: `only ${used} usable reference pixels` };
  const M = [];
  if (mode === "free") {
    const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Xty = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < used; k++) for (let a = 0; a < 3; a++) {
      for (let b2 = 0; b2 < 3; b2++) XtX[a][b2] += cams[k][a] * cams[k][b2];
      for (let o = 0; o < 3; o++) Xty[o][a] += cams[k][a] * outs[k][o];
    }
    for (let o = 0; o < 3; o++) {
      const row = solve3(XtX, Xty[o]);
      if (!row) return { matrix: null, reason: "reference fit is singular" };
      const sum = row[0] + row[1] + row[2];
      if (!(sum > 0)) return { matrix: null, reason: "reference fit has no positive gain" };
      M.push(row.map((x) => x / sum));
    }
  } else {
    // Each pixel on its own exposure: camera and JPEG colours divided by
    // their own sum, so the JPEG's tone curve and exposure drop out and only
    // the mix is fitted. Rows sum to 1 (a neutral stays neutral): out_o - c_B
    // = a (c_R - c_B) + b (c_G - c_B), least squares on (a, b) per row.
    const A = [[0, 0], [0, 0]], Y = [[0, 0], [0, 0], [0, 0]];
    for (let k = 0; k < used; k++) {
      const c = cams[k], sc = c[0] + c[1] + c[2];
      const o = outs[k], so = o[0] + o[1] + o[2];
      const u = (c[0] - c[2]) / sc, v = (c[1] - c[2]) / sc, cb = c[2] / sc;
      A[0][0] += u * u; A[0][1] += u * v; A[1][1] += v * v;
      for (let r = 0; r < 3; r++) { const t = o[r] / so - cb; Y[r][0] += u * t; Y[r][1] += v * t; }
    }
    A[1][0] = A[0][1];
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    if (!det) return { matrix: null, reason: "reference fit is singular" };
    for (let r = 0; r < 3; r++) {
      const a = (A[1][1] * Y[r][0] - A[0][1] * Y[r][1]) / det, b2 = (A[0][0] * Y[r][1] - A[1][0] * Y[r][0]) / det;
      M.push([a, b2, 1 - a - b2]);
    }
  }
  // A plausible camera matrix: each channel mostly from its own colour, no
  // wild negative mixes.
  for (let o = 0; o < 3; o++) {
    if (M[o][o] < 0.5 || M[o][o] > 3 || M[o].some((x) => x < -1.5)) return { matrix: null, reason: "reference fit is implausible", rejected: M };
  }
  return { matrix: M, used };
}

// For a raw that states no colour matrix: the mean of the sRGB-from-camera
// matrices (srgbFromCamera) that five cameras wrote into their own DNGs in the
// public samples (DJI Phantom 4, LG Nexus 5X, Leica T, Leica X Vario, Pentax
// Q-S1). Rows sum to 1, so the camera's white balance is kept. Chosen over a
// fit to the camera's thumbnail and over no matrix on the Olympus compacts
// against LibRaw (eval/cull-orf-compacts-2026-11-24.md).
export const GENERIC_SRGB_FROM_CAMERA = [[1.703, -0.577, -0.126], [-0.246, 1.691, -0.445], [0.008, -0.517, 1.509]];

const srgbEncode = (() => {
  const lut = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i++) {
    const v = i / 4095;
    lut[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  return lut;
})();

/**
 * Develops the DNG's CFA image into a preview. Returns
 *   { width, height, rgba: Uint8ClampedArray, source, notes, block, gain }
 * at the CFA-block size, box-shrunk by a whole factor until its longer side
 * is at most `maxSide`. Orientation is not applied (the page does that from
 * the raw's own tag). Throws MosaicError for files it cannot read.
 */
export function developMosaic(bytes, { maxSide = 2400, found = null, reference = null, fitMode = "generic" } = {}) {
  const m = found || findMosaic(bytes);
  if (!m) throw new MosaicError("no CFA image in this file");
  const { t, raw, ifd0, one } = m;
  const notes = [...(m.notes || [])];
  const mos = decodeMosaic(m);
  const get = (tag) => nums(t, raw.tags.get(tag));
  const dim = get(TAG.CFARepeatPatternDim);
  const [pr, pc] = dim.length === 2 ? dim : [2, 2];
  const pat = get(TAG.CFAPattern);
  if (pat.length !== pr * pc) throw new MosaicError("CFA pattern missing or the wrong size");
  if (pat.some((c) => c > 2)) throw new MosaicError("a CFA with colours other than red, green and blue");

  // Linearisation and levels.
  const lin = get(TAG.LinearizationTable);
  const bits = one(raw, TAG.Bits, 16);
  const white = get(TAG.WhiteLevel)[0] ?? (lin.length ? lin[lin.length - 1] : (1 << bits) - 1);
  const bdim = get(TAG.BlackLevelRepeatDim);
  const [br, bc] = bdim.length === 2 ? bdim : [1, 1];
  const bl = get(TAG.BlackLevel);
  const blackAt = (y, x) => (bl.length ? bl[((y % br) * bc + (x % bc)) % bl.length] : 0); // y, x from the ActiveArea's corner
  const dh = get(TAG.BlackLevelDeltaH), dv = get(TAG.BlackLevelDeltaV);

  // The area to show: ActiveArea, then DefaultCrop inside it. The CFA
  // pattern, BlackLevel's repeat and the BlackLevelDelta tables all count from
  // the ActiveArea's top-left corner (DNG 1.7.1, ActiveArea).
  const aa = get(TAG.ActiveArea);
  let aTop = 0, aLeft = 0, aBottom = mos.height, aRight = mos.width;
  if (aa.length === 4 && aa[2] > aa[0] && aa[3] > aa[1] && aa[2] <= mos.height && aa[3] <= mos.width) [aTop, aLeft, aBottom, aRight] = aa;
  let top = aTop, left = aLeft, bottom = aBottom, right = aRight;
  const co = get(TAG.DefaultCropOrigin), cs = get(TAG.DefaultCropSize);
  if (co.length === 2 && cs.length === 2) {
    const l2 = aLeft + Math.round(co[0]), t2 = aTop + Math.round(co[1]);
    const r2 = l2 + Math.round(cs[0]), b2 = t2 + Math.round(cs[1]);
    if (r2 <= aRight && b2 <= aBottom && r2 > l2 && b2 > t2) { left = l2; top = t2; right = r2; bottom = b2; }
  }
  // Blocks start on the pattern's phase: the first whole repeat inside the crop.
  const y0 = aTop + Math.ceil((top - aTop) / pr) * pr, x0 = aLeft + Math.ceil((left - aLeft) / pc) * pc;
  const bw = Math.floor((right - x0) / pc), bh = Math.floor((bottom - y0) / pr);
  if (bw < 1 || bh < 1) throw new MosaicError("CFA image smaller than one repeat block");

  // Lens shading as phones write it: GainMaps in OpcodeList2, on the
  // stage-2 image (the active area). Other opcodes are named in `notes`.
  const ah = aBottom - aTop, aw = aRight - aLeft;
  const ops = (tag) => { const e = raw.tags.get(tag); return e ? readOpcodes(m.b, e.at, e.size) : []; };
  const maps = [];
  const skipped = new Set();
  for (const op of ops(TAG.OpcodeList2)) {
    const g = op.id === 9 ? gainMap(op.params, ah, aw) : null;
    if (g && g.plane === 0) maps.push(g);
    else skipped.add(`${op.name} (OpcodeList2)`);
  }
  let vignette = null;
  for (const op of ops(TAG.OpcodeList3)) {
    const fn = op.id === 3 ? vignetteRadial(op.params, aw, ah) : null;
    if (fn && !vignette) vignette = fn;
    else skipped.add(`${op.name} (OpcodeList3)`);
  }
  if (maps.length) notes.push(`${maps.length} GainMap applied`);
  if (vignette) notes.push("FixVignetteRadial applied");
  if (skipped.size) notes.push(`not run: ${[...skipped].join(", ")}`);
  // Per-colour means of each block, in linear units 0..1 of the white level.
  // A block with any colour at the white level is marked clipped, so white
  // balance cannot turn blown highlights magenta.
  const counts = [0, 0, 0];
  for (const c of pat) counts[c]++;
  const lut = lin.length ? Float32Array.from(lin) : null;
  const lin3 = new Float32Array(bw * bh * 3);
  const clipped = new Uint8Array(bw * bh);
  const rowAcc = new Float64Array(bw * 3);
  const rowClip = new Uint8Array(bw);
  for (let by = 0; by < bh; by++) {
    rowAcc.fill(0); rowClip.fill(0);
    for (let r = 0; r < pr; r++) {
      const y = y0 + by * pr + r;
      const ay = y - aTop;
      const dvy = dv.length ? dv[ay] || 0 : 0;
      const line = y * mos.width;
      for (let c = 0; c < pc; c++) {
        const col = pat[r * pc + c];
        const blk0 = blackAt(ay, x0 - aLeft + c) + dvy;
        // The maps that touch this row and this column of the pattern; when a
        // map's column pitch divides the pattern's, that holds for every block.
        const ax0 = x0 - aLeft + c;
        const here = maps.filter((g) => ay >= g.top && ay < g.bottom && (ay - g.top) % g.rowPitch === 0);
        const even = here.every((g) => pc % g.colPitch === 0);
        const rowMaps = even ? here.filter((g) => (((ax0 - g.left) % g.colPitch) + g.colPitch) % g.colPitch === 0) : here;
        for (let bx = 0; bx < bw; bx++) {
          const x = x0 + bx * pc + c;
          let v = mos.data[line + x];
          if (lut) v = lut[Math.min(v, lut.length - 1)];
          if (v >= white) rowClip[bx] = 1;
          const blk = dh.length ? blk0 + (dh[x - aLeft] || 0) : blk0;
          let lv = (v - blk) / (white - blk);
          if (rowMaps.length) {
            const ax = x - aLeft;
            let gn = 1;
            for (const g of rowMaps) {
              if (ax < g.left || ax >= g.right) continue;
              if (!even && (ax - g.left) % g.colPitch) continue;
              gn *= g.at(ay, ax);
            }
            lv = Math.min(1, lv * gn);
          }
          rowAcc[bx * 3 + col] += lv;
        }
      }
    }
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * 3;
      // FixVignetteRadial runs after demosaic; here at the block's centre.
      const vg = vignette ? vignette(x0 - aLeft + bx * pc + (pc - 1) / 2, y0 - aTop + by * pr + (pr - 1) / 2) : 1;
      lin3[o] = rowAcc[bx * 3] / counts[0] * vg; lin3[o + 1] = rowAcc[bx * 3 + 1] / counts[1] * vg; lin3[o + 2] = rowAcc[bx * 3 + 2] / counts[2] * vg;
      clipped[by * bw + bx] = rowClip[bx];
    }
  }

  // Shrink by a whole factor to maxSide.
  let w = bw, h = bh, img = lin3, clip = clipped;
  const f = Math.ceil(Math.max(bw, bh) / maxSide);
  if (f > 1) {
    w = Math.floor(bw / f); h = Math.floor(bh / f);
    img = new Float32Array(w * h * 3);
    clip = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, bl2 = 0, k = 0;
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
        const q = (y * f + dy) * bw + x * f + dx, s = q * 3;
        r += lin3[s]; g += lin3[s + 1]; bl2 += lin3[s + 2]; k += clipped[q];
      }
      const o = (y * w + x) * 3, n = f * f;
      img[o] = r / n; img[o + 1] = g / n; img[o + 2] = bl2 / n;
      clip[y * w + x] = 2 * k >= n ? 1 : 0;
    }
  }

  // White balance from AsShotNeutral (camera RGB of a neutral; multipliers are its inverse).
  const neutral = nums(t, ifd0.tags.get(TAG.AsShotNeutral));
  let wb = [1, 1, 1];
  if (neutral.length === 3 && neutral.every((x) => x > 0)) {
    wb = neutral.map((x) => 1 / x);
    const mn = Math.min(...wb);
    wb = wb.map((x) => x / mn);
  } else notes.push("no AsShotNeutral: no white balance");
  const { matrix, illuminant } = pickMatrix(m);
  let M = srgbFromCamera(matrix), fit = null;
  // A vendor raw (the Olympus compacts' ORF) has no matrix by design; a DNG
  // without one is malformed and keeps the camera's own colours.
  if (!matrix && m.orf && fitMode === "generic") {
    M = GENERIC_SRGB_FROM_CAMERA.map((r) => r.slice());
    fit = { matrix: M, generic: true };
    notes.push("no ColorMatrix: a typical Bayer sensor's matrix");
  } else if (!matrix) {
    fit = reference ? fitToReference(img, clip, w, h, wb, reference, { mode: fitMode }) : null;
    if (fit && fit.matrix) { M = fit.matrix; notes.push(`colours matched to the camera's own ${reference.width}x${reference.height} JPEG (${fit.used} pixels)`); }
    else notes.push(`no ColorMatrix: camera colours shown as they are${fit ? ` (${fit.reason})` : ""}`);
  }

  const n = w * h;
  const rgb = new Float32Array(n * 3);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Each channel stops at the sensor's white once balanced; a clipped block
    // is shown white rather than in the colour of whichever channels survived.
    let r = Math.min(1, img[3 * i] * wb[0]), g = Math.min(1, img[3 * i + 1] * wb[1]), bb = Math.min(1, img[3 * i + 2] * wb[2]);
    if (clip[i]) r = g = bb = 1;
    for (let k = 0; k < 3; k++) rgb[3 * i + k] = M[k][0] * r + M[k][1] * g + M[k][2] * bb;
    lum[i] = 0.2126 * rgb[3 * i] + 0.7152 * rgb[3 * i + 1] + 0.0722 * rgb[3 * i + 2];
  }

  // Exposure: BaselineExposure, then up to 2 more stops so the bright end of
  // the frame (99.5th percentile) is near white. Never darker than as shot.
  const be = nums(t, ifd0.tags.get(TAG.BaselineExposure))[0] || 0;
  const base = Math.pow(2, be);
  const hist = new Uint32Array(1024);
  for (let i = 0; i < n; i++) hist[Math.max(0, Math.min(1023, Math.floor(lum[i] * 1023)))]++;
  let bin = 1023;
  for (let seen = 0; bin > 0; bin--) { seen += hist[bin]; if (seen >= 0.005 * n) break; }
  const p995 = (bin / 1023) * base;
  const lift = p995 > 0 ? Math.min(4, Math.max(1, 0.95 / p995)) : 1;
  const gain = base * lift;

  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const v = rgb[3 * i + k] * gain;
      rgba[4 * i + k] = srgbEncode[v <= 0 ? 0 : v >= 1 ? 4095 : Math.round(v * 4095)];
    }
    rgba[4 * i + 3] = 255;
  }
  return {
    width: w, height: h, rgba,
    source: `raw data, ${pr}x${pc} blocks${f > 1 ? `, shrunk ${f}x` : ""}`,
    block: [pr, pc], shrink: f, gain, baselineExposure: be, illuminant, wb, notes, colour: fit && fit.generic ? "generic" : fit && fit.matrix ? "reference" : matrix ? "ColorMatrix" : "camera", M,
    sensor: [mos.width, mos.height], area: [top, left, bottom, right],
  };
}
