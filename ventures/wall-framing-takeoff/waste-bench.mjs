// @ts-check
// How much of a framing order is cutting waste? The lineal feet of stud-size
// lumber (2x4, 2x6, treated) a layout buys against the feet its pieces use,
// for four ways of buying the same cut list:
//
//   optimised, every length   the engine's cutting-stock order from 8 to 16 ft boards and precut studs
//   optimised, 8/16 ft only   the same solver, but the yard sends only 8 and 16 ft boards and precuts
//   optimised, 16 ft only     every piece cut from 16 ft boards
//   one piece per board       no planning: each piece on the shortest board it fits (no offcut reused)
//
// Waste = bought feet / used feet - 1, where used feet include the saw kerf. It is
// cutting waste only: culls (crooked or split boards), mistakes and theft are separate,
// and the engine takes a typed cull allowance for those (plan `culls: {pct}`).
//
//   node waste-bench.mjs     # prints the tables quoted on lumber-waste-factor.html
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";
import { gangOpenings } from "./ganged.mjs";
import { pathToFileURL } from "node:url";

const FRAMING = new Set(["2x4", "2x4 PT", "2x6", "2x6 PT"]);

export const MENUS = /** @type {const} */ (["every length", "8/16 ft only", "16 ft only"]);

/** The plan's stock list cut down to the menu a yard sends. @param {any[]} stock @param {string} menu */
export function menuStock(stock, menu) {
  if (menu === "every length") return stock;
  // Header sizes (2x8 and up) keep every length: the question is the stud-size order.
  const keep = (s) => !FRAMING.has(s.size) || (menu === "16 ft only" ? s.length === 192 : s.length === 96 || s.length === 192 || s.label === "precut stud");
  return stock.filter(keep);
}

/** @param {any} plan */
function layout(plan) {
  const run = (p) => { try { return takeoff(p); } catch (e) { return { ok: false, errors: [String(e.message)] }; } };
  let r = run(plan);
  if (!r.ok) {
    const g = gangOpenings(plan);
    if (g.notes.length) { plan = g.plan; r = run(plan); }
  }
  return { r, plan };
}

/**
 * Bought and used lineal feet of stud-size lumber for each way of buying.
 * @param {any} plan
 */
export function wasteByMenu(plan) {
  /** @type {Record<string, {bought:number, used:number, waste:number, boards:number}>} */
  const out = {};
  let base = null;
  for (const menu of MENUS) {
    const { r, plan: p } = layout({ ...plan, stock: menuStock(plan.stock, menu) });
    if (!r.ok) return { ok: false, errors: r.errors, menu };
    const orders = r.orders.filter((o) => FRAMING.has(o.size));
    const bought = orders.reduce((s, o) => s + o.bought, 0) / 12;
    const used = orders.reduce((s, o) => s + o.needed, 0) / 12;
    const boards = orders.reduce((s, o) => s + o.bars.length, 0);
    out[menu] = { bought, used, waste: bought / used - 1, boards };
    if (menu === "every length") base = { r, p };
  }
  // No planning: each piece on the shortest board of its size that fits, the offcut thrown away.
  const { r } = /** @type {{r:any, p:any}} */ (base);
  let bought = 0, used = 0, boards = 0;
  for (const o of r.orders.filter((o) => FRAMING.has(o.size))) {
    const lengths = plan.stock.filter((s) => s.size === o.size).map((s) => s.length).sort((a, b) => a - b);
    for (const bar of o.bars) for (const c of bar.cuts) {
      const fit = lengths.find((L) => L + 1e-9 >= c.length);
      if (fit == null) return { ok: false, errors: [`no ${o.size} board fits ${c.length}"`], menu: "one piece per board" };
      bought += fit; used += c.length; boards++;
    }
  }
  // `used` above is the bare cut lengths; scale to the solver's used feet (cuts plus kerf) so every row shares one base.
  const kerfUsed = out["every length"].used;
  out["one piece per board"] = { bought: bought / 12, used: kerfUsed, waste: bought / 12 / kerfUsed - 1, boards };
  return { ok: true, wallFeet: r.summary.wallFeet, menus: out };
}

/** The flat allowance a builder adds, against the measured cutting waste: what is left over for culls and mistakes. @param {number} measured @param {number} flat */
export function headroom(measured, flat) {
  return (1 + flat) / (1 + measured) - 1;
}

/** The three houses allowance-bench.mjs uses. @returns {[string, any][]} */
export function cases() {
  /** @type {[string, any][]} */
  const out = [["Example house (invented)", samplePlan()]];
  for (const n of [1, 2]) {
    const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
    if (!r.ok) continue;
    const plan = { ...samplePlan(), ...r.plan };
    // Plan 2 has a 16 ft garage-door header: add 24 ft header boards (2x8 and up) at 1.6x the 16 ft price, as allowance-bench.mjs does.
    // Header sizes are left out of every figure here, so this only lets the house lay out.
    const stock = [...plan.stock, ...["2x8", "2x10", "2x12"].map((size) => ({ size, length: 288, price: 1.6 * (plan.stock.find((x) => x.size === size && x.length === 192)?.price ?? 16) }))];
    out.push([`Open House Plans ${n} (CC0, generated)`, { ...plan, stock }]);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  console.log("house | spacing | wall ft | used ft | " + [...MENUS, "one piece per board"].join(" | "));
  for (const [name, plan] of cases()) for (const sp of [16, 24]) {
    const w = wasteByMenu({ ...plan, studSpacing: sp });
    if (!w.ok) { console.log(`${name} | ${sp} in | does not lay out (${w.menu}): ${w.errors?.[0]}`); continue; }
    const m = /** @type {any} */ (w.menus);
    console.log(`${name} | ${sp} in | ${w.wallFeet?.toFixed(0)} | ${m["every length"].used.toFixed(0)} | ` +
      [...MENUS, "one piece per board"].map((k) => `${m[k].bought.toFixed(0)} ft (${pct(m[k].waste)}, ${m[k].boards} boards)`).join(" | "));
  }
}
