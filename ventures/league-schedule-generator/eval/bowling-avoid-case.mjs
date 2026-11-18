// node eval/bowling-avoid-case.mjs <teams> <weeks> '<avoid JSON: [[team, [pairs]], ...]>'
// Prints the season's round-robin weeks, avoided pairs and laneTargets() lo/hi as JSON for
// eval/bowling-lane-avoid-sat.py.
import { laneTargets } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const n = Number(process.argv[2]), W = Number(process.argv[3]), spec = JSON.parse(process.argv[4]);
const P = n / 2, cyc = roundRobin(n);
const rounds = Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches);
const avoid = Array.from({ length: n }, () => []);
for (const [t, ps] of spec) for (const p of ps) avoid[t].push(p < 0 ? P + p : p);
const { lo, hi } = laneTargets(new Array(n).fill(W), P, avoid);
console.log(JSON.stringify({ rounds, avoid, lo, hi }));
