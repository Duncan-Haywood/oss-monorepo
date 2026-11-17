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
 * - Dot gain (2026-11-11): ink spreads past its cell on press. Modelled as an
 *   isolated dot covering (1 + gain) cells, so a cell takes gain/4 of each
 *   4-neighbour printed after it (area mixing in linear light): ink onto bare
 *   garment, and a later ink over an earlier one (wet on wet, in print order). With `dotGainPct` set, the
 *   error diffusion is model-based (after Pappas and Neuhoff's printer-model
 *   halftoning): each candidate is judged by how the cell will actually look
 *   next to its already-placed neighbours, and the ink it spills onto those
 *   neighbours is counted as error already spent. `calibrationFilms` gives a
 *   proof strip (solid, 50% checkerboard, bare) and `gainFromPatch` turns the
 *   three colours read off a photo of it into a gain figure.
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
/** Largest dot gain accepted (percent of a cell's area): beyond it a bare cell between four dots would be over-covered. */
export const MAX_GAIN_PCT = 100;
const gainSide = pct => Math.max(0, Math.min(MAX_GAIN_PCT, Number(pct) || 0)) / 400;
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
 * @param o     { crop } as given to `separate` (so the dots line up), minFeatureMm (default base.minFeatureMm), serpentine (default true), margin (default MARGIN),
 *              dotGainPct (default 0: the printer's dot gain to compensate for, percent of a cell's area)
 */
export function indexSeparate(image, base, o = {}) {
  if (!base || !Array.isArray(base.inks) || !base.labels) throw new Error("indexSeparate: run the flat separation first");
  if (o.crop) image = cropImage(image, o.crop);
  const cellMm = Math.max(0.05, Number(o.minFeatureMm) || base.minFeatureMm || 0.3);
  const { w, h } = gridSize(image.width, image.height, base.widthCm, cellMm);
  const src = resampleLinear(image, w, h);
  // which grid cells are background in the flat separation (nearest cell of its smaller grid)
  const bgAt = (x, y) => base.labels[Math.min(base.height - 1, Math.floor(y * base.height / h)) * base.width + Math.min(base.width - 1, Math.floor(x * base.width / w))] === NONE;
  // o.inks: the inks to dot with, one hex per flat ink in the same print order (e.g. from `chooseIndexInks`); default the flat inks
  const inkHex = base.inks.map((ink, p) => (Array.isArray(o.inks) && /^#[0-9a-f]{6}$/i.test(o.inks[p] || "") ? o.inks[p].toLowerCase() : ink.hex));
  const pal = [...inkHex.map(hex => ({ hex, ink: true })), { hex: base.garment, ink: false }];
  for (const p of pal) { p.lin = rgbOf(p.hex).map(lin); p.lab = toLab(...rgbOf(p.hex)); }
  const GARMENT = pal.length - 1;
  const serp = o.serpentine !== false;
  // The corrected colour is clamped near the displayable range: a painting's colours often lie outside what
  // the few inks can mix, and unclamped error then runs away into streaks (measured, README).
  const margin = Math.max(0, Number(o.margin ?? MARGIN));
  const sg = gainSide(o.dotGainPct), gLin = pal[GARMENT].lin;
  const labels = new Uint8Array(w * h).fill(NONE);
  const err = new Float32Array(w * h * 3);
  const seen = new Uint8Array(w * h); // decided (inked, bare or background)
  // print order: the bare garment is "first", then the inks in their order; a later layer spreads over an earlier one
  const rank = [...base.inks.map((ink, p) => Number(ink.order) || p + 1), 0];
  const cand = pal.map(() => [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    const ltr = !serp || y % 2 === 0, dir = ltr ? 1 : -1;
    for (let n = 0; n < w; n++) {
      const x = ltr ? n : w - 1 - n, i = y * w + x;
      if (bgAt(x, y)) { seen[i] = 1; continue; }
      const c = [0, 1, 2].map(k => Math.max(-margin, Math.min(1 + margin, src[i * 3 + k] + err[i * 3 + k])));
      const L = labLin(c.map(v => Math.max(0, Math.min(1, v))));
      let best = 0, bd = Infinity;
      if (!sg) {
        for (let p = 0; p < pal.length; p++) {
          const q = pal[p].lab, d = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
        for (let k = 0; k < 3; k++) cand[best][k] = pal[best].lin[k];
      } else {
        // the already-decided 4-neighbours: the one behind in this row and the one above
        const nb = [];
        if (x - dir >= 0 && x - dir < w && seen[i - dir]) nb.push(labels[i - dir]);
        if (y > 0) nb.push(labels[i - w]);
        for (let p = 0; p < pal.length; p++) {
          const r = cand[p], rp = rank[p], cp = pal[p].lin;
          for (let k = 0; k < 3; k++) r[k] = cp[k];
          for (const l of nb) {
            if (l === NONE) continue; // background: nothing spreads there that the print is judged on
            // a later-printed neighbour spreads onto this cell; this cell spreads onto an earlier one (error spent there)
            if (rank[l] > rp) for (let k = 0; k < 3; k++) r[k] += sg * (pal[l].lin[k] - cp[k]);
            else if (rank[l] < rp) for (let k = 0; k < 3; k++) r[k] += sg * (cp[k] - pal[l].lin[k]);
          }
          const q = labLin(r), d = (L[0] - q[0]) ** 2 + (L[1] - q[1]) ** 2 + (L[2] - q[2]) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
      }
      labels[i] = best; seen[i] = 1;
      const e = [0, 1, 2].map(k => c[k] - cand[best][k]);
      const push = (xx, yy, f) => {
        if (xx < 0 || xx >= w || yy >= h) return;
        const j = yy * w + xx;
        for (let k = 0; k < 3; k++) err[j * 3 + k] += e[k] * f;
      };
      push(x + dir, y, 7 / 16); push(x - dir, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + dir, y + 1, 1 / 16);
    }
  }
  const { inks, garmentPct } = inkStats(labels, w, h, base.inks.map((ink, p) => ({ order: ink.order, hex: inkHex[p], flatHex: ink.hex })), GARMENT);
  const heightCm = +(base.widthCm * h / w).toFixed(1);
  const dotMm = +((base.widthCm * 10) / w).toFixed(2);
  const notes = [
    `Each dot is ${dotMm} mm square (${Math.round(25.4 / dotMm)} dots per inch). The mesh must hold a single dot that size; ask the printer which mesh they use for index prints.`,
    `${garmentPct}% of the artwork is bare garment between the dots; the garment colour is part of the palette.`,
  ];
  if (dotMm > cellMm * 1.05) notes.push(`The source image limits the dot to ${dotMm} mm; a larger scan would allow ${cellMm} mm.`);
  if (sg) notes.push(`Compensated for ${+(sg * 400).toFixed(1)}% dot gain: fewer, more spaced dots where ink would spread. Check it against a proof of the calibration strip.`);
  else notes.push("Not compensated for dot gain. Ink spreads on press and darkens the dots; print the calibration strip on a proof and enter the gain it shows.");
  if (inkHex.some((h, p) => h !== base.inks[p].hex)) notes.push("These inks were chosen for the dots, not for flat areas (inkfit.mjs): match them, not the flat separation's.");
  if (base.underbase) notes.push("The white underbase sits under every inked dot (not the bare-garment ones); index prints on dark garments need tight registration between it and the inks.");
  return { method: "index", width: w, height: h, widthCm: base.widthCm, heightCm, garment: base.garment, dotMm, labels, palette: pal.map(p => p.hex), flatPalette: [...base.inks.map(i => i.hex), base.garment], inksRefit: inkHex.some((h, p) => h !== base.inks[p].hex), garmentIndex: GARMENT, inks, garmentPct, ranks: rank, dotGainPct: +(sg * 400).toFixed(1), underbase: base.underbase, screens: base.screens, notes, src };
}

/** True when cell i holds an ink (not bare, not background) with no 4-neighbour of the same ink: a single dot. */
function isLone(labels, w, h, i, garmentIndex) {
  const l = labels[i];
  if (l === NONE || l === garmentIndex) return false;
  const x = i % w, y = (i - x) / w;
  return !((x > 0 && labels[i - 1] === l) || (x < w - 1 && labels[i + 1] === l) || (y > 0 && labels[i - w] === l) || (y < h - 1 && labels[i + w] === l));
}

/** Per-ink masks, coverage and single-dot share; bare-garment share. `inks` gives { order, hex, flatHex } per ink in palette order. */
function inkStats(labels, w, h, inks, garmentIndex) {
  let inked = 0, bare = 0;
  for (let i = 0; i < w * h; i++) if (labels[i] !== NONE) { inked++; if (labels[i] === garmentIndex) bare++; }
  const out = inks.map((ink, p) => {
    const mask = new Uint8Array(w * h);
    let area = 0, lone = 0;
    for (let i = 0; i < w * h; i++) if (labels[i] === p) { mask[i] = 1; area++; if (isLone(labels, w, h, i, garmentIndex)) lone++; }
    return { ...ink, coveragePct: +(100 * area / Math.max(1, inked)).toFixed(1), loneDotPct: area ? +(100 * lone / area).toFixed(1) : 0, mask };
  });
  return { inks: out, garmentPct: +(100 * bare / Math.max(1, inked)).toFixed(1) };
}

/** Count of single dots (inked cells with no same-ink 4-neighbour) in an index result's labels. */
export function countLoneDots(idx, labels = idx.labels) {
  let n = 0;
  for (let i = 0; i < labels.length; i++) if (isLone(labels, idx.width, idx.height, i, idx.garmentIndex)) n++;
  return n;
}

/**
 * What a press that cannot hold single dots prints: every single dot (an inked cell with no 4-neighbour of the
 * same ink) is lost to bare garment. The worst case of dot loss, for scoring; a real mesh may hold some of them.
 */
export function loseLoneDots(idx, labels = idx.labels) {
  const out = labels.slice();
  for (let i = 0; i < labels.length; i++) if (isLone(labels, idx.width, idx.height, i, idx.garmentIndex)) out[i] = idx.garmentIndex;
  return out;
}

/**
 * Minimum-dot cleanup: no ink keeps a single dot, so every dot on every film touches at least one more of its
 * own (a 2-cell dot or larger), which a mesh that drops single dots can still hold.
 *
 * Each single dot gets the cheapest of these moves, judged by the change in squared error between the painting
 * and the print once both are blurred as seen from `metres` (linear RGB, the same blur as `perceivedDeltaE`):
 * - give it up: the cell takes the garment or the ink of a 4-neighbour (it then joins that neighbour's dot);
 * - grow it: one 4-neighbour takes this ink, making a 2-cell dot, unless that would leave the neighbour's old
 *   ink with a single dot of its own.
 * No move creates a single dot, so one pass leaves none. The dot-gain spread is not modelled in the cleanup.
 *
 * @param idx  result of `indexSeparate`
 * @param o    { metres } viewing distance the moves are judged at (default 1); { passes } search passes after the
 *             cleanup (default 0); { keepSingles: true } skips the cleanup and the rule (the search alone, for comparison)
 * @returns a new index result with cleaned labels and masks, plus `loneCleanup` { before, gaveUp, grew }
 */
export function cleanLoneDots(idx, o = {}) {
  const { width: w, height: h, src, garmentIndex: G } = idx;
  const labels = idx.labels.slice();
  const pl = idx.palette.map(hx => rgbOf(hx).map(lin));
  const sig = Math.max(0.3, sigmaAt(Number(o.metres) || 1) / idx.dotMm);
  const r = Math.ceil(3 * sig), k1 = [];
  let s1 = 0;
  for (let k = -r; k <= r; k++) { const v = Math.exp(-(k * k) / (2 * sig * sig)); k1.push(v); s1 += v; }
  for (let k = 0; k < k1.length; k++) k1[k] /= s1;
  // a cell's own term: sum of the 2-D kernel squared (every move changes one cell)
  const C0 = k1.reduce((a, v) => a + v * v, 0) ** 2;
  // The score (perceivedDeltaE) is the mean CIE76 between the blurred painting and the blurred print. It is
  // minimised Gauss-Newton style: at each cell x, e(x) = Lab(blurred print) - Lab(blurred painting) and J(x) the
  // Jacobian of Lab at the blurred print, so changing cell i by d (linear RGB) moves e(x) by J(x) K(x - i) d.
  // The squares are summed (weighing each cell by 1 / |e| to aim at the mean instead scored the same on four
  // paintings, so it was left out). Linearised afresh before the cleanup and before each search pass. (Linearising at the painting's
  // colour, or weighing linear RGB, made the search raise the true error: README "No single dots".)
  const Pb = blurLinear(printLinear(labels, idx.palette, idx.garment, { garmentIndex: G }), w, h, sig);
  const Sb = blurLinear(src, w, h, sig), LS = new Float32Array(w * h * 3);
  for (let j = 0; j < w * h; j++) if (idx.labels[j] !== NONE) LS.set(labLin([Sb[j * 3], Sb[j * 3 + 1], Sb[j * 3 + 2]]), j * 3);
  const M = new Float32Array(w * h * 6), g = new Float32Array(w * h * 3), eps = 1e-4;
  const linearise = () => {
    for (let j = 0; j < w * h; j++) {
      if (idx.labels[j] === NONE) continue;
      const c = [0, 1, 2].map(k => Math.min(1 - eps, Math.max(0, Pb[j * 3 + k]))), L0 = labLin(c), J = [];
      for (let k = 0; k < 3; k++) { const cc = c.slice(); cc[k] += eps; const L1 = labLin(cc); J.push([0, 1, 2].map(m => (L1[m] - L0[m]) / eps)); }
      const e = [0, 1, 2].map(m => L0[m] - LS[j * 3 + m]);
      // J[k][m] = dLab_m / dRGB_k; M = J J^T stored as xx, yy, zz, xy, xz, yz; g = J e
      const m = (a, b) => J[a][0] * J[b][0] + J[a][1] * J[b][1] + J[a][2] * J[b][2];
      M.set([m(0, 0), m(1, 1), m(2, 2), m(0, 1), m(0, 2), m(1, 2)], j * 6);
      for (let k = 0; k < 3; k++) g[j * 3 + k] = J[k][0] * e[0] + J[k][1] * e[1] + J[k][2] * e[2];
    }
  };
  linearise();
  const mq = (j, a, b) => { const o = j * 6; return a[0] * (M[o] * b[0] + M[o + 3] * b[1] + M[o + 4] * b[2]) + a[1] * (M[o + 3] * b[0] + M[o + 1] * b[1] + M[o + 5] * b[2]) + a[2] * (M[o + 4] * b[0] + M[o + 5] * b[1] + M[o + 2] * b[2]); };
  // cross term 2 * sum_x K(x - i) g(x) . d over scored cells in the window
  const cross = (i, d) => {
    const cx = i % w, cy = (i - cx) / w;
    let a = 0;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy; if (y < 0 || y >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx; if (x < 0 || x >= w) continue;
        const j = y * w + x; if (idx.labels[j] === NONE) continue;
        a += k1[dy + r] * k1[dx + r] * (g[j * 3] * d[0] + g[j * 3 + 1] * d[1] + g[j * 3 + 2] * d[2]);
      }
    }
    return 2 * a;
  };
  // a change d at cell i: the blurred print moves by K d, and g by M K d (the linear model kept current)
  const apply = (i, d) => {
    const cx = i % w, cy = (i - cx) / w;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy; if (y < 0 || y >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx; if (x < 0 || x >= w) continue;
        const j = y * w + x, kk = k1[dy + r] * k1[dx + r], o6 = j * 6;
        const kd = [kk * d[0], kk * d[1], kk * d[2]];
        Pb[j * 3] += kd[0]; Pb[j * 3 + 1] += kd[1]; Pb[j * 3 + 2] += kd[2];
        g[j * 3] += M[o6] * kd[0] + M[o6 + 3] * kd[1] + M[o6 + 4] * kd[2];
        g[j * 3 + 1] += M[o6 + 3] * kd[0] + M[o6 + 1] * kd[1] + M[o6 + 5] * kd[2];
        g[j * 3 + 2] += M[o6 + 4] * kd[0] + M[o6 + 5] * kd[1] + M[o6 + 2] * kd[2];
      }
    }
  };
  const colour = l => (l === NONE || l === G ? pl[G] : pl[l]);
  const diff = (from, to) => { const a = colour(from), b = colour(to); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; };
  const nbrs = i => { const x = i % w, y = (i - x) / w, n = []; if (x > 0) n.push(i - 1); if (x < w - 1) n.push(i + 1); if (y > 0) n.push(i - w); if (y < h - 1) n.push(i + w); return n; };
  // may cell j give up its ink without leaving a neighbour of that ink alone?
  const free = o.keepSingles === true; // search only, single dots allowed (for measuring what the rule costs)
  const canTake = j => {
    const l = labels[j];
    if (l === NONE) return false;
    if (l === G || free) return true;
    return nbrs(j).every(k => labels[k] !== l || nbrs(k).some(m => m !== j && labels[m] === l));
  };
  const before = countLoneDots(idx);
  let gaveUp = 0, grew = 0;
  for (let i = 0; i < w * h && !free; i++) {
    if (!isLone(labels, w, h, i, G)) continue;
    const p = labels[i];
    let best = null;
    const opts = new Set([G]);
    for (const j of nbrs(i)) if (labels[j] !== NONE && labels[j] !== p) opts.add(labels[j]);
    for (const q of opts) {
      const d = diff(p, q), cost = cross(i, d) + C0 * mq(i, d, d);
      if (!best || cost < best.cost) best = { cost, moves: [[i, q]] };
    }
    for (const j of nbrs(i)) {
      if (labels[j] === p || !canTake(j)) continue;
      const d = diff(labels[j], p), cost = cross(j, d) + C0 * mq(j, d, d);
      if (cost < best.cost) best = { cost, moves: [[j, p]], grow: true };
    }
    for (const [j, q] of best.moves) { apply(j, diff(labels[j], q)); labels[j] = q; }
    if (best.grow) grew++; else gaveUp++;
  }
  // Then search: any cell may change to any palette entry when the blurred error falls and no single dot is
  // created (a direct-binary-search pass under the minimum-dot rule). `passes` 0 skips it.
  const passes = Math.max(0, Math.min(20, Math.round(o.passes ?? 0)));
  let changed = 0, done = 0;
  for (; done < passes; done++) {
    linearise();
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      const l = labels[i];
      if (l === NONE || !canTake(i)) continue;
      let bq = -1, bc = -1e-12;
      for (let q = 0; q < pl.length; q++) {
        if (q === l) continue;
        if (q !== G && !free && !nbrs(i).some(j => labels[j] === q)) continue; // it would be a single dot
        const d = diff(l, q), cost = cross(i, d) + C0 * mq(i, d, d);
        if (cost < bc) { bc = cost; bq = q; }
      }
      if (bq >= 0) { apply(i, diff(l, bq)); labels[i] = bq; n++; }
    }
    changed += n;
    if (!n) { done++; break; }
  }
  const inkList = idx.inks.map(i => ({ order: i.order, hex: i.hex, flatHex: i.flatHex }));
  const { inks, garmentPct } = inkStats(labels, w, h, inkList, G);
  const notes = free ? [...idx.notes] : [...idx.notes.map(n => n.replace("The mesh must hold a single dot that size;", "No dot is smaller than two of these side by side (below), so the mesh must hold a pair;")), `No single dots: ${before} single dots were cleaned up (${gaveUp} given up to a neighbour or the garment, ${grew} grown into 2-dot pairs)${done ? `, then ${changed} cells moved in ${done} search passes` : ""}, so every dot on the films touches another of its own ink.`];
  return { ...idx, labels, inks, garmentPct, notes, loneCleanup: { before, gaveUp, grew, passes: done, changed, metres: Number(o.metres) || 1 } };
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

/**
 * Linear-RGB triples of a labelled print: palette colour per cell, garment where nothing prints.
 * With `w` and `dotGainPct`, ink spreads: a cell takes gain/4 of each 4-neighbour printed after it (the garment
 * and unprinted cells come first, then `ranks`, the print order per palette entry; by default every ink ranks 1,
 * so inks spread onto bare cells only), in place of its own colour.
 */
export function printLinear(labels, palette, garment, { w = 0, dotGainPct = 0, garmentIndex = -1, ranks = null } = {}) {
  const pl = palette.map(hx => rgbOf(hx).map(lin)), g = rgbOf(garment).map(lin);
  const out = new Float32Array(labels.length * 3);
  const bare = l => l === NONE || l === garmentIndex || !pl[l];
  const rk = l => bare(l) ? 0 : ranks ? ranks[l] : 1;
  for (let i = 0; i < labels.length; i++) { const c = bare(labels[i]) ? g : pl[labels[i]]; out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2]; }
  const sg = gainSide(dotGainPct);
  if (!sg || !w) return out;
  const h = labels.length / w;
  const own = out.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, ri = rk(labels[i]);
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || rk(labels[j]) <= ri) continue;
      for (let k = 0; k < 3; k++) out[i * 3 + k] += sg * (own[j * 3 + k] - own[i * 3 + k]);
    }
  }
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

/** Mean CIE76 between painting and print after both are blurred by sigmaMm, over the cells that print; the print spread by `dotGainPct`. */
export function perceivedDeltaE(idx, labels, sigmaMm, dotGainPct = 0, palette = idx.palette) {
  const { width: w, height: h, src, garment } = idx;
  const sig = sigmaMm / idx.dotMm;
  const a = blurLinear(src, w, h, sig), b = blurLinear(printLinear(labels, palette, garment, { w, dotGainPct, garmentIndex: idx.garmentIndex, ranks: idx.ranks }), w, h, sig);
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
export function compareFlatIndex(base, idx, distances = [0.5, 1, 3], { dotGainPct = idx.dotGainPct || 0 } = {}) {
  const flat = flatOnGrid(base, idx.width, idx.height);
  return distances.map(m => ({ metres: m, sigmaMm: sigmaAt(m), flat: perceivedDeltaE(idx, flat, sigmaAt(m), dotGainPct, idx.flatPalette || idx.palette), index: perceivedDeltaE(idx, idx.labels, sigmaAt(m), dotGainPct) }));
}

/** Relative luminance (linear) of a hex colour. */
const lum = hex => { const [r, g, b] = rgbOf(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/**
 * Dot gain from a printed calibration strip. Read three colours off one photo or scan of the proof (same light,
 * so their ratios hold): the bare garment, the solid ink and the 50% checkerboard. Under this file's spread model
 * every bare cell of a checkerboard touches four dots, so its inked share is 0.5 + gain/200; solved for gain.
 * Returns { dotGainPct, coveragePct, warnings }.
 */
export function gainFromPatch({ garment, solid, patch }) {
  for (const [k, v] of Object.entries({ garment, solid, patch })) if (!/^#[0-9a-f]{6}$/i.test(String(v))) throw new Error(`gainFromPatch: ${k} must be a #rrggbb colour`);
  const yg = lum(garment), yi = lum(solid), yp = lum(patch), warnings = [];
  if (Math.abs(yg - yi) < 0.05) throw new Error("gainFromPatch: the ink and the garment are too close in lightness to read coverage from; use a lighter garment area or a darker ink");
  const cov = (yg - yp) / (yg - yi);
  let gain = 200 * (cov - 0.5);
  if (cov < 0 || cov > 1) warnings.push("The patch is outside the range between garment and solid ink: read all three from the same photo, in even light, away from glare.");
  if (gain < 0) { warnings.push("The checkerboard came out lighter than half: the dots are losing area (dot loss), so the mesh may not hold single dots this size. Use a larger dot (finest dot setting) rather than compensating."); gain = 0; }
  if (gain > MAX_GAIN_PCT) { warnings.push(`Gain above ${MAX_GAIN_PCT}%: the checkerboard has filled in. Use a larger dot or a finer mesh.`); gain = MAX_GAIN_PCT; }
  return { dotGainPct: +gain.toFixed(1), coveragePct: +(100 * cov).toFixed(1), warnings };
}

/**
 * Calibration films: per ink, a strip of three 10 mm squares (solid, 50% checkerboard at the index dot size, bare)
 * for the printer to run on the same garment as a proof. `gainFromPatch` reads the result.
 */
export function calibrationFilms(idx, { squareMm = 10 } = {}) {
  const n = Math.max(2, Math.round(squareMm / idx.dotMm)), w = 3 * n, h = n;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < 2 * n; x++) if (x < n || (x + y) % 2 === 0) mask[y * w + x] = 1;
  const geo = { width: w, height: h, widthCm: +(w * idx.dotMm / 10).toFixed(2), heightCm: +(h * idx.dotMm / 10).toFixed(2) };
  const out = [];
  if (idx.underbase) out.push({ name: "00-calibration-underbase-white", ink: "#ffffff", svg: maskSvg(geo, mask, { title: "calibration strip: white underbase" }) });
  for (const ink of idx.inks) out.push({ name: `${String(ink.order).padStart(2, "0")}-calibration-${ink.hex.slice(1)}`, ink: ink.hex, svg: maskSvg(geo, mask, { title: `calibration strip ink ${ink.order} ${ink.hex}: solid, 50% checkerboard of ${idx.dotMm} mm dots, bare` }) });
  return out;
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
    idx.dotGainPct ? `Films compensated for ${idx.dotGainPct}% dot gain (a dot printing ${idx.dotGainPct}% larger in area than its film). Please keep press conditions as for the calibration proof.` : "Films not compensated for dot gain. Please print the calibration strip on a proof first if you can.",
    ...idx.inks.map(i => `Screen ${i.order}: ${i.hex}${i.flatHex && i.flatHex !== i.hex ? ` (chosen for the dots; the flat separation had ${i.flatHex})` : ""}, ${i.coveragePct}% of the artwork, ${i.loneDotPct}% single dots.`),
    ...comparison.map(c => `Seen from ${c.metres} m: flat inks ${c.flat} delta E from the painting, index ${c.index} (lower is closer; a rough blur model, judge a proof).`),
    ...idx.notes,
  ].join("\n");
}
