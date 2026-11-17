// Strength of schedule in a shorter season: the circle method's first k rounds against
// balanceSeedStrength's relabelling, and, where all n! relabellings fit, the exact optimum.
// Gaps are in seed places: |mean opponent seed - mean seed of every other team|, worst team.
// Run: node eval/seed-balance.mjs > eval/seed-balance.txt
import { roundRobin, relabelPlan, seedStrength, balanceSeedStrength } from "../calc.mjs";

function* perms(a, l = 0) {
  if (l === a.length) { yield a; return; }
  for (let i = l; i < a.length; i++) { [a[l], a[i]] = [a[i], a[l]]; yield* perms(a, l + 1); [a[l], a[i]] = [a[i], a[l]]; }
}
const breaks = (plan, n) => {
  const last = new Array(n).fill(null);
  let b = 0;
  for (const r of plan) {
    const t = new Array(n).fill(null);
    for (const [h, a] of r.matches) { t[h] = 1; t[a] = 0; }
    for (let i = 0; i < n; i++) { if (t[i] !== null && t[i] === last[i]) b++; if (t[i] !== null) last[i] = t[i]; }
  }
  return b;
};
console.log("teams rounds | plain worst  bottom-seed opp mean (even share) | balanced worst  bottom-seed opp mean | exact optimum | breaks plain/balanced | ms");
const cases = [[6, 3], [8, 4], [8, 5], [9, 5], [10, 6], [11, 8], [12, 8], [14, 8], [16, 10], [18, 10], [20, 10], [24, 12], [30, 12], [40, 15], [64, 20]];
for (const [n, k] of cases) {
  const plan = roundRobin(n).slice(0, k);
  const a = seedStrength(plan, n);
  const t0 = Date.now();
  const bal = balanceSeedStrength(plan, n, { seed: 1 });
  const ms = Date.now() - t0;
  const b = seedStrength(bal.plan, n);
  let exact = "-";
  if (n <= 10) {
    let best = Infinity;
    for (const p of perms([...Array(n).keys()])) best = Math.min(best, seedStrength(relabelPlan(plan, p), n).worst);
    exact = best.toFixed(3);
  }
  const bot = (s) => `${s.teams[n - 1].opponentMean.toFixed(1)}`;
  console.log(`${n} ${k} | ${a.worst.toFixed(3)}  ${bot(a)} (${a.teams[n - 1].target.toFixed(1)}) | ${b.worst.toFixed(3)}  ${bot(b)} | ${exact} | ${breaks(plan, n)}/${breaks(bal.plan, n)} | ${ms}`);
}
