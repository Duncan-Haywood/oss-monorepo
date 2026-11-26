// Line work and text from a vector PDF drawing, in the page's own user space
// (PDF points, y up). This is what the takeoff measures against: every stroked
// or filled path is flattened to straight segments so a click can snap to a
// wall's corner or face, and every text run comes with its position so the
// sheet's printed scale notes and dimension strings can be read.
//
// It renders nothing and needs no library: the content stream is read with the
// tokenizer in pdf-text.mjs (path operators m l c v y h re, painting S s f F f*
// B B* b b* n, graphics state q Q cm, and Form XObjects through Do), and curves
// are flattened to short chords. A scanned sheet (a picture) has no line work;
// the reader says so and the page falls back to calibrating by two clicks.

import {
  bytesToBinaryString, scanObjects, findTrailer, expandObjectStreams, decodeStream,
  resolve, isDict, isName, PRef, PName, binaryStringToBytes,
} from './pdf-parser.mjs';
import { TokenList, runTokens, mul, pageList, inherited, loadFonts, loadForms, textRuns } from './pdf-text.mjs';

const MAX_SEGMENTS = 600000; // per page; a dense site plan stays far below this

/**
 * Flatten a cubic Bezier from (x0, y0) with controls (x1, y1), (x2, y2) to
 * (x3, y3) into n chords, appended to the flat path as x1, y1, x2, y2 per
 * chord, each flagged as a curve chord.
 */
function cubic(x0, y0, x1, y1, x2, y2, x3, y3, path, curved) {
  const len = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  const n = Math.max(2, Math.min(24, Math.ceil(len / 6)));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const qx = a * x0 + b * x1 + c * x2 + d * x3, qy = a * y0 + b * y1 + c * y2 + d * y3;
    curved[path.length / 4] = 1;
    path.push(px, py, qx, qy);
    px = qx; py = qy;
  }
}

/** A Form XObject's tokens, listed on first use and kept on the form: a CAD
 * block placed many times is read once, and textRuns reads `form.toks` too.
 * Forms are loaded per page, so the list goes with the page. */
function formTokens(form) {
  if (!form.toks) form.toks = new TokenList(form.content);
  return form.toks;
}

/**
 * Segments of every painted path in a content stream (a string, or a
 * TokenList of one).
 * @returns {{segs: number[], paint: number[], widths: number[]}} segs is flat
 *   [x1, y1, x2, y2, ...] in page space; paint[i] is 1 for a stroke, 2 for the
 *   edge of a fill only; widths[i] the stroke width in page units.
 */
export function pathSegments(content, forms = null, startCtm = null, depth = 0, acc = null, images = null) {
  const out = acc || { segs: [], paint: [], widths: [], curve: [], truncated: false, images: [] };
  let ctm = startCtm ? startCtm.slice() : [1, 0, 0, 1, 0, 0];
  let lw = 1;
  const stack = [];
  let operands = [];
  // The path being built, flat: x1, y1, x2, y2 per segment, already through
  // the ctm. A drawing is hundreds of thousands of short segments, so points
  // are plain numbers rather than a small array each (perf note
  // docs/history/pdf-plan-takeoff-perf-2026-11-26.md).
  let path = [];
  let curved = []; // per segment: 1 when it is a chord of a flattened curve
  let has = false, cx = 0, cy = 0, sx = 0, sy = 0; // current point and subpath start
  // Operand i of the last k, as a number (anything else reads as 0).
  const arg = (k, i) => { const v = operands[operands.length - k + i]; return typeof v === 'number' ? v : 0; };
  const X = (x, y) => x * ctm[0] + y * ctm[2] + ctm[4];
  const Y = (x, y) => x * ctm[1] + y * ctm[3] + ctm[5];
  const line = (x, y) => { path.push(cx, cy, x, y); cx = x; cy = y; };
  const paint = (kind) => {
    const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
    const w = lw * scale;
    for (let i = 0; i + 3 < path.length; i += 4) {
      if (out.paint.length >= MAX_SEGMENTS) { out.truncated = true; break; }
      const ax = path[i], ay = path[i + 1], bx = path[i + 2], by = path[i + 3];
      if (ax === bx && ay === by) continue;
      out.segs.push(ax, ay, bx, by);
      out.paint.push(kind);
      out.widths.push(w);
      out.curve.push(curved[i / 4] || 0);
    }
    path = []; curved = []; has = false;
  };
  const value = (v) => { operands.push(v); if (operands.length > 64) operands.shift(); };
  const step = (op) => {
    switch (op) {
      case 'q': stack.push([ctm.slice(), lw]); break;
      case 'Q': if (stack.length) [ctm, lw] = stack.pop(); break;
      case 'cm': if (operands.length >= 6) ctm = mul([arg(6, 0), arg(6, 1), arg(6, 2), arg(6, 3), arg(6, 4), arg(6, 5)], ctm); break;
      case 'w': if (operands.length) lw = arg(1, 0); break;
      case 'm': if (operands.length >= 2) { const x = arg(2, 0), y = arg(2, 1); cx = sx = X(x, y); cy = sy = Y(x, y); has = true; } break;
      case 'l': if (operands.length >= 2 && has) { const x = arg(2, 0), y = arg(2, 1); line(X(x, y), Y(x, y)); } break;
      case 'c': if (operands.length >= 6 && has) {
        const x1 = arg(6, 0), y1 = arg(6, 1), x2 = arg(6, 2), y2 = arg(6, 3), x3 = arg(6, 4), y3 = arg(6, 5);
        const px = X(x3, y3), py = Y(x3, y3);
        cubic(cx, cy, X(x1, y1), Y(x1, y1), X(x2, y2), Y(x2, y2), px, py, path, curved); cx = px; cy = py;
      } break;
      case 'v': if (operands.length >= 4 && has) {
        const x2 = arg(4, 0), y2 = arg(4, 1), x3 = arg(4, 2), y3 = arg(4, 3);
        const px = X(x3, y3), py = Y(x3, y3);
        cubic(cx, cy, cx, cy, X(x2, y2), Y(x2, y2), px, py, path, curved); cx = px; cy = py;
      } break;
      case 'y': if (operands.length >= 4 && has) {
        const x1 = arg(4, 0), y1 = arg(4, 1), x3 = arg(4, 2), y3 = arg(4, 3);
        const px = X(x3, y3), py = Y(x3, y3);
        cubic(cx, cy, X(x1, y1), Y(x1, y1), px, py, px, py, path, curved); cx = px; cy = py;
      } break;
      case 'h': if (has) line(sx, sy); break;
      case 're': if (operands.length >= 4) {
        const x = arg(4, 0), y = arg(4, 1), w = arg(4, 2), h = arg(4, 3);
        const ax = X(x, y), ay = Y(x, y), bx = X(x + w, y), by = Y(x + w, y);
        const ccx = X(x + w, y + h), ccy = Y(x + w, y + h), dx = X(x, y + h), dy = Y(x, y + h);
        path.push(ax, ay, bx, by, bx, by, ccx, ccy, ccx, ccy, dx, dy, dx, dy, ax, ay);
        cx = sx = ax; cy = sy = ay; has = true;
      } break;
      case 'S': case 's': case 'B': case 'B*': case 'b': case 'b*':
        if ((op === 's' || op === 'b' || op === 'b*') && has) line(sx, sy);
        paint(1); break;
      case 'f': case 'F': case 'f*': paint(2); break;
      case 'n': path = []; curved = []; has = false; break;
      case 'Do': {
        const nameOp = operands.find((x) => x instanceof PName);
        const form = forms && nameOp ? forms.get(nameOp.name) : null;
        if (form && depth < 8) pathSegments(formTokens(form), form.forms, mul(form.matrix, ctm), depth + 1, out, form.images || null);
        else if (nameOp && images && images.has(nameOp.name)) out.images.push({ num: images.get(nameOp.name), ctm: ctm.slice() });
        break;
      }
      default: break;
    }
    operands = [];
  };
  runTokens(content, value, step);
  return out;
}

/**
 * Read every page of a PDF: box, rotation, segments and text runs.
 * @param {Uint8Array} bytes
 * @param {(b: Uint8Array) => Promise<Uint8Array|null>} inflate
 * @param {{pages?: number[]}} [opts] 1-based page numbers to read (default all)
 */
export async function readSheets(bytes, inflate, opts = {}) {
  const flags = { notPdf: false, encrypted: false, pageCount: 0 };
  const binaryStr = bytesToBinaryString(bytes);
  if (!binaryStr.slice(0, 1024).includes('%PDF')) { flags.notPdf = true; return { pages: [], flags }; }
  const objects = scanObjects(binaryStr);
  await expandObjectStreams(objects, binaryStr, inflate);
  const trailer = findTrailer(binaryStr, objects);
  if (trailer && trailer.has('Encrypt')) { flags.encrypted = true; return { pages: [], flags }; }
  const plist = pageList(objects, trailer);
  flags.pageCount = plist.length;
  const want = opts.pages ? new Set(opts.pages) : null;
  const fontCache = new Map();
  const pages = [];
  for (let i = 0; i < plist.length; i++) {
    if (want && !want.has(i + 1)) continue;
    const page = plist[i];
    const res = inherited(page, 'Resources', objects);
    const fonts = await loadFonts(res, objects, binaryStr, inflate, fontCache);
    const forms = await loadForms(res, objects, binaryStr, inflate, fontCache, new Set(), 0);
    const contents = page.get('Contents');
    let content = '';
    for (const r of Array.isArray(contents) ? contents : [contents]) {
      const entry = r instanceof PRef ? objects.get(r.num) : null;
      if (!entry) continue;
      const data = await decodeStream(entry, binaryStr, inflate);
      if (data) content += bytesToBinaryString(data) + '\n';
    }
    const box0 = inherited(page, 'CropBox', objects) || inherited(page, 'MediaBox', objects);
    const b = (Array.isArray(box0) && box0.length === 4 ? box0 : [0, 0, 612, 792]).map((v) => (typeof v === 'number' ? v : 0));
    const box = [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
    const rot = resolve(inherited(page, 'Rotate', objects), objects);
    // One tokenizing pass serves both readers (pdf-text.mjs, TokenList).
    const toks = new TokenList(content);
    const g = pathSegments(toks, forms, null, 0, null, imageNames(res, objects));
    const runs = textRuns(toks, fonts, forms).filter((r) => r.text && r.text.trim());
    pages.push({
      page: i + 1, box, rotate: (((typeof rot === 'number' ? rot : 0) % 360) + 360) % 360,
      segs: Float64Array.from(g.segs), paint: Uint8Array.from(g.paint), widths: Float32Array.from(g.widths), curve: Uint8Array.from(g.curve),
      truncated: g.truncated, images: g.images,
      runs: runs.map((r) => ({ text: r.text, x: r.x, y: r.y, size: r.size, angle: r.angle || 0, width: r.width })),
    });
  }
  const cache = new Map();
  /** Decode an image placed on a page to a dark/light bitmap (1 = ink), cached. */
  const decodeImage = async (num) => {
    if (cache.has(num)) return cache.get(num);
    const img = await decodeImageObject(objects.get(num), objects, binaryStr, inflate, opts.decodeJpeg).catch(() => null);
    cache.set(num, img);
    return img;
  };
  return { pages, flags, decodeImage };
}

function imageNames(res, objects) {
  const map = new Map();
  const xdict = isDict(res) ? resolve(res.get('XObject'), objects) : null;
  if (!isDict(xdict)) return map;
  for (const [name, ref] of xdict.map) {
    const num = ref instanceof PRef ? ref.num : null;
    const entry = num === null ? null : objects.get(num);
    if (entry && isDict(entry.dict) && isName(entry.dict.get('Subtype'), 'Image')) map.set(name, num);
  }
  return map;
}

/** Ink threshold: a pixel darker than this (0-255 luminance) is line work. */
export const INK = 160;

/**
 * An image XObject as {w, h, ink: Uint8Array} (1 = dark pixel). Reads
 * FlateDecode images (with PNG or TIFF predictors) in gray, RGB or CMYK at 8
 * bits, 1-bit images and stencil masks; DCTDecode (JPEG) only through the
 * `decodeJpeg(bytes) -> {w, h, rgba}` hook the browser page supplies.
 */
async function decodeImageObject(entry, objects, binaryStr, inflate, decodeJpeg) {
  if (!entry || !isDict(entry.dict)) return null;
  const d = entry.dict;
  const w = resolve(d.get('Width'), objects), h = resolve(d.get('Height'), objects);
  if (!(w > 0 && h > 0) || w * h > 64e6) return null;
  let f = resolve(d.get('Filter'), objects);
  const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => (x && x.name) || '');
  const ink = new Uint8Array(w * h);
  if (filters.length === 1 && filters[0] === 'DCTDecode') {
    if (!decodeJpeg) return null;
    const raw = binaryStringToBytes(binaryStr.slice(entry.streamStart, entry.streamEnd));
    const img = await decodeJpeg(raw);
    if (!img || img.w !== w || img.h !== h) return null;
    for (let i = 0; i < w * h; i++) ink[i] = (0.299 * img.rgba[4 * i] + 0.587 * img.rgba[4 * i + 1] + 0.114 * img.rgba[4 * i + 2]) < INK ? 1 : 0;
    return { w, h, ink };
  }
  if (filters.some((x) => x !== 'FlateDecode' && x !== 'Fl')) return null;
  let data = await decodeStream(entry, binaryStr, inflate);
  if (!data) return null;
  const mask = resolve(d.get('ImageMask'), objects) === true;
  const bpc = mask ? 1 : resolve(d.get('BitsPerComponent'), objects) || 8;
  let cs = resolve(d.get('ColorSpace'), objects);
  if (Array.isArray(cs)) cs = cs[0] && cs[0].name === 'ICCBased' ? resolve(cs[1], objects) : cs[0];
  let comps = 1;
  if (isDict(cs)) comps = resolve(cs.get('N'), objects) || 3; // ICC stream dict
  else if (cs && cs.name) comps = /RGB/.test(cs.name) ? 3 : /CMYK/.test(cs.name) ? 4 : cs.name === 'Indexed' ? 1 : 1;
  if (mask) comps = 1;
  const parms = resolve(d.get('DecodeParms'), objects);
  const pred = isDict(parms) ? resolve(parms.get('Predictor'), objects) || 1 : 1;
  const rowBytes = Math.ceil((w * comps * bpc) / 8);
  if (pred >= 10) data = unPng(data, rowBytes, h, Math.max(1, Math.ceil((comps * bpc) / 8)));
  if (!data || data.length < rowBytes * h) return null;
  if (Array.isArray(resolve(d.get('ColorSpace'), objects)) && (resolve(d.get('ColorSpace'), objects)[0] || {}).name === 'Indexed') return null;
  for (let y = 0; y < h; y++) {
    const row = y * rowBytes;
    for (let x = 0; x < w; x++) {
      let lum;
      if (bpc === 8) {
        const o = row + x * comps;
        if (comps === 3) lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        else if (comps === 4) lum = 255 - Math.min(255, 0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2] + data[o + 3]);
        else lum = data[o];
      } else if (bpc === 1 && comps === 1) {
        const bit = (data[row + (x >> 3)] >> (7 - (x & 7))) & 1;
        lum = mask ? (bit ? 255 : 0) : bit ? 255 : 0; // stencil: 0 paints
      } else return null;
      ink[y * w + x] = lum < INK ? 1 : 0;
    }
  }
  return { w, h, ink };
}

/** Undo PNG row filters (Predictor 10-15). */
function unPng(data, rowBytes, h, bpp) {
  const out = new Uint8Array(rowBytes * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    if (p >= data.length) return null;
    const type = data[p++];
    const o = y * rowBytes, prev = o - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = data[p++] ?? 0;
      const a = x >= bpp ? out[o + x - bpp] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= bpp && y > 0 ? out[prev + x - bpp] : 0;
      let v;
      switch (type) {
        case 0: v = raw; break;
        case 1: v = raw + a; break;
        case 2: v = raw + b; break;
        case 3: v = raw + ((a + b) >> 1); break;
        case 4: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: v = raw;
      }
      out[o + x] = v & 255;
    }
  }
  return out;
}

export { isDict };
