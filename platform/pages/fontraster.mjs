// Real type on the share cards: a TrueType reader and an anti-aliased
// rasteriser in plain JavaScript, with no dependency.
//
// WHY THIS EXISTS
//
// `cardtext.mjs` (now deleted) drew card headlines with a hand-made stroke font: one weight,
// capitals only, monoline. It made per-tool cards possible, but every share of
// the site still previewed as all-caps lettering that matched nothing on the
// pages it linked to, which use Inter. This reads the vendored Inter subsets in
// `fonts/` (SIL Open Font License, `fonts/OFL.txt`) and fills their outlines,
// so a card is set in the site's own face, in mixed case, with kerning.
//
// The build still imports only Node builtins. A TrueType `glyf` outline is a
// list of contours made of lines and quadratic curves; the reader below parses
// `cmap` (formats 4 and 12), `hmtx`, `loca` and `glyf` (simple and composite
// glyphs), which is all the subsets carry outlines in. Kerning comes from
// `fonts/kerning.json`, flattened from GPOS once by `fonts/kerning.py`, because
// parsing GPOS here would be three times this file for one table.
//
// The rasteriser is the signed-area accumulation method (as in font-rs): each
// edge adds its exact covered area to a per-pixel accumulator, and a running
// sum along each row gives coverage. It is exact for non-overlapping contours,
// which the static Inter instances are.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fonts');

let KERNING = null;
function kerningFor(name) {
  if (!KERNING) KERNING = JSON.parse(readFileSync(join(FONT_DIR, 'kerning.json'), 'utf8'));
  return KERNING[name] ?? {};
}

function parseTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    const tag = buf.toString('latin1', rec, rec + 4);
    tables[tag] = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  return tables;
}

function parseCmap(buf, { offset }) {
  const count = buf.readUInt16BE(offset + 2);
  let best = null;
  for (let i = 0; i < count; i += 1) {
    const rec = offset + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = offset + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) { best = { sub, format }; break; }
    if (format === 4 && !best) best = { sub, format };
  }
  const map = new Map();
  if (!best) return map;
  const { sub, format } = best;
  if (format === 12) {
    const groups = buf.readUInt32BE(sub + 12);
    for (let g = 0; g < groups; g += 1) {
      const p = sub + 16 + g * 12;
      const start = buf.readUInt32BE(p);
      const end = buf.readUInt32BE(p + 4);
      const glyph = buf.readUInt32BE(p + 8);
      for (let c = start; c <= end; c += 1) map.set(c, glyph + c - start);
    }
    return map;
  }
  const segX2 = buf.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = buf.readUInt16BE(ends + s);
    const start = buf.readUInt16BE(starts + s);
    const delta = buf.readInt16BE(deltas + s);
    const rangeOffset = buf.readUInt16BE(ranges + s);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const at = ranges + s + rangeOffset + (c - start) * 2;
        glyph = buf.readUInt16BE(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) map.set(c, glyph);
    }
  }
  return map;
}

/** One font, parsed once. `name` is a file stem in `fonts/`. */
export function loadFont(name) {
  const buf = readFileSync(join(FONT_DIR, `${name}.ttf`));
  const t = parseTables(buf);
  const head = t.head.offset;
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const longLoca = buf.readInt16BE(head + 50) === 1;
  const numGlyphs = buf.readUInt16BE(t.maxp.offset + 4);
  const hhea = t.hhea.offset;
  const ascender = buf.readInt16BE(hhea + 4);
  const descender = buf.readInt16BE(hhea + 6);
  const numHMetrics = buf.readUInt16BE(hhea + 34);
  const capHeight = t['OS/2'] && buf.readUInt16BE(t['OS/2'].offset) >= 2
    ? buf.readInt16BE(t['OS/2'].offset + 88)
    : Math.round(unitsPerEm * 0.7);

  const advance = (g) => buf.readUInt16BE(t.hmtx.offset + Math.min(g, numHMetrics - 1) * 4);
  const locaAt = (g) => (longLoca
    ? buf.readUInt32BE(t.loca.offset + g * 4)
    : buf.readUInt16BE(t.loca.offset + g * 2) * 2);

  const cmap = parseCmap(buf, t.cmap);
  const cache = new Map();

  // Contours as arrays of {x, y, on}, in font units, y up.
  function contoursOf(g, depth = 0) {
    if (g >= numGlyphs || depth > 8) return [];
    const start = locaAt(g);
    const end = locaAt(g + 1);
    if (end <= start) return [];
    let p = t.glyf.offset + start;
    const nContours = buf.readInt16BE(p);
    p += 10;
    if (nContours >= 0) {
      const endPts = [];
      for (let i = 0; i < nContours; i += 1) { endPts.push(buf.readUInt16BE(p)); p += 2; }
      const nPoints = nContours ? endPts[nContours - 1] + 1 : 0;
      p += 2 + buf.readUInt16BE(p); // instructions
      const flags = [];
      while (flags.length < nPoints) {
        const f = buf[p++];
        flags.push(f);
        if (f & 8) { let r = buf[p++]; while (r-- > 0) flags.push(f); }
      }
      const xs = new Array(nPoints);
      const ys = new Array(nPoints);
      let v = 0;
      for (let i = 0; i < nPoints; i += 1) {
        const f = flags[i];
        if (f & 2) { const d = buf[p++]; v += f & 16 ? d : -d; }
        else if (!(f & 16)) { v += buf.readInt16BE(p); p += 2; }
        xs[i] = v;
      }
      v = 0;
      for (let i = 0; i < nPoints; i += 1) {
        const f = flags[i];
        if (f & 4) { const d = buf[p++]; v += f & 32 ? d : -d; }
        else if (!(f & 32)) { v += buf.readInt16BE(p); p += 2; }
        ys[i] = v;
      }
      const out = [];
      let first = 0;
      for (const last of endPts) {
        const c = [];
        for (let i = first; i <= last; i += 1) c.push({ x: xs[i], y: ys[i], on: Boolean(flags[i] & 1) });
        out.push(c);
        first = last + 1;
      }
      return out;
    }
    // Composite: each component is another glyph, offset and optionally scaled.
    const out = [];
    let more = true;
    while (more) {
      const flags = buf.readUInt16BE(p);
      const index = buf.readUInt16BE(p + 2);
      p += 4;
      let dx;
      let dy;
      if (flags & 1) { dx = buf.readInt16BE(p); dy = buf.readInt16BE(p + 2); p += 4; }
      else { dx = buf.readInt8(p); dy = buf.readInt8(p + 1); p += 2; }
      let a = 1; let b = 0; let c = 0; let d = 1;
      const f2 = (at) => buf.readInt16BE(at) / 16384;
      if (flags & 8) { a = d = f2(p); p += 2; }
      else if (flags & 0x40) { a = f2(p); d = f2(p + 2); p += 4; }
      else if (flags & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const contour of contoursOf(index, depth + 1)) {
        out.push(contour.map((pt) => ({
          x: a * pt.x + c * pt.y + dx,
          y: b * pt.x + d * pt.y + dy,
          on: pt.on,
        })));
      }
      more = Boolean(flags & 0x20);
    }
    return out;
  }

  function glyph(code) {
    if (cache.has(code)) return cache.get(code);
    const g = cmap.get(code) ?? 0;
    const entry = { id: g, advance: advance(g), contours: contoursOf(g) };
    cache.set(code, entry);
    return entry;
  }

  const kern = kerningFor(name);
  return {
    name,
    unitsPerEm,
    ascender,
    descender,
    capHeight,
    has: (code) => cmap.has(code),
    glyph,
    kern: (a, b) => kern[a + b] ?? 0,
  };
}

const FONTS = new Map();
/** A cached `loadFont`: the cards share three faces across thousands of draws. */
export function font(name) {
  if (!FONTS.has(name)) FONTS.set(name, loadFont(name));
  return FONTS.get(name);
}

// Characters a subset may lack, mapped to the nearest one it has, so a title
// with a stray symbol never draws the empty .notdef box.
const FALLBACK = { '‐': '-', '‑': '-', '­': '', '​': '', ' ': ' ', ' ': ' ' };

function clean(f, text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    if (f.has(ch.codePointAt(0))) out += ch;
    else if (ch in FALLBACK) out += FALLBACK[ch];
    else if (/\s/.test(ch)) out += ' ';
  }
  return out;
}

/**
 * Width of `text` in pixels at `size` px, kerned, with `tracking` in em.
 */
export function measureText(f, text, size, tracking = 0) {
  const s = clean(f, text);
  const scale = size / f.unitsPerEm;
  let w = 0;
  let prev = '';
  for (const ch of s) {
    if (prev) w += f.kern(prev, ch) * scale;
    w += f.glyph(ch.codePointAt(0)).advance * scale + tracking * size;
    prev = ch;
  }
  return Math.max(0, w - (s.length ? tracking * size : 0));
}

/**
 * Greedy word wrap into at most `maxLines`. Returns null when the text does not
 * fit, so `fitText` can try a smaller size.
 */
export function wrapText(f, text, size, maxWidth, maxLines, tracking = 0) {
  const words = clean(f, text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measureText(f, next, size, tracking) <= maxWidth) { line = next; continue; }
    if (!line) return null; // one word wider than the box
    lines.push(line);
    line = word;
    if (measureText(f, line, size, tracking) > maxWidth) return null;
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

/**
 * The largest size from `maxSize` down to `minSize` at which `text` wraps into
 * `maxLines` inside `maxWidth`. At the floor it truncates with an ellipsis
 * rather than overflowing, so a very long title still draws inside the card.
 */
export function fitText(f, text, { maxWidth, maxLines = 3, maxSize = 80, minSize = 36, step = 2, tracking = 0 }) {
  for (let size = maxSize; size >= minSize; size -= step) {
    const lines = wrapText(f, text, size, maxWidth, maxLines, tracking);
    if (lines) return { lines, size };
  }
  const size = minSize;
  const words = clean(f, text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measureText(f, next, size, tracking) <= maxWidth) { line = next; continue; }
    lines.push(line || word);
    line = line ? word : '';
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  let last = lines[lines.length - 1] ?? '';
  const truncated = lines.join(' ').length < words.join(' ').length;
  if (truncated) {
    while (last && measureText(f, `${last}…`, size, tracking) > maxWidth) last = last.replace(/\s*\S+$/, '');
    lines[lines.length - 1] = `${last.replace(/[\s,.;:–—-]+$/, '')}…`;
  }
  return { lines, size };
}

// Flatten one contour into line segments in pixel space.
function flatten(contour, ox, oy, scale, push) {
  const n = contour.length;
  if (n < 2) return;
  const pt = (p) => [ox + p.x * scale, oy - p.y * scale];
  // Start on an on-curve point; if none, start at the midpoint of the first two.
  let startIndex = contour.findIndex((p) => p.on);
  let start;
  if (startIndex < 0) {
    const a = contour[0];
    const b = contour[1];
    start = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true };
    startIndex = 0;
  } else start = contour[startIndex];
  let [cx, cy] = pt(start);
  const [sx, sy] = [cx, cy];
  let ctrl = null;
  for (let k = 1; k <= n; k += 1) {
    const p = contour[(startIndex + k) % n];
    const [px, py] = k === n && !contour[startIndex].on ? pt(start) : pt(p);
    if (p.on || k === n) {
      if (ctrl) {
        quad(cx, cy, ctrl[0], ctrl[1], px, py, push);
        ctrl = null;
      } else push(cx, cy, px, py);
      cx = px; cy = py;
    } else if (ctrl) {
      const mx = (ctrl[0] + px) / 2;
      const my = (ctrl[1] + py) / 2;
      quad(cx, cy, ctrl[0], ctrl[1], mx, my, push);
      cx = mx; cy = my;
      ctrl = [px, py];
    } else ctrl = [px, py];
  }
  if (ctrl) quad(cx, cy, ctrl[0], ctrl[1], sx, sy, push);
  else if (cx !== sx || cy !== sy) push(cx, cy, sx, sy);
}

function quad(x0, y0, x1, y1, x2, y2, push) {
  const dd = Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
  const steps = Math.max(1, Math.min(32, Math.ceil(Math.sqrt(dd * 2))));
  let px = x0;
  let py = y0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    push(px, py, x, y);
    px = x; py = y;
  }
}

/**
 * Coverage of `text` as a Float32Array over a box. Returns
 * `{ left, top, width, height, cover }` in canvas pixels.
 */
export function rasterizeText(f, text, { x, y, size, tracking = 0 }) {
  const s = clean(f, text);
  const scale = size / f.unitsPerEm;
  const segments = [];
  let pen = x;
  let prev = '';
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const ch of s) {
    if (prev) pen += f.kern(prev, ch) * scale;
    const g = f.glyph(ch.codePointAt(0));
    for (const contour of g.contours) {
      flatten(contour, pen, y, scale, (ax, ay, bx, by) => {
        segments.push(ax, ay, bx, by);
        if (ax < minX) minX = ax; if (bx < minX) minX = bx;
        if (ax > maxX) maxX = ax; if (bx > maxX) maxX = bx;
        if (ay < minY) minY = ay; if (by < minY) minY = by;
        if (ay > maxY) maxY = ay; if (by > maxY) maxY = by;
      });
    }
    pen += g.advance * scale + tracking * size;
    prev = ch;
  }
  if (!segments.length) return null;
  const left = Math.floor(minX) - 1;
  const top = Math.floor(minY) - 1;
  const width = Math.ceil(maxX) - left + 2;
  const height = Math.ceil(maxY) - top + 2;
  const acc = new Float32Array(width * height + 2);
  for (let i = 0; i < segments.length; i += 4) {
    line(acc, width, height, segments[i] - left, segments[i + 1] - top, segments[i + 2] - left, segments[i + 3] - top);
  }
  const cover = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < width * height; i += 1) {
    sum += acc[i];
    cover[i] = Math.min(1, Math.abs(sum));
  }
  return { left, top, width, height, cover };
}

// font-rs's `draw_line`: add one edge's signed area to the accumulator.
function line(a, w, h, x0, y0, x1, y1) {
  if (Math.abs(y0 - y1) <= 1e-6) return;
  let dir = 1;
  if (y0 > y1) { dir = -1; [x0, y0, x1, y1] = [x1, y1, x0, y0]; }
  const dxdy = (x1 - x0) / (y1 - y0);
  let x = x0;
  const yStart = Math.max(0, Math.floor(y0));
  if (y0 < 0) x -= y0 * dxdy;
  const yEnd = Math.min(h, Math.ceil(y1));
  for (let yy = yStart; yy < yEnd; yy += 1) {
    const rowStart = yy * w;
    const dy = Math.min(yy + 1, y1) - Math.max(yy, y0);
    const xnext = x + dxdy * dy;
    const d = dy * dir;
    const lo = Math.min(x, xnext);
    const hi = Math.max(x, xnext);
    const lof = Math.floor(lo);
    const loi = lof;
    const hic = Math.ceil(hi);
    const hii = hic;
    if (hii <= loi + 1) {
      const xmf = 0.5 * (x + xnext) - lof;
      const at = rowStart + loi;
      if (at >= 0) { a[at] += d - d * xmf; a[at + 1] += d * xmf; }
    } else {
      const sInv = 1 / (hi - lo);
      const x0f = lo - lof;
      const a0 = 0.5 * sInv * (1 - x0f) * (1 - x0f);
      const x1f = hi - hic + 1;
      const am = 0.5 * sInv * x1f * x1f;
      const at = rowStart + loi;
      if (at >= 0) {
        a[at] += d * a0;
        if (hii === loi + 2) a[at + 1] += d * (1 - a0 - am);
        else {
          const a1 = sInv * (1.5 - x0f);
          a[at + 1] += d * (a1 - a0);
          for (let xi = loi + 2; xi < hii - 1; xi += 1) a[rowStart + xi] += d * sInv;
          const a2 = a1 + (hii - loi - 3) * sInv;
          a[rowStart + hii - 1] += d * (1 - a2 - am);
        }
        a[rowStart + hii] += d * am;
      }
    }
    x = xnext;
  }
}

/**
 * Composite `text` onto an RGB(A) canvas `{ width, height, data, channels }`.
 * `paint(px, py)` returns the [r, g, b] at a pixel, so a run can carry a
 * gradient; `rgb` is the flat-colour shorthand. `alpha` scales the whole run.
 * Returns the advance in pixels.
 */
export function fillText(canvas, f, text, { x, y, size, tracking = 0, rgb = [255, 255, 255], paint = null, alpha = 1 }) {
  const r = rasterizeText(f, text, { x, y, size, tracking });
  if (!r) return 0;
  const { width: cw, height: ch, data, channels = 3 } = canvas;
  for (let j = 0; j < r.height; j += 1) {
    const py = r.top + j;
    if (py < 0 || py >= ch) continue;
    for (let i = 0; i < r.width; i += 1) {
      const c = r.cover[j * r.width + i] * alpha;
      if (c <= 0.002) continue;
      const px = r.left + i;
      if (px < 0 || px >= cw) continue;
      const [cr, cg, cb] = paint ? paint(px, py) : rgb;
      const at = (py * cw + px) * channels;
      data[at] = Math.round(data[at] + (cr - data[at]) * c);
      data[at + 1] = Math.round(data[at + 1] + (cg - data[at + 1]) * c);
      data[at + 2] = Math.round(data[at + 2] + (cb - data[at + 2]) * c);
    }
  }
  return measureText(f, text, size, tracking);
}
