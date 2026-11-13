// The exact home-and-away break search (orient.mjs pairLeastBreaks) against the MaxSAT proofs in
// eval/orient-maxsat-double.txt: same tries (carryOverTry, weighted 8, seed 1, home and away), same
// timetables. Each try runs twice: with no hint (the search alone) and with the try's own breaks as
// the hint (as polishSeasonVenues runs it after the annealing; then only strictly fewer are sought).
//
//   node eval/pair-exact.mjs [sizes, default 8,10,12,14,16,18,20] [maxNodes, default 400]
import { readFileSync } from "node:fs";
import { carryOverTry, CARRY_OVER_GAP } from "../carryover.mjs";
import { pairLeastBreaks, countBreaks } from "../orient.mjs";

const sizes = (process.argv[2] || "8,10,12,14,16,18,20").split(",").map(Number);
const maxNodes = +(process.argv[3] || 400);
const sat = new Map();
for (const line of readFileSync(new URL("./orient-maxsat-double.txt", import.meta.url), "utf8").split("\n")) {
  if (!line.startsWith("{")) continue;
  const j = JSON.parse(line);
  sat.set(`${j.teams}/${j.i}`, j.least);
}
function oppOf(rounds, n) {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((rd) => {
    const o = new Int16Array(N).fill(N - 1);
    for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; }
    return o;
  });
}
const tally = { tries: 0, satProved: 0, agree: 0, wrong: 0, provedHere: 0, provedHereOnly: 0, improved: 0 };
for (const n of sizes) {
  for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) {
    const t = carryOverTry(n, i, { seed: 1, weighted: 8, double: true });
    const opp = oppOf(t.rounds, n);
    const ms = sat.get(`${n}/${i}`);
    const out = { teams: n, i, coe: t.coe, breaks: t.breaks, maxsat: ms ?? null };
    for (const [tag, hint] of [["alone", Infinity], ["hinted", t.breaks]]) {
      const r = pairLeastBreaks(opp, n, { upperHint: hint, maxNodes });
      if (r.venues && countBreaks(r.venues, opp, n) !== r.least) throw new Error(`recount at ${n}/${i}`);
      out[tag] = { floor: r.floor, relaxed: r.relaxed, least: r.least, proved: r.proved, nodes: r.nodes, ms: r.ms };
    }
    const h = out.hinted;
    tally.tries++;
    if (ms != null) tally.satProved++;
    if (h.proved) { tally.provedHere++; if (ms == null) tally.provedHereOnly++; }
    if (ms != null && h.proved) { if (h.least === ms) tally.agree++; else tally.wrong++; }
    if (h.least < t.breaks) tally.improved++;
    console.log(JSON.stringify(out));
  }
}
console.log(JSON.stringify({ maxNodes, ...tally }));
