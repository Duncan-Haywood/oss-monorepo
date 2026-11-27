// @ts-check
// Board-foot calculator: lumber lines (thickness x width in inches, length in
// feet, count) to board feet, cubic feet and cost.
//
// A board foot is 144 cubic inches: thickness (in) x width (in) x length (ft) / 12.
// Softwood dimension lumber and hardwood are both priced on the size they are
// SOLD as (nominal 2x4, or rough 4/4), not the size they measure after milling,
// so the default `basis: "nominal"` uses the numbers as typed. `basis: "actual"`
// swaps a softwood nominal size (1-4 thick, 2-12 wide) for its usual milled size
// (2x4 -> 1.5 x 3.5) so you can see the smaller volume you actually get; sizes
// that are not on the softwood list are used as typed. Thickness may be typed in
// quarters ("4/4" = 1 in, "8/4" = 2 in), the hardwood convention.
// Price per board foot, per piece or per linear foot is typed; no market prices
// are built in. Species, grade, moisture and sawing waste are not modelled
// beyond the `waste` fraction you type.
import { textNumberErrors } from "./numfields.mjs";

/** Usual milled thickness for a nominal softwood thickness, in inches. */
export const ACTUAL_THICKNESS = { 1: 0.75, 2: 1.5, 3: 2.5, 4: 3.5 };
/** Usual milled width for a nominal softwood width, in inches. */
export const ACTUAL_WIDTH = { 2: 1.5, 3: 2.5, 4: 3.5, 5: 4.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

/** "4/4" -> 1, "8/4" -> 2, "1.5" -> 1.5, 2 -> 2. Anything else -> NaN. @param {any} v */
export function parseThickness(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const s = v.trim();
  const q = /^(\d+(?:\.\d+)?)\/4$/.exec(s);
  if (q) return Number(q[1]) / 4;
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const r2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;

/** @param {any} d */
export function validateBoardFoot(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Board-foot settings are an object."];
  if (!Array.isArray(d.lines) || !d.lines.length) return ["Add at least one line: thickness and width in inches, length in feet."];
  if (d.lines.length > 200) return ["At most 200 lines."];
  const e = [];
  if (d.basis != null && d.basis !== "nominal" && d.basis !== "actual") e.push('basis is "nominal" or "actual".');
  e.push(...textNumberErrors(d, ["waste"]));
  if (typeof d.waste === "number" && !(d.waste >= 0 && d.waste <= 1)) e.push("waste is a fraction from 0 to 1.");
  for (const [i, l] of d.lines.entries()) {
    const n = `Line ${i + 1}`;
    if (!l || typeof l !== "object" || Array.isArray(l)) { e.push(`${n} is an object.`); continue; }
    const t = parseThickness(l.thickness);
    if (!(t > 0 && t <= 24)) e.push(`${n}: thickness is inches above 0 and at most 24 (or quarters like 4/4).`);
    e.push(...textNumberErrors(l, ["width", "length", "count", "pricePerBf", "pricePerPiece", "pricePerFt"]).map((x) => `${n}: ${x}`));
    for (const k of ["pricePerBf", "pricePerPiece", "pricePerFt"]) if (typeof l[k] === "number" && (l[k] < 0 || l[k] > 1e6)) e.push(`${n}: ${k} must be from 0 to 1,000,000.`);
    if (!(l.width > 0 && l.width <= 48)) e.push(`${n}: width is inches above 0 and at most 48.`);
    if (!(l.length > 0 && l.length <= 40)) e.push(`${n}: length is feet above 0 and at most 40.`);
    if (l.count != null && !(Number.isInteger(l.count) && l.count >= 1 && l.count <= 100000)) e.push(`${n}: count is a whole number from 1 to 100000.`);
    const priced = ["pricePerBf", "pricePerPiece", "pricePerFt"].filter((k) => l[k] != null);
    if (priced.length > 1) e.push(`${n}: type one price (${priced.join(", ")} given).`);
  }
  return e;
}

/** @param {any} d */
export function layoutBoardFoot(d) {
  const errors = validateBoardFoot(d);
  if (errors.length) return { ok: false, errors };
  const basis = d.basis ?? "nominal", waste = d.waste ?? 0;
  let totalBf = 0, totalActualBf = 0, totalCuFt = 0, cost = 0, pieces = 0, priced = 0, lineFeet = 0;
  const lines = d.lines.map((/** @type {any} */ l, /** @type {number} */ i) => {
    const count = l.count ?? 1, t = parseThickness(l.thickness);
    const sold = (t * l.width * l.length) / 12;
    // Softwood nominal -> milled size, only for the sizes on the list.
    const at = typeof l.thickness === "number" && Number.isInteger(t) ? ACTUAL_THICKNESS[/** @type {1|2|3|4} */ (t)] : undefined;
    const aw = Number.isInteger(l.width) ? ACTUAL_WIDTH[/** @type {2} */ (l.width)] : undefined;
    const milled = at && aw ? (at * aw * l.length) / 12 : null;
    const each = basis === "actual" && milled != null ? milled : sold;
    const bf = each * count;
    let lineCost = null;
    if (l.pricePerBf != null) lineCost = l.pricePerBf * (basis === "actual" ? bf : sold * count);
    else if (l.pricePerPiece != null) lineCost = l.pricePerPiece * count;
    else if (l.pricePerFt != null) lineCost = l.pricePerFt * l.length * count;
    if (lineCost != null) { cost += lineCost; priced++; }
    totalBf += bf; totalCuFt += (bf / 12); pieces += count; lineFeet += l.length * count;
    if (milled != null) totalActualBf += milled * count; else totalActualBf += sold * count;
    return { n: i + 1, label: l.label ?? "", thickness: t, width: l.width, length: l.length, count, bfEach: each, bf, soldBfEach: sold, milledBfEach: milled, cost: lineCost == null ? null : r2(lineCost), perBf: lineCost == null ? null : lineCost / bf };
  });
  const withWaste = totalBf * (1 + waste);
  return {
    ok: true, basis, waste, lines, pieces, lineFeet,
    boardFeet: r2(totalBf), boardFeetWithWaste: r2(withWaste), boardFeetToBuy: Math.ceil(withWaste - 1e-9),
    cubicFeet: r2(totalCuFt), cubicFeetWithWaste: r2(withWaste / 12),
    milledBoardFeet: r2(totalActualBf),
    pricedLines: priced, cost: priced ? r2(cost) : null, costWithWaste: priced ? r2(cost * (1 + waste)) : null,
    costPerBf: priced && totalBf > 0 && priced === lines.length ? cost / totalBf : null,
  };
}

/** @param {any} p */
export function boardFootText(p) {
  const L = ["Board feet (" + p.basis + " sizes)", ""];
  for (const l of p.lines) {
    const dims = `${l.thickness} x ${l.width} in, ${l.length} ft long`;
    const price = l.cost != null ? `  $${l.cost.toFixed(2)}` + (l.perBf != null ? ` ($${l.perBf.toFixed(2)}/bf)` : "") : "";
    const milled = l.milledBfEach != null && p.basis === "nominal" ? `  [milled ${l.milledBfEach.toFixed(2)} bf each]` : "";
    L.push(`${String(l.n).padStart(2)}. ${l.label ? l.label + ": " : ""}${l.count} pc of ${dims} = ${l.bf.toFixed(2)} bf${price}${milled}`);
  }
  L.push("", `Total: ${p.boardFeet.toFixed(2)} bf (${p.cubicFeet.toFixed(2)} cu ft) in ${p.pieces} piece${p.pieces === 1 ? "" : "s"}, ${p.lineFeet} linear ft`);
  if (p.waste > 0) L.push(`With ${(p.waste * 100).toFixed(0)}% waste: ${p.boardFeetWithWaste.toFixed(2)} bf, buy ${p.boardFeetToBuy} bf`);
  if (p.basis === "nominal" && p.milledBoardFeet < p.boardFeet - 0.005) L.push(`Milled to actual sizes the same boards hold ${p.milledBoardFeet.toFixed(2)} bf; you are priced on the sold size.`);
  if (p.cost != null) {
    L.push(`Cost: $${p.cost.toFixed(2)}` + (p.waste > 0 ? ` ($${p.costWithWaste.toFixed(2)} with waste)` : "") + (p.pricedLines < p.lines.length ? ` for ${p.pricedLines} of ${p.lines.length} priced lines` : ""));
    if (p.costPerBf != null) L.push(`Average: $${p.costPerBf.toFixed(2)} per board foot`);
  }
  return L;
}
