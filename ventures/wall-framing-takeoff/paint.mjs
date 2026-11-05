// @ts-check
// Interior paint: the area a painter covers, in gallons, from the walls and
// openings already in the plan.
//
// Walls: each wall's length x paint height, less its openings, on every
// painted face (exterior walls one, interior walls two unless `faces` says
// otherwise). Doors are painted too: `doorFaces` (default 2 sides) of each
// door leaf, less nothing. Ceilings are entered as rectangles (`ceilings`:
// width x depth in inches). Baseboard and casing paint is optional
// (`trimFeet`, a lineal-foot figure you take from --trim, at `trimFtPerGal`).
// Gallons = area x coats / coverage (default 350 sq ft per gallon per coat, a
// typical label figure; textured walls cover less, so type your own), plus
// waste, rounded up to whole gallons; a primer coat is counted separately.
// Window glass is not painted: a window is subtracted at its full size.

import { textNumberErrors } from "./numfields.mjs";
/** @typedef {{ height?: number, faces?: 1|2, coats?: number, primerCoats?: number, coverage?: number, primerCoverage?: number, waste?: number, ceilings?: { width: number, depth: number }[], ceilingCoats?: number, doors?: boolean, doorFaces?: number, doorLeafSqFt?: number, trimFeet?: number, trimFtPerGal?: number, gallonPrice?: number, primerPrice?: number, fivePrice?: number }} Paint */

/** @param {Paint} d */
export function validatePaint(d) {
  const e = [];
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Paint settings are an object."];
  e.push(...textNumberErrors(d, ["height", "coats", "primerCoats", "coverage", "primerCoverage", "waste", "ceilingCoats", "doorFaces", "doorLeafSqFt", "trimFeet", "trimFtPerGal", "gallonPrice", "primerPrice", "fivePrice"]));
  if (e.length) return e;
  if (d.height != null && !(d.height >= 72 && d.height <= 240)) e.push("Paint height must be between 6 and 20 ft.");
  if (d.faces != null && d.faces !== 1 && d.faces !== 2) e.push("Faces must be 1 or 2.");
  for (const k of /** @type {const} */ (["coats", "primerCoats", "ceilingCoats"])) if (d[k] != null && !(Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 5)) e.push(`${k} must be a whole number from 0 to 5.`);
  for (const k of /** @type {const} */ (["coverage", "primerCoverage"])) if (d[k] != null && !(d[k] >= 50 && d[k] <= 600)) e.push(`${k} must be between 50 and 600 sq ft per gallon.`);
  if (d.waste != null && !(d.waste >= 0 && d.waste <= 0.5)) e.push("Paint waste must be between 0 and 0.5.");
  if (d.doorFaces != null && !(d.doorFaces >= 0 && d.doorFaces <= 2)) e.push("Door faces must be 0, 1 or 2.");
  if (d.doorLeafSqFt != null && !(d.doorLeafSqFt > 0 && d.doorLeafSqFt <= 60)) e.push("A door leaf is a figure up to 60 sq ft.");
  if (d.trimFtPerGal != null && !(d.trimFtPerGal > 0)) e.push("Trim feet per gallon must be above 0.");
  if (Array.isArray(d.ceilings) ? d.ceilings.some((c) => !c || !(c.width > 0 && c.depth > 0)) : d.ceilings != null) e.push("Each ceiling needs a width and a depth above 0.");
  return e;
}

/** whole gallons, with a five-gallon pail when that is cheaper and a price is given
 * @param {number} gal @param {number|null} price @param {number|null} fivePrice */
function buy(gal, price, fivePrice) {
  const need = Math.ceil(gal - 1e-9);
  if (fivePrice == null || price == null) return { gallons: need, pails: 0, cost: price != null ? need * price : null };
  const pails = Math.floor(need / 5); const rest = need - pails * 5;
  const lastPail = rest * price > fivePrice ? 1 : 0;
  return { gallons: lastPail ? 0 : rest, pails: pails + lastPail, cost: (pails + lastPail) * fivePrice + (lastPail ? 0 : rest * price) };
}

/**
 * @param {Paint} d
 * @param {{ studLength?: number, walls: { id: string, length: number, sheathed?: boolean, openings?: { kind: string, width: number, height: number }[] }[] }} plan
 */
export function layoutPaint(d, plan) {
  const errors = validatePaint(d);
  if (errors.length) return { ok: false, errors };
  const height = d.height ?? (plan.studLength ? Math.round((plan.studLength + 4.5) / 12) * 12 : 96);
  const coats = d.coats ?? 2, primerCoats = d.primerCoats ?? 0, ceilingCoats = d.ceilingCoats ?? coats;
  const cov = d.coverage ?? 350, pcov = d.primerCoverage ?? 300, waste = d.waste ?? 0.1;
  const leaf = d.doorLeafSqFt ?? 21, doorFaces = d.doors === false ? 0 : (d.doorFaces ?? 2);
  let wallIn = 0, openIn = 0, doors = 0;
  for (const w of plan.walls) {
    const faces = d.faces ?? (w.sheathed === false ? 2 : 1);
    let open = 0;
    for (const o of w.openings || []) { open += Math.min(o.width * o.height, o.width * height); if (o.kind === "door") doors++; }
    wallIn += Math.max(0, w.length * height - open) * faces;
    openIn += open * faces;
  }
  const wallSq = wallIn / 144;
  const ceilSq = (d.ceilings || []).reduce((s, c) => s + c.width * c.depth, 0) / 144;
  const doorSq = doors * doorFaces * leaf;
  const wallGal = (wallSq + doorSq) * coats / cov, ceilGal = ceilSq * ceilingCoats / cov;
  const trimGal = d.trimFeet ? d.trimFeet / (d.trimFtPerGal ?? 150) * coats : 0;
  const paintGal = (wallGal + ceilGal + trimGal) * (1 + waste);
  const primerGal = primerCoats ? (wallSq + ceilSq) * primerCoats / pcov * (1 + waste) : 0;
  const paint = buy(paintGal, d.gallonPrice ?? null, d.fivePrice ?? null);
  const primer = buy(primerGal, d.primerPrice ?? null, null);
  return {
    ok: true, errors: [], height, coats, primerCoats, coverage: cov, waste,
    wallSqFt: wallSq, openingSqFt: openIn / 144, ceilingSqFt: ceilSq, doorSqFt: doorSq, doorLeaves: doors, trimFeet: d.trimFeet ?? 0,
    paintGallonsExact: paintGal, primerGallonsExact: primerGal,
    paintGallons: paint.gallons, paintPails: paint.pails, primerGallons: primer.gallons,
    cost: paint.cost != null || primer.cost != null ? (paint.cost ?? 0) + (primer.cost ?? 0) : null,
  };
}

/** @param {any} p */
export function paintText(p) {
  const l = [];
  l.push(`  Walls: ${p.wallSqFt.toFixed(0)} sq ft at ${p.height / 12} ft, less ${p.openingSqFt.toFixed(0)} sq ft of openings; ${p.ceilingSqFt ? `ceilings ${p.ceilingSqFt.toFixed(0)} sq ft; ` : ""}${p.doorLeaves ? `${p.doorLeaves} doors, ${p.doorSqFt.toFixed(0)} sq ft; ` : ""}${p.trimFeet ? `trim ${p.trimFeet.toFixed(0)} ft.` : ""}`.replace(/; $/, "."));
  l.push(`  Paint: ${p.coats} coats at ${p.coverage} sq ft per gallon, ${(100 * p.waste).toFixed(0)}% waste -> ${p.paintGallonsExact.toFixed(2)} gal, buy ${p.paintPails ? `${p.paintPails} five-gallon pail${p.paintPails > 1 ? "s" : ""}${p.paintGallons ? ` and ${p.paintGallons} gal` : ""}` : `${p.paintGallons} gal`}.`);
  if (p.primerGallons) l.push(`  Primer: ${p.primerCoats} coat, ${p.primerGallonsExact.toFixed(2)} gal -> buy ${p.primerGallons} gal.`);
  if (p.cost != null) l.push(`  Paint cost: ${p.cost.toFixed(2)}.`);
  l.push("  Coverage is a label figure; textured, new drywall and dark-to-light changes use more. Cutting in, rollers, tape and drop cloths are not counted.");
  return l;
}
