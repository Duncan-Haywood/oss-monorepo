// The second-call-out check's pair hours at budgets of 500 (the default), 2,000, 10,000 and 1,000,000 steps a pair, on 22
// rosters: the five templates and six seeded 20- and 40-person weeks, each default and --cover-price 25 (2026-11-15, README
// "Fewer capped pairs"). Reported per budget: pairs given up on, pair hours, walk time. Invented teams, single runs.
//   node eval/cover-pair-budgets.mjs
import { parseStaff, parseShifts, buildRoster, buildContext, coverRisk, coverPairRisk } from "../calc.mjs";
import { seededWeeks } from "./reissue-scale.mjs";
import { sets } from "./real-rate-week.mjs";
const BASE = { minRestHours: 10 };
const cases = [];
for (const [P, S, w] of [[20, 56, 0],[20, 56, 1],[20, 56, 2], [40, 112, 0], [40,112,1],[40, 112, 2]]) {
  const { staff: st, shifts: sh } = seededWeeks(P, S, w + 1)[w];
  for (const cp of [0, 25]) cases.push([`${P}x${S} w${w} cp${cp}`, st, sh, cp]);
}
for (const [k, [st, sh]] of Object.entries(sets())) for (const cp of [0, 25]) cases.push([`${k} cp${cp}`, st, sh, cp]);
const out = [];
for (const [label, st, sh, cp] of cases) {
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const r = buildRoster(staff, slots, { ...BASE, ...(cp ? { coverPrice: cp } : {}), seed: 1 });
  out.push({ label, st, sh, owner: Array.from(r.owner) });
  const ctx = buildContext(staff, slots, BASE);
  const one = coverRisk(ctx, r.owner);
  const row = [label];
  for (const b of [500, 2000, 10000, 1e6]) { const t = performance.now(); const x = coverPairRisk(ctx, r.owner, { single: one, budget: b }); row.push(`${b}: ${x.capped} capped, ${x.hours} h, ${(performance.now() - t).toFixed(0)} ms`); }
  console.log(row.join(" | "));
}
