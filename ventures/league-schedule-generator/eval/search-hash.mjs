// One hash over a fixed spread of carry-over searches (single and double, weighted and capped,
// odd and even leagues, cyclic, both venue searches). A speed-up to carryover.mjs must leave it
// unchanged: every search is seeded and every cost an integer, so any change to a cost or a move
// sends the annealing down another path and the hash moves.
//
//   node eval/search-hash.mjs                  # this tree's carryover.mjs
//   node eval/search-hash.mjs path/to/old.mjs  # another copy (keep it beside calc.mjs)
//
// 2026-11-12: f61d94fa030609cb8c3e75fa486180a7ff898ca5309c4c787136405fb9bb9f4a, 142 results
// (docs/history/ci-perf-2026-11-12-carryover-cached-costs.md).

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const target = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : new URL("../carryover.mjs", import.meta.url).href;
const mod = await import(target);
const h = createHash("sha256");
const t0 = Date.now();
let k = 0;
const add = (x) => { h.update(JSON.stringify(x)); k++; };
for (const n of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) for (const double of [false, true]) for (let i = 0; i < 6; i++)
  add(mod.carryOverTry(n, i, { double, seed: 3 + n, effort: 0.05, weighted: 4 }));
for (const n of [6, 9, 12]) for (const legacy of [false, true]) add(mod.assignVenues(mod.circleOpp(n % 2 ? n + 1 : n), n, 5, 8, { legacy }));
add(mod.lowCarryOverDoubleRounds(10, { seed: 2, effort: 0.1, breakWeight: 20, field: false }));
add(mod.lowCarryOverDoubleRounds(9, { seed: 2, effort: 0.1, maxBreaks: 30, legBreaks: 10 }));
add(mod.lowCarryOverDoubleRounds(12, { seed: 2, effort: 0.1 }));
add(mod.lowCarryOverRounds(11, { seed: 7, effort: 0.1, cyclic: true, breakWeight: 15 }));
console.log(h.digest("hex"), k, "results", Date.now() - t0, "ms");
