// Balanced teams (teams.mjs): the search's spread against an exhaustive search on random small lists,
// and its run time and lower-bound gap on big lists. Ratings 1-5 (or 1-10), tags F/M, random
// together/apart requests. Invented players. Run: node eval/balanced-teams-exact.mjs > eval/balanced-teams-exact.txt
import { balanceTeams, checkTeams, exactLeastSpread } from "../teams.mjs";

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function instance(r, n, maxRating, requests) {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, rating: 1 + Math.floor(r() * maxRating), tag: r() < 0.4 ? "F" : "M" }));
  const together = [], apart = [];
  for (let q = 0; q < requests; q++) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (a === b) continue;
    (r() < 0.5 ? together : apart).push([players[a].name, players[b].name]);
  }
  return { players, together, apart, warnings: [] };
}

const r = rng(20261119);
console.log("Small lists: search vs exhaustive (least spread under the same hard rules)");
console.log("Shipped = annealing, then the exhaustive search when n <= 16 and the bound is not met. annealing-alone = exhaustive fallback off.");
console.log("n  k  cases  infeasible  shipped-equal  shipped-worse  faults  proved  annealing-alone-equal");
for (const [n, k] of [[8, 2], [10, 2], [12, 3], [12, 4], [13, 3], [14, 2], [16, 4]]) {
  let bareEqual = 0, cases = 0, infeasible = 0, equal = 0, worse = 0, faults = 0, proved = 0;
  for (let c = 0; c < 60; c++) {
    const p = instance(r, n, 5, Math.floor(r() * 4));
    const exact = exactLeastSpread(p, k);
    cases++;
    if (exact === null) { infeasible++; continue; }
    const res = balanceTeams(p, k, { seed: c + 1 });
    const bare = balanceTeams(p, k, { seed: c + 1, exactUpTo: 0 });
    if (Math.abs(bare.spread - exact) < 1e-9 && !bare.broken.some((m) => !/together and apart/.test(m))) bareEqual++;
    if (checkTeams(p, res).length || res.broken.some((m) => !/together and apart/.test(m))) faults++;
    if (Math.abs(res.spread - exact) < 1e-9) equal++; else if (res.spread > exact) worse++;
    if (res.proved) proved++;
  }
  console.log(`${n} ${k}  ${cases}  ${infeasible}  ${equal}  ${worse}  ${faults}  ${proved}  ${bareEqual}`);
}
console.log("");
console.log("Big lists: spread vs lower bound, and time (ratings 1-10, 8 requests)");
console.log("n  k  spread  lower-bound  proved  faults  ms");
for (const [n, k] of [[40, 4], [80, 8], [120, 10], [200, 16], [400, 32]]) {
  const p = instance(r, n, 10, 8);
  const t0 = performance.now();
  const res = balanceTeams(p, k, { seed: 1 });
  const ms = Math.round(performance.now() - t0);
  console.log(`${n} ${k}  ${res.spread}  ${res.lowerBound}  ${res.proved}  ${checkTeams(p, res).length + res.broken.length}  ${ms}`);
}
