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

/** @typedef {{ id?: string, width: number, length: number, pitch: number, overhang?: number, gableOverhang?: number, rafter?: string, spacing?: number, ridge?: string | null, ceilingJoist?: string, ceilingBearing?: number, collarTies?: boolean, collarDrop?: number, trusses?: { spacing?: number, price?: number }, sheet?: { length?: number, width?: number, price?: number, kerf?: number }, roofing?: { waste?: number, bundlesPerSquare?: number, underlaymentRoll?: number, ridgeBundleFeet?: number, starterBundleFeet?: number, dripEdgePiece?: number } }} Roof */

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

/**
 * Lay out one gable roof.
 * @param {Roof} r
 * @param {{ stock: { size: string, length: number, price: number }[], kerf?: number }} plan
 */
export function layoutRoof(r, plan) {
  const errors = validateRoof(r, plan);
  if (errors.length) return { ok: false, errors };
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
    if (r.ceilingJoist) {
      const cl = Math.max(...plan.stock.filter((s) => s.size === r.ceilingJoist).map((s) => s.length));
      if (r.width <= cl + EPS) for (const c of centres) ceilingJoists.push({ x: c - THICK / 2, length: r.width, size: r.ceilingJoist });
      else {
        // too long for one board: two pieces lapped 6 in over an interior bearing wall `ceilingBearing` from the left eave (default mid-span)
        const mid = r.ceilingBearing ?? r.width / 2;
        const pieces = [mid + 3, r.width - mid + 3];
        if (pieces.some((p) => p > cl + EPS)) return { ok: false, errors: [`A ${formatLength(Math.max(...pieces))} ceiling joist piece is longer than the longest ${r.ceilingJoist} listed (${formatLength(cl)}); list longer boards or move the bearing wall.`] };
        for (const c of centres) for (const p of pieces) ceilingJoists.push({ x: c - THICK / 2, length: p, size: r.ceilingJoist });
        notes.push(`Ceiling joists are two pieces lapped 6 in over an interior bearing wall ${formatLength(mid)} from the left eave; the wall, the lap nailing and the load path are yours and the engineer's.`);
      }
    }
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
  for (const x of l.ridges) add(x.size, x.length, "ridge board");
  for (const x of l.ceilingJoists) add(x.size, x.length, "ceiling joist");
  for (const x of l.collarTies) add(x.size, x.length, "collar tie");
  return [...map.values()];
}

export function roofText(l) {
  if (!l.ok) return l.errors.map((e) => `  - ${e}`);
  const out = [`${l.id}: ${formatLength(l.width)} x ${formatLength(l.length)}, ${l.pitch}:12 pitch, ${formatInches(l.overhang)} eave and ${formatInches(l.gableOverhang)} rake overhang`];
  out.push(`  Roof rises ${formatInches(l.rise)} over the plates; each plane is ${formatInches(l.slope)} up the slope.`);
  if (l.trusses) out.push(`  ${l.trusses.count} trusses, ${formatLength(l.trusses.span)} span, at ${l.spacing} o.c. (purchased)`);
  else out.push(`  ${l.rafters.length} ${l.rafterSize} rafters of ${formatInches(l.rafterLength)} at ${l.spacing} o.c., ${l.ridges.length} ridge board${l.ridges.length === 1 ? "" : "s"}${l.ceilingJoists.length ? `, ${l.ceilingJoists.length} ceiling joists` : ""}${l.collarTies.length ? `, ${l.collarTies.length} collar ties` : ""}`);
  out.push(`  Roof sheathing: ${l.sheets.count} sheets of ${SHEET.width} x ${SHEET.length} in for ${l.sheets.area.toFixed(0)} sq ft (${(100 * l.sheets.waste).toFixed(1)}% offcut)`);
  for (const c of l.courses) out.push(`    course at ${formatLength(c.y)} up the slope (${formatInches(c.width)} wide): ${c.pieces.map((p) => formatInches(p.length)).join(" + ")}`);
  const g = l.roofing;
  out.push(`  Roofing: ${g.squares.toFixed(1)} squares -> ${g.shingleBundles} bundles of shingles, ${g.underlaymentRolls} rolls of underlayment, ${g.dripEdgePieces} drip edge pieces, ${g.ridgeBundles} ridge cap and ${g.starterBundles} starter bundles`);
  for (const n of l.notes) out.push(`  - ${n}`);
  return out;
}
