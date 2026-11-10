// @ts-check
// Plain slab, footing strip or round pier: cubic yards, ready-mix order and
// bagged-mix count. Closed-form geometry; the bag yields are the label
// figures (typed, change them); nothing here checks soil, frost depth or
// whether a thickness is enough for the load.
import { textNumberErrors } from "./numfields.mjs";
const CU_FT_PER_YD = 27;
/** Cubic feet per bag, from product labels: 40 lb 0.30, 60 lb 0.45, 80 lb 0.60. */
export const BAG_YIELD = { 40: 0.3, 60: 0.45, 80: 0.6 };

/** @param {{ shape?: "slab"|"footing"|"pier", length?: number, width?: number, diameter?: number, depth?: number, count?: number, waste?: number, bag?: number }} s inches
 *  @returns {{ ok: true, cuFt: number, cuYd: number, orderYd: number, withWaste: number, bags: number, bag: number, shortLoad: boolean, notes: string[] } | { ok: false, errors: string[] }} */
export function slabConcrete(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, errors: ["Give the slab, footing or pier as an object with its sizes."] };
  const shape = s.shape ?? "slab", waste = s.waste ?? 0.1, bag = s.bag ?? 80, count = s.count ?? 1, errors = textNumberErrors(s, ["length", "width", "diameter", "depth", "count", "waste", "bag"]);
  if (!["slab", "footing", "pier"].includes(shape)) errors.push('shape is "slab", "footing" or "pier".');
  if (!(s.depth >= 2 && s.depth <= 96)) errors.push("Thickness or depth must be between 2 and 96 in.");
  if (shape !== "pier" && !(s.length >= 12 && s.length <= 4800)) errors.push("Length must be between 1 and 400 ft.");
  if (shape !== "pier" && !(s.width >= 4 && s.width <= 2400)) errors.push("Width must be between 4 in and 200 ft.");
  if (shape === "pier" && !(s.diameter >= 6 && s.diameter <= 60)) errors.push("Pier diameter must be between 6 and 60 in.");
  if (!Number.isInteger(count) || count < 1 || count > 500) errors.push("Count is a whole number from 1 to 500.");
  if (!(waste >= 0 && waste <= 0.5)) errors.push("Waste is a fraction from 0 to 0.5.");
  if (!Object.hasOwn(BAG_YIELD, bag)) errors.push("Bag size is 40, 60 or 80 lb.");
  if (errors.length) return { ok: false, errors };
  const area = shape === "pier" ? Math.PI * (/** @type {number} */ (s.diameter) / 2) ** 2 : /** @type {number} */ (s.length) * /** @type {number} */ (s.width);
  const cuFt = area * /** @type {number} */ (s.depth) * count / 1728;
  const cuYd = cuFt / CU_FT_PER_YD, withWaste = cuYd * (1 + waste);
  const orderYd = Math.ceil(withWaste * 4 - 1e-9) / 4; // plants sell in quarter yards
  const bags = Math.ceil(cuFt * (1 + waste) / BAG_YIELD[/** @type {40|60|80} */ (bag)] - 1e-9);
  const shortLoad = orderYd < 4;
  const notes = [];
  if (shortLoad) notes.push("Under about 4 cu yd many ready-mix plants add a short-load charge; ask yours. For a yard or two, price bagged mix against the short-load fee.");
  if (shape === "slab" && s.depth < 4) notes.push("Under 4 in is thinner than the usual 4 in slab on grade: check with your engineer or building department.");
  return { ok: true, cuFt, cuYd, withWaste, orderYd, bags, bag: /** @type {number} */ (bag), shortLoad, notes };
}

/** @param {ReturnType<typeof slabConcrete>} r */
export function slabText(r) {
  if (!r.ok) return /** @type {any} */ (r).errors.map((e) => `  - ${e}`);
  const out = [`Concrete: ${r.cuFt.toFixed(1)} cu ft = ${r.cuYd.toFixed(2)} cu yd`, `With waste: ${r.withWaste.toFixed(2)} cu yd, so order ${r.orderYd.toFixed(2)} cu yd of ready-mix`, `Or ${r.bags} bags of ${r.bag} lb mix`];
  for (const n of r.notes) out.push(`- ${n}`);
  return out;
}

/** Control-joint rules of thumb (typed; the engineer's or local book's figures win): spacing is 30 times the slab thickness (the usual 24 to 36 range), never over 15 ft, panels no longer than 1.5 times their width, saw cut at least 1/4 of the thickness, cut within 6 to 18 hours of the pour. */
export const JOINT_RULES = { spacingFactor: 30, maxSpacing: 180, maxAspect: 1.5, cutFraction: 0.25 };

/** Control-joint layout for a rectangular slab on grade: equal panels that stay inside the spacing limit and the aspect limit (extra cuts are added on the long side when the spacing alone leaves long thin panels), the saw-cut length and the cut depth.
 *  @param {{ length?: number, width?: number, depth?: number, spacingFactor?: number, maxSpacing?: number }} s inches
 *  @returns {{ ok: true, spacing: number, cutsAlongLength: number, cutsAlongWidth: number, panelLength: number, panelWidth: number, panels: number, aspect: number, sawCutFeet: number, cutDepth: number, notes: string[] } | { ok: false, errors: string[] }} */
export function controlJoints(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, errors: ["Give the slab as an object with length, width and depth in inches."] };
  const factor = s.spacingFactor ?? JOINT_RULES.spacingFactor, cap = s.maxSpacing ?? JOINT_RULES.maxSpacing;
  const errors = textNumberErrors(s, ["length", "width", "depth", "spacingFactor", "maxSpacing"]);
  if (!(s.depth >= 2 && s.depth <= 24)) errors.push("Thickness must be between 2 and 24 in.");
  if (!(s.length >= 12 && s.length <= 4800)) errors.push("Length must be between 1 and 400 ft.");
  if (!(s.width >= 12 && s.width <= 4800)) errors.push("Width must be between 1 and 400 ft.");
  if (!(factor >= 12 && factor <= 48)) errors.push("Spacing factor is from 12 to 48 times the thickness.");
  if (!(cap >= 24 && cap <= 360)) errors.push("Maximum spacing is from 2 to 30 ft.");
  if (errors.length) return { ok: false, errors };
  const L = /** @type {number} */ (s.length), W = /** @type {number} */ (s.width), D = /** @type {number} */ (s.depth);
  const spacing = Math.min(factor * D, cap);
  // Equal panels: the fewest that keep each panel at or under the spacing,
  // then one more cut across the long side of the panel at a time until no
  // panel is longer than maxAspect times its width (a long thin panel cracks
  // across the middle whatever the spacing).
  let nL = Math.ceil(L / spacing - 1e-9), nW = Math.ceil(W / spacing - 1e-9);
  const spacingCuts = nL + nW;
  while (Math.max(L / nL, W / nW) > JOINT_RULES.maxAspect * Math.min(L / nL, W / nW) + 1e-9) {
    if (L / nL > W / nW) nL++; else nW++;
  }
  const panelLength = L / nL, panelWidth = W / nW;
  const cutsAlongLength = nL - 1, cutsAlongWidth = nW - 1;
  const sawCutFeet = (cutsAlongLength * W + cutsAlongWidth * L) / 12;
  const notes = [];
  const aspect = Math.max(panelLength, panelWidth) / Math.min(panelLength, panelWidth);
  const shapeCuts = nL + nW - spacingCuts;
  if (shapeCuts > 0) notes.push(`${shapeCuts} extra cut${shapeCuts > 1 ? "s" : ""} beyond the spacing keep${shapeCuts > 1 ? "" : "s"} each panel within ${JOINT_RULES.maxAspect} times its width; a long thin panel tends to crack across its middle.`);
  notes.push("Saw within 6 to 18 hours of the pour, before random cracks start. Joints run through to meet columns, walls and any re-entrant corner.");
  return { ok: true, spacing, cutsAlongLength, cutsAlongWidth, panelLength, panelWidth, panels: nL * nW, aspect, sawCutFeet, cutDepth: D * JOINT_RULES.cutFraction, notes };
}

/** Plain-text lines for a `controlJoints` result.
 *  @param {ReturnType<typeof controlJoints>} r */
export function jointText(r) {
  if (!r.ok) return /** @type {any} */ (r).errors.map((e) => `  - ${e}`);
  const f = (/** @type {number} */ n) => (Math.round(n * 10) / 10).toString();
  const out = [`Control joints: ${r.panels} panels of ${f(r.panelLength)} x ${f(r.panelWidth)} in, ${r.aspect.toFixed(2)} : 1 (spacing limit ${f(r.spacing)} in)`, `Saw cuts: ${r.cutsAlongLength} across the length, ${r.cutsAlongWidth} across the width, ${f(r.sawCutFeet)} ft in all, ${f(r.cutDepth)} in deep`];
  for (const n of r.notes) out.push(`- ${n}`);
  return out;
}
