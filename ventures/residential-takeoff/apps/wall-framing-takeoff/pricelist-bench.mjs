// @ts-check
// What optimising the order on a yard's prices is worth, against the usual shortcut: optimise on
// length (the placeholder, 1 per foot) and price the order afterwards. Same houses as
// allowance-bench.mjs (one invented, two generated from CC0 DXFs), same board lengths in both
// runs; only the prices the optimiser sees differ. The price lists are INVENTED shapes, not any
// yard's prices: a flat price per foot (the control: nothing to gain), precut studs cheaper per
// foot than 8 ft boards, and long boards dearer per foot.
//
//   node pricelist-bench.mjs           prints the table
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";

const PER_FT = { "2x4": 0.55, "2x4 PT": 0.77, "2x6": 0.85, "2x6 PT": 1.19, "2x8": 1.05, "2x10": 1.3, "2x12": 1.8 };
const FEET = [8, 10, 12, 14, 16];

/**
 * An invented price list as plan stock. `precut` scales a precut stud's price per foot, `long` is the per-foot premium per foot over 8 ft.
 * @param {number} studLength @param {{ precut: number, long: number }} shape
 */
export function inventedStock(studLength, shape) {
  const out = [];
  for (const [size, pf] of Object.entries(PER_FT)) {
    for (const f of FEET) out.push({ size, length: f * 12, price: Math.round(pf * f * (1 + shape.long * (f - 8)) * 100) / 100 });
    if (size === "2x4" || size === "2x6") out.push({ size, length: studLength, price: Math.round(pf * (studLength / 12) * shape.precut * 100) / 100, label: "precut stud" });
  }
  return out;
}

/** @param {any} r takeoff result @param {Map<string, number>} price */
const costAt = (r, price) => r.orders.reduce((t, /** @type {any} */ o) => t + o.lines.reduce((u, /** @type {any} */ l) => u + l.qty * /** @type {number} */ (price.get(`${o.size}|${l.length}|${l.label ?? ""}`)), 0), 0);

/**
 * @param {any} plan @param {{ precut: number, long: number }} shape
 * @returns {{ byLength: number, byPrice: number, saving: number, boardsByLength: number, boardsByPrice: number }}
 */
export function measure(plan, shape) {
  const stock = inventedStock(plan.studLength, shape);
  const price = new Map(stock.map((s) => [`${s.size}|${s.length}|${s.label ? s.label : ""}`, s.price]));
  const lengthOnly = takeoff({ ...plan, stock: stock.map((s) => ({ ...s, price: Math.round((s.length / 12) * 1000) / 1000 })) });
  const priced = takeoff({ ...plan, stock });
  if (!lengthOnly.ok || !priced.ok) throw new Error(`takeoff failed: ${JSON.stringify(lengthOnly.errors || priced.errors)}`);
  // order lines carry the label as `label` on precut lines; key them the same way
  const byLength = costAt(lengthOnly, price), byPrice = costAt(priced, price);
  const boards = (/** @type {any} */ r) => r.orders.reduce((t, /** @type {any} */ o) => t + o.lines.reduce((u, /** @type {any} */ l) => u + l.qty, 0), 0);
  return { byLength: Math.round(byLength * 100) / 100, byPrice: Math.round(byPrice * 100) / 100, saving: (byLength - byPrice) / byLength, boardsByLength: boards(lengthOnly), boardsByPrice: boards(priced) };
}

export const SHAPES = /** @type {const} */ ([
  ["flat per foot (control)", { precut: 1, long: 0 }],
  ["precut 15% cheaper per foot", { precut: 0.85, long: 0 }],
  ["long boards dearer: +2% a foot for each foot over 8 ft", { precut: 1, long: 0.02 }],
  ["both", { precut: 0.85, long: 0.02 }],
]);

export function houses() {
  /** @type {[string, any][]} */
  const out = [["example house (invented)", samplePlan()]];
  for (const n of [1, 2]) {
    const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
    if (r.ok) out.push([`Open House Plans ${n} (CC0, generated)`, { ...samplePlan(), ...r.plan }]);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log("| house | invented price list | optimised on length, then priced | optimised on the prices | saving | boards |");
  console.log("|---|---|---|---|---|---|");
  for (const [name, plan] of houses()) for (const [label, shape] of SHAPES) {
    if (!takeoff(plan).ok) { console.log(`| ${name} | (the plan checks refuse this house as generated; skipped) | | | | |`); break; }
    const m = measure(plan, shape);
    console.log(`| ${name} | ${label} | ${m.byLength.toFixed(2)} | ${m.byPrice.toFixed(2)} | ${(100 * m.saving).toFixed(1)}% | ${m.boardsByLength} -> ${m.boardsByPrice} |`);
  }
}
