// Carry-over against home/away breaks for the whole-season double round robin, by break weight and
// seed, next to the 20 real top-flight seasons (eval/carryover-real.mjs). For each run it counts the
// professional seasons of the same size it dominates (no worse on both counts, better on one).
//
//   node eval/double-frontier.mjs          # table to stdout (about a minute)
//   node eval/double-frontier.mjs --json
//
// Question it answers: is breakWeight 10, what buildSchedule uses, a good point on the curve, and is
// the curve smooth enough to offer organisers a "fewer breaks" setting?

import { fileURLToPath } from "node:url";
import { lowCarryOverDoubleRounds, carryOver } from "../carryover.mjs";
import { run as realRun } from "./carryover-real.mjs";

const WEIGHTS = [10, 20, 40, 80];
const SEEDS = [1, 2, 3];

function breaksOf(n, rounds) {
  const last = Array(n).fill(null);
  let b = 0;
  for (const r of rounds) {
    const seen = new Set();
    for (const [h, a] of r.matches) {
      if (last[h] === "H") b++;
      if (last[a] === "A") b++;
      last[h] = "H"; last[a] = "A"; seen.add(h); seen.add(a);
    }
    for (let t = 0; t < n; t++) if (!seen.has(t)) last[t] = null;
  }
  return b;
}

export function frontier({ sizes = [18, 20], weights = WEIGHTS, seeds = SEEDS } = {}) {
  const pro = realRun().map((r) => ({ key: r.key, teams: r.teams, coe: r.plannedCoe, breaks: r.plannedBreaks }));
  const rows = [];
  for (const n of sizes) {
    const same = pro.filter((p) => p.teams === n);
    for (const w of weights) for (const seed of seeds) {
      const d = lowCarryOverDoubleRounds(n, { seed, breakWeight: w });
      const coe = carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds: d.rounds }).value;
      const breaks = breaksOf(n, d.rounds);
      const dominated = same.filter((p) => coe <= p.coe && breaks <= p.breaks && (coe < p.coe || breaks < p.breaks)).map((p) => p.key);
      rows.push({ teams: n, breakWeight: w, seed, coe, breaks, dominates: dominated.length, of: same.length, seasons: dominated });
    }
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = frontier();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const pad = (s, w) => String(s).padStart(w);
  console.log(`${pad("teams", 5)}${pad("w", 5)}${pad("seed", 5)}${pad("carry-over", 11)}${pad("breaks", 7)}  dominates`);
  for (const r of rows) console.log(`${pad(r.teams, 5)}${pad(r.breakWeight, 5)}${pad(r.seed, 5)}${pad(r.coe, 11)}${pad(r.breaks, 7)}  ${r.dominates}/${r.of} ${r.seasons.join(" ")}`);
}
