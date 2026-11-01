// @ts-check
// How far off is a framing allowance from the counted order? Two rules of thumb
// builders quote, applied to the same walls the engine lays out, against the
// lineal feet of 2x4 and 2x6 the optimised order buys (header sizes left out: an
// allowance has no line for them).
//
//   node allowance-bench.mjs     # prints the table quoted in README "Verification"
//
// Rules (lineal feet of stud-size lumber, then +10% waste):
//   per-foot   one stud per foot of wall, studs at the plan's length, plus three plates
//   on-centre  ceil(length / spacing) + 1 studs per wall, 4 more per opening, 2 per
//              corner and tee, plus three plates
// Plates are three runs of the wall length (bottom, top, cap). The plan's own
// stud length and spacing are used, so a rule is only wrong by how it counts.
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";
import { gangOpenings } from "./ganged.mjs";

const FRAMING = new Set(["2x4", "2x4 PT", "2x6", "2x6 PT"]);

/** @param {any} plan */
export function compare(plan, { gang = false } = {}) {
  const run = (p) => { try { return takeoff(p); } catch (e) { return { ok: false, errors: [String(e.message)] }; } };
  const original = plan;
  let r = run(plan);
  let ganged = false;
  if (!r.ok && gang) {
    const g = gangOpenings(plan);
    if (g.notes.length) { plan = g.plan; r = run(plan); ganged = r.ok; }
  }
  // A garage-door-wide header is longer than the longest listed board: retry with 24 ft header stock at 1.6x the 16 ft price (bench assumption).
  let longHeaders = false;
  if (!r.ok && gang && r.errors.some((e) => /longer than every board/.test(e))) {
    const longer = { ...plan, stock: [...plan.stock, ...["2x4", "2x6", "2x8", "2x10", "2x12"].map((size) => ({ size, length: 288, price: 1.6 * (plan.stock.find((x) => x.size === size && x.length === 192)?.price ?? 10) }))] };
    r = run(longer);
    if (r.ok) { plan = longer; longHeaders = true; ganged = ganged || plan !== original; }
  }
  if (!r.ok) return { ok: false, errors: r.errors };
  const counted = r.orders.filter((o) => FRAMING.has(o.size)).reduce((s, o) => s + o.bought, 0) / 12;
  const stud = (plan.studLength ?? 92.625) / 12;
  let perFoot = 0, onCentre = 0;
  for (const w of original.walls) {
    const lf = w.length / 12;
    const plates = 3 * lf;
    perFoot += lf * stud + plates;
    const ends = (w.corner ? 2 : 0) + (w.tees ? w.tees.length * 2 : 0);
    const studs = Math.ceil(w.length / (plan.studSpacing ?? 16)) + 1 + 4 * (w.openings?.length ?? 0) + ends;
    onCentre += studs * stud + plates;
  }
  perFoot *= 1.1; onCentre *= 1.1;
  return {
    ok: true, ganged, longHeaders, wallFeet: r.summary.wallFeet, counted, perFoot, onCentre,
    perFootOff: (perFoot - counted) / counted, onCentreOff: (onCentre - counted) / counted,
  };
}

const cases = [["example house (invented)", samplePlan()]];
for (const n of [1, 2]) {
  const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
  if (r.ok) cases.push([`Open House Plans ${n} (CC0, generated)`, { ...samplePlan(), ...r.plan }]);
}

/** The same comparison at each stud spacing: rules that count studs per foot ignore it, the counted order does not. @param {any} plan @param {number[]} spacings */
export function spacingSweep(plan, spacings = [16, 24]) {
  return spacings.map((sp) => ({ spacing: sp, ...compare({ ...plan, studSpacing: sp }, { gang: true }) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  console.log("plan | wall ft | counted order ft | per-foot rule | on-centre rule");
  for (const [name, plan] of cases) {
    const c = compare(plan, { gang: true });
    if (!c.ok) { console.log(`${name} | does not lay out: ${c.errors[0]}`); continue; }
    console.log(`${name}${c.ganged ? " (close openings ganged)" : ""}${c.longHeaders ? " (24 ft headers added)" : ""} | ${c.wallFeet.toFixed(0)} | ${c.counted.toFixed(0)} | ${c.perFoot.toFixed(0)} (${pct(c.perFootOff)}) | ${c.onCentre.toFixed(0)} (${pct(c.onCentreOff)})`);
  }
  console.log("\nplan | spacing | counted ft | per-foot rule | on-centre rule");
  for (const [name, plan] of cases) for (const c of spacingSweep(plan)) {
    if (!c.ok) continue;
    console.log(`${name}${c.ganged ? " (ganged)" : ""} | ${c.spacing} in | ${c.counted.toFixed(0)} | ${c.perFoot.toFixed(0)} (${pct(c.perFootOff)}) | ${c.onCentre.toFixed(0)} (${pct(c.onCentreOff)})`);
  }
}
