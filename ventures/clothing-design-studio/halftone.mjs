// Halftone film for screen printing: turns the tone of one ink layer into
// round dots on a rotated grid, and checks the screen can hold them.
// Pure functions, no DOM. Rules of thumb (printer-dependent, not a promise):
// mesh count should be about 4 to 5 times the lines per inch (lpi), and a dot
// smaller than about 10% or larger than about 90% usually fills in or drops out.

const MM_PER_INCH = 25.4;

/** Screen angles (degrees) for n inks, spaced to avoid moire. Four-colour process
 * convention first (C 15, M 75, Y 0, K 45); for others, even spacing over 90 degrees. */
export function screenAngles(n) {
  if (n <= 0) return [];
  if (n === 1) return [45];
  if (n === 4) return [15, 75, 0, 45];
  const step = 90 / n;
  return Array.from({ length: n }, (_, i) => Math.round(((i * step + 15) % 90) * 10) / 10);
}

/** Largest lpi a mesh can hold (mesh / 4.5), rounded down to a whole lpi. */
export function maxLpi(mesh) {
  return Math.floor(mesh / 4.5);
}

/** Check a screen choice. Returns { ok, warnings[] }. */
export function checkScreen({ lpi, mesh, minDotPct, maxDotPct }) {
  const warnings = [];
  if (!(lpi > 0)) warnings.push("lpi must be above 0");
  if (mesh && lpi > 0) {
    const ratio = mesh / lpi;
    if (ratio < 3.5) warnings.push(`mesh ${mesh} is only ${ratio.toFixed(1)}x ${lpi} lpi; use a finer mesh (about ${Math.ceil(lpi * 4.5)}) or fewer lines (${maxLpi(mesh)} lpi or less) or the dots will break up`);
    else if (ratio < 4) warnings.push(`mesh ${mesh} is ${ratio.toFixed(1)}x ${lpi} lpi, under the usual 4 to 5x; test a strike first`);
  }
  if (minDotPct !== undefined && minDotPct > 0 && minDotPct < 10) warnings.push(`highlights go down to a ${minDotPct.toFixed(1)}% dot; below about 10% dots usually do not hold on the screen`);
  if (maxDotPct !== undefined && maxDotPct > 90 && maxDotPct < 100) warnings.push(`shadows reach a ${maxDotPct.toFixed(1)}% dot; above about 90% they usually fill in`);
  return { ok: warnings.length === 0, warnings };
}

/** Tone 0 (no ink) to 1 (full ink) per pixel, from luminance against the garment.
 * `image` is {data,width,height} RGBA; alpha 0 pixels carry no ink. */
export function toneMap(image, { ink = "#000000", garment = "#ffffff" } = {}) {
  const { data, width, height } = image;
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const lInk = lum(ink), lG = lum(garment);
  const span = lG - lInk;
  const tone = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3] / 255;
    if (a === 0) continue;
    const l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    // full ink where the pixel is as dark as the ink; none where it matches the garment
    const t = Math.abs(span) < 1e-6 ? (l < 0.5 ? 1 : 0) : (lG - l) / span;
    tone[i] = Math.min(1, Math.max(0, t)) * a;
  }
  return { tone, width, height };
}

/** Build the dot film. Options: lpi, angle, widthMm (printed width), mesh, ink.
 * Dots sit on a grid rotated by `angle`; each dot's area is the mean tone under its cell,
 * so a dot of radius r covers pi r^2 of a cell of side `pitch`. */
export function halftone(toneImage, { lpi = 45, angle = 45, widthMm = 250, mesh = 0, ink = "#000000", minDotPct = 5 } = {}) {
  const { tone, width, height } = toneImage;
  const pitchMm = MM_PER_INCH / lpi;
  const pxMm = widthMm / width;               // millimetres per source pixel
  const heightMm = height * pxMm;
  const pitchPx = pitchMm / pxMm;
  const th = (angle * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  // grid cell indices span the rotated bounding box of the image
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => [(x * c + y * s) / pitchPx, (-x * s + y * c) / pitchPx]);
  const u0 = Math.floor(Math.min(...corners.map(p => p[0]))), u1 = Math.ceil(Math.max(...corners.map(p => p[0])));
  const v0 = Math.floor(Math.min(...corners.map(p => p[1]))), v1 = Math.ceil(Math.max(...corners.map(p => p[1])));
  // accumulate tone per cell
  const cells = new Map();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = tone[y * width + x];
    const u = Math.floor((x + 0.5) * c / pitchPx + (y + 0.5) * s / pitchPx), v = Math.floor((-(x + 0.5) * s + (y + 0.5) * c) / pitchPx);
    const key = (u - u0) * (v1 - v0 + 1) + (v - v0);
    const e = cells.get(key);
    if (e) { e.sum += t; e.n++; } else cells.set(key, { u, v, sum: t, n: 1 });
  }
  const dots = [];
  let minPct = 100, maxPct = 0, dropped = 0;
  const cellArea = pitchPx * pitchPx;
  for (const { u, v, sum, n } of cells.values()) {
    // a cell clipped by the image edge has fewer pixels: treat its missing part as no ink
    const mean = sum / Math.max(n, cellArea);
    if (mean <= 0) continue;
    const pct = Math.min(100, mean * 100);
    if (pct < minDotPct) { dropped++; continue; }
    const cu = (u + 0.5) * pitchPx, cv = (v + 0.5) * pitchPx;
    const x = cu * c - cv * s, y = cu * s + cv * c;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    // area fraction f of a square cell -> radius; past 78.5% circles touch, then dots merge
    const f = Math.min(mean, 0.785);
    const r = Math.sqrt(f * pitchMm * pitchMm / Math.PI);
    dots.push({ x: x * pxMm, y: y * pxMm, r, pct });
    if (pct < minPct) minPct = pct;
    if (pct > maxPct) maxPct = pct;
  }
  const smallestDotMm = dots.length ? Math.min(...dots.map(d => d.r)) * 2 : 0;
  const report = checkScreen({ lpi, mesh, minDotPct: dots.length ? minPct : undefined, maxDotPct: dots.length ? maxPct : undefined });
  if (dropped) report.warnings.push(`${dropped} dots under ${minDotPct}% were left off the film (highlight cut-off)`);
  return { dots, widthMm, heightMm, lpi, angle, pitchMm, smallestDotMm, minDotPct: dots.length ? minPct : 0, maxDotPct: dots.length ? maxPct : 0, dropped, ink, warnings: report.warnings, ok: report.ok && dropped === 0 };
}

/** The film as an SVG in millimetres: black dots on transparent, labelled with its screen. */
export function halftoneSvg(h, { title = "halftone film" } = {}) {
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const circles = h.dots.map(d => `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r.toFixed(3)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${h.widthMm.toFixed(1)} ${h.heightMm.toFixed(1)}" width="${h.widthMm.toFixed(1)}mm" height="${h.heightMm.toFixed(1)}mm" role="img"><title>${esc(title)}: ${h.lpi} lpi at ${h.angle} degrees</title><g fill="#000">${circles}</g></svg>`;
}

/** Plain-words brief for the printer. */
export function halftoneBrief(h, { name = "ink" } = {}) {
  const lines = [`${name}: ${h.lpi} lpi at ${h.angle} degrees, ${h.dots.length} dots, ${h.widthMm.toFixed(0)} x ${h.heightMm.toFixed(0)} mm.`,
    `Dot sizes ${h.minDotPct.toFixed(1)}% to ${h.maxDotPct.toFixed(1)}%, smallest dot ${h.smallestDotMm.toFixed(2)} mm across.`];
  for (const w of h.warnings) lines.push(`Check: ${w}`);
  lines.push("Rules of thumb only; strike a test with your printer's mesh and ink before the run.");
  return lines.join("\n");
}

/** One-ink tonal film from a colour separation (see separation.mjs): each region's
 * lightness in its palette colour sets how dense the dots are, so a painting reduced
 * to a few flat inks prints as one ink in several tones on one screen. Unprinted
 * (background or knocked-out) pixels carry no ink. `ink` is the single ink's colour;
 * `garment` defaults to the separation's garment colour. Returns the halftone() result
 * sized to the separation's printed width. */
export function singleInkFilm(sep, { ink = "#000000", lpi = 45, angle = 45, mesh = 0, minDotPct = 5 } = {}) {
  const garment = sep.garment || "#ffffff";
  const n = sep.width * sep.height, data = new Uint8ClampedArray(n * 4);
  const rgb = new Map(sep.inks.map(i => [i.label, [1, 3, 5].map(k => parseInt(i.hex.slice(k, k + 2), 16))]));
  for (let i = 0; i < n; i++) {
    const c = rgb.get(sep.labels[i]);
    if (!c) continue; // alpha stays 0: no ink
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
  }
  const t = toneMap({ data, width: sep.width, height: sep.height }, { ink, garment });
  const f = halftone(t, { lpi, angle, widthMm: sep.widthCm * 10, mesh, ink, minDotPct });
  const lum = hex => { const v = parseInt(hex.slice(1), 16); return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255; };
  if (Math.abs(lum(ink) - lum(garment)) < 0.35) { f.warnings.unshift(`ink ${ink} and garment ${garment} are too close in lightness to show a tone; pick a lighter or darker ink`); f.ok = false; }
  return f;
}

/** A readable single ink for a garment colour: near-white on dark cloth, near-black on light. */
export function contrastInk(garment) {
  const v = parseInt(String(garment).slice(1), 16);
  return (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255 < 0.5 ? "#f2f2f2" : "#111111";
}
