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
import { gangOpenings } from "./ganged.mjs";

export const VARIANTS = [
  ["standard 16 in", {}, 16],
  ["24 in spacing", {}, 24],
  ["corners + ladder tees", { twoStudCorners: true, ladderTees: true }, 16],
  ["single top plate", { singleTopPlate: true }, 16],
  ["all three details, 16 in", { twoStudCorners: true, ladderTees: true, singleTopPlate: true }, 16],
  ["all three details + 24 in", { twoStudCorners: true, ladderTees: true, singleTopPlate: true }, 24],
];

/**
 * @param {any} plan
 * @param {{ gang?: boolean, longBoards?: boolean }} [opts] longBoards: add 20 and 24 ft boards in every
 *   size at the default 1 per foot price (a long header needs a longer board or a beam line), the same
 *   for every variant, so a plan whose ganged header outgrows the 16 ft stock is measured. `longBoardsAdded`
 *   says so; whether a header that long is sound is an engineer's call. gang: frame windows too close for their own kings as one
 *   opening (the opt-in `--gang` step), so a plan that otherwise does not lay out is measured.
 *   The gang is applied identically to every variant; `ganged` lists its notes.
 */
export function measure(plan, opts = {}) {
  const rows = [];
  /** @type {string[]} */
  let ganged = [];
  if (opts.gang) { const g = gangOpenings(plan); plan = g.plan; ganged = g.notes; }
  let longBoardsAdded = false;
  if (opts.longBoards) {
    const have = new Set((plan.stock || []).map((/** @type {any} */ x) => `${x.size}|${x.length}`));
    const extra = [];
    for (const size of ["2x4", "2x4 PT", "2x6", "2x6 PT", "2x8", "2x10", "2x12"]) {
      for (const f of [20, 24]) if (!have.has(`${size}|${f * 12}`)) extra.push({ size, length: f * 12, price: f });
    }
    plan = { ...plan, stock: [...(plan.stock || []), ...extra] };
    longBoardsAdded = extra.length > 0;
  }
  for (const [name, advanced, spacing] of VARIANTS) {
    const r = takeoff({ ...plan, studSpacing: spacing, advanced });
    if (!r.ok) return { ok: false, errors: r.errors };
    const s = r.summary;
    rows.push({ name, pieces: s.pieces, boards: s.boards, cost: s.cost, feet: s.boughtFeet });
  }
  return { ok: true, rows, ganged, longBoardsAdded };
}

const cases = [["example house (invented)", samplePlan()]];
for (const n of [1, 2]) {
  const r = planFromDxf(readFileSync(new URL(`./fixtures/open-house-plans-${n}.dxf`, import.meta.url), "utf8"));
  if (r.ok) cases.push([`Open House Plans ${n} (CC0, generated)`, { ...samplePlan(), ...r.plan }]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, plan] of cases) {
    let m = measure(plan);
    console.log(`\n${name}`);
    if (!m.ok) {
      const asDrawn = m.errors[0];
      const g = measure(plan, { gang: true });
      if (g.ok) {
        m = g;
        console.log(`does not lay out as drawn (${asDrawn}); measured with --gang:`);
        for (const n of g.ganged) console.log(`  ${n}`);
      } else {
        const L = measure(plan, { gang: true, longBoards: true });
        if (!L.ok) {
          console.log(`does not lay out as drawn: ${asDrawn}`);
          console.log(`with --gang it still does not: ${g.errors[0]}`);
          console.log(`and not with 20 and 24 ft boards added either: ${L.errors[0]}`);
          continue;
        }
        m = L;
        console.log(`does not lay out as drawn (${asDrawn}); measured with --gang and 20 and 24 ft boards added at 1 per foot (a bench assumption; ${g.errors[0]}):`);
        for (const n of L.ganged) console.log(`  ${n}`);
      }
    }
    console.log("option | pieces | boards | bought ft | order cost | vs standard");
    const base = m.rows[0].cost;
    for (const r of m.rows) console.log(`${r.name} | ${r.pieces} | ${r.boards} | ${r.feet.toFixed(0)} | $${r.cost.toFixed(2)} | ${r === m.rows[0] ? "-" : ((r.cost - base) / base * 100).toFixed(1) + "%"}`);
  }
}
