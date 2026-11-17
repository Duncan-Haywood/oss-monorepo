// node eval/bench.mjs  -- solver benchmark on synthetic fully booked schools
import { syntheticSchool } from "./generate.mjs";
import { parseSchool, solve, validate, feasibility } from "../timetable.mjs";
const sizes = (process.argv[2] || "4,8,12,16,24").split(",").map(Number);
const seeds = Number(process.argv[3] || 3);
console.log("classes | units | seed | ms | hard | class gaps | teacher gaps | repeats | valid");
for (const n of sizes) {
  for (let seed = 1; seed <= seeds; seed++) {
    const { problem, errors } = parseSchool(syntheticSchool({ classes: n, seed }));
    if (errors.length) throw new Error(errors.join("; "));
    if (feasibility(problem).length) { console.log(n, "infeasible by counting"); continue; }
    const t0 = Date.now();
    const s = solve(problem, { seed });
    const ms = Date.now() - t0;
    const v = validate(problem, s.units, s.placements);
    console.log([n, s.units.length, seed, ms, s.hard, v.stats.classGaps, v.stats.teacherGaps, v.stats.repeats, v.ok].join(" | "));
  }
}
