// @ts-check
// Finish flooring: what to order for each room, from rectangles typed in
// inches (`rooms: [{name, width, depth, kind}]`; the wall model has no room
// outlines, so rooms are typed the way paint ceilings are).
//
// Three kinds, each with its own arithmetic and typed defaults (label-style
// figures, not code; type your product's own):
//  - "plank" (hardwood, laminate, vinyl plank): room areas summed, plus waste
//    (7% straight, 12% for a room with `diagonal: true`), into whole boxes of
//    `boxSqFt` (default 20). Optional underlayment rolls (`underlayment`,
//    `underlaymentRollSqFt` default 100, no waste added past the roll).
//  - "tile": whole tiles from the area, the tile size plus the grout joint,
//    waste (10% / 15% diagonal), thinset bags at a typed coverage, grout by
//    joint volume (length and width of the joints x joint width x tile
//    thickness x grout density), in whole bags.
//  - "carpet": cut from a roll of `rollWidth` (default 144 in). Per room the
//    roll runs along the longer side, one strip per roll width across the
//    shorter side, each strip the long side plus a trim allowance; seams =
//    strips - 1; pad is the room area plus waste; tack strip is the perimeter.
//
// Not counted: transitions, stair nosing, subfloor prep or leveling, adhesive
// and fasteners for plank, caulk, a room's closets or alcoves (add them as
// rooms), cuts around fixtures, or pattern matching in the carpet.

import { textNumberErrors } from "./numfields.mjs";

const KINDS = ["plank", "tile", "carpet"];
const NUMS = ["boxSqFt", "waste", "diagonalWaste", "underlaymentRollSqFt", "boxPrice", "underlaymentPrice", "tileWidth", "tileLength", "joint", "thickness", "thinsetSqFtPerBag", "groutLbPerCuFt", "groutBagLb", "tilePrice", "thinsetPrice", "groutPrice", "rollWidth", "trimAllowance", "padWaste", "carpetPrice", "padPrice", "tackStripLength", "tackPrice"];

/** @param {any} d */
export function validateFlooring(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Flooring settings are an object."];
  if (!Array.isArray(d.rooms) || !d.rooms.length) return ["Flooring needs rooms: [{name, width, depth, kind}], sizes in inches."];
  if (d.rooms.length > 500) return ["At most 500 rooms."];
  d.rooms.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
    if (!r || typeof r !== "object") { e.push(`Room ${i + 1} is not an object.`); return; }
    for (const k of ["width", "depth"]) if (typeof r[k] !== "number" || !(r[k] > 0 && r[k] <= 1e5)) e.push(`Room ${i + 1} (${r.name ?? "unnamed"}): ${k} must be a number of inches above 0.`);
    if (!KINDS.includes(r.kind)) e.push(`Room ${i + 1} (${r.name ?? "unnamed"}): kind must be one of ${KINDS.join(", ")}.`);
  });
  for (const k of KINDS) {
    const s = d[k];
    if (s == null) continue;
    if (typeof s !== "object" || Array.isArray(s)) { e.push(`${k} settings are an object.`); continue; }
    e.push(...textNumberErrors(s, NUMS));
  }
  if (e.length) return e;
  const p = d.plank || {}, t = d.tile || {}, c = d.carpet || {};
  if (p.boxSqFt != null && !(p.boxSqFt > 0 && p.boxSqFt <= 200)) e.push("boxSqFt must be above 0 and at most 200.");
  for (const [s, ks] of /** @type {[any, string[]][]} */ ([[p, ["waste", "diagonalWaste"]], [t, ["waste", "diagonalWaste"]], [c, ["padWaste"]]])) for (const k of ks) if (s[k] != null && !(s[k] >= 0 && s[k] <= 0.5)) e.push(`${k} must be between 0 and 0.5.`);
  for (const k of ["tileWidth", "tileLength"]) if (t[k] != null && !(t[k] >= 1 && t[k] <= 96)) e.push(`${k} must be between 1 and 96 in.`);
  if (t.joint != null && !(t.joint >= 0 && t.joint <= 2)) e.push("joint must be between 0 and 2 in.");
  if (t.thickness != null && !(t.thickness > 0 && t.thickness <= 2)) e.push("thickness must be above 0 and at most 2 in.");
  for (const k of ["thinsetSqFtPerBag", "groutLbPerCuFt", "groutBagLb"]) if (t[k] != null && !(t[k] > 0)) e.push(`${k} must be above 0.`);
  if (c.rollWidth != null && !(c.rollWidth >= 36 && c.rollWidth <= 240)) e.push("rollWidth must be between 36 and 240 in.");
  if (c.trimAllowance != null && !(c.trimAllowance >= 0 && c.trimAllowance <= 48)) e.push("trimAllowance must be between 0 and 48 in.");
  if (c.tackStripLength != null && !(c.tackStripLength >= 1 && c.tackStripLength <= 20)) e.push("tackStripLength must be between 1 and 20 ft.");
  if (p.underlaymentRollSqFt != null && !(p.underlaymentRollSqFt > 0)) e.push("underlaymentRollSqFt must be above 0.");
  return e;
}

const up = (/** @type {number} */ x) => Math.ceil(x - 1e-9);

/** @param {any} d */
export function layoutFlooring(d) {
  const errors = validateFlooring(d);
  if (errors.length) return { ok: false, errors };
  const p = d.plank || {}, t = d.tile || {}, c = d.carpet || {};
  /** @type {any} */ const out = { ok: true, errors: [], rooms: d.rooms.length, plank: null, tile: null, carpet: null, cost: null };
  /** @param {string} k */ const of = (k) => d.rooms.filter((/** @type {any} */ r) => r.kind === k);
  const sq = (/** @type {any} */ r) => r.width * r.depth / 144;
  let cost = 0, priced = false;

  const pr = of("plank");
  if (pr.length) {
    const base = pr.filter((/** @type {any} */ r) => !r.diagonal).reduce((s, r) => s + sq(r), 0);
    const diag = pr.filter((/** @type {any} */ r) => r.diagonal).reduce((s, r) => s + sq(r), 0);
    const need = base * (1 + (p.waste ?? 0.07)) + diag * (1 + (p.diagonalWaste ?? 0.12));
    const boxSq = p.boxSqFt ?? 20;
    const boxes = up(need / boxSq);
    const area = base + diag;
    const rolls = p.underlayment ? up(area / (p.underlaymentRollSqFt ?? 100)) : 0;
    const bc = p.boxPrice != null ? boxes * p.boxPrice : null, uc = rolls && p.underlaymentPrice != null ? rolls * p.underlaymentPrice : null;
    if (bc != null || uc != null) { cost += (bc ?? 0) + (uc ?? 0); priced = true; }
    out.plank = { rooms: pr.length, sqFt: area, orderSqFt: need, boxSqFt: boxSq, boxes, leftoverSqFt: boxes * boxSq - need, underlaymentRolls: rolls, cost: bc != null || uc != null ? (bc ?? 0) + (uc ?? 0) : null };
  }

  const tr = of("tile");
  if (tr.length) {
    const w = t.tileWidth ?? 12, l = t.tileLength ?? w, j = t.joint ?? 0.125, th = t.thickness ?? 0.375;
    const base = tr.filter((/** @type {any} */ r) => !r.diagonal).reduce((s, r) => s + sq(r), 0);
    const diag = tr.filter((/** @type {any} */ r) => r.diagonal).reduce((s, r) => s + sq(r), 0);
    const need = base * (1 + (t.waste ?? 0.1)) + diag * (1 + (t.diagonalWaste ?? 0.15));
    const area = base + diag;
    const perTile = (w + j) * (l + j) / 144;
    const tiles = up(need / perTile);
    const thinsetBags = up(area / (t.thinsetSqFtPerBag ?? 80));
    // joint volume per sq ft of floor: (joint runs in a sq ft) x joint width x depth; runs = 1/(l+j) + 1/(w+j) rows per inch
    const jointCuIn = 144 * (1 / (w + j) + 1 / (l + j)) * j * th; // in3 per sq ft: 144 in2 x joint inches per in2 x width x depth
    const groutLb = area * jointCuIn / 1728 * (t.groutLbPerCuFt ?? 100);
    const bagLb = t.groutBagLb ?? 25;
    const groutBags = groutLb > 0 ? up(groutLb / bagLb) : 0;
    const tc = t.tilePrice != null ? tiles * t.tilePrice : null;
    const parts = [tc, t.thinsetPrice != null ? thinsetBags * t.thinsetPrice : null, t.groutPrice != null ? groutBags * t.groutPrice : null];
    const tcost = parts.some((x) => x != null) ? parts.reduce((s, x) => s + (x ?? 0), 0) : null;
    if (tcost != null) { cost += tcost; priced = true; }
    out.tile = { rooms: tr.length, sqFt: area, orderSqFt: need, tileWidth: w, tileLength: l, joint: j, tiles, thinsetBags, groutLb, groutBags, cost: tcost };
  }

  const cr = of("carpet");
  if (cr.length) {
    const rw = c.rollWidth ?? 144, allow = c.trimAllowance ?? 6;
    let linIn = 0, seams = 0, areaSq = 0, perim = 0;
    const perRoom = cr.map((/** @type {any} */ r) => {
      const long = Math.max(r.width, r.depth), short = Math.min(r.width, r.depth);
      const strips = up(short / rw);
      const len = long + allow;
      linIn += strips * len; seams += strips - 1; areaSq += sq(r); perim += 2 * (r.width + r.depth) / 12;
      return { name: r.name ?? null, strips, stripLength: len, seams: strips - 1 };
    });
    const rollSqYd = linIn * rw / 1296;
    const padSqYd = areaSq / 9 * (1 + (c.padWaste ?? 0.05));
    const tack = perim; // feet, one run round each room
    const cc = c.carpetPrice != null ? rollSqYd * c.carpetPrice : null, pc = c.padPrice != null ? padSqYd * c.padPrice : null;
    const tk = c.tackPrice != null ? up(tack / (c.tackStripLength ?? 4)) * c.tackPrice : null;
    const ccost = [cc, pc, tk].some((x) => x != null) ? (cc ?? 0) + (pc ?? 0) + (tk ?? 0) : null;
    if (ccost != null) { cost += ccost; priced = true; }
    out.carpet = { rooms: cr.length, sqFt: areaSq, rollWidth: rw, rollSqYd, rollLinearFeet: linIn / 12, seams, padSqYd, tackFeet: tack, perRoom, cost: ccost };
  }
  out.cost = priced ? cost : null;
  return out;
}

/** @param {any} f */
export function flooringText(f) {
  const l = [];
  if (f.plank) l.push(`  Plank: ${f.plank.sqFt.toFixed(0)} sq ft in ${f.plank.rooms} room(s), ${f.plank.orderSqFt.toFixed(0)} with waste -> ${f.plank.boxes} boxes of ${f.plank.boxSqFt} sq ft (${f.plank.leftoverSqFt.toFixed(1)} sq ft left over)${f.plank.underlaymentRolls ? `; ${f.plank.underlaymentRolls} underlayment roll(s)` : ""}.`);
  if (f.tile) l.push(`  Tile: ${f.tile.sqFt.toFixed(0)} sq ft of ${f.tile.tileWidth} x ${f.tile.tileLength} in tile, ${f.tile.joint} in joints -> ${f.tile.tiles} tiles, ${f.tile.thinsetBags} bags thinset, ${f.tile.groutLb.toFixed(1)} lb grout (${f.tile.groutBags} bags).`);
  if (f.carpet) l.push(`  Carpet: ${f.carpet.sqFt.toFixed(0)} sq ft of floor from a ${f.carpet.rollWidth / 12} ft roll -> ${f.carpet.rollLinearFeet.toFixed(1)} linear ft (${f.carpet.rollSqYd.toFixed(1)} sq yd), ${f.carpet.seams} seam(s); pad ${f.carpet.padSqYd.toFixed(1)} sq yd; tack strip ${f.carpet.tackFeet.toFixed(0)} ft.`);
  if (f.cost != null) l.push(`  Flooring cost: ${f.cost.toFixed(2)}.`);
  l.push("  Defaults are typed figures, not code or a maker's: use your product's box size, tile size and coverage. Transitions, nosing, subfloor prep and adhesive are not counted.");
  return l;
}
