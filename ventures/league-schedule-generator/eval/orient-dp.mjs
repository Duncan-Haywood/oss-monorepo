// The exact break programme (orient.mjs leastBreaks) against the MaxSAT proofs in eval/orient-maxsat.txt:
// same tries (carryOverTry, weighted 8, seed 1, as eval/orient-maxsat-dump.mjs), same timetables.
//
//   node eval/orient-dp.mjs [sizes, default 12,14,16,17,18,19,20,22,24] [d]
import { readFileSync } from "node:fs";
import { carryOverTry, CARRY_OVER_GAP } from "../carryover.mjs";
import { leastBreaks, countBreaks } from "../orient.mjs";

const sizes = (process.argv[2] || "12,14,16,17,18,19,20,22,24").split(",").map(Number);
const double = process.argv[3] === "d";
const proved = new Map();
for (const line of readFileSync(new URL("./orient-maxsat.txt", import.meta.url), "utf8").split("\n")) {
  if (!line.startsWith("{")) continue;
  const j = JSON.parse(line);
  if (j.order == null) proved.set(`${j.teams}/${j.double}/${j.i}`, j.least);
}
function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    if (rd.bye != null) { o[rd.bye] = N - 1; }
    return o;
  });
}
let agree = 0, disagree = 0, unproved = 0;
for (const n of sizes) {
  for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) {
    const t = carryOverTry(n, i, { seed: 1, weighted: 8, double });
    const opp = oppOf(t.rounds, n);
    const t0 = performance.now();
    const r = leastBreaks(opp, n, { span: double ? opp.length / 2 : opp.length });
    const ms = performance.now() - t0;
    const sat = proved.get(`${n}/${double}/${i}`);
    const recount = r ? countBreaks(r.venues, opp, n) : null;
    if (r && recount !== r.breaks) throw new Error(`recount ${recount} != ${r.breaks} at ${n}/${i}`);
    if (sat == null) unproved++; else if (r && r.proved && r.least === sat) agree++; else disagree++;
    console.log(JSON.stringify({ teams: n, double, i, coe: t.coe, breaks: t.breaks, floor: r?.floor ?? null, least: r?.least ?? null, proved: r?.proved ?? null, maxsat: sat ?? null, steps: r?.steps ?? null, ms: Math.round(ms) }));
  }
}
console.log(`# ${agree} agree with MaxSAT, ${disagree} differ, ${unproved} with no MaxSAT proof`);
