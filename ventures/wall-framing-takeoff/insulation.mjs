// @ts-check
// Insulation by cavity: the area between the framing, measured from the
// members the takeoff placed, not from a framing-factor guess.
//
// Per wall: panel area (length x member extent) less the area of every framed
// member (studs, kings, jacks, headers, sills, cripples, plates, backing) less
// each opening's rough area. What is left is open cavity. Batts are sold by
// the bag, with a coverage you type from the label; the bag count adds waste.
// A 2x4 cavity is 3.5 in deep and a 2x6 5.5 in; the R-value is a label figure
// you type (defaults: R-15 in 2x4, R-21 in 2x6), not computed.
import { formatLength, DEPTH, THICK } from "./engine.mjs";
import { joistCentres } from "./floor.mjs";

const DEFAULT_R = { "2x4": 15, "2x6": 21 };

/** @typedef {{ rValue?: number, rPerInch?: number, bagCuFt?: number, price?: number, heel?: number, baffles?: boolean, baffleLength?: number, baffleWidth?: number, ceiling?: { width: number, depth: number }[] }} Attic */
/** @typedef {{ bagSqFt?: number, waste?: number, rValue?: number, price?: number, attic?: Attic, rim?: boolean }} Insulation */

/** @param {Insulation} d */
export function validateInsulation(d) {
  const e = [];
  if (d.bagSqFt != null && !(d.bagSqFt >= 10 && d.bagSqFt <= 500)) e.push("Insulation bag coverage must be between 10 and 500 sq ft.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Insulation waste must be between 0 and 0.3.");
  if (d.rValue != null && !(d.rValue > 0 && d.rValue <= 60)) e.push("R-value must be between 0 and 60.");
  const a = d.attic;
  if (a) {
    if (a.rValue != null && !(a.rValue >= 10 && a.rValue <= 80)) e.push("Attic R-value must be between 10 and 80.");
    if (a.rPerInch != null && !(a.rPerInch >= 1 && a.rPerInch <= 8)) e.push("Attic R per inch must be between 1 and 8 (read it from the bag's coverage chart).");
    if (a.bagCuFt != null && !(a.bagCuFt > 0 && a.bagCuFt <= 200)) e.push("Attic bag volume must be between 0 and 200 cubic feet.");
    if (a.heel != null && !(a.heel >= 1 && a.heel <= 30)) e.push("Attic heel height must be between 1 and 30 inches (the clear height above the top plate at the eave).");
    for (const c of a.ceiling || []) if (!(c.width > 0 && c.depth > 0)) e.push("Each attic ceiling rectangle needs a positive width and depth (inches).");
  }
  return e;
}

/**
 * Loose-fill (blown) attic insulation over flat ceilings: depth = target R / R per inch,
 * volume = area x depth. Bags are counted only when the label's bag volume is typed.
 * @param {Attic} a
 * @param {number} waste
 * @param {{ ceiling?: { width: number, depth: number }[] } | undefined} drywall
 * @param {any} roof
 */
function layoutAttic(a, waste, drywall, roof) {
  const rects = a.ceiling?.length ? a.ceiling : drywall?.ceiling?.length ? drywall.ceiling : null;
  const fromRoof = !rects && roof && roof.width > 0 && roof.length > 0;
  const areaSqIn = rects ? rects.reduce((s, c) => s + c.width * c.depth, 0) : fromRoof ? roof.width * roof.length : 0;
  if (!(areaSqIn > 0)) return { ok: false, errors: ["Attic insulation needs a ceiling area: attic.ceiling, drywall.ceiling or a roof footprint."] };
  const rValue = a.rValue ?? 38, rPerInch = a.rPerInch ?? 2.5;
  const depthIn = rValue / rPerInch;
  const sqFt = areaSqIn / 144;
  let cuFt = (sqFt * depthIn) / 12 * (1 + waste);
  let eave = null;
  if (a.heel != null) {
    if (!(roof && roof.width > 0 && roof.length > 0 && roof.pitch > 0)) return { ok: false, errors: ["Eave compression needs a plan `roof` (width, length and pitch)."] };
    // clear height under the roof at x from the wall = heel + x * pitch / 12; the fill is squeezed where that is below the settled depth
    const run = depthIn > a.heel ? Math.min((depthIn - a.heel) * 12 / roof.pitch, roof.width / 2) : 0;
    const d0 = Math.max(0, depthIn - a.heel), d1 = Math.max(0, d0 - run * roof.pitch / 12);
    const lostSqIn = 2 * roof.length * run * (d0 + d1) / 2; // trapezoid of missing fill along each eave
    const lostCuFt = lostSqIn / 1728 * (1 + waste);
    eave = { heel: a.heel, pitch: roof.pitch, runIn: run, bandSqFt: 2 * run * roof.length / 144, lostCuFt, energyHeelIn: depthIn };
    cuFt -= lostCuFt;
  }
  const bags = a.bagCuFt ? Math.ceil(cuFt / a.bagCuFt - 1e-9) : null;
  let baffles = null;
  if (a.baffles) {
    if (!(roof && roof.length > 0)) return { ok: false, errors: ["Eave baffles need a plan `roof` (its length and rafter or truss spacing give the bays)."] };
    // one baffle per bay between neighbouring rafters or trusses, on both eaves of a gable (the ridge-parallel sides)
    const spacing = roof.trusses?.spacing ?? roof.spacing ?? 16;
    const bays = Math.ceil(roof.length / spacing - 1e-9);
    const baffleWidth = a.baffleWidth ?? 22.5; // vent chutes are sold to fit a 24 in o.c. bay (22.5 in clear between 1.5 in framing); a wider bay needs two
    const perEave = bays * Math.ceil((spacing - 1.5) / baffleWidth - 1e-9);
    baffles = { bays, perEave, count: 2 * perEave, spacing, baffleWidth, baffleLength: a.baffleLength ?? 48 };
  }
  return {
    ok: true, errors: [], source: rects ? "ceiling rectangles" : "roof footprint (eaves not netted off)", sqFt, rValue, rPerInch,
    rPerInchAssumed: a.rPerInch == null, depthIn, cuFt, eave, bagCuFt: a.bagCuFt ?? null, bags,
    cost: bags != null && a.price != null ? bags * a.price : null, price: a.price ?? null, baffles,
  };
}

/**
 * @param {Insulation} d
 * @param {{ defaultHeaderHeight: number, walls: any[] }} plan
 * @param {{ walls: any[] }} result the takeoff result (members placed per wall)
 */
export function layoutInsulation(d, plan, result) {
  let full = layoutWalls(d, plan, result);
  if (!full.ok) return full;
  if (d.rim) {
    const rim = layoutRim(d, /** @type {any} */ (plan).floor);
    if (!rim.ok) return { ...full, ok: false, errors: rim.errors };
    full = { ...full, rim };
  }
  if (!d.attic) return full;
  const attic = layoutAttic(d.attic, d.waste ?? 0.05, /** @type {any} */ (plan).drywall, /** @type {any} */ (plan).roof);
  if (!attic.ok) return { ...full, ok: false, errors: attic.errors };
  return { ...full, attic };
}

/**
 * Rim joist bays: the rim board runs the floor's width at the front and back, so each side's cavity is the
 * width x joist depth less the joist ends that butt it. Counted with the wall bags' coverage and waste.
 * @param {Insulation} d
 * @param {any} floor
 */
function layoutRim(d, floor) {
  if (!floor || floor.rim === false) return { ok: false, errors: ["Rim joist insulation needs a plan floor with a rim board."] };
  const depth = /** @type {Record<string, number>} */ (DEPTH)[floor.joist];
  if (!depth) return { ok: false, errors: [`Unknown joist size ${floor.joist}.`] };
  const ends = joistCentres(floor.width, floor.spacing ?? 16).length;
  const sideSqIn = floor.width * depth - ends * THICK * depth;
  const sqFt = (2 * sideSqIn) / 144;
  const waste = d.waste ?? 0.05, bag = d.bagSqFt ?? 88;
  const bags = Math.ceil((sqFt * (1 + waste)) / bag - 1e-9);
  return { ok: true, errors: [], sqFt, joistDepthIn: depth, bags, cost: d.price != null ? bags * d.price : null, price: d.price ?? null };
}

/** @param {Insulation} d @param {any} plan @param {any} result */
function layoutWalls(d, plan, result) {
  const errors = validateInsulation(d);
  if (errors.length) return { ok: false, errors };
  const waste = d.waste ?? 0.05;
  const bag = d.bagSqFt ?? 88;
  const walls = [];
  /** @type {Map<string, number>} */
  const bySize = new Map();
  let framedSqIn = 0, panelSqIn = 0, openSqIn = 0;
  for (const rw of result.walls) {
    const pw = plan.walls.find((/** @type {any} */ w) => w.id === rw.id) || {};
    const size = rw.stud || "2x4";
    let top = 0;
    for (const m of rw.members) top = Math.max(top, m.y + m.h);
    const panel = rw.length * top;
    const framed = rw.members.reduce((/** @type {number} */ s, /** @type {any} */ m) => s + m.w * m.h, 0);
    const ro = (pw.openings || []).reduce((/** @type {number} */ s, /** @type {any} */ o) => s + o.width * o.height, 0);
    const cavity = Math.max(0, panel - framed - ro);
    panelSqIn += panel; framedSqIn += framed; openSqIn += ro;
    bySize.set(size, (bySize.get(size) || 0) + cavity);
    walls.push({ id: rw.id, size, cavitySqFt: cavity / 144, framingShare: panel > 0 ? framed / panel : 0 });
  }
  const sizes = [...bySize.entries()].map(([size, sq]) => {
    const sqFt = sq / 144;
    const r = d.rValue ?? DEFAULT_R[/** @type {"2x4"|"2x6"} */ (size)] ?? null;
    return { size, cavitySqFt: sqFt, rValue: r, bags: Math.ceil((sqFt * (1 + waste)) / bag - 1e-9) };
  });
  const bags = sizes.reduce((s, x) => s + x.bags, 0);
  return {
    ok: true, errors: [], walls, sizes, bags, bagSqFt: bag, waste,
    cavitySqFt: sizes.reduce((s, x) => s + x.cavitySqFt, 0),
    framingShare: panelSqIn > 0 ? framedSqIn / panelSqIn : 0,
    openingSqFt: openSqIn / 144,
    cost: d.price != null ? bags * d.price : null, price: d.price ?? null,
  };
}

/** @param {any} d */
export function insulationText(d) {
  const l = [];
  l.push(`  ${d.bags} bags at ${d.bagSqFt} sq ft (${d.cavitySqFt.toFixed(0)} sq ft of open cavity plus ${(100 * d.waste).toFixed(0)}% waste; framing takes ${(100 * d.framingShare).toFixed(1)}% of the wall panels)`);
  for (const s of d.sizes) l.push(`    ${s.size} cavities: ${s.cavitySqFt.toFixed(0)} sq ft, R-${s.rValue ?? "?"} -> ${s.bags} bags`);
  if (d.cost != null) l.push(`  bags at ${d.price} each: ${d.cost.toFixed(2)}`);
  if (d.rim) l.push(`  Rim joist bays: ${d.rim.sqFt.toFixed(0)} sq ft (front and back, ${d.rim.joistDepthIn} in deep, less joist ends) -> ${d.rim.bags} bags at the same coverage${d.rim.cost != null ? `, ${d.rim.cost.toFixed(2)}` : ""}`);
  const a = d.attic;
  if (a) {
    l.push(`  Attic (loose fill) over ${a.sqFt.toFixed(0)} sq ft, from ${a.source}: R-${a.rValue} at R-${a.rPerInch}/in${a.rPerInchAssumed ? " (assumed: read yours from the bag's coverage chart)" : ""} = ${a.depthIn.toFixed(1)} in settled depth, ${a.cuFt.toFixed(0)} cu ft with waste`);
    if (a.eave) l.push(`    Eave compression: with a ${a.eave.heel} in heel at ${a.eave.pitch}/12 the fill is squeezed under ${a.eave.energyHeelIn.toFixed(1)} in for the first ${a.eave.runIn.toFixed(1)} in from each wall (${a.eave.bandSqFt.toFixed(0)} sq ft in all), so that band stays below R-${a.rValue}; ${a.eave.lostCuFt.toFixed(0)} cu ft left out of the count. A raised (energy) heel of ${a.eave.energyHeelIn.toFixed(1)} in or more holds full depth to the wall.`);
    if (a.baffles) l.push(`    Eave baffles: ${a.baffles.count} (${a.baffles.bays} bays at ${a.baffles.spacing} in, both eaves, ${a.baffles.baffleLength} in chutes); keep them clear of the blown fill`);
    l.push(a.bags != null ? `    ${a.bags} bags at ${a.bagCuFt} cu ft${a.cost != null ? `, ${a.cost.toFixed(2)} at ${a.price} each` : ""}` : "    Bag count needs the label's cubic feet per bag (attic.bagCuFt); coverage charts list bags per 1,000 sq ft by R-value.");
  }
  l.push(`  Wall cavities${a ? " and the attic floor" : " only: attic"}, ${d.rim ? "" : "rim joists, "}${a ? "" : "ceiling joists "}and air sealing are not all counted; bag coverage and R-value are figures you type from the label.`);
  return l;
}
