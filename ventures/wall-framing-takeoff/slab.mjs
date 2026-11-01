// @ts-check
// Plain slab, footing strip or round pier: cubic yards, ready-mix order and
// bagged-mix count. Closed-form geometry; the bag yields are the label
// figures (typed, change them); nothing here checks soil, frost depth or
// whether a thickness is enough for the load.
const CU_FT_PER_YD = 27;
/** Cubic feet per bag, from product labels: 40 lb 0.30, 60 lb 0.45, 80 lb 0.60. */
export const BAG_YIELD = { 40: 0.3, 60: 0.45, 80: 0.6 };

/** @param {{ shape?: "slab"|"footing"|"pier", length?: number, width?: number, diameter?: number, depth?: number, count?: number, waste?: number, bag?: number }} s inches
 *  @returns {{ ok: true, cuFt: number, cuYd: number, orderYd: number, withWaste: number, bags: number, bag: number, shortLoad: boolean, notes: string[] } | { ok: false, errors: string[] }} */
export function slabConcrete(s) {
  const shape = s.shape ?? "slab", waste = s.waste ?? 0.1, bag = s.bag ?? 80, count = s.count ?? 1, errors = [];
  if (!["slab", "footing", "pier"].includes(shape)) errors.push('shape is "slab", "footing" or "pier".');
  if (!(s.depth >= 2 && s.depth <= 96)) errors.push("Thickness or depth must be between 2 and 96 in.");
  if (shape !== "pier" && !(s.length >= 12 && s.length <= 4800)) errors.push("Length must be between 1 and 400 ft.");
  if (shape !== "pier" && !(s.width >= 4 && s.width <= 2400)) errors.push("Width must be between 4 in and 200 ft.");
  if (shape === "pier" && !(s.diameter >= 6 && s.diameter <= 60)) errors.push("Pier diameter must be between 6 and 60 in.");
  if (!Number.isInteger(count) || count < 1 || count > 500) errors.push("Count is a whole number from 1 to 500.");
  if (!(waste >= 0 && waste <= 0.5)) errors.push("Waste is a fraction from 0 to 0.5.");
  if (!(bag in BAG_YIELD)) errors.push("Bag size is 40, 60 or 80 lb.");
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
