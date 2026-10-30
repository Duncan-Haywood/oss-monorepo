// @ts-check
// What does advanced framing save, measured on the same walls with the same engine?
// Options (plan `advanced` + stud spacing), one at a time and together, against the
// standard 16 in layout. Lumber only: priced order cost, boards, pieces.
//
//   node advanced-bench.mjs     # prints the table quoted in README "Advanced framing"
//
// Whether a wall may use a detail (24 in spacing needs a stress check, single top plate
// needs in-line framing) is a code and engineer's call this tool cannot see.
import { readFileSync } from "node:fs";
import { samplePlan, takeoff } from "./engine.mjs";
import { planFromDxf } from "./dxf.mjs";

export const VARIANTS = [
  ["standard 16 in", {}, 16],
  ["24 in spacing", {}, 24],
  ["corners + ladder tees", { twoStudCorners: true, ladderTees: true }, 16],
  ["single top plate", { singleTopPlate: true }, 16],
  ["all three details, 16 in", { twoStudCorners: true, ladderTees: true, singleTopPlate: true }, 16],
  ["all three details + 24 in", { twoStudCorners: true, ladderTees: true, singleTopPlate: true }, 24],
];

/** @param {any} plan */
export function measure(plan) {
  const rows = [];
  for (const [name, advanced, spacing] of VARIANTS) {
    const r = takeoff({ ...plan, studSpacing: spacing, advanced });
    if (!r.ok) return { ok: false, errors: r.errors };
    const s = r.summary;
    rows.push({ name, pieces: s.pieces, boards: s.boards, cost: s.cost, feet: s.boughtFeet });
  }
  return { ok: true, rows };
}

const cases = [["example house (invented)", samplePlan()]];
for (const n of [1, 2]) {
  const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
  if (r.ok) cases.push([`Open House Plans ${n} (CC0, generated)`, { ...samplePlan(), ...r.plan }]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, plan] of cases) {
    const m = measure(plan);
    console.log(`\n${name}`);
    if (!m.ok) { console.log(`does not lay out: ${m.errors[0]}`); continue; }
    console.log("option | pieces | boards | bought ft | order cost | vs standard");
    const base = m.rows[0].cost;
    for (const r of m.rows) console.log(`${r.name} | ${r.pieces} | ${r.boards} | ${r.feet.toFixed(0)} | $${r.cost.toFixed(2)} | ${r === m.rows[0] ? "-" : ((r.cost - base) / base * 100).toFixed(1) + "%"}`);
  }
}
