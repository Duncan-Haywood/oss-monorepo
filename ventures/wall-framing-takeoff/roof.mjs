// @ts-check
// Roof framing for a gable roof: common rafters, ridge board, optional ceiling
// joists and collar ties, or a truss count as a purchased line; roof sheathing
// by course, underlayment, drip edge and shingles.
//
// The building is `width` (eave to eave, outside of the walls) by `length`
// (along the ridge). The pitch is rise in 12 of run. A rafter runs from the
// ridge board's face to the eave plus the `overhang` (horizontal), so its board
// length is (width / 2 - ridge thickness / 2 + overhang) x sqrt(1 + (pitch/12)^2);
// the birdsmouth and tail cuts are made in that length and are not drawn.
// Rafters (or trusses) stand on the spacing with one at each end, and each roof
// plane is sheathed in 4 ft courses from the eave up with long edges across the
// rafters and end joints on rafter centres, alternate courses staggered.
// Lumber goes out as cut rows that `takeoff(plan, roofCuts(...))` pools with the
// walls and floor; sheets, felt, drip edge and shingles are their own order.
import { THICK, EPS, DEPTH, optimizeStock, formatLength, formatInches } from "./engine.mjs";

export const SHEET = { width: 48, length: 96 };

/** @typedef {{ width: number, projection: number, pitch?: number, at?: number, side?: "left" | "right", valley?: string }} Wing */
/** @typedef {{ id?: string, shape?: "gable" | "hip", hip?: string, wing?: Wing, wing2?: Wing, plateWidth?: number, maxNotchFraction?: number, width: number, length: number, pitch: number, overhang?: number, gableOverhang?: number, rafter?: string, spacing?: number, ridge?: string | null, ceilingJoist?: string, ceilingBearing?: number, collarTies?: boolean, valleyBacking?: boolean, collarDrop?: number, trusses?: { spacing?: number, price?: number }, sheet?: { length?: number, width?: number, price?: number, kerf?: number }, roofing?: { waste?: number, bundlesPerSquare?: number, underlaymentRoll?: number, ridgeBundleFeet?: number, starterBundleFeet?: number, dripEdgePiece?: number } }} Roof */

export function sampleRoof() {
  return { id: "Main roof", width: 336, length: 480, pitch: 4, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 16, ridge: "2x10", ceilingJoist: "2x6", collarTies: true };
}

/** Slope length per inch of run: sqrt(1 + (pitch/12)^2). */
export const slopeFactor = (/** @type {number} */ pitch) => Math.sqrt(1 + (pitch / 12) ** 2);

/**
 * Birdsmouth (seat and plumb cut) where a rafter bears on the wall plate. The seat is the plate width
 * (`bearing`); the plumb cut is bearing x pitch/12 tall, which measured square to the rafter edge is that
 * over the slope factor. `maxFraction` is the deepest notch you allow as a share of the rafter's depth
 * (default 1/4, the end-notch figure many codes use; check yours). Also gives the bearing that would just
 * reach the limit, so a steep pitch shows how much plate the notch can sit on.
 * @param {string} size @param {number} pitch @param {number} [bearing] @param {number} [maxFraction]
 */
export function birdsmouth(size, pitch, bearing = 3.5, maxFraction = 0.25) {
  const d = DEPTH[size], k = slopeFactor(pitch);
  const plumb = bearing * pitch / 12; // vertical height of the plumb cut
  const notch = plumb / k; // depth square to the rafter edge
  const maxBearing = maxFraction * d * k * 12 / pitch;
  return { size, pitch, bearing, plumb, notch, fraction: notch / d, maxFraction, maxBearing, remaining: d - notch, ok: notch <= maxFraction * d + EPS };
}

/** @param {Roof} r @param {{stock: {size: string, length: number}[]}} plan */
export function validateRoof(r, plan) {
  const errors = [];
  if (!(r.width >= 96 && r.width <= 1200)) errors.push("Roof width (eave to eave) must be between 8 ft and 100 ft.");
  if (!(r.length >= 48 && r.length <= 2400)) errors.push("Roof length (along the ridge) must be between 4 ft and 200 ft.");
  if (!(r.pitch >= 1 && r.pitch <= 24)) errors.push("Pitch is rise in 12 of run, between 1 and 24.");
  if (!(((r.overhang ?? 12) >= 0) && ((r.overhang ?? 12) <= 48))) errors.push("Eave overhang must be between 0 and 48 inches.");
  if (!(((r.gableOverhang ?? 12) >= 0) && ((r.gableOverhang ?? 12) <= 48))) errors.push("Gable (rake) overhang must be between 0 and 48 inches.");
  if (!(((r.spacing ?? 16) > 0) && ((r.spacing ?? 16) <= 48))) errors.push("Rafter spacing must be between 0 and 48 inches.");
  if (r.wing2 && !r.wing) errors.push("`wing2` is the second cross wing; set `wing` first.");
  for (const w of [r.wing, r.wing2]) if (w) {
    if (r.shape === "hip") errors.push("A cross wing is framed on a gable main roof; set shape to gable.");
    if (r.trusses) errors.push("A cross wing is framed with rafters; the truss maker draws the girder and valley set, so leave `trusses` off.");
    const wp = w.pitch ?? r.pitch;
    if (!(wp >= 1 && wp <= 24)) errors.push("Wing pitch is rise in 12 of run, between 1 and 24.");
    if (!(w.width >= 96 && w.width <= r.width - 24)) errors.push("Wing width must be at least 8 ft and at least 2 ft less than the main roof's width, so its ridge sits below the main ridge.");
    else if (wp >= 1 && wp <= 24 && w.width / 2 * wp / r.pitch > r.width / 2 - 12) errors.push("At this pitch the wing ridge would reach the main ridge (its rise at the main wall must stay a foot of run below it): narrow the wing or lower its pitch.");
    if (!(w.projection >= 24 && w.projection <= 1200)) errors.push("Wing projection (main wall to the wing's gable wall) must be between 2 ft and 100 ft.");
    const at = w.at ?? r.length / 2;
    if (!(at - w.width / 2 >= 0 && at + w.width / 2 <= r.length)) errors.push("The wing must sit inside the main roof's length: `at` (its centre, from the first gable wall) +- half its width.");
    if (w.valley && !(w.valley in DEPTH)) errors.push(`Unknown valley size ${w.valley}.`);
    else if (w.valley && !plan.stock.some((s) => s.size === w.valley)) errors.push(`No ${w.valley} boards listed in the stock.`);
  }
  if (r.wing && r.wing2) {
    const a = r.wing, b = r.wing2;
    if ((a.side ?? "right") === (b.side ?? "right") && Math.abs((a.at ?? r.length / 2) - (b.at ?? r.length / 2)) < (a.width + b.width) / 2 + 24) errors.push("Two wings on the same side need at least 2 ft between them along the ridge (centres at least half the two widths plus 2 ft apart); put one on the other side or move it.");
  }
  if (!r.trusses) {
    const sizes = [["rafter", r.rafter ?? "2x8"], ...(r.ridge ? [["ridge", r.ridge]] : []), ...(r.ceilingJoist ? [["ceiling joist", r.ceilingJoist]] : [])];
    for (const [what, size] of sizes) {
      if (!(size in DEPTH)) errors.push(`Unknown ${what} size ${size}.`);
      else if (!plan.stock.some((s) => s.size === size)) errors.push(`No ${size} boards listed in the stock.`);
    }
  }
  return errors;
}

/** Split `total` into pieces no longer than `max`, each end on one of `centres` (a splice sits over a rafter). */
function splitOnCentres(total, max, centres) {
  if (total <= max + EPS) return [total];
  const out = [];
  let at = 0;
  while (total - at > max + EPS) {
    const next = centres.filter((c) => c > at + 12 && c <= at + max - THICK / 2).pop();
    if (next == null) { out.push(max); at += max; continue; }
    out.push(next - at);
    at = next;
  }
  out.push(total - at);
  return out;
}

/** Ceiling joists on `centres`: one board when it spans, else two lapped over a bearing wall. */
function ceilingJoistRows(r, plan, centres, notes, width = r.width, label = "") {
  const rows = [];
  const cl = Math.max(...plan.stock.filter((s) => s.size === r.ceilingJoist).map((s) => s.length));
  if (width <= cl + EPS) for (const c of centres) rows.push({ x: c - THICK / 2, length: width, size: r.ceilingJoist });
  else {
    // too long for one board: two pieces lapped 6 in over an interior bearing wall `ceilingBearing` from the left eave (default mid-span)
    const mid = label ? width / 2 : r.ceilingBearing ?? width / 2;
    const pieces = [mid + 3, width - mid + 3];
    if (pieces.some((p) => p > cl + EPS)) return { error: `A ${formatLength(Math.max(...pieces))} ceiling joist piece is longer than the longest ${r.ceilingJoist} listed (${formatLength(cl)}); list longer boards or move the bearing wall.` };
    for (const c of centres) for (const p of pieces) rows.push({ x: c - THICK / 2, length: p, size: r.ceilingJoist });
    notes.push(`Ceiling joists are ${label}two pieces lapped 6 in over an interior bearing wall ${formatLength(mid)} from the left eave; the wall, the lap nailing and the load path are yours and the engineer's.`);
  }
  return { rows };
}

/**
 * Lay out one hip roof on a rectangle (`shape: "hip"`): four planes at one pitch, hips at 45 degrees in plan.
 * Common rafters stand between the hip ends on the spacing; jack rafters fill each corner, their run
 * to the hip (d + overhang, less the hip's half thickness measured square to the jack) growing by the
 * spacing from the corner; a common at the middle of each end plane runs to the ridge end.
 * @param {Roof & { hip?: string }} r
 */
function layoutHip(r, plan) {
  const id = r.id || "Roof";
  const overhang = r.overhang ?? 12, spacing = r.spacing ?? 16;
  const W = r.width, L = r.length;
  if (r.trusses) return { ok: false, errors: ["A hip roof needs girder and jack trusses from the truss maker; leave `trusses` off and use rafters, or order the hip set from them."] };
  if (L < W - EPS) return { ok: false, errors: ["For a hip roof `length` is the long side and must be at least `width`; swap them."] };
  const k = slopeFactor(r.pitch);
  const notes = [];
  const size = r.rafter ?? "2x8", hipSize = r.hip ?? size;
  if (!(hipSize in DEPTH)) return { ok: false, errors: [`Unknown hip size ${hipSize}.`] };
  if (!plan.stock.some((s) => s.size === hipSize)) return { ok: false, errors: [`No ${hipSize} boards listed in the stock.`] };
  const longestOf = (sz) => Math.max(...plan.stock.filter((s) => s.size === sz).map((s) => s.length));
  const ridgeT = r.ridge ? THICK : 0;
  const half = W / 2;
  const commonLen = Math.round((half - ridgeT / 2 + overhang) * k * 16) / 16;
  // hip: plan run (half + overhang) x sqrt 2, rise per unit run pitch/12 -> length sqrt(2 + (pitch/12)^2) per unit of side run
  const hipLen = Math.round((half + overhang) * Math.sqrt(2 + (r.pitch / 12) ** 2) * 16) / 16;
  const slope = (half + overhang) * k, rise = half * r.pitch / 12;
  if (commonLen > longestOf(size) + EPS) return { ok: false, errors: [`A ${formatLength(commonLen)} common rafter is longer than the longest ${size} listed (${formatLength(longestOf(size))}). List longer boards, shorten the overhang, or lower the pitch.`] };
  if (hipLen > longestOf(hipSize) + EPS) return { ok: false, errors: [`A ${formatLength(hipLen)} hip rafter is longer than the longest ${hipSize} listed (${formatLength(longestOf(hipSize))}). List longer boards or shorten the overhang.`] };

  // commons: from the ridge-end rafter at `half` (from the end wall) to the other, on multiples of the spacing from the wall
  const centres = [half];
  for (let c = Math.ceil((half + 1) / spacing) * spacing; c < L - half - 9; c += spacing) if (c > half + 9) centres.push(c); // a grid point within 9 in of an end rafter is dropped
  if (L - half > half + EPS) centres.push(L - half);
  const rafters = [];
  for (const c of centres) for (const side of ["left", "right"]) rafters.push({ x: c - THICK / 2, side, length: commonLen, size });
  for (const end of ["start", "end"]) rafters.push({ end, side: "end", length: commonLen, size });
  // jacks: distance d from the corner along the eave, while the jack still has run left before the common
  const jackLen = (d) => Math.round((d + overhang - THICK / 2 * Math.SQRT2) * k * 16) / 16;
  const jackDs = [];
  for (let d = spacing; d < half - THICK; d += spacing) jackDs.push(d);
  const jacks = [];
  for (let corner = 0; corner < 4; corner++) for (const plane of ["long", "end"]) for (const d of jackDs) jacks.push({ corner, plane, d, length: jackLen(d), size });
  if (jackDs.length && jackLen(jackDs[0]) < 6) notes.push("The shortest jack is under 6 in; it is cut but may be better as a block.");
  const hips = [0, 1, 2, 3].map((corner) => ({ corner, length: hipLen, size: hipSize }));
  const ridges = [];
  const ridgeRun = L - W;
  if (r.ridge && ridgeRun > EPS) {
    const rl = longestOf(r.ridge);
    for (const len of splitOnCentres(ridgeRun, rl, centres.map((c) => c - half))) ridges.push({ length: len, size: r.ridge });
  }
  if (r.hip == null && DEPTH[size] != null) notes.push(`Hips are ${hipSize}, as the rafters; a hip is normally one size deeper than the rafters so the cuts bear (set \`hip\`).`);
  const ceilingJoists = [];
  const jc = [THICK / 2];
  for (let c = spacing; c < L - THICK / 2 - THICK - 3; c += spacing) jc.push(c);
  jc.push(L - THICK / 2);
  if (r.ceilingJoist) { const res = ceilingJoistRows(r, plan, jc, notes); if (res.error) return { ok: false, errors: [res.error] }; ceilingJoists.push(...res.rows); }
  const collarTies = [];
  if (r.collarTies) {
    const drop = r.collarDrop ?? 24;
    const len = Math.round((ridgeT + 2 * drop * 12 / r.pitch) * 16) / 16;
    if (len < W - 1) for (let i = 0; i < centres.length; i += 2) collarTies.push({ x: centres[i] - THICK / 2, length: len, size: "2x4" });
    else notes.push("The collar tie would be as long as the building is wide; lower the drop or skip them.");
  }

  // Planes: 2 long trapezoids (eave L + 2 oh, ridge L - W) and 2 end triangles/trapezoids (eave W + 2 oh, ridge 0 at a hip end).
  const planes = [
    { name: "long", count: 2, eave: L + 2 * overhang },
    { name: "end", count: 2, eave: W + 2 * overhang },
  ];
  const sheet = { ...SHEET, price: 1, kerf: plan.kerf ?? 0.125, ...(r.sheet || {}) };
  const courses = [];
  const nFull = Math.floor((slope + EPS) / sheet.width), rest = slope - nFull * sheet.width;
  for (const p of planes) {
    for (let c = 0; c < nFull + (rest > EPS ? 1 : 0); c++) {
      const y = c * sheet.width, width = c < nFull ? sheet.width : rest;
      const bottom = p.eave - 2 * (y / k); // the diagonal hip cuts shorten both ends by the run gained
      const pieces = [];
      let left = bottom;
      while (left > EPS) { const len = Math.min(left, sheet.length); pieces.push({ length: len }); left -= len; }
      courses.push({ plane: p.name, count: p.count, y, width, pieces });
    }
  }
  let sheets = 0, ripped = 0;
  const sheetRows = [];
  for (const w of [...new Set(courses.map((c) => c.width))]) {
    const ps = courses.filter((c) => Math.abs(c.width - w) < EPS).flatMap((c) => Array.from({ length: c.count }, () => c.pieces).flat());
    const perSheet = Math.max(1, Math.floor((sheet.width + sheet.kerf) / (w + sheet.kerf)));
    const res = optimizeStock(ps.map((p) => ({ length: p.length, qty: 1 })), [{ length: sheet.length, price: 1 }], sheet.kerf);
    const need = Math.ceil(res.bars.length / perSheet);
    sheets += need;
    if (w < sheet.width - EPS) ripped += need;
    sheetRows.push({ width: w, count: need, pieces: ps.length });
  }
  const trapezoid = (eave, ridge) => (eave + ridge) / 2 * slope;
  const area = (2 * trapezoid(L + 2 * overhang, L - W) + 2 * trapezoid(W + 2 * overhang, 0)) / 144; // sq ft; each plane's ridge edge is the span L-W (long) or a point (end)
  const sheetArea = (sheet.width * sheet.length) / 144;
  const g = { waste: 1.15, bundlesPerSquare: 3, underlaymentRoll: 400, ridgeBundleFeet: 33, starterBundleFeet: 100, dripEdgePiece: 120, ...(r.roofing || {}) };
  const squares = area / 100;
  const eaveFeet = (2 * L + 2 * W + 8 * overhang) / 12;
  const hipFeet = 4 * hipLen / 12;
  const ridgeFeet = ridgeRun / 12 + hipFeet;
  const roofing = {
    squares, shingleBundles: Math.ceil(squares * g.waste * g.bundlesPerSquare - 1e-9),
    underlaymentRolls: Math.ceil(area * g.waste / g.underlaymentRoll - 1e-9),
    dripEdgePieces: Math.ceil(eaveFeet * 12 / g.dripEdgePiece - 1e-9),
    ridgeBundles: Math.ceil(ridgeFeet / g.ridgeBundleFeet - 1e-9),
    starterBundles: Math.ceil(eaveFeet / g.starterBundleFeet - 1e-9),
    eaveFeet, rakeFeet: 0, ridgeFeet, hipFeet, assumptions: g,
  };
  if (rest > EPS) notes.push(`The top course of each plane is ${formatInches(rest)} wide, ripped from ${ripped} sheet${ripped === 1 ? "" : "s"}.`);
  notes.push("Hip sheathing counts each course by its bottom length (the longest piece, cut diagonally at both ends) and does not reuse the triangular offcuts, so the sheet count is an upper bound; end joints are not placed over rafters.");
  if (r.pitch < 4) notes.push("Under 4:12 most shingle makers need a low-slope underlayment and special installation; check the product's rules.");
  notes.push("Common, jack and hip sizes, spacing, the ridge, collar ties and ceiling joists are your inputs and are not checked against a span table or code; the hip's backing and side bevels, birdsmouth depth, hurricane ties and bracing are not in the takeoff. Jacks are measured to the hip's face (half its thickness off the run).");
  notes.push("Shingle, felt, ridge and hip-cap quantities use the coverage in `roofing` (15% waste for a hip roof) and ignore vents, flashing and nails.");
  return {
    ok: true, shape: "hip", id, width: W, length: L, pitch: r.pitch, overhang, gableOverhang: 0, spacing, rafterSize: size, hipSize,
    rafterLength: commonLen, hipLength: hipLen, slope, rise, centres, rafters, hips, jacks, ridges, ceilingJoists, collarTies, trusses: null, courses,
    sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 },
    roofing, notes,
  };
}

/**
 * Lay out one gable roof.
 * @param {Roof} r
 * @param {{ stock: { size: string, length: number, price: number }[], kerf?: number }} plan
 */
export function layoutRoof(r, plan) {
  const errors = validateRoof(r, plan);
  if (errors.length) return { ok: false, errors };
  if (r.shape === "hip") return layoutHip(r, plan);
  const id = r.id || "Roof";
  const overhang = r.overhang ?? 12, rake = r.gableOverhang ?? 12, spacing = r.spacing ?? 16;
  const k = slopeFactor(r.pitch);
  const notes = [];
  const truss = !!r.trusses;
  const ridgeT = !truss && r.ridge ? THICK : 0;
  const run = r.width / 2 - ridgeT / 2;
  const rafterLength = Math.round((run + overhang) * k * 16) / 16;
  const planeLength = r.length + 2 * rake; // along the ridge, rake to rake
  const slope = (r.width / 2 + overhang) * k; // eave to ridge, along the roof
  const rise = (r.width / 2) * r.pitch / 12;
  // rafter (or truss) centres from the first gable wall: one at each end, others on multiples of the spacing
  const sp = truss ? (r.trusses?.spacing ?? 24) : spacing;
  const centres = [THICK / 2];
  for (let c = sp; c < r.length - THICK / 2 - THICK - 3; c += sp) centres.push(Math.round(c * 16) / 16);
  centres.push(r.length - THICK / 2);
  // centres measured on the plane (rake overhang before the first one)
  const planeCentres = centres.map((c) => c + rake);

  const rafters = [], ridges = [], ceilingJoists = [], collarTies = [];
  const trusses = truss ? { count: centres.length, spacing: sp, span: r.width, price: r.trusses?.price ?? 0 } : null;
  if (!truss) {
    const size = r.rafter ?? "2x8";
    const longest = Math.max(...plan.stock.filter((s) => s.size === size).map((s) => s.length));
    if (rafterLength > longest + EPS) return { ok: false, errors: [`A ${formatLength(rafterLength)} rafter is longer than the longest ${size} listed (${formatLength(longest)}). List longer boards, shorten the overhang, steepen the pitch less, or use trusses (roof.trusses).`] };
    for (const c of centres) for (const side of ["left", "right"]) rafters.push({ x: c - THICK / 2, side, length: rafterLength, size });
    if (r.ridge) {
      const rl = Math.max(...plan.stock.filter((s) => s.size === r.ridge).map((s) => s.length));
      for (const len of splitOnCentres(planeLength, rl, planeCentres)) ridges.push({ length: len, size: r.ridge });
      if (!(DEPTH[r.ridge] >= DEPTH[size])) notes.push(`The ${r.ridge} ridge is shallower than the ${size} rafters, so the plumb cut will not bear on it; use a ridge at least as deep.`);
    }
    if (r.ceilingJoist) { const res = ceilingJoistRows(r, plan, centres, notes); if (res.error) return { ok: false, errors: [res.error] }; ceilingJoists.push(...res.rows); }
    if (r.collarTies) {
      const drop = r.collarDrop ?? 24; // vertical, from the ridge's top down to the tie
      const len = Math.round((ridgeT + 2 * drop * 12 / r.pitch) * 16) / 16;
      if (len < r.width - 1) for (let i = 0; i < centres.length; i += 2) collarTies.push({ x: centres[i] - THICK / 2, length: len, size: "2x4" });
      else notes.push("The collar tie would be as long as the building is wide; lower the drop or skip them.");
    }
  }

  // Sheathing: each plane is `planeLength` along the ridge by `slope` up the roof, in 4 ft courses from the eave.
  const sheet = { ...SHEET, price: 1, kerf: plan.kerf ?? 0.125, ...(r.sheet || {}) };
  const nFull = Math.floor((slope + EPS) / sheet.width);
  const rest = slope - nFull * sheet.width;
  /** @type {{y: number, width: number, pieces: {x: number, length: number}[]}[]} */
  const courses = [];
  for (let c = 0; c < nFull + (rest > EPS ? 1 : 0); c++) {
    const width = c < nFull ? sheet.width : rest;
    const lead = c % 2 ? planeCentres.filter((x) => x <= sheet.length / 2 + EPS).pop() : 0;
    const cuts = [];
    let at = lead || 0;
    if (lead) cuts.push(lead);
    while (planeLength - at > sheet.length + EPS) {
      const next = planeCentres.filter((x) => x > at + 12 && x <= at + sheet.length + EPS).pop();
      cuts.push(next ?? at + sheet.length);
      at = cuts[cuts.length - 1];
    }
    const pieces = [];
    let prev = 0;
    for (const x of [...cuts, planeLength]) { pieces.push({ x: prev, length: x - prev }); prev = x; }
    courses.push({ y: c * sheet.width, width, pieces });
  }
  let sheets = 0, ripped = 0;
  const sheetRows = [];
  for (const w of [...new Set(courses.map((c) => c.width))]) {
    const ps = courses.filter((c) => Math.abs(c.width - w) < EPS).flatMap((c) => c.pieces);
    const perSheet = Math.max(1, Math.floor((sheet.width + sheet.kerf) / (w + sheet.kerf)));
    const res = optimizeStock([...ps, ...ps].map((p) => ({ length: p.length, qty: 1 })), [{ length: sheet.length, price: 1 }], sheet.kerf); // two planes
    const need = Math.ceil(res.bars.length / perSheet);
    sheets += need;
    if (w < sheet.width - EPS) ripped += need;
    sheetRows.push({ width: w, count: need, pieces: ps.length * 2 });
  }
  const area = 2 * planeLength * slope / 144;
  const sheetArea = (sheet.width * sheet.length) / 144;

  // Roofing: squares of 100 sq ft; the waste factor, bundles per square, felt roll and trim coverage are inputs.
  const g = { waste: 1.1, bundlesPerSquare: 3, underlaymentRoll: 400, ridgeBundleFeet: 33, starterBundleFeet: 100, dripEdgePiece: 120, ...(r.roofing || {}) };
  const squares = area / 100;
  const eaveFeet = 2 * planeLength / 12;
  const rakeFeet = 4 * slope / 12;
  const ridgeFeet = planeLength / 12;
  const roofing = {
    squares, shingleBundles: Math.ceil(squares * g.waste * g.bundlesPerSquare - 1e-9),
    underlaymentRolls: Math.ceil(area * g.waste / g.underlaymentRoll - 1e-9),
    dripEdgePieces: Math.ceil((eaveFeet + rakeFeet) * 12 / g.dripEdgePiece - 1e-9),
    ridgeBundles: Math.ceil(ridgeFeet / g.ridgeBundleFeet - 1e-9),
    starterBundles: Math.ceil(eaveFeet / g.starterBundleFeet - 1e-9),
    eaveFeet, rakeFeet, ridgeFeet, assumptions: g,
  };
  if (rest > EPS) notes.push(`The top course of each plane is ${formatInches(rest)} wide, ripped from ${ripped} sheet${ripped === 1 ? "" : "s"}; its offcut is not carried to the other plane.`);
  if (r.pitch < 4) notes.push("Under 4:12 most shingle makers need a low-slope underlayment and special installation; check the product's rules.");
  if (truss) notes.push(`${trusses.count} trusses of ${formatLength(r.width)} span at ${sp} o.c. are a purchased line from the truss maker's drawings; the rake overhang, the truss design and the bracing are theirs and the engineer's.`);
  else notes.push("Rafter size, spacing, the ridge, collar ties and ceiling joists are your inputs and are not checked against a span table or code; hurricane ties and bracing are not in the takeoff.");
  notes.push("Shingle, felt, drip edge and ridge quantities use the coverage in `roofing` and ignore valleys, hips, vents, flashing and nails.");
  const bm = truss ? null : birdsmouth(r.rafter ?? "2x8", r.pitch, r.plateWidth, r.maxNotchFraction);
  if (bm && !bm.ok) notes.push(`The birdsmouth on a ${bm.size} at ${r.pitch}:12 over a ${formatInches(bm.bearing)} plate is ${formatInches(bm.notch)} deep, ${(100 * bm.fraction).toFixed(0)}% of the rafter against your ${(100 * bm.maxFraction).toFixed(0)}% limit; the seat can bear at most ${formatInches(bm.maxBearing)}. Use a deeper rafter, a narrower seat with a raised heel, or trusses.`);
  const out = {
    ok: true, id, birdsmouth: bm, width: r.width, length: r.length, pitch: r.pitch, overhang, gableOverhang: rake, spacing: sp, rafterSize: truss ? null : r.rafter ?? "2x8",
    rafterLength: truss ? null : rafterLength, slope, rise, centres, rafters, ridges, ceilingJoists, collarTies, trusses, courses,
    sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 },
    roofing, notes,
  };
  let laid = out;
  for (const w of [r.wing, r.wing2]) if (w && laid.ok !== false) laid = addWing(laid, r, plan, w);
  return laid;
}

/**
 * Add a cross wing (an L- or T-shaped plan) to a laid-out gable roof: same pitch, narrower than the main roof.
 * Plan coordinates: u runs along the wing's axis from its gable end (u = 0) to the main wall (u = projection);
 * the wing's ridge meets the main roof where its rise equals the main roof's, half a wing-width inside the main
 * wall. Each valley runs from where the two eave lines cross to that point, 45 degrees in plan, so its length is
 * (wing half-width + overhang) x sqrt(2 + (pitch/12)^2). Wing commons stand on the spacing from the gable end
 * while the wing's eave is clear of the main eave line; past it each station is a valley jack to the valley on
 * both sides; main-roof rafters that meet the wing run from the main ridge to the valley instead of the eave.
 */
function addWing(base, r, plan, w) {
  const overhang = base.overhang, rake = base.gableOverhang, sp = base.spacing, k = slopeFactor(r.pitch);
  const wp = w.pitch ?? r.pitch, kw = slopeFactor(wp), s = wp / r.pitch; // s: wing pitch over main pitch
  const size = base.rafterSize;
  const side = w.side ?? "right", at = w.at ?? r.length / 2;
  const hw = w.width / 2, P = w.projection;
  const ridgeT = r.ridge ? THICK : 0;
  const valleySize = w.valley ?? size;
  const longestOf = (sz) => Math.max(...plan.stock.filter((s) => s.size === sz).map((s) => s.length));
  const reach = hw + overhang; // run from wing ridge to wing eave
  // The valley is where the two planes meet. The wing ridge ends on the main plane e inside the main wall (e = hw x s);
  // the valley runs out to whichever eave line it reaches first, at lateral distance yEnd from the wing's axis:
  // plan legs yEnd (across) and yEnd x s (along), drop yEnd x wp/12. With equal pitches yEnd = reach and it is 45 degrees.
  const e = hw * s, yEnd = Math.min(reach, hw + overhang / s);
  const commonLen = Math.round((hw - ridgeT / 2 + overhang) * kw * 16) / 16;
  const valleyLen = Math.round(yEnd * Math.sqrt(1 + s * s + (wp / 12) ** 2) * 16) / 16;
  if (commonLen > longestOf(size) + EPS) return { ok: false, errors: [`A ${formatLength(commonLen)} wing rafter is longer than the longest ${size} listed (${formatLength(longestOf(size))}).`] };
  if (valleyLen > longestOf(valleySize) + EPS) return { ok: false, errors: [`A ${formatLength(valleyLen)} valley rafter is longer than the longest ${valleySize} listed (${formatLength(longestOf(valleySize))}). List longer boards or narrow the wing.`] };
  // a jack's run is cut back by the valley's half thickness measured square to the jack; the valley is 45 degrees only at equal pitch
  const wingJackLen = (run) => Math.round((run - THICK / 2 * Math.sqrt(1 + 1 / (s * s))) * kw * 16) / 16;
  const mainJackLen = (run) => Math.round((run - THICK / 2 * Math.sqrt(1 + s * s)) * k * 16) / 16;
  // wing stations from the gable end: commons while clear of the valleys, valley jacks after
  const eaveU = P - overhang * Math.min(1, s), ridgeEnd = P + e;
  const uCentres = [THICK / 2];
  for (let u = sp; u < ridgeEnd - THICK - 3; u += sp) uCentres.push(Math.round(u * 16) / 16);
  const wingRafters = [], wingJacks = [], wingNotes = [];
  for (const u of uCentres) {
    if (u <= eaveU + EPS) { for (const sd of ["left", "right"]) wingRafters.push({ u, side: sd, length: commonLen, size, kind: "wing rafter" }); continue; }
    const run = (ridgeEnd - u) / s - ridgeT / 2;
    for (const sd of ["left", "right"]) wingJacks.push({ u, side: sd, length: wingJackLen(run), size, kind: "valley jack rafter" });
  }
  // wing ceiling joists span the wing's width on the wing stations that fall on its walls (u short of the main wall)
  const wingCeilingJoists = [];
  if (r.ceilingJoist) {
    const res = ceilingJoistRows(r, plan, uCentres.filter((u) => u < P - THICK), wingNotes, w.width, "Wing ceiling joists are ");
    if (res.error) return { ok: false, errors: [res.error] };
    wingCeilingJoists.push(...res.rows);
  }
  // wing collar ties: every other pair of wing commons, the same height rule as the main roof's (jack pairs end at a valley, so none)
  const wingCollarTies = [];
  if (r.collarTies) {
    const drop = r.collarDrop ?? 24;
    const len = Math.round((ridgeT + 2 * drop * 12 / wp) * 16) / 16;
    if (len < w.width - 1) { const commons = uCentres.filter((u) => u <= eaveU + EPS); for (let i = 0; i < commons.length; i += 2) wingCollarTies.push({ u: commons[i], length: len, size: "2x4" }); }
    else wingNotes.push("The wing collar tie would be as long as the wing is wide; lower the drop or skip them.");
  }
  const valleys = [0, 1].map((i) => ({ side: i ? "right" : "left", length: valleyLen, size: valleySize, kind: "valley rafter" }));
  // valley backing: a board the valley's length and size laid on each valley so the jacks have a face to nail to
  const valleyBacking = r.valleyBacking ? valleys.map((v) => ({ ...v, kind: "valley backing" })) : [];
  const wingRidges = [];
  if (r.ridge) {
    const rl = longestOf(r.ridge);
    for (const len of splitOnCentres(P + e + rake, rl, uCentres.map((c) => c + rake))) wingRidges.push({ length: len, size: r.ridge });
  }
  // main rafters that meet the wing end at the valley instead of the eave
  let interrupted = 0;
  const rafters = base.rafters.map((x) => {
    if (x.kind) return x;
    const dv = Math.abs(x.x + THICK / 2 - at);
    if (x.side !== side || dv >= yEnd - EPS) return x;
    interrupted++;
    const run = r.width / 2 - ridgeT / 2 - (hw - dv) * s;
    return { ...x, length: mainJackLen(run), kind: "valley jack rafter" };
  });
  // sheathing: the wing's two planes by course, each piece counted at its longer (top) edge: an upper bound
  const sheet = { ...SHEET, price: 1, kerf: plan.kerf ?? 0.125, ...(r.sheet || {}) };
  const wslope = reach * kw;
  const nFull = Math.floor((wslope + EPS) / sheet.width), rest = wslope - nFull * sheet.width;
  const wingCourses = [];
  for (let c = 0; c < nFull + (rest > EPS ? 1 : 0); c++) {
    const y = c * sheet.width, width = c < nFull ? sheet.width : rest;
    const len = rake + P + Math.max(-overhang, ((y + width) / kw - overhang) * s); // the course's top edge meets the valley ((y + width) / kw up the plane) or the main eave line
    const pieces = [];
    for (let left = len; left > EPS; left -= sheet.length) pieces.push({ length: Math.min(left, sheet.length) });
    wingCourses.push({ plane: "wing", count: 2, y, width, pieces });
  }
  // The wing's plane replaces the main plane's sheathing between the valleys. In the main plane the covered half-width at a
  // plan run x from the eave edge is min(yEnd, (xEnd - x) / s), with xEnd = e + overhang where the wing ridge meets the plane.
  // A main course loses the width covered at its top (narrowest) edge, centred on the wing; what is left is re-pieced.
  // The ragged triangle beside each valley stays in the main course (it is cut from a whole piece), so this stays a mild upper bound.
  const planeCourses = base.planeCourses ?? { left: base.courses.map((c) => ({ ...c })), right: base.courses.map((c) => ({ ...c })) };
  const xEnd = e + overhang, centre = at + rake;
  planeCourses[side] = planeCourses[side].map((c) => {
    const xt = (c.y + c.width) / k;
    const cw = Math.max(0, Math.min(yEnd, (xEnd - xt) / s));
    if (cw <= EPS) return c;
    const lo = centre - cw, hi = centre + cw, pieces = [];
    for (const p of c.pieces) {
      const p0 = p.x, p1 = p.x + p.length;
      if (p0 < lo - EPS) pieces.push({ x: p0, length: Math.min(p1, lo) - p0 });
      if (p1 > hi + EPS) pieces.push({ x: Math.max(p0, hi), length: p1 - Math.max(p0, hi) });
    }
    return { ...c, pieces };
  });
  let sheets = 0;
  const sheetRows = [];
  const poolWidths = [...new Set([...planeCourses.left, ...planeCourses.right, ...wingCourses].map((c) => c.width))];
  for (const wd of poolWidths) {
    const ps = [...planeCourses.left, ...planeCourses.right].filter((c) => Math.abs(c.width - wd) < EPS).flatMap((c) => c.pieces)
      .concat(wingCourses.filter((c) => Math.abs(c.width - wd) < EPS).flatMap((c) => Array.from({ length: c.count }, () => c.pieces).flat()));
    const perSheet = Math.max(1, Math.floor((sheet.width + sheet.kerf) / (wd + sheet.kerf)));
    const res = optimizeStock(ps.map((p) => ({ length: p.length, qty: 1 })), [{ length: sheet.length, price: 1 }], sheet.kerf);
    const need = Math.ceil(res.bars.length / perSheet);
    sheets += need;
    sheetRows.push({ width: wd, count: need, pieces: ps.length, wing: wingCourses.some((c) => Math.abs(c.width - wd) < EPS) });
  }
  // area: the two wing planes (plan length rake + P + valley position, integrated across the reach) less the main-plane strip they cover
  const yKink = hw + overhang / s, m = Math.min(reach, yKink);
  const wingPlan = 2 * ((rake + P) * reach + s * (hw * m - m * m / 2) - overhang * (reach - m));
  const mainCovered = 2 * (s * (hw * yEnd - yEnd * yEnd / 2) + overhang * yEnd);
  const area = base.sheets.area + (wingPlan * kw - mainCovered * k) / 144;
  const sheetArea = (sheet.width * sheet.length) / 144;
  const g = base.roofing.assumptions;
  const squares = area / 100;
  const eaveFeet = base.roofing.eaveFeet + (2 * (eaveU + rake) - (w.width + 2 * overhang)) / 12;
  const rakeFeet = base.roofing.rakeFeet + 2 * wslope / 12;
  const valleyFeet = (base.roofing.valleyFeet ?? 0) + 2 * valleyLen / 12;
  const ridgeFeet = base.roofing.ridgeFeet + (P + e + rake) / 12;
  const roofing = {
    squares, shingleBundles: Math.ceil(squares * g.waste * g.bundlesPerSquare - 1e-9),
    underlaymentRolls: Math.ceil(area * g.waste / g.underlaymentRoll - 1e-9),
    dripEdgePieces: Math.ceil((eaveFeet + rakeFeet) * 12 / g.dripEdgePiece - 1e-9),
    ridgeBundles: Math.ceil(ridgeFeet / g.ridgeBundleFeet - 1e-9),
    starterBundles: Math.ceil(eaveFeet / g.starterBundleFeet - 1e-9),
    eaveFeet, rakeFeet, ridgeFeet, valleyFeet, assumptions: g,
  };
  const notes = base.notes.filter((n) => !/ignore valleys, hips/.test(n) && !/^Wing sheathing counts/.test(n));
  notes.push(...wingNotes);
  notes.push(`${base.wing ? "Second cross wing" : "Cross wing"} ${formatLength(w.width)} wide, ${formatLength(P)} out from the main wall, centred ${formatLength(at)} along the ridge on the ${side} side: ${wingRafters.length} wing rafters, ${wingJacks.length + interrupted} valley jacks (${interrupted} of them main-roof rafters cut short at the valley), 2 ${valleySize} valleys of ${formatInches(valleyLen)}, a ${formatLength(P + e + rake)} wing ridge. The wing is ${wp}:12 against the main roof's ${r.pitch}:12, so its ridge meets the main roof ${formatLength(e)} inside the main wall.`);
  if (!w.valley) notes.push(`Valleys are ${valleySize}, as the rafters; a valley is normally one size deeper so the jacks bear on its face (set \`wing.valley\`).`);
  notes.push("Wing sheathing counts each course at its longer edge, and each main course is shortened by the width the wing covers at the course's top edge (the triangles beside the valleys stay whole), so the sheet count is a mild upper bound. Wing collar ties follow the main roof's rule (every other pair of wing commons); valley backing is framed only when `valleyBacking` is set (one board per valley, valley length and size, no bevel rip or lap), nor saddles, the main wall's extra header or the wing's own plates; valley flashing length is `roofing.valleyFeet`.");
  const info = { width: w.width, projection: P, at, side, pitch: wp, eaveLineRun: Math.round((rake + P + e - yEnd * s) * 16) / 16, yEnd, rakeRun: Math.round(reach * kw * 16) / 16, valleySize, valleyLength: valleyLen, rafters: wingRafters.length, jacks: wingJacks.length, valleys: valleys.length, ridges: wingRidges.length, collarTies: wingCollarTies.length };
  const cat = (a, b) => [...(a || []), ...b];
  return { ...base, rafters, wing: base.wing ?? info, wings: [...(base.wings || []), info], wingRafters: cat(base.wingRafters, wingRafters), wingJacks: cat(base.wingJacks, wingJacks), wingCeilingJoists: cat(base.wingCeilingJoists, wingCeilingJoists), wingCollarTies: cat(base.wingCollarTies, wingCollarTies), valleys: cat(base.valleys, valleys), valleyBacking: cat(base.valleyBacking, valleyBacking), wingRidges: cat(base.wingRidges, wingRidges), wingCentres: base.wingCentres ?? uCentres, valleyLength: base.valleyLength ?? valleyLen, courses: [...base.courses, ...wingCourses], planeCourses, sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 }, roofing, notes };
}

/** Cut rows in the engine's shape, so `takeoff(plan, roofCuts(layout))` buys roof lumber with the walls'. */
export function roofCuts(l) {
  if (!l.ok) return [];
  const map = new Map();
  const add = (size, length, kind) => {
    const len = Math.round(length * 16) / 16;
    const key = `${size}|${len}|${kind}`;
    const row = map.get(key) || { size, length: len, kind, qty: 0, walls: [l.id] };
    row.qty++;
    map.set(key, row);
  };
  for (const x of l.rafters) add(x.size, x.length, x.kind || "rafter");
  for (const x of [...(l.wingRafters || []), ...(l.wingJacks || []), ...(l.valleys || []), ...(l.valleyBacking || [])]) add(x.size, x.length, x.kind);
  for (const x of l.wingRidges || []) add(x.size, x.length, "ridge board");
  for (const x of l.hips || []) add(x.size, x.length, "hip rafter");
  for (const x of l.jacks || []) add(x.size, x.length, "jack rafter");
  for (const x of l.ridges) add(x.size, x.length, "ridge board");
  for (const x of [...l.ceilingJoists, ...(l.wingCeilingJoists || [])]) add(x.size, x.length, "ceiling joist");
  for (const x of [...l.collarTies, ...(l.wingCollarTies || [])]) add(x.size, x.length, "collar tie");
  return [...map.values()];
}

export function roofText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.length)}, ${l.pitch}:12 pitch, ${formatInches(l.overhang)} eave${l.shape === "hip" ? "" : ` and ${formatInches(l.gableOverhang)} rake`} overhang${l.shape === "hip" ? " (hip)" : ""}`];
  out.push(`  Roof rises ${formatInches(l.rise)} over the plates; each plane is ${formatInches(l.slope)} up the slope.`);
  if (l.shape === "hip") out.push(`  Hip roof: ${l.rafters.length} common rafters of ${formatInches(l.rafterLength)}, ${l.hips.length} ${l.hipSize} hips of ${formatInches(l.hipLength)}, ${l.jacks.length} jack rafters (${l.jacks.length ? `${formatInches(Math.min(...l.jacks.map((j) => j.length)))} to ${formatInches(Math.max(...l.jacks.map((j) => j.length)))}` : "none"}), ${l.ridges.length} ridge board${l.ridges.length === 1 ? "" : "s"}${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  else if (l.trusses) out.push(`  ${l.trusses.count} trusses, ${formatLength(l.trusses.span)} span, at ${l.spacing} o.c. (purchased)`);
  else if (l.birdsmouth) out.push(`  Birdsmouth: ${formatInches(l.birdsmouth.bearing)} seat, ${formatInches(l.birdsmouth.plumb)} plumb cut (${formatInches(l.birdsmouth.notch)} square to the edge, ${(100 * l.birdsmouth.fraction).toFixed(0)}% of the ${l.birdsmouth.size}; limit ${(100 * l.birdsmouth.maxFraction).toFixed(0)}% = ${formatInches(l.birdsmouth.maxBearing)} of bearing)`);
  if (l.shape !== "hip" && !l.trusses) out.push(`  ${l.rafters.length} ${l.rafterSize} rafters of ${formatInches(l.rafterLength)} at ${l.spacing} o.c., ${l.ridges.length} ridge board${l.ridges.length === 1 ? "" : "s"}${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  for (const wg of l.wings || []) out.push(`  Cross wing ${formatLength(wg.width)} x ${formatLength(wg.projection)}: ${wg.rafters} wing rafters, ${wg.jacks} valley jacks, ${wg.valleys} ${wg.valleySize} valleys of ${formatInches(wg.valleyLength)}, ${wg.ridges} wing ridge board${wg.ridges === 1 ? "" : "s"}${wg.collarTies ? `, ${wg.collarTies} wing collar ties` : ""}`);
  if (l.wing) out.push(`  ${l.rafters.filter((x) => x.kind).length} main rafters end at a valley`);
  out.push(`  Roof sheathing: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    ${c.plane ? `${c.plane} planes, ` : ""}course at ${formatLength(c.y)} up the slope (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length)).join(" + ")}`);
  const g = l.roofing;
  out.push(`  Roofing: ${g.squares.toFixed(1)} squares -> ${g.shingleBundles} bundles of shingles, ${g.underlaymentRolls} rolls of underlayment, ${g.dripEdgePieces} drip edge pieces, ${g.ridgeBundles} ridge cap and ${g.starterBundles} starter bundles`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
