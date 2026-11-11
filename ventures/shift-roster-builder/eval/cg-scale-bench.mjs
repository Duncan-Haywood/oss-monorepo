// Column generation (openFloorByColumnGeneration) on bigger weeks than cg-bench.mjs: 20-60 people and about 80-390 shift
// copies, to find where the per-person pricing oracle stops being exact (it is capped at `maxNodes` per call) and where the
// branch-and-price stops proving the open-hours floor inside its time limit. Same generator as cg-bench.mjs and
// ilp-export.mjs (same seed rule), with shift lines scaled to people so supply and demand stay in the same ratio as the
// 10x28 bench week (about 2.8 lines per person).
//   node eval/cg-scale-bench.mjs P S [cases=3] [ms=60000] [maxNodes=2000000]
//   DIVE=0 / WARM=0 turn off the deepest-first tie-break and the warm-started LP (both on by default since 2026-11-10).
//   ROOTDIVE=0 turns off the root dive (pin integral columns plus the heaviest fractional one, re-price; on since 2026-11-11).
//   WEEKS=w.json also writes the weeks for an independent ILP: python3 eval/ilp-check.py w.json
// Hard rules only; no incumbent is given, so the floor is proven only by the search itself.
import { writeFileSync } from "node:fs";
import { parseStaff, parseShifts, buildContext, openFloorByColumnGeneration } from "../calc.mjs";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 20), S = Number(process.argv[3] || 56), cases = Number(process.argv[4] || 3);
const ms = Number(process.argv[5] || 60000), maxNodes = Number(process.argv[6] || 2000000);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const weeks = [];
console.log(`${P} people, ${S} shift lines, oracle cap ${maxNodes} nodes per call, ${ms} ms per week`);
console.log("case  copies  demand-h  rootLP  floor  best  proven  nodes  columns  rounds  pricing-calls  inexact  max-oracle-nodes  pricing-ms  ms  dive-steps  dive-found");
for (let c = 0; c < cases; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  const staff = parseStaff(st).staff, ps = parseShifts(sh);
  if (ps.error || ps.errors?.length) { console.log(c, "shifts file refused:", ps.error || ps.errors.join("; ")); continue; }
  const slots = ps.slots;
  const demand = slots.reduce((a, s) => a + (s.end - s.start) / 60, 0);
  const r = openFloorByColumnGeneration(staff, slots, { exact: true }, { nodeLimit: 100000, ms, maxNodes, dive: process.env.DIVE !== "0", rootDive: process.env.ROOTDIVE !== "0", diveWidth: process.env.WIDTH ? Number(process.env.WIDTH) : null, warm: process.env.WARM !== "0" });
  const t = r.stats;
  console.log([c, slots.length, demand, r.rootLP.toFixed(2), r.floor, r.best ?? "-", r.proven, t.nodes, t.columns, t.rounds, t.pricingCalls, t.inexactPricing, t.maxPricingNodes, t.pricingMs, t.ms, t.diveSteps ?? 0, t.diveFound ? "yes" : "no"].join("\t"));
  if (process.env.WEEKS) {
    const ctx = buildContext(staff, slots, { exact: true });
    weeks.push({ slots: ctx.slots.map((s) => [s.start, s.end]), elig: ctx.elig, maxH: ctx.staff.map((p) => p.maxHours), rest: ctx.restMin, engineOpen: r.best, engineFloor: r.floor });
  }
}
if (process.env.WEEKS) writeFileSync(process.env.WEEKS, JSON.stringify(weeks));
