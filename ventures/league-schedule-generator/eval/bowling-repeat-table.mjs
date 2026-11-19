// Back-to-back repeats of the page's season on every stored-answer season (bowling-lane-table.mjs
// keys, plus the pinned lengths of eval/bowling-lanes.mjs), seed 1: the season bowlingSchedule()
// would build, with its lane balance. Run in this tree and in an older one to compare.
// node eval/bowling-repeat-table.mjs [keys...]  (keys "teams,weeks"; default: every stored key)
import { assignLanes, offBound } from "../bowling.mjs";
import { LANE_TABLE } from "../bowling-lane-table.mjs";
import { roundRobin } from "../calc.mjs";

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LANE_TABLE);
let tot = 0;
for (const key of keys) {
  const [n, W] = key.split(",").map(Number), P = n / 2;
  const cyc = roundRobin(n);
  const rounds = Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches);
  const t0 = Date.now();
  const plan = assignLanes(rounds, n, P, { seed: 1 });
  const ms = Date.now() - t0;
  const last = new Array(n).fill(-1); let r = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { if (last[t] === p) r++; last[t] = p; }
  tot += r;
  console.log(JSON.stringify({ key, repeats: r, off: offBound(plan, n, P), ms }));
}
console.error(`total repeats ${tot}`);
