// Independent recomputations for the 2026-11-28 quality re-audit
// (portfolio/quality/audits/2026-11-28-league-schedule-generator-reaudit.json).
// Each check prints the expected value worked by hand next to what the code returns.
// Run from this venture: node eval/reaudit-2026-11-28.mjs
import * as c from "../calc.mjs";
import * as n from "../night.mjs";

// 1. Head to head under FIVB set scoring (3-0/3-1 = 3/0, 3-2 = 2/1). A beats B 3-2 twice, B beats A 3-0.
//    Mini-table by hand: A 2+2+0 = 4, B 1+1+3 = 5, so B ranks first. Plain win points: A 6, B 3.
const res = [[0, 1, 3, 2], [0, 1, 3, 2], [1, 0, 3, 0]].map(([a, b, ga, gb]) => ({ a, b, ga, gb }));
const fivb = c.standings(["A", "B"], res, { setScoring: true, headToHead: true, adjustments: { 0: 1 } });
const plain = c.standings(["A", "B"], res, { setScoring: false, headToHead: true, adjustments: { 1: 3 } });
console.log("1 h2h FIVB  expected B first, 5 v 4; got", fivb.map((r) => `${r.name} ${r.h2h.points}`).join(", "));
console.log("1 h2h plain expected A first, 6 v 3; got", plain.map((r) => `${r.name} ${r.h2h.points}`).join(", "));

// 2. Home/away breaks counted here, not by countBreaks: a bye resets a run (de Werra's convention).
const breaks = (rounds, k) => {
  let total = 0;
  const last = Array(k).fill(null);
  for (const r of rounds) {
    const today = Array(k).fill(null);
    for (const [h, a] of r.matches) { today[h] = "H"; today[a] = "A"; }
    for (let i = 0; i < k; i++) {
      if (today[i] === null) { last[i] = null; continue; }
      if (last[i] === today[i]) total++;
      last[i] = today[i];
    }
  }
  return total;
};
for (const k of [4, 5, 6, 7, 8, 10, 12]) {
  const rev = c.roundRobin(k, { double: true, reverseLeg: true });
  const seen = new Map();
  for (const r of rev) for (const [h, a] of r.matches) seen.set(`${h}-${a}`, (seen.get(`${h}-${a}`) ?? 0) + 1);
  const once = seen.size === k * (k - 1) && [...seen.values()].every((v) => v === 1);
  const exp = k % 2 ? [0, k - 2, 0] : [k - 2, 3 * (k - 2), 2 * (k - 2)];
  const got = [breaks(c.roundRobin(k), k), breaks(c.roundRobin(k, { double: true }), k), breaks(rev, k)];
  console.log(`2 breaks ${k} teams: single/mirrored/reversed expected ${exp.join("/")} got ${got.join("/")}; each ordered pair once: ${once}`);
}

// 3. Americano average sit-out credit: round(points for / games played x sit-outs, 1), from the unrounded average.
let night = n.newNight({ players: ["P1", "P2", "P3", "P4", "P5"], courts: 1, rounds: 5, target: 24, sitOut: "average", seed: 3 });
[[15, 9], [13, 11], [20, 4], [7, 17], [12, 12]].forEach((s, r) => { night = n.setScore(night, r, 1, ...s).night; });
const lb = n.leaderboard(night);
const off = lb.filter((row) => Math.abs(Math.round((row.pf / row.played) * row.satOut * 10) / 10 - row.credit) > 1e-9);
console.log("3 sit-out credit: mismatches expected 0 got", off.length, "; points for total expected 240 got", lb.reduce((s, r) => s + r.pf, 0));

// 4. 3/1/0 table: A beat B 2-1, B drew C 1-1, C beat A 3-0 -> C 4 (+3), A 3 (-2), B 1 (-1).
const t = c.standings(["A", "B", "C"], [{ a: 0, b: 1, ga: 2, gb: 1 }, { a: 1, b: 2, ga: 1, gb: 1 }, { a: 2, b: 0, ga: 3, gb: 0 }]);
console.log("4 table expected C 4 +3, A 3 -2, B 1 -1; got", t.map((r) => `${r.name} ${r.points} ${r.gd > 0 ? "+" : ""}${r.gd}`).join(", "));
