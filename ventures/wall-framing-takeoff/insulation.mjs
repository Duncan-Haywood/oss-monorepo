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
import { formatLength } from "./engine.mjs";

const DEFAULT_R = { "2x4": 15, "2x6": 21 };

/** @typedef {{ bagSqFt?: number, waste?: number, rValue?: number, price?: number, ceiling?: { width: number, depth: number }[] }} Insulation */

/** @param {Insulation} d */
export function validateInsulation(d) {
  const e = [];
  if (d.bagSqFt != null && !(d.bagSqFt >= 10 && d.bagSqFt <= 500)) e.push("Insulation bag coverage must be between 10 and 500 sq ft.");
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.3)) e.push("Insulation waste must be between 0 and 0.3.");
  if (d.rValue != null && !(d.rValue > 0 && d.rValue <= 60)) e.push("R-value must be between 0 and 60.");
  return e;
}

/**
 * @param {Insulation} d
 * @param {{ defaultHeaderHeight: number, walls: any[] }} plan
 * @param {{ walls: any[] }} result the takeoff result (members placed per wall)
 */
export function layoutInsulation(d, plan, result) {
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
  l.push("  Wall cavities only: attic, rim joists, ceiling joists and air sealing are not counted; bag coverage and R-value are figures you type from the label.");
  return l;
}
