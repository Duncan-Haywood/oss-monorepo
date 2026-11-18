// node eval/bowling-avoid-start.mjs <teams> <weeks> '<avoid JSON: [[slot, [pairs]], ...]>' [seed]
// Like eval/bowling-avoid-case.mjs (the circle method's first W rounds, the avoided pairs, the
// laneTargets() lo/hi), plus the lane search's own plan for those rounds (assignLanes with no
// stored answers) as "plan": [[pair of each match] per week]. eval/bowling-avoid-lns.py repairs it.
import { assignLanes, laneTargets } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const n = Number(process.argv[2]), W = Number(process.argv[3]), spec = JSON.parse(process.argv[4]);
const seed = Number(process.argv[5] ?? 1);
const P = n / 2, cyc = roundRobin(n);
const rounds = Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches);
const avoid = Array.from({ length: n }, () => []);
for (const [t, ps] of spec) for (const p of ps) avoid[t].push(p < 0 ? P + p : p);
const { lo, hi } = laneTargets(new Array(n).fill(W), P, avoid);
const plan = assignLanes(rounds, n, P, { avoid, shapes: false, seed }).map((wk) => wk.map((m) => m[2]));
console.log(JSON.stringify({ rounds, avoid, lo, hi, plan }));
