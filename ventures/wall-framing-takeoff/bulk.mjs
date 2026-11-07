// @ts-check
// Bulk material (gravel, mulch, topsoil, sand): cubic yards, tons and bags for
// beds, paths and bases typed as rectangles or circles in feet and a depth in
// inches. Volume is area x depth; `compaction` (1.0 for mulch, about 1.15-1.25
// for a compacted base) and `waste` scale it; tons come from a typed
// `tonsPerYard`; bags from a typed bag size in cubic feet; a delivery
// minimum is a typed figure. Material presets are rough typical weights only:
// your supplier's ticket weight wins, so type theirs. Slope, uneven grade,
// edging, fabric and delivery fees are not sized.
import { textNumberErrors } from "./numfields.mjs";

export const PRESETS = {
  mulch: { tonsPerYard: 0.4, compaction: 1, depth: 3 },
  topsoil: { tonsPerYard: 1.2, compaction: 1.1, depth: 4 },
  "pea gravel": { tonsPerYard: 1.4, compaction: 1.1, depth: 3 },
  "crushed stone": { tonsPerYard: 1.4, compaction: 1.2, depth: 4 },
  "road base": { tonsPerYard: 1.5, compaction: 1.25, depth: 4 },
  sand: { tonsPerYard: 1.35, compaction: 1.1, depth: 1 },
};
const NUMS = ["tonsPerYard", "compaction", "waste", "bagCuFt", "minYards", "pricePerYard", "pricePerTon", "pricePerBag"];
const up = (/** @type {number} */ x) => Math.ceil(x - 1e-9);
const r2 = (/** @type {number} */ x) => Math.round(x * 100) / 100;

/** @param {any} d */
export function validateBulk(d) {
  if (d == null || typeof d !== "object" || Array.isArray(d)) return ["Bulk settings are an object."];
  if (!Array.isArray(d.areas) || !d.areas.length) return ["Bulk needs `areas`: a list of {name, length, width} or {diameter} in feet, with depth in inches."];
  if (d.areas.length > 200) return ["Bulk takes at most 200 areas."];
  const e = [];
  const m = d.material ?? {};
  if (typeof m !== "object" || Array.isArray(m)) e.push("`material` is an object.");
  else {
    if (m.name != null && !(m.name in PRESETS)) e.push(`material.name is one of: ${Object.keys(PRESETS).join(", ")} (or type tonsPerYard yourself).`);
    e.push(...textNumberErrors(m, NUMS, "material"));
    for (const k of NUMS) if (m[k] != null && (!Number.isFinite(m[k]) || m[k] < 0)) e.push(`material.${k} must be zero or more.`);
    if (m.compaction != null && m.compaction < 1) e.push("material.compaction is 1 or more (1 = none).");
    if (m.waste != null && m.waste > 1) e.push("material.waste is a fraction, 0.05 for 5%.");
    if (m.bagCuFt != null && m.bagCuFt <= 0) e.push("material.bagCuFt must be above zero.");
  }
  d.areas.forEach((a, i) => {
    const w = `Area ${i + 1}`;
    if (a == null || typeof a !== "object") { e.push(`${w} is an object.`); return; }
    const dims = ["length", "width", "diameter", "areaSqFt", "depth"];
    e.push(...textNumberErrors(a, dims, w));
    for (const k of dims) if (a[k] != null && (!Number.isFinite(a[k]) || a[k] <= 0 || a[k] > 100000)) e.push(`${w}: ${k} must be above zero and at most 100,000.`);
    const shapes = [a.length != null && a.width != null, a.diameter != null, a.areaSqFt != null].filter(Boolean).length;
    if (shapes !== 1) e.push(`${w}: type exactly one of length and width, diameter, or areaSqFt.`);
    if (a.depth == null && !(m.name in PRESETS)) e.push(`${w}: type a depth in inches (or pick a material name for its default).`);
    if (a.depth != null && a.depth > 120) e.push(`${w}: depth is in inches; ${a.depth} in is over 10 ft.`);
  });
  return e;
}

/** @param {any} d */
export function layoutBulk(d) {
  const errors = validateBulk(d);
  if (errors.length) return { ok: false, errors };
  const pre = /** @type {any} */ (PRESETS)[d.material?.name] ?? {};
  const m = { tonsPerYard: 1.4, compaction: 1, waste: 0.05, bagCuFt: 0.5, minYards: 0, ...pre, ...(d.material ?? {}) };
  /** @type {string[]} */
  const notes = [];
  let sqft = 0, cuft = 0;
  const areas = d.areas.map((/** @type {any} */ a, /** @type {number} */ i) => {
    const area = a.areaSqFt ?? (a.diameter != null ? Math.PI * (a.diameter / 2) ** 2 : a.length * a.width);
    const depth = a.depth ?? pre.depth;
    const cf = area * depth / 12;
    sqft += area; cuft += cf;
    return { name: a.name ?? `Area ${i + 1}`, sqFt: r2(area), depth, cuFt: r2(cf) };
  });
  const netYards = cuft / 27;
  const orderYards = netYards * m.compaction * (1 + m.waste);
  const delivered = Math.max(orderYards, m.minYards);
  const roundedYards = Math.ceil(delivered * 4 - 1e-9) / 4; // yards are sold to the quarter
  const tons = orderYards * m.tonsPerYard;
  const bags = up(cuft * m.compaction * (1 + m.waste) / m.bagCuFt);
  const out = {
    ok: true, areas, sqFt: r2(sqft), cuFt: r2(cuft), netYards: r2(netYards), orderYards: r2(orderYards), roundedYards,
    tons: r2(tons), bags, bagCuFt: m.bagCuFt, compaction: m.compaction, waste: m.waste, tonsPerYard: m.tonsPerYard, notes,
    cost: m.pricePerYard != null ? r2(roundedYards * m.pricePerYard) : m.pricePerTon != null ? r2(tons * m.pricePerTon) : null,
    bagCost: m.pricePerBag != null ? r2(bags * m.pricePerBag) : null,
  };
  if (m.minYards > orderYards) notes.push(`Your delivery minimum (${m.minYards} yd) is above the ${r2(orderYards)} yd the job needs.`);
  if (areas.some((a) => a.depth < 2) && d.material?.name !== "sand") notes.push("A layer under 2 in is hard to spread evenly; most suppliers suggest at least 2 in of gravel or mulch.");
  notes.push("Weights are typical figures; wet material runs heavier. Use your supplier's tons per yard.");
  return out;
}

/** @param {any} p */
export function bulkText(p) {
  const l = [];
  for (const a of p.areas) l.push(`${a.name}: ${a.sqFt} sq ft x ${a.depth} in = ${a.cuFt} cu ft`);
  l.push(`Total: ${p.sqFt} sq ft, ${p.cuFt} cu ft = ${p.netYards} cu yd in place`);
  l.push(`Order: ${p.orderYards} cu yd with ${((p.compaction - 1) * 100).toFixed(0)}% compaction and ${(p.waste * 100).toFixed(0)}% waste (${p.roundedYards} yd to the quarter yard)`);
  l.push(`Weight: about ${p.tons} tons at ${p.tonsPerYard} tons a yard`);
  l.push(`Bags: ${p.bags} of ${p.bagCuFt} cu ft`);
  if (p.cost != null) l.push(`Bulk cost: $${p.cost.toFixed(2)}`);
  if (p.bagCost != null) l.push(`Bag cost: $${p.bagCost.toFixed(2)}`);
  for (const n of p.notes) l.push(`Note: ${n}`);
  return l;
}
