// Which bowling seasons does the page's search leave off the lane-pair bound?
// node eval/bowling-bound-sweep.mjs <minTeams> <maxTeams> [maxWeeks=60] > out.jsonl
// One JSON line per (teams, round-robin weeks): out-of-bounds counts after the search (0 = every
// team bowls every pair floor(W/P) or ceil(W/P) times), back-to-back repeats and milliseconds.
// Seasons it misses go to eval/bowling-lane-sat.py --table, which writes bowling-table.mjs.
import { assignLanes } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";
import { pathToFileURL } from "node:url";

export function offBound(plan, n, P) {
  const c = Array.from({ length: n }, () => new Array(P).fill(0));
  const last = new Array(n).fill(-1);
  let rep = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { c[t][p]++; if (last[t] === p) rep++; last[t] = p; }
  const W = plan.length, lo = Math.floor(W / P), hi = Math.ceil(W / P);
  let off = 0;
  for (const r of c) for (const x of r) off += Math.max(0, x - hi) + Math.max(0, lo - x);
  return { off, rep };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [a, b, mw = 60] = process.argv.slice(2).map(Number);
  for (let n = a; n <= b; n += 2) {
    const cyc = roundRobin(n);
    for (let W = 1; W <= mw; W++) {
      const rounds = [];
      for (let k = 0; k < W; k++) rounds.push(cyc[k % cyc.length].matches);
      const t0 = Date.now();
      const r = offBound(assignLanes(rounds, n, n / 2), n, n / 2);
      console.log(JSON.stringify({ n, W, ...r, ms: Date.now() - t0 }));
    }
  }
}
