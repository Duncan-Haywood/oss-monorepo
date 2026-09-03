// A dependency-free stroke font, used to draw a headline onto a share card.
//
// WHY THIS EXISTS
//
// `offline.mjs` renders the site's PNGs with ~40 lines of `zlib` and no font
// rasteriser, so until now the wide share card could only draw the mark on a
// coloured field: 164 tools shared as 164 identical pictures. `og:title` does
// carry the name, but on X, LinkedIn, Slack and Discord the image is the part
// a reader's eye lands on first and the title is the part that gets truncated,
// so a card that says nothing is the weakest half of every share of a tool.
//
// Pulling in a real font would mean a binary asset and a shaping library in a
// build whose entire premise is that it imports only Node builtins. A stroke
// font does not: each glyph is a handful of polylines on a unit em, drawn with
// round-capped thick strokes and analytic anti-aliasing. It renders one style
// of one weight in capitals — which is all a share card needs — for about 12 KB
// of source and no dependency.
//
// Coordinates are in "em" units: x grows right from the glyph origin, y runs
// 0 at the cap line to 1 at the baseline. A few glyphs (comma) dip below 1.

const { sin, cos, PI, min, max, hypot, round, ceil, floor } = Math;

const DEG = PI / 180;

/**
 * Points along an ellipse arc, in the same y-down space as the glyphs.
 *
 * `t` is measured from the top of the ellipse and increases clockwise, so
 * t=0 is the top, t=90° the right, t=180° the bottom. `t0 > t1` walks the
 * other way round, which is how the open side of a C or a U is placed.
 */
function arc(cx, cy, rx, ry, t0deg, t1deg, steps = 12) {
  const t0 = t0deg * DEG;
  const t1 = t1deg * DEG;
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = t0 + ((t1 - t0) * i) / steps;
    out.push([cx + rx * sin(t), cy - ry * cos(t)]);
  }
  return out;
}

const ring = (cx, cy, rx, ry, steps = 20) => arc(cx, cy, rx, ry, 0, 360, steps);

// Mirror a glyph's points horizontally within its own advance width. Used so
// ')' is exactly '(' reversed rather than a second set of hand-placed points
// that drifts away from it.
const mirror = (strokes, w) => strokes.map((s) => s.map(([x, y]) => [w - x, y]));
// Rotate 180° inside the em box — '9' is '6' turned over, as in most sans faces.
const turn = (strokes, w) => strokes.map((s) => s.map(([x, y]) => [w - x, 1 - y]));

const SIX = [
  [
    [0.5, 0.06], [0.34, 0.0], [0.18, 0.06], [0.07, 0.26], [0.03, 0.54],
    [0.04, 0.76], [0.14, 0.94], [0.32, 1.0], [0.48, 0.94], [0.56, 0.78],
    [0.53, 0.6], [0.4, 0.48], [0.22, 0.47], [0.09, 0.56], [0.04, 0.68],
  ],
];

const PAREN = [[[0.28, 0.0], [0.11, 0.22], [0.06, 0.5], [0.11, 0.78], [0.28, 1.0]]];

/**
 * The glyph table. `w` is the advance width in em units; `s` is the list of
 * polylines to stroke. An unmapped character falls back to a space rather
 * than throwing, so a title picking up an unexpected symbol degrades to a gap
 * instead of failing the whole build.
 */
export const GLYPHS = {
  ' ': { w: 0.3, s: [] },
  A: { w: 0.68, s: [[[0, 1], [0.34, 0], [0.68, 1]], [[0.11, 0.68], [0.57, 0.68]]] },
  B: {
    w: 0.62,
    s: [
      [[0, 0], [0, 1]],
      [[0, 0], [0.3, 0], ...arc(0.3, 0.25, 0.25, 0.25, 0, 180, 8), [0, 0.5]],
      [[0, 0.5], [0.32, 0.5], ...arc(0.32, 0.75, 0.25, 0.25, 0, 180, 8), [0, 1]],
    ],
  },
  C: { w: 0.64, s: [arc(0.32, 0.5, 0.32, 0.5, 55, -235, 22)] },
  D: { w: 0.64, s: [[[0, 0], [0, 1]], [[0, 0], [0.26, 0], ...arc(0.26, 0.5, 0.38, 0.5, 0, 180, 12), [0, 1]]] },
  E: { w: 0.56, s: [[[0.56, 0], [0, 0], [0, 1], [0.56, 1]], [[0, 0.5], [0.46, 0.5]]] },
  F: { w: 0.54, s: [[[0.54, 0], [0, 0], [0, 1]], [[0, 0.48], [0.44, 0.48]]] },
  G: {
    w: 0.66,
    s: [
      arc(0.32, 0.5, 0.32, 0.5, 55, -235, 22),
      [[0.4, 0.55], [0.6, 0.55]],
      [[0.6, 0.55], [0.6, 0.82]],
    ],
  },
  H: { w: 0.64, s: [[[0, 0], [0, 1]], [[0.64, 0], [0.64, 1]], [[0, 0.5], [0.64, 0.5]]] },
  I: { w: 0.16, s: [[[0.08, 0], [0.08, 1]]] },
  J: { w: 0.5, s: [[[0.5, 0], ...arc(0.25, 0.72, 0.25, 0.28, 180, 270, 8)]] },
  K: { w: 0.62, s: [[[0, 0], [0, 1]], [[0.62, 0], [0.04, 0.56]], [[0.2, 0.42], [0.62, 1]]] },
  L: { w: 0.52, s: [[[0, 0], [0, 1], [0.52, 1]]] },
  M: { w: 0.78, s: [[[0, 1], [0, 0], [0.39, 0.62], [0.78, 0], [0.78, 1]]] },
  N: { w: 0.66, s: [[[0, 1], [0, 0], [0.66, 1], [0.66, 0]]] },
  O: { w: 0.7, s: [ring(0.35, 0.5, 0.35, 0.5, 24)] },
  P: { w: 0.6, s: [[[0, 1], [0, 0]], [[0, 0], [0.3, 0], ...arc(0.3, 0.28, 0.28, 0.28, 0, 180, 10), [0, 0.56]]] },
  Q: { w: 0.7, s: [ring(0.35, 0.5, 0.35, 0.5, 24), [[0.44, 0.68], [0.72, 1.02]]] },
  R: {
    w: 0.62,
    s: [
      [[0, 1], [0, 0]],
      [[0, 0], [0.3, 0], ...arc(0.3, 0.28, 0.28, 0.28, 0, 180, 10), [0, 0.56]],
      [[0.3, 0.56], [0.62, 1]],
    ],
  },
  S: {
    w: 0.58,
    s: [[
      [0.56, 0.14], [0.5, 0.05], [0.38, 0.0], [0.22, 0.0], [0.09, 0.05],
      [0.02, 0.16], [0.03, 0.3], [0.12, 0.4], [0.3, 0.47], [0.46, 0.54],
      [0.55, 0.64], [0.56, 0.78], [0.48, 0.92], [0.34, 1.0], [0.18, 1.0],
      [0.06, 0.95], [0.0, 0.86],
    ]],
  },
  T: { w: 0.58, s: [[[0, 0], [0.58, 0]], [[0.29, 0], [0.29, 1]]] },
  U: { w: 0.64, s: [[[0, 0], [0, 0.68], ...arc(0.32, 0.68, 0.32, 0.32, 270, 90, 12), [0.64, 0]]] },
  V: { w: 0.66, s: [[[0, 0], [0.33, 1], [0.66, 0]]] },
  W: { w: 0.94, s: [[[0, 0], [0.2, 1], [0.47, 0.28], [0.74, 1], [0.94, 0]]] },
  X: { w: 0.64, s: [[[0, 0], [0.64, 1]], [[0.64, 0], [0, 1]]] },
  Y: { w: 0.64, s: [[[0, 0], [0.32, 0.52], [0.64, 0]], [[0.32, 0.52], [0.32, 1]]] },
  Z: { w: 0.6, s: [[[0, 0], [0.6, 0], [0, 1], [0.6, 1]]] },
  0: { w: 0.62, s: [ring(0.31, 0.5, 0.31, 0.5, 24)] },
  1: { w: 0.36, s: [[[0.05, 0.2], [0.24, 0.03], [0.24, 1]]] },
  2: {
    w: 0.58,
    s: [[[0.02, 0.24], [0.08, 0.1], [0.22, 0.0], [0.38, 0.02], [0.5, 0.12],
      [0.52, 0.28], [0.44, 0.44], [0.0, 1.0], [0.58, 1.0]]],
  },
  3: {
    w: 0.58,
    s: [[[0.04, 0.12], [0.18, 0.01], [0.36, 0.01], [0.5, 0.1], [0.52, 0.24],
      [0.42, 0.38], [0.26, 0.44], [0.44, 0.48], [0.56, 0.62], [0.54, 0.82],
      [0.4, 0.97], [0.2, 1.0], [0.04, 0.92]]],
  },
  4: { w: 0.64, s: [[[0.46, 0], [0.0, 0.7], [0.64, 0.7]], [[0.46, 0], [0.46, 1]]] },
  5: {
    w: 0.58,
    s: [[[0.52, 0], [0.1, 0], [0.06, 0.4], [0.2, 0.34], [0.38, 0.36], [0.52, 0.48],
      [0.55, 0.68], [0.46, 0.9], [0.28, 1.0], [0.1, 0.97], [0.02, 0.88]]],
  },
  6: { w: 0.6, s: SIX },
  7: { w: 0.56, s: [[[0, 0], [0.56, 0], [0.2, 1]]] },
  8: { w: 0.6, s: [ring(0.3, 0.25, 0.26, 0.25, 18), ring(0.3, 0.74, 0.3, 0.26, 18)] },
  9: { w: 0.6, s: turn(SIX, 0.6) },
  '&': {
    w: 0.72,
    s: [[[0.72, 1.0], [0.28, 0.46], [0.16, 0.32], [0.16, 0.16], [0.28, 0.02],
      [0.44, 0.06], [0.48, 0.2], [0.38, 0.34], [0.12, 0.56], [0.06, 0.74],
      [0.14, 0.94], [0.34, 1.0], [0.52, 0.9], [0.62, 0.72]]],
  },
  '-': { w: 0.42, s: [[[0.05, 0.55], [0.37, 0.55]]] },
  '–': { w: 0.62, s: [[[0.04, 0.55], [0.58, 0.55]]] },
  '—': { w: 0.9, s: [[[0.03, 0.55], [0.87, 0.55]]] },
  ',': { w: 0.24, s: [[[0.15, 0.86], [0.12, 1.08]]] },
  '.': { w: 0.24, s: [[[0.12, 0.97], [0.12, 1.0]]] },
  '·': { w: 0.32, s: [[[0.16, 0.5], [0.16, 0.53]]] },
  ':': { w: 0.24, s: [[[0.12, 0.33], [0.12, 0.36]], [[0.12, 0.92], [0.12, 0.95]]] },
  '/': { w: 0.46, s: [[[0.02, 1.0], [0.44, 0.0]]] },
  '|': { w: 0.3, s: [[[0.15, 0.0], [0.15, 1.0]]] },
  '+': { w: 0.5, s: [[[0.05, 0.55], [0.45, 0.55]], [[0.25, 0.35], [0.25, 0.75]]] },
  '%': {
    w: 0.82,
    s: [ring(0.17, 0.19, 0.15, 0.19, 12), ring(0.65, 0.81, 0.15, 0.19, 12), [[0.74, 0.02], [0.08, 0.98]]],
  },
  '?': {
    w: 0.54,
    s: [
      [[0.04, 0.2], [0.1, 0.06], [0.26, 0.0], [0.42, 0.06], [0.5, 0.2],
        [0.46, 0.36], [0.32, 0.46], [0.27, 0.62], [0.27, 0.7]],
      [[0.27, 0.92], [0.27, 0.95]],
    ],
  },
  '!': { w: 0.22, s: [[[0.11, 0.0], [0.11, 0.68]], [[0.11, 0.92], [0.11, 0.95]]] },
  "'": { w: 0.2, s: [[[0.11, 0.0], [0.08, 0.26]]] },
  '’': { w: 0.2, s: [[[0.11, 0.0], [0.08, 0.26]]] },
  '(': { w: 0.34, s: PAREN },
  ')': { w: 0.34, s: mirror(PAREN, 0.34) },
};

// Space between glyphs, in em units. Wide enough that round caps on adjacent
// stems do not touch at the stroke weights this card uses.
export const TRACKING = 0.1;

/** Advance width of a string, in em units. */
export function measure(text) {
  let w = 0;
  for (const ch of String(text)) {
    const glyph = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS[' '];
    w += glyph.w + TRACKING;
  }
  return w > 0 ? w - TRACKING : 0;
}

/**
 * Break `text` into at most `maxLines` lines and pick the largest em size at
 * which it still fits `maxWidth` x `maxHeight`.
 *
 * Tries every line count rather than wrapping greedily at a fixed size: a
 * two-word title set on one big line beats the same title broken across three
 * small ones, and which of those wins depends on the words, not on a rule that
 * can be written down ahead of time.
 */
export function layout(text, { maxWidth, maxHeight, maxLines = 3, lineGap = 1.42, maxSize = Infinity }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 0, lineHeight: 0 };

  let best = null;
  for (let count = 1; count <= min(maxLines, words.length); count += 1) {
    const lines = wrapInto(words, count);
    if (!lines) continue;
    const widest = max(...lines.map(measure));
    if (widest <= 0) continue;
    // Height is measured in em: `count` cap heights plus the gaps between them.
    const heightEm = 1 + (lines.length - 1) * lineGap;
    const size = min(maxWidth / widest, maxHeight / heightEm, maxSize);
    if (!best || size > best.size) best = { lines, size, lineHeight: size * lineGap };
  }
  return best ?? { lines: [], size: 0, lineHeight: 0 };
}

/**
 * Split `words` into exactly `count` lines, balancing the widest line.
 *
 * A plain greedy fill packs the first lines full and leaves a stub on the
 * last, which on a card reads as a mistake. This walks the width limit up
 * until the greedy fill happens to land on `count` lines, so the limit that
 * wins is close to the narrowest one that works — which is the balanced one.
 */
function wrapInto(words, count) {
  if (count === 1) return [words.join(' ')];
  const total = measure(words.join(' '));
  const spaceEm = GLYPHS[' '].w + TRACKING;
  for (let step = 0; step <= 60; step += 1) {
    const limit = (total / count) * (1 + step * 0.02);
    const lines = [];
    let current = '';
    let currentWidth = 0;
    for (const word of words) {
      const wordWidth = measure(word);
      const candidate = current ? currentWidth + spaceEm + wordWidth : wordWidth;
      if (current && candidate > limit) {
        lines.push(current);
        current = word;
        currentWidth = wordWidth;
      } else {
        current = current ? `${current} ${word}` : word;
        currentWidth = candidate;
      }
    }
    if (current) lines.push(current);
    if (lines.length === count) return lines;
    if (lines.length < count) return null; // a wider limit only makes fewer lines
  }
  return null;
}

/**
 * Draw `text` onto an RGBA buffer.
 *
 * Anti-aliasing is analytic rather than supersampled: for each pixel near a
 * segment we take the distance to that segment and fade over one pixel of
 * stroke edge. That keeps the whole card at one sample per pixel — 164 cards
 * are rendered on every pod start, inside the cluster, on a shared node.
 *
 * Coverage is accumulated with `max` over the whole glyph run before anything
 * is composited, so overlapping strokes (the crossbar of an A, the two bowls
 * of a B) do not darken where they meet the way per-segment blending would.
 */
export function drawText(target, text, { x, y, size, weight = 0.1, rgb = [255, 255, 255], align = 'left' }) {
  const { width, height, rgba } = target;
  const half = (size * weight) / 2;
  const startX = align === 'center' ? x - (measure(text) * size) / 2 : x;

  // One coverage plane for the run, bounded to the pixels the run can touch.
  const pad = ceil(half + 2);
  const runWidth = measure(text) * size;
  const x0 = max(0, floor(startX - pad));
  const y0 = max(0, floor(y - size - pad));
  const x1 = min(width, ceil(startX + runWidth + pad));
  const y1 = min(height, ceil(y + size * 0.15 + pad));
  if (x1 <= x0 || y1 <= y0) return;
  const cw = x1 - x0;
  const cov = new Float32Array(cw * (y1 - y0));

  let penX = startX;
  for (const ch of String(text)) {
    const glyph = GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS[' '];
    for (const poly of glyph.s) {
      for (let i = 0; i < poly.length - 1; i += 1) {
        const ax = penX + poly[i][0] * size;
        const ay = y - size + poly[i][1] * size;
        const bx = penX + poly[i + 1][0] * size;
        const by = y - size + poly[i + 1][1] * size;
        stampSegment(cov, cw, x0, y0, x1, y1, ax, ay, bx, by, half);
      }
      // A single-point polyline is a dot (the tittle on a '?'), which the
      // segment loop above never visits.
      if (poly.length === 1) {
        const ax = penX + poly[0][0] * size;
        const ay = y - size + poly[0][1] * size;
        stampSegment(cov, cw, x0, y0, x1, y1, ax, ay, ax, ay, half);
      }
    }
    penX += (glyph.w + TRACKING) * size;
  }

  const [r, g, b] = rgb;
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const a = cov[(py - y0) * cw + (px - x0)];
      if (a <= 0) continue;
      const i = (py * width + px) * 4;
      const k = min(1, a);
      rgba[i] = round(rgba[i] * (1 - k) + r * k);
      rgba[i + 1] = round(rgba[i + 1] * (1 - k) + g * k);
      rgba[i + 2] = round(rgba[i + 2] * (1 - k) + b * k);
      rgba[i + 3] = 255;
    }
  }
}

/** Round-capped thick segment, written into the coverage plane. */
function stampSegment(cov, cw, x0, y0, x1, y1, ax, ay, bx, by, half) {
  const lo = half + 1;
  const sx = max(x0, floor(min(ax, bx) - lo));
  const ex = min(x1, ceil(max(ax, bx) + lo));
  const sy = max(y0, floor(min(ay, by) - lo));
  const ey = min(y1, ceil(max(ay, by) + lo));
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  for (let py = sy; py < ey; py += 1) {
    for (let px = sx; px < ex; px += 1) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      let t = lenSq > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / lenSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = hypot(cx - (ax + t * dx), cy - (ay + t * dy));
      // One pixel of feathering at the stroke edge. Wider looks blurry at
      // these sizes; narrower shows stair-steps on the diagonals of an A or X.
      const a = half + 0.5 - d;
      if (a <= 0) continue;
      const idx = (py - y0) * cw + (px - x0);
      const v = a >= 1 ? 1 : a;
      if (v > cov[idx]) cov[idx] = v;
    }
  }
}

/**
 * The part of a page title worth setting large on a card.
 *
 * Titles here are written for a search result, so many carry a dash-separated
 * tagline ("Doordash fee calculator for restaurants — compare delivery apps on
 * one ticket"). All 77 characters of that at card size is unreadable; the half
 * before the dash is the name of the thing, which is what a reader scanning a
 * feed needs.
 */
export function headlineFrom(title) {
  const primary = String(title ?? '')
    .split(/\s+[—–|]\s+|\s+[-]\s+/)[0]
    .trim();
  return (primary || String(title ?? '').trim()).toUpperCase();
}
