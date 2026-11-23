// The page's lane search on the seasons of bowling-lane-near.mjs, now (with the stored start) against the
// `page` figure recorded before it, seeds 1 and 2. node eval/bowling-lane-near-check.mjs
import { assignLanes, offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
import { LANE_NEAR } from "../bowling-lane-near.mjs";
import { LANE_TABLE } from "../bowling-lane-table.mjs";
console.log("teams weeks | off before (seed 1) | stored | page now seed 1, seed 2 | ms (seed 1)");
const rows = Object.entries(LANE_NEAR).map(([k, e]) => [k, e]);
for (const k of ["22,34", "28,12"]) if (LANE_TABLE[k]) rows.push([k, null]);
for (const [key, e] of rows) {
  const [n, W] = key.split(",").map(Number), P = n / 2, cyc = roundRobin(n);
  const rounds = Array.from({ length: W }, (_, w) => cyc[w % cyc.length].matches);
  const t0 = Date.now();
  const a = offBound(assignLanes(rounds, n, P, { seed: 1 }), n, P);
  const ms = Date.now() - t0;
  const b = offBound(assignLanes(rounds, n, P, { seed: 2 }), n, P);
  console.log(`${String(n).padStart(5)} ${String(W).padStart(5)} | ${String(e ? e.page : "-").padStart(19)} | ${e ? String(e.off).padStart(6) : "  at 0"} | ${String(a).padStart(14)}, ${String(b).padStart(6)} | ${ms}`);
}
