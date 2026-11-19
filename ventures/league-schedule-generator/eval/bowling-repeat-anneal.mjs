// Back-to-back repeats of the page's lane search with and without the repeat anneal (cutRepeats in
// bowling.mjs, on by default since 2026-11-18), on the 36 seasons of eval/bowling-lanes.mjs.
// node eval/bowling-repeat-anneal.mjs [seed] > eval/bowling-repeat-anneal.txt
import { assignLanes, offBound } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";

const seed = Number(process.argv[2] ?? 1);
const repeats = (plan, n) => {
  const last = new Array(n).fill(-1); let r = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { if (last[t] === p) r++; last[t] = p; }
  return r;
};
const sizes = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const seasons = [26, 30, 32, 34];
let before = 0, after = 0, ms0 = 0, ms1 = 0, broke = 0, zero = 0;
console.log(`# seed ${seed}; "off" = out-of-bounds lane counts (0 = every team at the bound)`);
console.log("teams weeks | repeats without | with anneal | off without | off with | ms without | ms with");
for (const n of sizes) for (const W of seasons) {
  const cyc = roundRobin(n);
  const rounds = [];
  for (let k = 0; k < W; k++) rounds.push(cyc[k % cyc.length].matches);
  const P = n / 2;
  let t0 = Date.now();
  const a = assignLanes(rounds, n, P, { seed, anneal: false });
  const d0 = Date.now() - t0; t0 = Date.now();
  const b = assignLanes(rounds, n, P, { seed });
  const d1 = Date.now() - t0;
  ms0 += d0; ms1 += d1;
  const ra = repeats(a, n), rb = repeats(b, n), oa = offBound(a, n, P), ob = offBound(b, n, P);
  if (ob > oa) broke++;
  if (rb === 0) zero++;
  before += ra; after += rb;
  console.log(`${String(n).padStart(5)} ${String(W).padStart(5)} | ${String(ra).padStart(15)} | ${String(rb).padStart(11)} | ${String(oa).padStart(11)} | ${String(ob).padStart(8)} | ${String(d0).padStart(10)} | ${String(d1).padStart(7)}`);
}
console.log(`\nrepeats ${before} -> ${after} over 36 seasons; ${zero} seasons with none; seasons less balanced with the anneal: ${broke}`);
console.log(`${(ms0 / 36).toFixed(0)} ms -> ${(ms1 / 36).toFixed(0)} ms per season on average on this machine`);
