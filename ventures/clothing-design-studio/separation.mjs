/**
 * Colour separation for screen print: take a painting (RGBA pixels), reduce it
 * to n flat ink colours, and say what a screen printer needs to know: the
 * palette, how much of the print each ink covers, which features are too fine
 * for the mesh, how many screens it takes, and one film per ink. It also
 * builds a raised-outline layer from the colour boundaries, for high-density
 * or puff ink, because those inks hold bold lines better than painted detail.
 *
 * Pure functions over typed arrays, no DOM, so the tests run in Node and the
 * page feeds it canvas pixels. Nothing here is uploaded anywhere.
 */

const MAX_SIDE = 320; // work resolution; films are vector at this grid
const NONE = 255; // label for "no ink" (transparent or background)

/** sRGB 0-255 to CIE Lab (D65), so "nearest colour" matches what the eye sees. */
export function toLab(r, g, b) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const hex = ([r, g, b]) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Box-average down to at most MAX_SIDE on the long side. */
function shrink({ data, width, height }) {
  const k = Math.max(1, Math.ceil(Math.max(width, height) / MAX_SIDE));
  if (k === 1) return { data, width, height };
  const w = Math.floor(width / k), h = Math.floor(height / k);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const i = ((y * k + dy) * width + x * k + dx) * 4;
      const al = data[i + 3];
      r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al;
    }
    const o = (y * w + x) * 4;
    out[o] = a ? r / a : 0; out[o + 1] = a ? g / a : 0; out[o + 2] = a ? b / a : 0; out[o + 3] = a / (k * k);
  }
  return { data: out, width: w, height: h };
}

/** Flood from the border over pixels close to the border's median colour: a plain paper or canvas surround. */
function floodBackground(px, w, h, tol) {
  const edge = [];
  for (let x = 0; x < w; x++) { edge.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { edge.push(y * w, y * w + w - 1); }
  const med = c => { const v = edge.map(i => px[i * 4 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ref = [med(0), med(1), med(2)];
  const refLab = toLab(...ref);
  const close = i => {
    const l = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    return Math.hypot(l[0] - refLab[0], l[1] - refLab[1], l[2] - refLab[2]) <= tol;
  };
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (const i of edge) if (!bg[i] && close(i)) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!bg[j] && close(j)) { bg[j] = 1; stack.push(j); }
    }
  }
  return bg;
}

function kmeans(points, k, seed, iters = 14) {
  const n = points.length;
  const rand = rng(seed);
  const cent = [points[Math.floor(rand() * n)].slice()];
  const d2 = new Float64Array(n).fill(Infinity);
  while (cent.length < k) { // k-means++ seeding, seeded so a run repeats
    let total = 0;
    const c = cent[cent.length - 1];
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < d2[i]) d2[i] = d;
      total += d2[i];
    }
    if (total === 0) break;
    let r = rand() * total, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    cent.push(points[pick].slice());
  }
  const assign = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    const sum = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let best = 0, bd = Infinity;
      for (let c = 0; c < cent.length; c++) {
        const d = (p[0] - cent[c][0]) ** 2 + (p[1] - cent[c][1]) ** 2 + (p[2] - cent[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; moved++; }
      const s = sum[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    for (let c = 0; c < cent.length; c++) if (sum[c][3]) cent[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
    if (!moved && it) break;
  }
  return cent;
}

/** Majority filter: each pixel takes the most common label among its 8 neighbours when that beats its own by `margin`. Removes speckle a screen cannot hold. */
function smoothLabels(lab, w, h, passes) {
  let cur = lab;
  for (let p = 0; p < passes; p++) {
    const next = cur.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (cur[i] === NONE) continue;
      const counts = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const l = cur[i + dy * w + dx];
        if (l !== NONE) counts.set(l, (counts.get(l) || 0) + 1);
      }
      let best = cur[i], bc = counts.get(cur[i]) || 0;
      for (const [l, c] of counts) if (c > bc + 1) { best = l; bc = c; }
      next[i] = best;
    }
    cur = next;
  }
  return cur;
}

function erode(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let ok = 1;
    for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) { ok = 0; break; }
    }
    out[y * w + x] = ok;
  }
  return out;
}
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
    }
  }
  return out;
}
const count = m => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i] ? 1 : 0; return c; };

/**
 * @param {{data:Uint8ClampedArray,width:number,height:number}} image RGBA
 * @param {object} o
 *   colours       inks to reduce to, 2 to 8 (default 4)
 *   widthCm       printed width, for converting pixels to millimetres (default 25)
 *   garment       garment colour hex; decides whether a white underbase is advised (default #ffffff)
 *   background    "auto" removes a plain surround connected to the border; "none" keeps all (default "auto")
 *   smooth        speckle-removal passes (default 1)
 *   minFeatureMm  finest line or dot the mesh holds (default 0.3 for fine screens)
 *   raisedLineMm  width of the raised outline (default 0.8)
 */
export function separate(image, o = {}) {
  const k = Math.max(2, Math.min(8, Math.round(Number(o.colours) || 4)));
  const widthCm = Math.max(1, Math.min(60, Number(o.widthCm) || 25));
  const garment = /^#[0-9a-f]{6}$/i.test(o.garment || "") ? o.garment : "#ffffff";
  const minFeatureMm = Math.max(0.05, Number(o.minFeatureMm) || 0.3);
  const raisedLineMm = Math.max(0.3, Number(o.raisedLineMm) || 0.8);
  if (!image || !image.data || !(image.width > 0) || !(image.height > 0) || image.data.length < image.width * image.height * 4) throw new Error("separate: need RGBA pixels with width and height");
  const { data, width: w, height: h } = shrink(image);
  const n = w * h;

  const bg = (o.background ?? "auto") === "auto" ? floodBackground(data, w, h, 14) : new Uint8Array(n);
  const inked = new Uint8Array(n);
  const pts = [], idx = [];
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128 || bg[i]) continue;
    inked[i] = 1;
    idx.push(i);
    pts.push(toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  }
  if (pts.length < k) throw new Error("separate: the image has too little artwork to separate (all background or transparent)");

  // Cluster on a sample so big paintings stay fast, then label every pixel.
  const sample = pts.length > 20000 ? pts.filter((_, i) => i % Math.ceil(pts.length / 20000) === 0) : pts;
  const cent = kmeans(sample, k, o.seed ?? 7);
  let labels = new Uint8Array(n).fill(NONE);
  for (let j = 0; j < idx.length; j++) {
    const p = pts[j];
    let best = 0, bd = Infinity;
    for (let c = 0; c < cent.length; c++) {
      const d = (p[0] - cent[c][0]) ** 2 + (p[1] - cent[c][1]) ** 2 + (p[2] - cent[c][2]) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    labels[idx[j]] = best;
  }
  labels = smoothLabels(labels, w, h, o.smooth ?? 1);

  // Ink colour = mean RGB of its pixels (what the printer mixes), not the Lab centroid.
  const acc = cent.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++) { const l = labels[i]; if (l === NONE) continue; const a = acc[l]; a[0] += data[i * 4]; a[1] += data[i * 4 + 1]; a[2] += data[i * 4 + 2]; a[3]++; }
  const inkedCount = count(inked);
  // Fidelity: mean CIE76 distance between each inked pixel and the flat ink that replaces it (lower is closer).
  let dESum = 0;
  for (let i = 0; i < n; i++) {
    const l = labels[i]; if (l === NONE || !acc[l][3]) continue;
    const a = acc[l], p = toLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), q = toLab(a[0] / a[3], a[1] / a[3], a[2] / a[3]);
    dESum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  const meanDeltaE = +(dESum / Math.max(1, inkedCount)).toFixed(2);
  const pxMm = (widthCm * 10) / w;
  const rThin = Math.max(1, Math.round(minFeatureMm / pxMm / 2));
  const gl = lum([parseInt(garment.slice(1, 3), 16), parseInt(garment.slice(3, 5), 16), parseInt(garment.slice(5, 7), 16)]);

  const inks = [];
  for (let c = 0; c < cent.length; c++) {
    if (!acc[c][3]) continue; // an ink that lost all its pixels to smoothing is dropped
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (labels[i] === c) mask[i] = 1;
    const area = acc[c][3];
    const opened = dilate(erode(mask, w, h, rThin), w, h, rThin);
    let thin = 0;
    for (let i = 0; i < n; i++) if (mask[i] && !opened[i]) thin++;
    const rgb = [acc[c][0] / area, acc[c][1] / area, acc[c][2] / area];
    inks.push({ index: inks.length, label: c, hex: hex(rgb), luminance: +lum(rgb).toFixed(3), coveragePct: +(100 * area / inkedCount).toFixed(1), thinSharePct: +(100 * thin / area).toFixed(1), mask });
  }
  // Print order: light inks first, dark last (darks overprint cleanly and hold the line detail).
  inks.sort((a, b) => b.luminance - a.luminance);
  inks.forEach((ink, i) => { ink.order = i + 1; });

  // Raised outline: pixels where the ink label changes, or the silhouette edge, widened to the line width.
  const edge = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (labels[i] === NONE) continue;
    const r = x + 1 < w ? labels[i + 1] : NONE, d = y + 1 < h ? labels[i + w] : NONE;
    const l = x > 0 ? labels[i - 1] : NONE, u = y > 0 ? labels[i - w] : NONE;
    if (r !== labels[i] || d !== labels[i] || l !== labels[i] || u !== labels[i]) edge[i] = 1;
  }
  const rOut = Math.max(0, Math.round(raisedLineMm / pxMm / 2) - 1);
  const raisedMask = rOut ? dilate(edge, w, h, rOut) : edge;
  const raisedCoveragePct = +(100 * count(raisedMask) / inkedCount).toFixed(1);

  const underbase = gl < 0.6 || inks.some(i => i.luminance > gl + 0.25 && gl < 0.8);
  const screens = inks.length + (underbase ? 1 : 0);
  const notes = [];
  if (underbase) notes.push("Garment is dark enough that the lighter inks need a white underbase screen printed first; it is counted in the screens.");
  for (const ink of inks) if (ink.thinSharePct >= 25) notes.push(`Ink ${ink.order} (${ink.hex}): ${ink.thinSharePct}% of it is thinner than ${minFeatureMm} mm at ${widthCm} cm wide; it may fill in or drop out. Print wider, use fewer colours, or move this detail to the raised outline.`);
  for (const ink of inks) if (ink.coveragePct < 2) notes.push(`Ink ${ink.order} (${ink.hex}) covers only ${ink.coveragePct}% of the artwork; a whole screen for that is usually not worth it. Try ${Math.max(2, k - 1)} colours.`);
  if (raisedCoveragePct > 35) notes.push(`The outline covers ${raisedCoveragePct}% of the artwork: this image is too busy for a clean raised line. Use fewer colours or a larger print.`);
  notes.push("Rendered from the pixels you gave it. Photographs of paintings are shaded, so expect the printer to adjust curves and registration on a proof; this is a starting separation, not a final film.");

  return { width: w, height: h, widthCm, heightCm: +(widthCm * h / w).toFixed(1), garment, inkedPct: +(100 * inkedCount / n).toFixed(1), meanDeltaE, labels, inks, raised: { mask: raisedMask, lineMm: raisedLineMm, coveragePct: raisedCoveragePct }, underbase, screens, minFeatureMm, notes };
}

/** Run-length SVG film for a mask, sized in cm so it prints 1:1 (black = ink). */
export function maskSvg(sep, mask, { title = "film" } = {}) {
  const { width: w, height: h, widthCm, heightCm } = sep;
  const rects = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!mask[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && mask[y * w + e]) e++;
      rects.push(`M${x} ${y}h${e - x}v1h${-(e - x)}z`);
      x = e;
    }
  }
  const t = String(title).replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthCm}cm" height="${heightCm}cm" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${t}</title><rect width="${w}" height="${h}" fill="#fff"/><path d="${rects.join("")}" fill="#000"/></svg>`;
}

/** Films to send the printer: one per ink in print order, an underbase if advised, and the raised outline. */
export function films(sep) {
  const out = [];
  if (sep.underbase) {
    const any = new Uint8Array(sep.width * sep.height);
    for (const ink of sep.inks) for (let i = 0; i < any.length; i++) if (ink.mask[i]) any[i] = 1;
    out.push({ name: "00-underbase-white", ink: "#ffffff", svg: maskSvg(sep, any, { title: "white underbase" }) });
  }
  for (const ink of sep.inks) out.push({ name: `${String(ink.order).padStart(2, "0")}-ink-${ink.hex.slice(1)}`, ink: ink.hex, svg: maskSvg(sep, ink.mask, { title: `ink ${ink.order} ${ink.hex}` }) });
  out.push({ name: "raised-outline", ink: "#000000", svg: maskSvg(sep, sep.raised.mask, { title: "raised outline" }) });
  return out;
}

/** The separation drawn flat in its palette on the garment colour, as RGBA for a canvas. */
export function previewRgba(sep) {
  const out = new Uint8ClampedArray(sep.width * sep.height * 4);
  const g = [1, 3, 5].map(i => parseInt(sep.garment.slice(i, i + 2), 16));
  const col = new Map(sep.inks.map(ink => [ink.label, [1, 3, 5].map(i => parseInt(ink.hex.slice(i, i + 2), 16))]));
  for (let i = 0; i < sep.width * sep.height; i++) {
    const c = col.get(sep.labels[i]) || g;
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Plain-text brief for the printer. */
export function separationBrief(sep) {
  const lines = [
    `Colour separation: ${sep.inks.length} inks${sep.underbase ? " + white underbase" : ""} = ${sep.screens} screens, printed ${sep.widthCm} x ${sep.heightCm} cm on ${sep.garment}.`,
    ...(sep.underbase ? ["Screen 0: white underbase under all inked areas."] : []),
    ...sep.inks.map(i => `Screen ${i.order}: ${i.hex}, ${i.coveragePct}% of the artwork${i.thinSharePct >= 10 ? `, ${i.thinSharePct}% finer than ${sep.minFeatureMm} mm` : ""}.`),
    `Raised outline layer (high-density or puff): ${sep.raised.lineMm} mm line, ${sep.raised.coveragePct}% of the artwork.`,
    ...sep.notes,
  ];
  return lines.join("\n");
}
