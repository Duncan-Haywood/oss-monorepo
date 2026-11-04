// Halftone film for screen printing: turns a tone image (a photo of a painting,
// a shaded drawing) into one-colour dots that a mesh can hold, so shading
// survives where the flat-colour separation (separation.mjs) would posterise it.
//
// Amplitude-modulated round-ish dots on a rotated grid. The spot function is
// ranked by its exact area CDF, so the share of ink in a flat tone patch equals
// that tone (no gamma surprise). Dots below `minDotPct` drop out and above
// `maxDotPct` fill solid, because a screen cannot hold them. Mesh advice is
// the usual rule of thumb (mesh about 4.5 x lines per inch), not a printer's
// word: a proof on the real mesh and ink decides.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Screen angles (degrees) for n inks printed over each other, spread to keep moire down. */
export function screenAngles(n) {
  const set = [45, 75, 15, 0, 30, 60];
  if (!(n >= 1 && n <= set.length)) throw new Error(`screenAngles: 1 to ${set.length} inks`);
  return set.slice(0, n);
}

/** Smallest angle gap (degrees, mod 90 because a square grid repeats every 90) between any two angles. */
export function minAngleGap(angles) {
  let m = 90;
  for (let i = 0; i < angles.length; i++) for (let j = i + 1; j < angles.length; j++) {
    const d = Math.abs(angles[i] - angles[j]) % 90;
    m = Math.min(m, d, 90 - d);
  }
  return m;
}

const spot = (u, v) => 0.5 + 0.25 * (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v)); // 1 at a dot centre

let rankTable;
/** rank(s): share of a cell whose spot value is above s, i.e. the tone at which the dot reaches that pixel. */
function ranks() {
  if (rankTable) return rankTable;
  const N = 128, bins = 1024, counts = new Float64Array(bins + 1);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) counts[Math.min(bins, Math.floor(spot(a / N, b / N) * bins))]++;
  const t = new Float64Array(bins + 1);
  let above = 0;
  for (let i = bins; i >= 0; i--) { t[i] = above / (N * N); above += counts[i]; }
  return (rankTable = t);
}

/** Box-average RGBA down (or nearest up) to w x h; returns tone darkness 0..1 and an alpha mask. */
function toTone(image, w, h, mode) {
  const sw = image.width, sh = image.height, tone = new Float32Array(w * h), live = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.floor(x * sw / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / w));
    const y0 = Math.floor(y * sh / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / h));
    let s = 0, n = 0, a = 0;
    for (let yy = y0; yy < Math.min(sh, y1); yy++) for (let xx = x0; xx < Math.min(sw, x1); xx++) {
      const i = (yy * sw + xx) * 4;
      const l = (0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2]) / 255;
      s += mode === "light" ? l : 1 - l; a += image.data[i + 3]; n++;
    }
    tone[y * w + x] = s / n; live[y * w + x] = a / n >= 128 ? 1 : 0;
  }
  return { tone, live };
}

/**
 * @param image {data,width,height} RGBA
 * @param o {widthCm, lpi, angle, dpi, mesh, tone: "dark"|"light", gamma, minDotPct, maxDotPct, maxPixels}
 *   tone "dark" (default): dark pixels get big dots (ink is the dark colour on a light garment);
 *   "light": light pixels get big dots (a white or light ink on a dark garment).
 */
export function halftone(image, o = {}) {
  if (!image || !image.data || !(image.width > 0) || !(image.height > 0) || image.data.length < image.width * image.height * 4) throw new Error("halftone: need RGBA pixels with width and height");
  const widthCm = clamp(Number(o.widthCm) || 25, 1, 60);
  const lpi = clamp(Number(o.lpi) || 45, 15, 85);
  const angle = Number.isFinite(Number(o.angle)) && o.angle !== "" && o.angle != null ? Number(o.angle) : 45;
  const mode = o.tone ?? "dark";
  if (!["dark", "light"].includes(mode)) throw new Error('halftone: tone must be "dark" or "light"');
  const gamma = clamp(Number(o.gamma) || 1, 0.3, 3);
  const minDot = clamp(o.minDotPct ?? 5, 0, 30) / 100, maxDot = clamp(o.maxDotPct ?? 95, 70, 100) / 100;
  const dpiWanted = clamp(Number(o.dpi) || 600, 150, 1200);
  const maxPixels = Number(o.maxPixels) || 4_000_000;
  const aspect = image.height / image.width;
  let wPx = Math.round(widthCm / 2.54 * dpiWanted);
  if (wPx * wPx * aspect > maxPixels) wPx = Math.floor(Math.sqrt(maxPixels / aspect));
  const w = Math.max(8, wPx), h = Math.max(8, Math.round(w * aspect));
  const dpi = w / (widthCm / 2.54);
  const pitch = dpi / lpi; // film pixels per screen cell
  if (pitch < 4) throw new Error("halftone: the film resolution is too low for this lpi; raise dpi or lower lpi");
  const th = (angle * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const { tone, live } = toTone(image, w, h, mode);
  const rank = ranks(), bins = rank.length - 1;
  const mask = new Uint8Array(w * h);
  let toneSum = 0, inkSum = 0, liveN = 0, solid = 0, dropped = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!live[i]) continue;
    let t = Math.pow(tone[i], gamma);
    liveN++;
    if (t < minDot) { dropped += t > 0.002 ? 1 : 0; t = 0; } else if (t > maxDot) { solid++; t = 1; }
    toneSum += t;
    if (t <= 0) continue;
    const u = (x * c + y * s) / pitch, v = (-x * s + y * c) / pitch;
    const fu = u - Math.floor(u), fv = v - Math.floor(v);
    const r = rank[Math.min(bins, Math.floor(spot(fu, fv) * bins))];
    if (t >= 1 || r < t) { mask[i] = 1; inkSum++; }
  }
  if (!liveN) throw new Error("halftone: the image is empty or fully transparent");
  const lpmm = lpi / 25.4, pitchMm = 25.4 / lpi;
  const smallDotMm = +(pitchMm * Math.sqrt((4 * Math.max(minDot, 0.01)) / Math.PI)).toFixed(3);
  const mesh = Number(o.mesh) || Math.round(lpi * 4.5 / 10) * 10;
  const recommendedMesh = [Math.round(lpi * 4), Math.round(lpi * 5)];
  const threadMm = 25.4 / mesh;
  const notes = [];
  if (mesh < lpi * 3.5) notes.push(`Mesh ${mesh} is coarse for ${lpi} lpi (rule of thumb ${recommendedMesh[0]} to ${recommendedMesh[1]}): dots will look ragged. Lower the lpi or use a finer mesh.`);
  if (smallDotMm < 2 * threadMm) notes.push(`The smallest ${Math.round(minDot * 100)}% dot is about ${smallDotMm} mm, near two thread pitches on a ${mesh} mesh (${(2 * threadMm).toFixed(2)} mm): it may not hold. Raise the minimum dot or lower the lpi.`);
  if (lpi > 65) notes.push("Above about 65 lpi needs a very fine mesh, a skilled printer and a smooth garment; most T-shirt shops stay at 35 to 55.");
  if (liveN && solid / liveN > 0.25) notes.push(`${Math.round(100 * solid / liveN)}% of the artwork is darker than ${Math.round(maxDot * 100)}% and prints solid: the shadows will block up. Lighten the image or raise the maximum dot.`);
  if (liveN && dropped / liveN > 0.2) notes.push(`${Math.round(100 * dropped / liveN)}% of the artwork is lighter than ${Math.round(minDot * 100)}% and drops out: the highlights will vanish. That is normal for highlights; lower the minimum dot only if your printer can hold it.`);
  notes.push(`Angle ${angle} degrees. A second ink printed over this one needs an angle at least 15 degrees away (see screenAngles) or a moire pattern appears.`);
  notes.push("A starting film from the pixels you gave it. Dot gain on press (often 10 to 20% in the midtones) is not modelled: ask the printer for a proof and a curve.");
  return {
    width: w, height: h, widthCm, heightCm: +(widthCm * aspect).toFixed(2), dpi: +dpi.toFixed(0), lpi, linesPerMm: +lpmm.toFixed(2), angle, tone: mode,
    mask, targetCoveragePct: +(100 * toneSum / liveN).toFixed(1), coveragePct: +(100 * inkSum / liveN).toFixed(1),
    mesh, recommendedMesh, smallestDotMm: smallDotMm, solidPct: +(100 * solid / liveN).toFixed(1), droppedPct: +(100 * dropped / liveN).toFixed(1), notes,
  };
}

/** The film as a 1:1 SVG in cm (black = ink), run-length coded. */
export function halftoneSvg(ht, { title = "halftone film" } = {}) {
  const { width: w, height: h, widthCm, heightCm, mask } = ht, d = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!mask[y * w + x]) { x++; continue; }
      let e = x;
      while (e < w && mask[y * w + e]) e++;
      d.push(`M${x} ${y}h${e - x}v1h${-(e - x)}z`);
      x = e;
    }
  }
  const t = String(title).replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthCm}cm" height="${heightCm}cm" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${t}</title><rect width="${w}" height="${h}" fill="#fff"/><path d="${d.join("")}" fill="#000"/></svg>`;
}

export function halftoneBrief(ht) {
  return [
    `Halftone film: ${ht.lpi} lines per inch at ${ht.angle} degrees, ${ht.widthCm} x ${ht.heightCm} cm, film ${ht.width} x ${ht.height} px (${ht.dpi} dpi).`,
    `Ink coverage ${ht.coveragePct}% (the tones asked for ${ht.targetCoveragePct}%). Mesh ${ht.mesh} (rule of thumb ${ht.recommendedMesh[0]} to ${ht.recommendedMesh[1]}). Smallest dot about ${ht.smallestDotMm} mm.`,
    ...ht.notes,
  ].join("\n");
}
