// The picture a link to this site previews as, and the brand mark it carries.
//
// A shared link is the first thing most people ever see of this site: in a
// Slack thread, an iMessage bubble, a LinkedIn post or a forum reply, the card
// is read before the title and long before the page. So the card is drawn in
// the Maris Stella Labs look the company's LinkedIn banner set (2026-10-31):
// a deep navy sea, brass-gold light, a faint chart grid and a constellation
// for the star the name means, set in Inter, the face the pages use,
// with the page's own section as a coloured kicker. A roofing bid, a research
// project and an essay therefore preview as visibly different cards that are
// still obviously one site.
//
// Everything is drawn here with Node builtins: `fontraster.mjs` fills the type
// and `zlib` encodes the PNG. Deterministic: the same arguments give the same
// bytes, which the build's tests rely on.

import zlib from 'node:zlib';

import { fillText, fitText, font, measureText, wrapText } from './fontraster.mjs';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
const MARGIN = 72;

// The brand palette: navy sea, brass gold, parchment. The names TEAL, INDIGO
// and ORCHID are the roles the hero's aurora had (first, second and third
// glow), now filled with the navy-and-gold theme.
const NIGHT = [9, 16, 36];
const DEEP = [26, 42, 88];
const TEAL = [214, 176, 92];
const INDIGO = [120, 146, 206];
const ORCHID = [244, 232, 204];
const INK = [247, 242, 230];
const MUTED = [196, 200, 214];
const GRID = [214, 176, 92];


export const hexToRgb = (hex) => {
  const h = String(hex || '#12594a').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
};

const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);

/** Lift a colour towards white until it reads on the night field. */
function luminous(rgb) {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bg = lum(NIGHT);
  let c = rgb;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    c = mix(rgb, [255, 255, 255], t);
    if ((lum(c) + 0.05) / (bg + 0.05) >= 7) break;
  }
  return c.map(Math.round);
}

// A small deterministic PRNG, so a card's constellation is stable per title.
function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The field without type, cached per accent: every card in a section shares it.
const FIELDS = new Map();
const FIELD_ROWS = 6;
function field(accent) {
  const key = accent.join(',');
  if (FIELDS.has(key)) return FIELDS.get(key);
  const w = CARD_WIDTH;
  const h = CARD_HEIGHT;
  const data = Buffer.alloc(w * h * 3);
  const glows = [
    { x: -0.04 * w, y: -0.1 * h, r: 620, rgb: TEAL, a: 0.26 },
    { x: 1.02 * w, y: 0.05 * h, r: 680, rgb: INDIGO, a: 0.3 },
    { x: 0.86 * w, y: 1.08 * h, r: 560, rgb: accent, a: 0.55 },
    { x: 0.42 * w, y: 1.25 * h, r: 520, rgb: ORCHID, a: 0.12 },
  ];
  // The glows are sampled once per FIELD_ROWS rows, so a block of rows is
  // byte-identical and PNG's "up" filter turns all but its first row into
  // zeros. On a field this dark the step between blocks is under one level
  // of 255 almost everywhere, and the card is a third of the bytes.
  for (let y = 0; y < h; y += 1) {
    const gy = Math.floor(y / FIELD_ROWS) * FIELD_ROWS + FIELD_ROWS / 2;
    for (let x = 0; x < w; x += 1) {
      const gx = Math.floor(x / FIELD_ROWS) * FIELD_ROWS + FIELD_ROWS / 2;
      // The hero's deep-blue floor glow under the night field.
      const fy = Math.max(0, 1 - Math.hypot((gx - w / 2) / 1200, (gy - h * 1.2) / 600));
      let c = mix(NIGHT, DEEP, fy * fy * 0.9);
      for (const g of glows) {
        const d = Math.hypot(gx - g.x, gy - g.y) / g.r;
        if (d >= 1) continue;
        const k = (1 - d * d) ** 2 * g.a;
        c = mix(c, g.rgb, k);
      }
      // The hero's faint 48px grid.
      if (x % 48 === 0 || y % 48 === 0) c = mix(c, GRID, 0.045);
      const at = (y * w + x) * 3;
      data[at] = Math.round(c[0]);
      data[at + 1] = Math.round(c[1]);
      data[at + 2] = Math.round(c[2]);
    }
  }
  FIELDS.set(key, data);
  return data;
}

function blend(canvas, x, y, rgb, a) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || a <= 0) return;
  const at = (y * canvas.width + x) * 3;
  for (let i = 0; i < 3; i += 1) canvas.data[at + i] = Math.round(canvas.data[at + i] + (rgb[i] - canvas.data[at + i]) * a);
}

function disc(canvas, cx, cy, r, rgb, a = 1) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(canvas, x, y, rgb, Math.max(0, Math.min(1, r + 0.5 - d)) * a);
    }
  }
}

function segment(canvas, x0, y0, x1, y1, rgb, a) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    blend(canvas, xi, yi, rgb, a * (1 - fx) * (1 - fy));
    blend(canvas, xi + 1, yi, rgb, a * fx * (1 - fy));
    blend(canvas, xi, yi + 1, rgb, a * (1 - fx) * fy);
    blend(canvas, xi + 1, yi + 1, rgb, a * fx * fy);
  }
}

/** The hero's constellation, kept to the right so it never sits under type. */
function constellation(canvas, seed, accent) {
  const rand = seeded(seed);
  const points = [];
  for (let i = 0; i < 18; i += 1) {
    const x = CARD_WIDTH * (0.6 + 0.42 * rand());
    const y = CARD_HEIGHT * (0.04 + 0.92 * rand());
    points.push({ x, y, rgb: [TEAL, INDIGO, ORCHID, luminous(accent)][Math.floor(rand() * 4)] });
  }
  // Fade from nothing at the middle of the card to full at the right edge.
  const fade = (x) => Math.max(0, Math.min(1, (x - CARD_WIDTH * 0.6) / (CARD_WIDTH * 0.25)));
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 170) continue;
      const k = (1 - d / 170) * 0.3 * Math.min(fade(a.x), fade(b.x));
      segment(canvas, a.x, a.y, b.x, b.y, INDIGO, k);
    }
  }
  for (const p of points) {
    const k = fade(p.x);
    disc(canvas, p.x, p.y, 2.2, p.rgb, 0.85 * k);
  }
}

/**
 * The brand mark: an eight-point compass star inside a brass ring on a navy
 * disc, the star of the sea that "Maris Stella" names. Drawn into any RGB(A)
 * canvas at any size, so the favicon, the app icons and the cards are one
 * logo. Geometry is in unit coordinates (0..1 across the mark), and
 * `renderFaviconSvg` in build.mjs draws the same shapes as vector art.
 */
export const MARK_NAVY = [29, 43, 83];
export const MARK_GOLD = [212, 172, 88];
export const MARK_PEARL = [250, 244, 230];

function starPoints(cx, cy, outer, inner, turn) {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const a = turn + (i * Math.PI) / 4;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([Number((cx + r * Math.sin(a)).toFixed(4)), Number((cy - r * Math.cos(a)).toFixed(4))]);
  }
  return pts;
}

export const MARK_GEOMETRY = {
  disc: 0.5,
  ring: { outer: 0.43, inner: 0.375 },
  // The four short diagonal points sit under the four long cardinal ones.
  diagonal: starPoints(0.5, 0.5, 0.3, 0.075, Math.PI / 4),
  cardinal: starPoints(0.5, 0.5, 0.47, 0.1, 0),
  hub: 0.045,
};

const hex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/**
 * The mark as SVG source, drawn from `MARK_GEOMETRY` on a 0..`size` canvas:
 * the tab icon (`favicon.svg`) and the site header's mark both use it, so the
 * vector and the raster logos cannot drift apart.
 */
export function markSvg(size = 32) {
  const g = MARK_GEOMETRY;
  const n = (v) => Number((v * size).toFixed(2));
  const poly = (pts, fill) => `<polygon points="${pts.map(([u, v]) => `${n(u)},${n(v)}`).join(' ')}" fill="${fill}"/>`;
  const ringR = (g.ring.outer + g.ring.inner) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${n(0.5)}" cy="${n(0.5)}" r="${n(g.disc)}" fill="${hex(MARK_NAVY)}"/>` +
    `<circle cx="${n(0.5)}" cy="${n(0.5)}" r="${n(ringR)}" fill="none" stroke="${hex(MARK_GOLD)}" stroke-width="${n(g.ring.outer - g.ring.inner)}"/>` +
    poly(g.diagonal, hex(MARK_GOLD)) +
    poly(g.cardinal, hex(MARK_PEARL)) +
    `<circle cx="${n(0.5)}" cy="${n(0.5)}" r="${n(g.hub)}" fill="${hex(MARK_GOLD)}"/>` +
    `</svg>`
  );
}

function inPolygon(pts, u, v) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The mark's colour at one unit-space sample, or null outside it. */
function markSample(u, v, plate) {
  const g = MARK_GEOMETRY;
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d <= g.hub) return MARK_GOLD;
  if (inPolygon(g.cardinal, u, v)) return MARK_PEARL;
  if (inPolygon(g.diagonal, u, v)) return MARK_GOLD;
  if (d <= g.ring.outer && d >= g.ring.inner) return MARK_GOLD;
  if (plate && d <= g.disc) return MARK_NAVY;
  return null;
}

export function drawMark(canvas, left, top, size, { channels = 3, plate = true } = {}) {
  const ss = 4;
  for (let y = Math.floor(top); y < Math.ceil(top + size); y += 1) {
    for (let x = Math.floor(left); x < Math.ceil(left + size); x += 1) {
      let hits = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const u = (x + (sx + 0.5) / ss - left) / size;
          const v = (y + (sy + 0.5) / ss - top) / size;
          if (u < 0 || v < 0 || u > 1 || v > 1) continue;
          const c = markSample(u, v, plate);
          if (!c) continue;
          hits += 1;
          sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
        }
      }
      if (!hits) continue;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const c = sum.map((v) => v / hits);
      const a = hits / (ss * ss);
      const at = (y * canvas.width + x) * channels;
      if (channels === 4) {
        // Straight alpha over whatever is there (transparent for an icon).
        const da = canvas.data[at + 3] / 255;
        const oa = a + da * (1 - a);
        for (let i = 0; i < 3; i += 1) {
          canvas.data[at + i] = Math.round(oa ? (c[i] * a + canvas.data[at + i] * da * (1 - a)) / oa : 0);
        }
        canvas.data[at + 3] = Math.round(oa * 255);
      } else {
        for (let i = 0; i < 3; i += 1) canvas.data[at + i] = Math.round(canvas.data[at + i] + (c[i] - canvas.data[at + i]) * a);
      }
    }
  }
}

// -- PNG ---------------------------------------------------------------------

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode raw RGB (channels 3) or RGBA (channels 4) pixels as a PNG. */
export function encodePng(width, height, data, channels = 3) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Filter "up" for every row after the first: the field is smooth
    // vertically, so this roughly halves the file against no filter.
    const o = y * (stride + 1);
    raw[o] = y === 0 ? 0 : 2;
    for (let i = 0; i < stride; i += 1) {
      const cur = data[y * stride + i];
      raw[o + 1 + i] = y === 0 ? cur : (cur - data[(y - 1) * stride + i]) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -- Palette -----------------------------------------------------------------
//
// A truecolour card is 150-200 KB: the field is a smooth gradient and the type
// is anti-aliased over it, so almost every pixel is a new colour. There are
// one of these per tool and per research project, two thousand and counting,
// so the deploy would carry a third of a gigabyte of share cards. Median-cut
// to 256 colours and written as an indexed PNG, a card is about 50 KB and
// looks the same at the size any preview shows it.

let HIST = null;
let INDEX = null;

/** Median-cut `data` (RGB) to at most `n` colours: `{ palette, indices }`. */
export function quantize(data, n = 256) {
  if (!HIST) { HIST = new Uint32Array(1 << 24); INDEX = new Uint16Array(1 << 24); }
  const pixels = data.length / 3;
  const keys = [];
  for (let i = 0; i < pixels; i += 1) {
    const k = (data[i * 3] << 16) | (data[i * 3 + 1] << 8) | data[i * 3 + 2];
    if (HIST[k] === 0) keys.push(k);
    HIST[k] += 1;
  }
  const describe = (list) => {
    let r0 = 255; let g0 = 255; let b0 = 255; let r1 = 0; let g1 = 0; let b1 = 0; let count = 0;
    for (const k of list) {
      const r = k >> 16; const g = (k >> 8) & 255; const b = k & 255;
      if (r < r0) r0 = r; if (r > r1) r1 = r;
      if (g < g0) g0 = g; if (g > g1) g1 = g;
      if (b < b0) b0 = b; if (b > b1) b1 = b;
      count += HIST[k];
    }
    const spans = [r1 - r0, g1 - g0, b1 - b0];
    const span = Math.max(...spans);
    return { list, count, axis: spans.indexOf(span), score: list.length > 1 ? span * Math.sqrt(count) : -1 };
  };
  const boxes = [describe(keys)];
  while (boxes.length < n) {
    let best = -1;
    for (let i = 0; i < boxes.length; i += 1) if (boxes[i].score > 0 && (best < 0 || boxes[i].score > boxes[best].score)) best = i;
    if (best < 0) break;
    const { list, count, axis } = boxes[best];
    const shift = [16, 8, 0][axis];
    list.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < list.length; i += 1) {
      acc += HIST[list[i]];
      if (acc >= count / 2) { cut = Math.max(1, Math.min(list.length - 1, i + 1)); break; }
    }
    boxes.splice(best, 1, describe(list.slice(0, cut)), describe(list.slice(cut)));
  }
  const palette = Buffer.alloc(boxes.length * 3);
  boxes.forEach(({ list }, i) => {
    let r = 0; let g = 0; let b = 0; let t = 0;
    for (const k of list) {
      const c = HIST[k];
      r += (k >> 16) * c; g += ((k >> 8) & 255) * c; b += (k & 255) * c; t += c;
      INDEX[k] = i;
    }
    palette[i * 3] = Math.round(r / t);
    palette[i * 3 + 1] = Math.round(g / t);
    palette[i * 3 + 2] = Math.round(b / t);
  });
  const indices = Buffer.alloc(pixels);
  for (let i = 0; i < pixels; i += 1) {
    indices[i] = INDEX[(data[i * 3] << 16) | (data[i * 3 + 1] << 8) | data[i * 3 + 2]];
  }
  for (const k of keys) HIST[k] = 0;
  return { palette, indices };
}

/** Encode RGB pixels as an indexed (palette) PNG. */
export function encodeIndexedPng(width, height, data) {
  const { palette, indices } = quantize(data);
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0;
    indices.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', palette),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -- The card ------------------------------------------------------------------

const DISPLAY = 'InterDisplay-Bold';
const SEMI = 'Inter-SemiBold';
const MEDIUM = 'Inter-Medium';

const HERO_GRADIENT = [TEAL, ORCHID, TEAL];
function heroPaint(x0, x1) {
  return (x) => {
    const t = Math.max(0, Math.min(1, (x - x0) / Math.max(1, x1 - x0)));
    return t < 0.5 ? mix(HERO_GRADIENT[0], HERO_GRADIENT[1], t * 2) : mix(HERO_GRADIENT[1], HERO_GRADIENT[2], (t - 0.5) * 2);
  };
}

/**
 * One 1200x630 share card.
 *
 *   accent    the section's colour: the corner glow, the kicker and the rule
 *   headline  the page's name; omitted, the card is the site's own lockup
 *   kicker    the section the page belongs to, drawn above the headline
 *   subtitle  one or two lines under the headline (a lede, a question)
 *   footer    the claim along the bottom-left
 *   site      the site's name, drawn beside the mark
 *   address   the host and path drawn bottom-right
 *   highlight words of the headline painted in the hero's gradient
 */
export function renderCard({
  accent = '#12594a',
  headline = '',
  kicker = '',
  subtitle = '',
  footer = '',
  site = 'Maris Stella Labs',
  address = '',
  highlight = '',
} = {}) {
  const w = CARD_WIDTH;
  const h = CARD_HEIGHT;
  const acc = hexToRgb(accent);
  const data = Buffer.from(field(acc));
  const canvas = { width: w, height: h, data, channels: 3 };
  constellation(canvas, `${headline}|${kicker}`, acc);

  const display = font(DISPLAY);
  const semi = font(SEMI);
  const medium = font(MEDIUM);
  const accentInk = luminous(acc);
  const textWidth = w - MARGIN * 2 - 40;

  // Lockup, top-left.
  const markSize = 52;
  drawMark(canvas, MARGIN, MARGIN - 8, markSize);
  fillText(canvas, semi, site, { x: MARGIN + markSize + 18, y: MARGIN - 8 + markSize / 2 + 10, size: 28, rgb: INK });

  // Footer band: a rule in the accent, the claim, and the address.
  const footY = h - MARGIN + 6;
  // The address yields to the claim when both do not fit: the claim is a
  // promise about the page, the address is already in the link preview.
  const footerWidth = footer ? measureText(medium, footer, 22) : 0;
  if (footer) fillText(canvas, medium, footer, { x: MARGIN, y: footY, size: 22, rgb: MUTED });
  if (address) {
    const room = w - MARGIN * 2 - footerWidth - (footer ? 40 : 0);
    const host = address.split('/')[0];
    const shown = measureText(medium, address, 22) <= room ? address : measureText(medium, host, 22) <= room ? host : '';
    if (shown) {
      const aw = measureText(medium, shown, 22);
      fillText(canvas, medium, shown, { x: w - MARGIN - aw, y: footY, size: 22, rgb: MUTED });
    }
  }
  for (let y = h - 8; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const t = x / w;
      const c = t < 0.5 ? mix(acc.map((v) => v * 0.6 + 100), TEAL, t * 2) : mix(TEAL, ORCHID, (t - 0.5) * 2);
      blend(canvas, x, y, c, 0.9);
    }
  }

  const bandTop = MARGIN + markSize + 34;
  const bandBottom = h - MARGIN - 54;

  if (!headline) {
    // The site's own card: the lockup is the subject.
    return encodeIndexedPng(w, h, data);
  }

  // Measure the block first so it can be centred in the band.
  const kickerSize = 22;
  const kickerTracking = 0.12;
  const kickerText = kicker ? kicker.toUpperCase() : '';
  const kickerBlock = kickerText ? kickerSize + 26 : 0;
  const subFont = medium;
  let subLines = [];
  const subSize = 28;
  const subLineHeight = 40;
  const room = bandBottom - bandTop - kickerBlock;
  const fit = (maxLines, maxHeight) => {
    for (let size = 84; size >= 44; size -= 2) {
      const lines = wrapText(display, headline, size, textWidth, maxLines);
      if (lines && size + (lines.length - 1) * size * 1.08 <= maxHeight) return { lines, size };
    }
    return null;
  };
  let head = null;
  if (subtitle) {
    head = fit(2, room - 30 - subLineHeight * 2) ?? fit(3, room - 30 - subLineHeight);
    if (head) {
      const used = head.size + (head.lines.length - 1) * head.size * 1.08;
      const left = room - used - 30;
      const maxSub = Math.max(0, Math.min(2, Math.floor(left / subLineHeight)));
      if (maxSub) subLines = fitText(subFont, subtitle, { maxWidth: textWidth, maxLines: maxSub, maxSize: subSize, minSize: subSize }).lines;
    }
  }
  if (!head) head = fit(3, room) ?? fitText(display, headline, { maxWidth: textWidth, maxLines: 3, maxSize: 44, minSize: 44 });
  const lineHeight = head.size * 1.08;
  const headHeight = head.size * 0.73 + (head.lines.length - 1) * lineHeight;
  const subHeight = subLines.length ? 30 + subLines.length * subLineHeight - 12 : 0;
  const blockHeight = kickerBlock + headHeight + subHeight;
  let y = bandTop + Math.max(0, (bandBottom - bandTop - blockHeight) / 2);

  if (kickerText) {
    // A small accent dot leads the kicker, as the research badges do.
    disc(canvas, MARGIN + 6, y + kickerSize * 0.36, 6, accentInk);
    fillText(canvas, semi, kickerText, { x: MARGIN + 22, y: y + kickerSize * 0.73, size: kickerSize, tracking: kickerTracking, rgb: accentInk });
    y += kickerBlock;
  }

  // `highlight` is a phrase of the headline: its words, in order, are painted
  // in the hero's gradient, as the homepage paints "use, inspect, and run".
  const norm = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const phrase = String(highlight).split(/\s+/).map(norm).filter(Boolean);
  const all = head.lines.flatMap((l) => l.split(' '));
  const marked = new Set();
  if (phrase.length) {
    for (let i = 0; i + phrase.length <= all.length; i += 1) {
      if (phrase.every((p, k) => norm(all[i + k]) === p)) {
        for (let k = 0; k < phrase.length; k += 1) marked.add(i + k);
        break;
      }
    }
  }
  let baseline = y + head.size * 0.73;
  const space = measureText(display, ' ', head.size);
  let wordIndex = 0;
  for (const lineText of head.lines) {
    const words = lineText.split(' ');
    if (!words.some((_, k) => marked.has(wordIndex + k))) {
      fillText(canvas, display, lineText, { x: MARGIN - 2, y: baseline, size: head.size, rgb: INK });
      wordIndex += words.length;
    } else {
      let x = MARGIN - 2;
      const lineWidth = measureText(display, lineText, head.size);
      const paint = heroPaint(MARGIN, MARGIN + lineWidth);
      for (const word of words) {
        const opts = { x, y: baseline, size: head.size };
        if (marked.has(wordIndex)) fillText(canvas, display, word, { ...opts, paint });
        else fillText(canvas, display, word, { ...opts, rgb: INK });
        x += measureText(display, word, head.size) + space;
        wordIndex += 1;
      }
    }
    baseline += lineHeight;
  }

  if (subLines.length) {
    let sy = baseline - lineHeight + 30 + subLineHeight - 8;
    for (const lineText of subLines) {
      fillText(canvas, subFont, lineText, { x: MARGIN, y: sy, size: subSize, rgb: MUTED });
      sy += subLineHeight;
    }
  }

  return encodeIndexedPng(w, h, data);
}

/**
 * The site's own card, for the hub and pages that belong to no section: the
 * homepage headline with the hero's gradient words, and the counts.
 */
export function renderSiteCard({ address = '', subtitle = '', footer = '', site } = {}) {
  return renderCard({
    accent: '#d4ac58',
    headline: 'Software and research that anyone can use, inspect, and run themselves.',
    highlight: 'use, inspect, and run',
    kicker: 'Open source · MIT licensed · Built in public',
    subtitle,
    footer,
    site,
    address,
  });
}

/**
 * An app icon in the brand mark: transparent corners by default, full-bleed
 * for `maskable` (the mark inside Android's 80% safe zone on navy), and
 * `opaque` for Apple's touch icon, which must have no alpha.
 */
export function renderMarkIcon({ size = 192, maskable = false, opaque = false } = {}) {
  const data = Buffer.alloc(size * size * 4);
  const canvas = { width: size, height: size, data, channels: 4 };
  if (maskable || opaque) {
    // Full-bleed navy, then the ring and star inset.
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const c = MARK_NAVY;
        const at = (y * size + x) * 4;
        data[at] = Math.round(c[0]); data[at + 1] = Math.round(c[1]); data[at + 2] = Math.round(c[2]); data[at + 3] = 255;
      }
    }
    const inset = maskable ? size * 0.14 : size * 0.06;
    drawMark(canvas, inset, inset, size - inset * 2, { channels: 4, plate: false });
  } else {
    drawMark(canvas, 0, 0, size, { channels: 4 });
  }
  if (opaque) {
    const rgb = Buffer.alloc(size * size * 3);
    for (let i = 0; i < size * size; i += 1) data.copy(rgb, i * 3, i * 4, i * 4 + 3);
    return encodePng(size, size, rgb, 3);
  }
  return encodePng(size, size, data, 4);
}
