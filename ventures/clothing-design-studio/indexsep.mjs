/**
 * Index separation for screen printing a painting: the same few inks as the
 * flat separation (`separation.mjs`), but laid down as a scatter of square dots
 * (error diffusion) instead of flat areas, so the eye mixes neighbouring inks
 * and the bare garment into the in-between tones a painting is made of.
 * Printers call this "index" separation; it is how photographs and paintings
 * are usually printed with spot inks.
 *
 * Why it exists: on nine real public-domain paintings (Van Gogh, Munch, Turner,
 * Hokusai, Matisse, Picabia, Sassoferrato, Barocci), flat spot inks left the
 * print a mean CIE76 delta E of 6 to 14 from the painting even at 8 inks
 * (README, "Index separation"), where about 2 is barely visible.
 *
 * Method, said plainly:
 * - Palette: the flat separation's inks plus the garment colour, which is free
 *   (it is the unprinted cloth). Background pixels of the flat separation stay
 *   unprinted here too, so crop, surround removal and knock-outs carry over.
 * - Grid: one dot = `minFeatureMm` (the finest dot the mesh holds), capped at
 *   MAX_GRID pixels on the long side and never finer than the source pixels.
 * - Serpentine Floyd-Steinberg error diffusion in linear RGB (light adds
 *   linearly, which is how dots mix optically), nearest ink chosen in CIE Lab,
 *   with the corrected colour clamped to MARGIN past the 0..1 range.
 * - Perceived distance: both the painting and the print are blurred with a
 *   Gaussian of sigma = viewing distance x tan(1 arcminute) in linear RGB, then
 *   compared in CIE76. A crude stand-in for the eye's blur, not S-CIELAB; it
 *   is used only to compare flat and index on the same footing.
 *
 * Pure functions over typed arrays; no DOM, nothing uploaded.
 */
import { toLab, cropImage, maskSvg } from "./separation.mjs";

export const MAX_GRID = 1200;
/**
 * How far past the 0..1 range the error-corrected colour may run before it is clamped. 0 keeps paintings'
 * out-of-gamut colours from running away but loses tone at the ends of an in-gamut ramp (grey ramp 4.1 delta E
 * blurred vs 0.9); 0.25 keeps the ramp and costs paintings about 0.3 (README, "Index separation").
 */
export const MARGIN = 0.25;
const NONE = 255;
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const unlin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const labLin = ([r, g, b]) => toLab(unlin(Math.max(0, Math.min(1, r))), unlin(Math.max(0, Math.min(1, g))), unlin(Math.max(0, Math.min(1, b))));

/** Box/bilinear resample of RGBA to w x h, returned as linear-RGB Float32 triples. */
function resampleLinear(img, w, h) {
  const out = new Float32Array(w * h * 3);
  const sx = img.width / w, sy = img.height / h;
  const lut = new Float32Array(256); for (let i = 0; i < 256; i++) lut[i] = lin(i);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // average the source pixels this cell covers (at least one)
    const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    let r = 0, g = 0, b = 0, c = 0;
    for (let yy = y0; yy < Math.min(y1, img.height); yy++) for (let xx = x0; xx < Math.min(x1, img.width); xx++) {
      const i = (yy * img.width + xx) * 4;
      r += lut[img.data[i]]; g += lut[img.data[i + 1]]; b += lut[img.data[i + 2]]; c++;
    }
    const o = (y * w + x) * 3;
    out[o] = r / c; out[o + 1] = g / c; out[o + 2] = b / c;
  }
  return out;
}

/** Grid size for a printed width: one cell per `cellMm`, no finer than the source, at most MAX_GRID on the long side. */
export function gridSize(srcW, srcH, widthCm, cellMm) {
  let w = Math.round((widthCm * 10) / cellMm);
  w = Math.min(w, srcW);
  let h = Math.round(w * srcH / srcW);
  if (Math.max(w, h) > MAX_GRID) { const k = MAX_GRID / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  return { w: Math.max(2, w), h: Math.max(2, h) };
}

/**
 * @param image RGBA pixels (the same the flat separation was given)
 * @param base  the result of `separate(image, o)`: its inks, garment, width, crop and background are reused
 * @param o     { crop } as given to `separate` (so the dots line up), minFeatureMm (default base.minFeatureMm), serpentine (default true), margin (default MARGIN)
 */
export function indexSeparate(image, base, o = {}) {
  if (!base || !Array.isArray(base.inks) || !base.labels) throw new Error("indexSeparate: run the flat separation first");
  if (o.crop) image = cropImage(image, o.crop);
  const cellMm = Math.max(0.05, Number(o.minFeatureMm) || base.minFeatureMm || 0.3);
  const { w, h } = gridSize(image.width, image.height, base.widthCm, cellMm);
  const src = resampleLinear(image, w, h);
  // which grid cells are background in the flat separation (nearest cell of its smaller grid)
  const bgAt = (x, y) => base.labels[Math.min(base.height - 1, Math.floor(y * base.height / h)) * base.width + Math.min(base.width - 1, Math.floor(x * base.width / w))] === NONE;
  const pal = [...base.inks.map(i => ({ hex: i.hex, ink: true })), { hex: base.garment, ink: false }];
  for (const p of pal) { p.lin = rgbOf(p.hex).map(lin); p.lab = toLab(...rgbOf(p.hex)); }
  const GARMENT = pal.length - 1;
  const serp = o.serpentine !== false;
  // The corrected colour is clamped near the displayable range: a painting's colours often lie outside what
  // the few inks can mix, and unclamped error then runs away into streaks (measured, README).
  const margin = Math.max(0, Number(o.margin ?? MARGIN));
  const labels = new Uint8Array(w * h).fill(NONE);
  const err = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const ltr = !serp || y % 2 === 0, dir = ltr ? 1 : -1;
    for (let n = 0; n < w; n++) {
      const x = ltr ? n : w - 1 - n, i = y * w + x;
      if (bgAt(x, y)) continue;
      const c = [0, 1, 2].map(k => Math.max(-margin, Math.min(1 + margin, src[i * 3 + k] + err[i * 3 + k])));
      const L = labLin(c.map(v => Math.max(0, Math.min(1, v))));
      let best = 0, bd = Infinity;
      for (let p = 0; p < pal.length; p++) {
        const q = pal[p].lab, d = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      labels[i] = best;
      const e = [0, 1, 2].map(k => c[k] - pal[best].lin[k]);
      const push = (xx, yy, f) => {
        if (xx < 0 || xx >= w || yy >= h) return;
        const j = yy * w + xx;
        for (let k = 0; k < 3; k++) err[j * 3 + k] += e[k] * f;
      };
      push(x + dir, y, 7 / 16); push(x - dir, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + dir, y + 1, 1 / 16);
    }
  }
  let inked = 0;
  for (let i = 0; i < w * h; i++) if (labels[i] !== NONE) inked++;
  const inks = base.inks.map((ink, p) => {
    const mask = new Uint8Array(w * h);
    let area = 0, lone = 0;
    for (let i = 0; i < w * h; i++) if (labels[i] === p) { mask[i] = 1; area++; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      if (!(x > 0 && mask[i - 1]) && !(x < w - 1 && mask[i + 1]) && !(y > 0 && mask[i - w]) && !(y < h - 1 && mask[i + w])) lone++;
    }
    return { order: ink.order, hex: ink.hex, coveragePct: +(100 * area / Math.max(1, inked)).toFixed(1), loneDotPct: area ? +(100 * lone / area).toFixed(1) : 0, mask };
  });
  const garmentPct = +(100 * labels.reduce((s, l) => s + (l === GARMENT ? 1 : 0), 0) / Math.max(1, inked)).toFixed(1);
  const heightCm = +(base.widthCm * h / w).toFixed(1);
  const dotMm = +((base.widthCm * 10) / w).toFixed(2);
  const notes = [
    `Each dot is ${dotMm} mm square (${Math.round(25.4 / dotMm)} dots per inch). The mesh must hold a single dot that size; ask the printer which mesh they use for index prints.`,
    `${garmentPct}% of the artwork is bare garment between the dots; the garment colour is part of the palette.`,
  ];
  if (dotMm > cellMm * 1.05) notes.push(`The source image limits the dot to ${dotMm} mm; a larger scan would allow ${cellMm} mm.`);
  if (base.underbase) notes.push("The white underbase sits under every inked dot (not the bare-garment ones); index prints on dark garments need tight registration between it and the inks.");
  return { method: "index", width: w, height: h, widthCm: base.widthCm, heightCm, garment: base.garment, dotMm, labels, palette: pal.map(p => p.hex), garmentIndex: GARMENT, inks, garmentPct, underbase: base.underbase, screens: base.screens, notes, src };
}

/** Separable Gaussian blur of linear-RGB triples (sigma in cells); edges clamp. */
export function blurLinear(px, w, h, sigma) {
  if (!(sigma > 0.05)) return px.slice();
  const r = Math.ceil(3 * sigma), ker = [];
  let s = 0;
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); ker.push(v); s += v; }
  for (let k = 0; k < ker.length; k++) ker[k] /= s;
  const tmp = new Float32Array(px.length), out = new Float32Array(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let a = 0;
    for (let k = -r; k <= r; k++) a += ker[k + r] * px[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 3 + c];
    tmp[(y * w + x) * 3 + c] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let a = 0;
    for (let k = -r; k <= r; k++) a += ker[k + r] * tmp[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 3 + c];
    out[(y * w + x) * 3 + c] = a;
  }
  return out;
}

/** Linear-RGB triples of a labelled print: palette colour per cell, garment where nothing prints. */
export function printLinear(labels, palette, garment) {
  const pl = palette.map(hx => rgbOf(hx).map(lin)), g = rgbOf(garment).map(lin);
  const out = new Float32Array(labels.length * 3);
  for (let i = 0; i < labels.length; i++) { const c = labels[i] === NONE ? g : pl[labels[i]]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  return out;
}

/** Flat separation's labels upsampled (nearest) to the index grid, palette as in the index result. */
export function flatOnGrid(base, w, h) {
  const out = new Uint8Array(w * h);
  const map = new Map(base.inks.map((ink, p) => [ink.label, p]));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = base.labels[Math.min(base.height - 1, Math.floor(y * base.height / h)) * base.width + Math.min(base.width - 1, Math.floor(x * base.width / w))];
    out[y * w + x] = l === NONE ? NONE : (map.get(l) ?? NONE);
  }
  return out;
}

/** Mean CIE76 between painting and print after both are blurred by sigmaMm, over the cells that print. */
export function perceivedDeltaE(idx, labels, sigmaMm) {
  const { width: w, height: h, src, palette, garment } = idx;
  const sig = sigmaMm / idx.dotMm;
  const a = blurLinear(src, w, h, sig), b = blurLinear(printLinear(labels, palette, garment), w, h, sig);
  let s = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (idx.labels[i] === NONE) continue;
    const p = labLin([a[i * 3], a[i * 3 + 1], a[i * 3 + 2]]), q = labLin([b[i * 3], b[i * 3 + 1], b[i * 3 + 2]]);
    s += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); n++;
  }
  return +(s / Math.max(1, n)).toFixed(2);
}

/** Viewing distance in metres to blur sigma in mm (1 arcminute). */
export const sigmaAt = metres => +(metres * 1000 * Math.tan(Math.PI / 180 / 60)).toFixed(3);

/** Flat against index at the given viewing distances, same palette, same grid. */
export function compareFlatIndex(base, idx, distances = [0.5, 1, 3]) {
  const flat = flatOnGrid(base, idx.width, idx.height);
  return distances.map(m => ({ metres: m, sigmaMm: sigmaAt(m), flat: perceivedDeltaE(idx, flat, sigmaAt(m)), index: perceivedDeltaE(idx, idx.labels, sigmaAt(m)) }));
}

/** The index print as RGBA for a canvas (garment colour where nothing prints). */
export function indexPreviewRgba(idx) {
  const out = new Uint8ClampedArray(idx.width * idx.height * 4);
  const pal = idx.palette.map(rgbOf), g = rgbOf(idx.garment);
  for (let i = 0; i < idx.labels.length; i++) {
    const c = idx.labels[i] === NONE ? g : pal[idx.labels[i]];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Films for the printer: underbase (if any) under every inked dot, then one per ink in print order. */
export function indexFilms(idx) {
  const out = [];
  if (idx.underbase) {
    const any = new Uint8Array(idx.width * idx.height);
    for (const ink of idx.inks) for (let i = 0; i < any.length; i++) if (ink.mask[i]) any[i] = 1;
    out.push({ name: "00-underbase-white", ink: "#ffffff", svg: maskSvg(idx, any, { title: "white underbase (index)" }) });
  }
  for (const ink of idx.inks) out.push({ name: `${String(ink.order).padStart(2, "0")}-index-${ink.hex.slice(1)}`, ink: ink.hex, svg: maskSvg(idx, ink.mask, { title: `index ink ${ink.order} ${ink.hex}` }) });
  return out;
}

/** Plain-text brief for the printer. */
export function indexBrief(idx, comparison = []) {
  return [
    `Index separation: ${idx.inks.length} inks${idx.underbase ? " + white underbase" : ""} = ${idx.screens} screens, ${idx.widthCm} x ${idx.heightCm} cm on ${idx.garment}, square dots of ${idx.dotMm} mm (${idx.width} x ${idx.height}).`,
    ...idx.inks.map(i => `Screen ${i.order}: ${i.hex}, ${i.coveragePct}% of the artwork, ${i.loneDotPct}% single dots.`),
    ...comparison.map(c => `Seen from ${c.metres} m: flat inks ${c.flat} delta E from the painting, index ${c.index} (lower is closer; a rough blur model, judge a proof).`),
    ...idx.notes,
  ].join("\n");
}
