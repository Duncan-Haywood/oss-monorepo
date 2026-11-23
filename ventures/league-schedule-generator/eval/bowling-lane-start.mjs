// Rounds plus the page's own lane plan for one season, as the start for eval/bowling-lane-tabu.c.
// node eval/bowling-lane-start.mjs <teams> <weeks> > start.json
// {"n","W","off","rounds":[[[a,b],...],...],"start":[pair of each match, week by week]}
import { assignLanes, offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
const n = Number(process.argv[2]), W = Number(process.argv[3]), P = n / 2;
const cyc = roundRobin(n);
const rounds = [];
for (let k = 0; k < W; k++) rounds.push(cyc[k % cyc.length].matches);
const plan = assignLanes(rounds, n, P, {});
// assignLanes keeps each week's match order, so plan[w][m] is rounds[w][m] with its pair.
for (let w = 0; w < W; w++) for (let m = 0; m < P; m++) {
  const [a, b] = rounds[w][m], [c, d] = plan[w][m];
  if (a !== c || b !== d) throw new Error(`week ${w + 1} match ${m}: order changed`);
}
const off = offBound(plan, n, P);
process.stdout.write(JSON.stringify({ n, W, off, rounds, start: plan.flatMap((wk) => wk.map((m) => m[2])) }));
