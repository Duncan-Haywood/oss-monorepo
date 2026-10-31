// @ts-check
// Gable dormer framing quantities, closed-form from a few typed dimensions.
//
// Geometry (inches; x runs from the dormer's front wall back up the main roof,
// y is sideways from the dormer's centre line):
//  - the dormer eave is level at `eaveHeight` above the front wall's bottom plate;
//    the cheek walls stand on the main roof, so a cheek stud at x is
//    eaveHeight - (mainPitch/12) x long before plates, and the cheek ends where
//    that reaches zero, at xe = eaveHeight x 12 / mainPitch;
//  - the dormer ridge is level, rise = (width/2) x pitch/12 above the eave, and
//    meets the main roof at xr = (eaveHeight + rise) x 12 / mainPitch;
//  - each valley runs from the eave corner (width/2, xe) to the ridge's end
//    (0, xr): length sqrt((width/2)^2 + (xr-xe)^2 + rise^2);
//  - commons stand while the eave is clear (x <= xe); after that each station is
//    a jack to the valley, with plan run width/2 x (xr-x)/(xr-xe).
// Plates: one bottom, two top (4.5 in off every stud). Not counted: roof
// overhangs, the flashing, the hole cut in the main roof and the framing around
// it (headers and trimmers belong to the engineer's roof plan) and sheathing
// waste. Hand-arithmetic checks in dormer.test.mjs; no real dormer plan checked.

/** @typedef {{ width: number, eaveHeight: number, pitch: number, mainPitch: number, spacing?: number, studSize?: string, rafterSize?: string, valleySize?: string, ridgeSize?: string, headerSize?: string, window?: { width: number, height?: number, sill?: number } }} Dormer */

const PLATES = 4.5;
const r16 = (/** @type {number} */ n) => Math.round(n * 16) / 16;
const slope = (/** @type {number} */ p) => Math.sqrt(1 + (p / 12) ** 2);

/** @param {Dormer} d */
export function validateDormer(d) {
  const e = [];
  if (!(d.width >= 36 && d.width <= 180)) e.push("Dormer width must be between 3 and 15 ft.");
  if (!(d.eaveHeight >= 24 && d.eaveHeight <= 96)) e.push("Dormer eave height (front wall, bottom plate to eave) must be between 2 and 8 ft.");
  if (!(d.pitch >= 3 && d.pitch <= 16)) e.push("Dormer pitch must be between 3 and 16 in 12.");
  if (!(d.mainPitch >= 3 && d.mainPitch <= 16)) e.push("Main roof pitch must be between 3 and 16 in 12.");
  if (d.spacing != null && ![12, 16, 19.2, 24].includes(d.spacing)) e.push("Spacing must be 12, 16, 19.2 or 24 in.");
  if (d.window) {
    const w = d.window;
    if (!(w.width >= 12 && w.width <= d.width - 12)) e.push("Window width must be at least 1 ft and leave 1 ft of wall.");
    if (!(( w.height ?? 36) >= 12 && (w.height ?? 36) + (w.sill ?? 30) <= d.eaveHeight - PLATES - 3)) e.push("Window height plus sill must fit under the header in the front wall.");
  }
  return e;
}

/** @param {Dormer} d */
export function layoutDormer(d) {
  const errors = validateDormer(d);
  if (errors.length) return { ok: false, errors };
  const s = d.spacing ?? 16, hw = d.width / 2, H = d.eaveHeight, k = slope(d.pitch);
  const rise = hw * d.pitch / 12;
  const xe = H * 12 / d.mainPitch, xr = (H + rise) * 12 / d.mainPitch;
  const stud = d.studSize ?? "2x4", raf = d.rafterSize ?? "2x6", val = d.valleySize ?? "2x8", ridge = d.ridgeSize ?? "2x8", hdr = d.headerSize ?? "2x6";
  /** @type {{ part: string, size: string, length: number, count: number }[]} */
  const parts = [];
  const add = (/** @type {string} */ part, /** @type {string} */ size, /** @type {number} */ length, count = 1) => { if (count > 0 && length > 0) parts.push({ part, size, length: r16(length), count }); };
  const notes = [];

  // front wall: studs on spacing from one corner, plus the far corner stud
  const frontLen = H - PLATES;
  let frontX = []; for (let x = 0; x < d.width - 1e-9; x += s) frontX.push(x); frontX.push(d.width);
  if (d.window) {
    const w = d.window, left = (d.width - w.width) / 2, right = left + w.width, sill = w.sill ?? 30, wh = w.height ?? 36;
    const inside = frontX.filter((x) => x > left - 1.5 && x < right + 1.5 && x !== 0 && x !== d.width);
    frontX = frontX.filter((x) => !inside.includes(x));
    add("front stud", stud, frontLen, frontX.length);
    add("king stud", stud, frontLen, 2);
    const top = sill + wh;
    add("jack stud", stud, top, 2);
    add("window header (2 plies)", hdr, w.width + 3, 2);
    add("window sill", stud, w.width, 1);
    const cripples = Math.max(1, Math.floor(w.width / s));
    add("cripple under sill", stud, sill - 1.5, cripples);
    add("cripple over header", stud, frontLen - top - 3, cripples);
    notes.push(`Window ${w.width} x ${wh} in on a ${sill} in sill: ${inside.length} layout stud(s) replaced by 2 kings, 2 jacks, a 2-ply ${hdr} header, a sill and ${cripples} cripples each above and below.`);
  } else add("front stud", stud, frontLen, frontX.length);
  add("front bottom plate", stud, d.width, 1);
  add("front top plate", stud, d.width, 2);

  // front gable triangle studs
  let gableStuds = 0;
  for (let u = s; u < d.width - 1e-9; u += s) {
    const h = Math.min(u, d.width - u) * d.pitch / 12 - 1.5;
    if (h >= 3) { add("gable stud", stud, h); gableStuds++; }
  }

  // cheek walls (two): level top, bottom on the main roof, so stud length falls with x
  let cheekStuds = 0;
  for (let x = s; x < xe - 1e-9; x += s) {
    const len = H - (d.mainPitch / 12) * x - PLATES;
    if (len >= 3) { add("cheek stud", stud, len, 2); cheekStuds += 2; }
  }
  add("cheek top plate", stud, xe, 4);
  add("cheek bottom plate (cut to the main slope)", stud, xe * slope(d.mainPitch), 2);

  // roof
  const valleyLen = Math.sqrt(hw * hw + (xr - xe) ** 2 + rise * rise);
  add("ridge", ridge, xr);
  add("valley rafter", val, valleyLen, 2);
  let commons = 0, jacks = 0;
  const common = hw * k;
  for (let x = 0; x <= xr + 1e-9; x += s) {
    if (x <= xe + 1e-9) { add("common rafter", raf, common, 2); commons += 2; }
    else { const run = hw * (xr - x) / (xr - xe); if (run * k >= 3) { add("valley jack", raf, run * k, 2); jacks += 2; } }
  }
  const roofSqFt = 2 * (hw * xe + hw * (xr - xe) / 2) / 144 * k;
  const wallSqFt = (d.width * H + hw * rise + xe * H) / 144; // front wall + gable triangle + two cheeks (each H x xe / 2)
  notes.push("Roof overhangs, flashing, the opening in the main roof (headers and trimmers) and sheathing waste are not counted.");
  const pooled = /** @type {typeof parts} */ ([]);
  for (const p of parts) { const f = pooled.find((q) => q.part === p.part && q.size === p.size && q.length === p.length); if (f) f.count += p.count; else pooled.push({ ...p }); }
  return {
    ok: true, errors: [], parts: pooled, spacing: s,
    geometry: { rise: r16(rise), cheekRunToEave: r16(xe), ridgeLength: r16(xr), valleyLength: r16(valleyLen), commonLength: r16(common) },
    counts: { commons, jacks, cheekStuds, gableStuds },
    areas: { roofSqFt: Math.round(roofSqFt * 10) / 10, wallSqFt: Math.round(wallSqFt * 10) / 10 },
    notes,
  };
}

/** @param {any} r */
export function dormerText(r) {
  const g = r.geometry, l = [];
  l.push(`  ridge ${g.ridgeLength} in long, rise ${g.rise} in, valleys ${g.valleyLength} in, commons ${g.commonLength} in; cheeks meet the main roof ${g.cheekRunToEave} in back from the front wall`);
  l.push(`  roof ${r.areas.roofSqFt} sq ft, walls to sheathe ${r.areas.wallSqFt} sq ft`);
  for (const p of r.parts) l.push(`  ${String(p.count).padStart(3)} x ${p.size.padEnd(5)} ${String(p.length).padStart(8)} in  ${p.part}`);
  for (const n of r.notes) l.push(`  ${n}`);
  return l;
}
