// Dumps the page's 12 carry-over tries (8 weighted, 2 capped, 2 gap) for one size and seed as JSON,
// for eval/orient-maxsat.py: [{ i, coe, breaks, start, rounds }], rounds as the page builds them.
//
//   node eval/orient-maxsat-dump.mjs <teams> <seed> [d] > tries.json     (d: home and away)
import { carryOverTry, CARRY_OVER_GAP } from "../carryover.mjs";

const n = +process.argv[2], seed = +process.argv[3], double = process.argv[4] === "d";
const out = [];
for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) {
  const t = carryOverTry(n, i, { seed, weighted: 8, double });
  out.push({ i, coe: t.coe, breaks: t.breaks, start: t.start ?? null, rounds: t.rounds });
}
console.log(JSON.stringify(out));
