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

/** @typedef {{ id?: string, shape?: "gable" | "hip" | "lshape", hip?: string, valley?: string, wing?: { width: number, projection: number, at?: number }, width: number, length: number, pitch: number, overhang?: number, gableOverhang?: number, rafter?: string, spacing?: number, ridge?: string | null, ceilingJoist?: string, ceilingBearing?: number, collarTies?: boolean, collarDrop?: number, trusses?: { spacing?: number, price?: number }, sheet?: { length?: number, width?: number, price?: number, kerf?: number }, roofing?: { waste?: number, bundlesPerSquare?: number, underlaymentRoll?: number, ridgeBundleFeet?: number, starterBundleFeet?: number, dripEdgePiece?: number } }} Roof */

export function sampleRoof() {
  return { id: "Main roof", width: 336, length: 480, pitch: 4, overhang: 12, gableOverhang: 12, rafter: "2x8", spacing: 16, ridge: "2x10", ceilingJoist: "2x6", collarTies: true };
}

/** Slope length per inch of run: sqrt(1 + (pitch/12)^2). */
export const slopeFactor = (/** @type {number} */ pitch) => Math.sqrt(1 + (pitch / 12) ** 2);

/** @param {Roof} r @param {{stock: {size: string, length: number}[]}} plan */
export function validateRoof(r, plan) {
  const errors = [];
  if (!(r.width >= 96 && r.width <= 1200)) errors.push("Roof width (eave to eave) must be between 8 ft and 100 ft.");
  if (!(r.length >= 48 && r.length <= 2400)) errors.push("Roof length (along the ridge) must be between 4 ft and 200 ft.");
  if (!(r.pitch >= 1 && r.pitch <= 24)) errors.push("Pitch is rise in 12 of run, between 1 and 24.");
  if (!(((r.overhang ?? 12) >= 0) && ((r.overhang ?? 12) <= 48))) errors.push("Eave overhang must be between 0 and 48 inches.");
  if (!(((r.gableOverhang ?? 12) >= 0) && ((r.gableOverhang ?? 12) <= 48))) errors.push("Gable (rake) overhang must be between 0 and 48 inches.");
  if (!(((r.spacing ?? 16) > 0) && ((r.spacing ?? 16) <= 48))) errors.push("Rafter spacing must be between 0 and 48 inches.");
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
function ceilingJoistRows(r, plan, centres, notes) {
  const rows = [];
  const cl = Math.max(...plan.stock.filter((s) => s.size === r.ceilingJoist).map((s) => s.length));
  if (r.width <= cl + EPS) for (const c of centres) rows.push({ x: c - THICK / 2, length: r.width, size: r.ceilingJoist });
  else {
    // too long for one board: two pieces lapped 6 in over an interior bearing wall `ceilingBearing` from the left eave (default mid-span)
    const mid = r.ceilingBearing ?? r.width / 2;
    const pieces = [mid + 3, r.width - mid + 3];
    if (pieces.some((p) => p > cl + EPS)) return { error: `A ${formatLength(Math.max(...pieces))} ceiling joist piece is longer than the longest ${r.ceilingJoist} listed (${formatLength(cl)}); list longer boards or move the bearing wall.` };
    for (const c of centres) for (const p of pieces) rows.push({ x: c - THICK / 2, length: p, size: r.ceilingJoist });
    notes.push(`Ceiling joists are two pieces lapped 6 in over an interior bearing wall ${formatLength(mid)} from the left eave; the wall, the lap nailing and the load path are yours and the engineer's.`);
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
 * An L-shaped roof (`shape: "lshape"`): a main gable roof with a gable wing of the same pitch that projects
 * `wing.projection` from one eave wall (outside face to the wing's gable wall), centred `wing.at` from the main
 * roof's first gable wall (default the middle). The wing's ridge meets the main roof plane half the wing
 * width inside the main eave wall, and the two valleys run at 45 degrees in plan from that meeting point to the
 * inside corners of the eave overhang lines. Equal pitch makes every length closed-form: a valley is
 * (wing/2 + overhang) x sqrt(2 + (pitch/12)^2); a valley jack on either plane has a horizontal run that grows with
 * its distance from the junction; total plan area is the main rectangle plus the wing's rectangle beyond the eave line.
 * @param {Roof} r
 */
function layoutLShape(r, plan) {
  const id = r.id || "Roof";
  const w = r.wing;
  const errors = [];
  if (r.trusses) errors.push("An L-shaped roof needs valley sets from the truss maker; leave `trusses` off and use rafters.");
  if (!w || !(w.width > 0) || !(w.projection > 0)) errors.push("An L-shaped roof needs `wing: { width, projection }` (inches; projection is from the main eave wall's outside face to the wing's gable wall).");
  if (errors.length) return { ok: false, errors };
  const overhang = r.overhang ?? 12, rake = r.gableOverhang ?? 12, spacing = r.spacing ?? 16;
  const W = r.width, Ww = w.width, P = w.projection, Lm = r.length;
  const at = w.at ?? Lm / 2;
  const hz = Ww / 2 + overhang; // plan run from the wing's ridge to its eave line
  if (Ww > W + EPS) return { ok: false, errors: ["The wing must be no wider than the main roof (equal pitch: a wider wing would ride above the main ridge); swap them or narrow the wing."] };
  if (P < overhang + 12) return { ok: false, errors: ["The wing must project at least the eave overhang plus 12 in."] };
  if (at - hz < -EPS || at + hz > Lm + EPS) return { ok: false, errors: [`The wing (with its overhangs, ${formatLength(2 * hz)}) does not fit along the main roof's ${formatLength(Lm)}; move \`wing.at\` or narrow it.`] };
  const base = layoutRoof({ ...r, shape: "gable", wing: undefined }, plan);
  if (!base.ok) return base;
  const k = slopeFactor(r.pitch);
  const size = r.rafter ?? "2x8", valleySize = r.valley ?? r.hip ?? size;
  if (!(valleySize in DEPTH)) return { ok: false, errors: [`Unknown valley size ${valleySize}.`] };
  if (!plan.stock.some((s) => s.size === valleySize)) return { ok: false, errors: [`No ${valleySize} boards listed in the stock.`] };
  const longestOf = (sz) => Math.max(...plan.stock.filter((s) => s.size === sz).map((s) => s.length));
  const ridgeT = r.ridge ? THICK : 0, notes = [...base.notes];
  const vOff = THICK / 2 * Math.SQRT2; // the valley's face, measured along a jack
  const valleyLen = Math.round(hz * Math.sqrt(2 + (r.pitch / 12) ** 2) * 16) / 16;
  if (valleyLen > longestOf(valleySize) + EPS) return { ok: false, errors: [`A ${formatLength(valleyLen)} valley rafter is longer than the longest ${valleySize} listed (${formatLength(longestOf(valleySize))}). List longer boards or narrow the wing.`] };
  const wingCommon = Math.round((Ww / 2 - ridgeT / 2 + overhang) * k * 16) / 16;
  if (wingCommon > longestOf(size) + EPS) return { ok: false, errors: [`A ${formatLength(wingCommon)} wing rafter is longer than the longest ${size} listed.`] };

  // main rafters inside the wing's zone on the wing side become valley jacks; the other side stays common
  const jacks = [];
  const rafters = [];
  for (const x of base.rafters) {
    const z = Math.abs(x.x + THICK / 2 - at);
    if (x.side === "right" && z < hz - 1) {
      const run = (W - Ww) / 2 + z - ridgeT / 2 - vOff;
      if (run > 0) jacks.push({ plane: "main", offset: z, length: Math.round(run * k * 16) / 16, size });
    } else rafters.push(x);
  }
  // wing rafters: from the gable wall on the spacing; full commons to the eave corner, then valley jacks
  const wingCentres = [THICK / 2];
  for (let c = spacing; c < P + Ww / 2 - THICK - 3; c += spacing) wingCentres.push(Math.round(c * 16) / 16);
  for (const c of wingCentres) {
    if (c <= P - overhang + EPS) for (const side of ["left", "right"]) rafters.push({ wing: true, x: c - THICK / 2, side, length: wingCommon, size });
    else {
      const d = P + Ww / 2 - c;
      const run = d - ridgeT / 2 - vOff;
      if (run > 0) for (const side of ["left", "right"]) jacks.push({ plane: "wing", offset: d, side, length: Math.round(run * k * 16) / 16, size });
    }
  }
  const valleys = [0, 1].map((i) => ({ valley: i, length: valleyLen, size: valleySize }));
  const ridges = [...base.ridges];
  const wingRidgeLen = P + Ww / 2 + rake;
  if (r.ridge) {
    const rl = longestOf(r.ridge);
    const wc = wingCentres.map((c) => c + rake);
    for (const len of splitOnCentres(wingRidgeLen, rl, wc)) ridges.push({ length: len, size: r.ridge, wing: true });
  }
  if (r.valley == null && r.hip == null) notes.push(`Valleys are ${valleySize}, as the rafters; a valley is normally one size deeper than the rafters (set \`valley\`).`);
  if (jacks.some((j) => j.length < 6)) notes.push("The shortest valley jack is under 6 in; it is cut but may be better as a block.");
  notes.push(`The wing's ridge ends against the main roof ${formatInches(Ww / 2)} inside the eave wall, on a doubled main rafter or a header you detail; the wing has no ceiling joists or collar ties in this takeoff, and the valley's backing, side bevels and the framing under the valley are yours.`);

  // Sheathing, courses by plane: far main plane, wing-side main plane (notched by the wing), two wing planes.
  const sheet = { ...SHEET, price: 1, kerf: plan.kerf ?? 0.125, ...(r.sheet || {}) };
  const planeLength = Lm + 2 * rake;
  const mainSlope = (W / 2 + overhang) * k, wingSlope = hz * k;
  const split = (len) => { const out = []; let left = len; while (left > EPS) { const l = Math.min(left, sheet.length); out.push({ length: l }); left -= l; } return out; };
  const planes = [
    { name: "main far", count: 1, slope: mainSlope, pieces: () => split(planeLength) },
    { name: "main wing side", count: 1, slope: mainSlope, pieces: (e1) => {
      const notch = 2 * Math.max(0, hz - e1);
      const leftLen = Math.max(0, at + rake - (hz - Math.min(hz, e1))), rightLen = Math.max(0, planeLength - leftLen - notch);
      return [...split(leftLen), ...split(rightLen)];
    } },
    { name: "wing", count: 2, slope: wingSlope, pieces: (e1) => split(P - overhang + rake + Math.min(e1, hz)) },
  ];
  const courses = [];
  for (const p of planes) {
    const nFull = Math.floor((p.slope + EPS) / sheet.width), rest = p.slope - nFull * sheet.width;
    for (let c = 0; c < nFull + (rest > EPS ? 1 : 0); c++) {
      const y = c * sheet.width, width = c < nFull ? sheet.width : rest;
      courses.push({ plane: p.name, count: p.count, y, width, pieces: p.pieces(Math.min((y + width) / k, p.slope / k)) });
    }
  }
  let sheets = 0, ripped = 0;
  const sheetRows = [];
  for (const wd of [...new Set(courses.map((c) => c.width))]) {
    const ps = courses.filter((c) => Math.abs(c.width - wd) < EPS).flatMap((c) => Array.from({ length: c.count }, () => c.pieces).flat());
    const perSheet = Math.max(1, Math.floor((sheet.width + sheet.kerf) / (wd + sheet.kerf)));
    const res = optimizeStock(ps.map((p) => ({ length: p.length, qty: 1 })), [{ length: sheet.length, price: 1 }], sheet.kerf);
    const need = Math.ceil(res.bars.length / perSheet);
    sheets += need;
    if (wd < sheet.width - EPS) ripped += need;
    sheetRows.push({ width: wd, count: need, pieces: ps.length });
  }
  // roof surface = plan area x slope factor: the main rectangle plus the wing's rectangle beyond the eave line
  const planArea = planeLength * (W + 2 * overhang) + (P - overhang + rake) * (Ww + 2 * overhang);
  const area = planArea * k / 144;
  const sheetArea = (sheet.width * sheet.length) / 144;
  const g = { waste: 1.15, bundlesPerSquare: 3, underlaymentRoll: 400, ridgeBundleFeet: 33, starterBundleFeet: 100, dripEdgePiece: 120, ...(r.roofing || {}) };
  const squares = area / 100;
  const eaveFeet = (2 * planeLength - (Ww + 2 * overhang) + 2 * (P - overhang + rake)) / 12;
  const rakeFeet = (4 * mainSlope + 2 * wingSlope) / 12;
  const valleyFeet = 2 * valleyLen / 12;
  const ridgeFeet = (planeLength + wingRidgeLen) / 12;
  const roofing = {
    squares, shingleBundles: Math.ceil(squares * g.waste * g.bundlesPerSquare - 1e-9),
    underlaymentRolls: Math.ceil(area * g.waste / g.underlaymentRoll - 1e-9),
    dripEdgePieces: Math.ceil((eaveFeet + rakeFeet) * 12 / g.dripEdgePiece - 1e-9),
    ridgeBundles: Math.ceil(ridgeFeet / g.ridgeBundleFeet - 1e-9),
    starterBundles: Math.ceil(eaveFeet / g.starterBundleFeet - 1e-9),
    eaveFeet, rakeFeet, ridgeFeet, valleyFeet, assumptions: g,
  };
  const keep = notes.filter((n) => !/^Shingle, felt, drip edge and ridge/.test(n) && !/^The top course of each plane/.test(n));
  if (ripped) keep.push(`Top courses are ripped from ${ripped} sheet${ripped === 1 ? "" : "s"}.`);
  keep.push("Valley sheathing counts each course by its longest edge (cut diagonally at the valley) and does not reuse the triangular offcuts, so the sheet count is an upper bound; end joints are not placed over rafters.");
  keep.push(`Shingle, felt, drip edge, ridge and starter quantities use the coverage in \`roofing\` (15% waste); ${formatLength(valleyFeet * 12)} of valley needs flashing or a woven/ribbon-cut treatment and an underlayment strip that are not counted.`);
  return {
    ok: true, shape: "lshape", id, width: W, length: Lm, pitch: r.pitch, overhang, gableOverhang: rake, spacing, rafterSize: size, valleySize,
    rafterLength: base.rafterLength, wingRafterLength: wingCommon, valleyLength: valleyLen, slope: mainSlope, wingSlope, rise: base.rise,
    wing: { width: Ww, projection: P, at }, centres: base.centres, rafters, jacks, valleys, hips: [], ridges,
    ceilingJoists: base.ceilingJoists, collarTies: base.collarTies, trusses: null, courses,
    sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 },
    roofing, notes: keep,
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
  if (r.shape === "lshape") return layoutLShape(r, plan);
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
  else notes.push("Rafter size, spacing, the ridge, collar ties and ceiling joists are your inputs and are not checked against a span table or code; hurricane ties, birdsmouth depth and bracing are not in the takeoff.");
  notes.push("Shingle, felt, drip edge and ridge quantities use the coverage in `roofing` and ignore valleys, hips, vents, flashing and nails.");
  return {
    ok: true, id, width: r.width, length: r.length, pitch: r.pitch, overhang, gableOverhang: rake, spacing: sp, rafterSize: truss ? null : r.rafter ?? "2x8",
    rafterLength: truss ? null : rafterLength, slope, rise, centres, rafters, ridges, ceilingJoists, collarTies, trusses, courses,
    sheets: { count: sheets, rows: sheetRows, area, waste: sheets ? 1 - area / (sheets * sheetArea) : 0 },
    roofing, notes,
  };
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
  for (const x of l.rafters) add(x.size, x.length, "rafter");
  for (const x of l.hips || []) add(x.size, x.length, "hip rafter");
  for (const x of l.valleys || []) add(x.size, x.length, "valley rafter");
  for (const x of l.jacks || []) add(x.size, x.length, l.shape === "lshape" ? "valley jack" : "jack rafter");
  for (const x of l.ridges) add(x.size, x.length, "ridge board");
  for (const x of l.ceilingJoists) add(x.size, x.length, "ceiling joist");
  for (const x of l.collarTies) add(x.size, x.length, "collar tie");
  return [...map.values()];
}

export function roofText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.length)}, ${l.pitch}:12 pitch, ${formatInches(l.overhang)} eave${l.shape === "hip" ? "" : ` and ${formatInches(l.gableOverhang)} rake`} overhang${l.shape === "hip" ? " (hip)" : l.shape === "lshape" ? " (L-shaped)" : ""}`];
  out.push(`  Roof rises ${formatInches(l.rise)} over the plates; each plane is ${formatInches(l.slope)} up the slope.`);
  if (l.shape === "lshape") out.push(`  L-shaped roof: main ${l.rafters.filter((x) => !x.wing).length} common rafters of ${formatInches(l.rafterLength)}, wing ${formatLength(l.wing.width)} wide projecting ${formatLength(l.wing.projection)} at ${formatLength(l.wing.at)}: ${l.rafters.filter((x) => x.wing).length} wing commons of ${formatInches(l.wingRafterLength)}, ${l.valleys.length} ${l.valleySize} valleys of ${formatInches(l.valleyLength)}, ${l.jacks.length} valley jacks, ${l.ridges.length} ridge boards${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  else if (l.shape === "hip") out.push(`  Hip roof: ${l.rafters.length} common rafters of ${formatInches(l.rafterLength)}, ${l.hips.length} ${l.hipSize} hips of ${formatInches(l.hipLength)}, ${l.jacks.length} jack rafters (${l.jacks.length ? `${formatInches(Math.min(...l.jacks.map((j) => j.length)))} to ${formatInches(Math.max(...l.jacks.map((j) => j.length)))}` : "none"}), ${l.ridges.length} ridge board${l.ridges.length === 1 ? "" : "s"}${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  else if (l.trusses) out.push(`  ${l.trusses.count} trusses, ${formatLength(l.trusses.span)} span, at ${l.spacing} o.c. (purchased)`);
  else out.push(`  ${l.rafters.length} ${l.rafterSize} rafters of ${formatInches(l.rafterLength)} at ${l.spacing} o.c., ${l.ridges.length} ridge board${l.ridges.length === 1 ? "" : "s"}${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  out.push(`  Roof sheathing: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    ${c.plane ? `${c.plane} planes, ` : ""}course at ${formatLength(c.y)} up the slope (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length)).join(" + ")}`);
  const g = l.roofing;
  out.push(`  Roofing: ${g.squares.toFixed(1)} squares -> ${g.shingleBundles} bundles of shingles, ${g.underlaymentRolls} rolls of underlayment, ${g.dripEdgePieces} drip edge pieces, ${g.ridgeBundles} ridge cap and ${g.starterBundles} starter bundles`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
