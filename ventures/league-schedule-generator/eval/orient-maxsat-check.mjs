// Re-checks eval/orient-maxsat.py's oriented seasons in JS against the tries they came from: same
// timetable (every round has the same pairs), same carry-over (it does not depend on grounds),
// every pair once (single) or twice with the hosts swapped (home and away), each team's home and
// away games within one (whole single round robin, or leg one of a season), and the breaks
// recounted the way carryover.mjs teamBreaks does (a bye round resets the run) equal the proved least.
//
//   node eval/orient-maxsat-check.mjs <tries.json> <oriented.json> <teams> [d]
import { readFileSync } from "node:fs";
import { carryOverFromOpponents, opponentsFromRounds } from "../carryover.mjs";

const [triesFile, outFile, nS, d] = process.argv.slice(2);
const n = +nS, double = d === "d";
const tries = new Map(JSON.parse(readFileSync(triesFile, "utf8")).map((t) => [t.i, t]));
const key = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
let bad = 0;
for (const { i, least, rounds } of JSON.parse(readFileSync(outFile, "utf8"))) {
  const t = tries.get(i), R = rounds.length, L = double ? R / 2 : R;
  const sameTimetable = rounds.every((rd, r) => {
    const a = rd.matches.map(([x, y]) => key(x, y)).sort().join(), b = t.rounds[r].matches.map(([x, y]) => key(x, y)).sort().join();
    return a === b;
  });
  const real = (rd) => rd.matches.filter(([a, b]) => a < n && b < n);
  const coe = carryOverFromOpponents(opponentsFromRounds(rounds.map((rd) => ({ matches: real(rd) })), n)).value;
  const hosts = new Map();
  for (let r = 0; r < R; r++) for (const [h, a] of real(rounds[r])) (hosts.get(key(h, a)) ?? hosts.set(key(h, a), []).get(key(h, a))).push(h);
  const pairsOk = hosts.size === (n * (n - 1)) / 2 && [...hosts.values()].every((v) => (double ? v.length === 2 && v[0] !== v[1] : v.length === 1));
  let breaks = 0, worst = 0;
  for (let x = 0; x < n; x++) {
    let last = null, home = 0, games = 0;
    for (let r = 0; r < R; r++) {
      const m = real(rounds[r]).find((p) => p.includes(x));
      if (!m) { last = null; continue; }
      const h = m[0] === x;
      if (r < L) { games++; home += h; }
      if (last === h) breaks++;
      last = h;
    }
    worst = Math.max(worst, Math.abs(2 * home - games));
  }
  const ok = sameTimetable && coe === t.coe && pairsOk && worst <= 1 && breaks === least;
  if (!ok) bad++;
  console.log(JSON.stringify({ i, ok, coe, triesCoe: t.coe, triesBreaks: t.breaks, least, breaks, imbalance: worst, sameTimetable, pairsOk }));
}
process.exitCode = bad ? 1 : 0;
