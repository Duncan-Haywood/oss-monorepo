// Dump the round-robin weeks bowlingSchedule() plays (no position rounds) for eval/bowling-lane-sat.py.
// node eval/bowling-rounds.mjs <teams> <weeks>   (teams even; an odd league adds the Vacancy first)
import { roundRobin } from "../calc.mjs";
const n = Number(process.argv[2]), W = Number(process.argv[3]);
const cyc = roundRobin(n);
const rounds = [];
for (let k = 0; k < W; k++) rounds.push(cyc[k % cyc.length].matches);
process.stdout.write(JSON.stringify({ n, W, rounds }));
