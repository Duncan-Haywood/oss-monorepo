// Game length under common white elephant house rules: the most moves the
// rules allow (exact) and the median and 90th percentile of 2,000 simulated
// games under a stated toy policy (steal with probability 0.5 whenever a steal
// is allowed). `node eval/elephant-length.mjs` prints the guide's table.
import { pathToFileURL } from "node:url";
import { mulberry32 } from "../calc.mjs";
import { maxMoves, simulate } from "../elephant.mjs";

export const SIZES = [8, 12, 20, 30];
export const RULESETS = [
  ["Frozen after 2 steals", { maxSteals: 2, perTurn: 0, noStealBack: true, finalSwap: true }],
  ["Frozen after 3 steals", { maxSteals: 3, perTurn: 0, noStealBack: true, finalSwap: true }],
  ["Frozen after 3, one steal per turn", { maxSteals: 3, perTurn: 1, noStealBack: true, finalSwap: true }],
];
export const P = 0.5;
export const GAMES = 2000;

const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function table() {
  const rows = [];
  for (const [label, rules] of RULESETS) {
    for (const n of SIZES) {
      const rng = mulberry32(1000 + n);
      const xs = Array.from({ length: GAMES }, () => simulate(n, rules, P, rng).moves);
      rows.push({ label, n, max: maxMoves(n, rules), median: pct(xs, 0.5), p90: pct(xs, 0.9) });
    }
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const r of table()) console.log(`${r.label} | ${r.n} | ${r.max} | ${r.median} | ${r.p90}`);
}
