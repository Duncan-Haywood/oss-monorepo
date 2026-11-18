// Odd leagues under a cap on home/away breaks (2026-11-11). Until now an odd league's two "capped"
// tries were weighted searches at break weights 160 and 320, because the capped search started from
// the circle method with home/away from a venue search that could not find its zero-break pattern
// (19 teams: 46 breaks where 0 exist). assignVenues now two-colours the stretches between byes, so
// the circle method starts at 0 breaks, and the capped search runs for odd leagues as for even ones.
//
//   node eval/odd-capped.mjs          # output in eval/odd-capped.txt (a few minutes)
//
// Every carry-over and break figure is recounted from the rounds, not taken from the search.

import { circleOpp, assignVenues, venueCost, lowCarryOverRounds, lowCarryOverDoubleRounds, lowCarryOverCappedRounds, cappedTryBreaks, carryOver } from "../carryover.mjs";

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
const coeOf = (n, rounds) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;
const toOpp = (rounds, n) => {
  const N = n % 2 ? n + 1 : n;
  return rounds.map((r) => { const o = new Int16Array(N); for (const [a, b] of r.matches) { o[a] = b; o[b] = a; } if (r.bye != null) { o[r.bye] = n; o[n] = r.bye; } return o; });
};
const beats = (a, b) => a.coe <= b.coe && a.breaks <= b.breaks && (a.coe < b.coe || a.breaks < b.breaks);

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };

log("Venue search alone: breaks + 50 x imbalance on fixed timetables (seed 1), legacy single-flip -> now");
log("teams | circle method | low carry-over (weight 0) | low carry-over (weight 10)");
for (const n of [7, 11, 15, 19, 21, 12, 18, 20]) {
  const N = n % 2 ? n + 1 : n;
  const cells = [circleOpp(N), toOpp(lowCarryOverRounds(n, { seed: 1 }).rounds, n), toOpp(lowCarryOverRounds(n, { seed: 1, breakWeight: 10 }).rounds, n)]
    .map((opp) => `${venueCost(assignVenues(opp, n, 1, 8, { legacy: true }), opp, n)} -> ${venueCost(assignVenues(opp, n, 1), opp, n)}`);
  log(`${n} | ${cells.join(" | ")}`);
}

const SEEDS = [1, 2, 3];
for (const double of [false, true]) {
  log();
  log(double ? "Home-and-away season (double round robin)" : "One leg (single round robin)");
  log("teams | old fallback w=160 | old fallback w=320 | capped try 0 (cap) | capped try 1 (cap) | what the two tries now keep | capped tries dominating both old");
  for (const n of [9, 11, 15, 19, 21]) {
    const acc = { w160: [], w320: [], c0: [], c1: [], now: [] };
    let dom = 0, of = 0;
    for (const seed of SEEDS) {
      const run = (f) => { const r = f(); return { coe: coeOf(n, r.rounds), breaks: breaksOf(n, r.rounds) }; };
      const w = [160, 320].map((bw) => run(() => (double ? lowCarryOverDoubleRounds(n, { seed, breakWeight: bw }) : lowCarryOverRounds(n, { seed, breakWeight: bw }))));
      const c = [0, 1].map((j) => {
        const caps = cappedTryBreaks(n, j, double);
        return run(() => (double ? lowCarryOverDoubleRounds(n, { seed, maxBreaks: caps.season, legBreaks: caps.leg }) : lowCarryOverCappedRounds(n, { seed, maxBreaks: caps.leg })));
      });
      acc.w160.push(w[0]); acc.w320.push(w[1]); acc.c0.push(c[0]); acc.c1.push(c[1]);
      // carryOverTry for an odd league keeps, per try, the fewer breaks (then less carry-over) of
      // the capped search and the heavy-weight search (160, then 320)
      const keep = (a, b) => (b.breaks < a.breaks || (b.breaks === a.breaks && b.coe < a.coe) ? b : a);
      acc.now.push([keep(c[0], w[0]), keep(c[1], w[1])]);
      for (const x of c) { of++; if (w.every((y) => beats(x, y))) dom++; }
    }
    const fmt = (a) => `${a.map((x) => `${x.coe}/${x.breaks}`).join(", ")}`;
    const caps = [0, 1].map((j) => { const c = cappedTryBreaks(n, j, double); return double ? c.season : c.leg; });
    log(`${n} | ${fmt(acc.w160)} | ${fmt(acc.w320)} | ${fmt(acc.c0)} (${caps[0]}) | ${fmt(acc.c1)} (${caps[1]}) | ${acc.now.map(([a, b]) => `${a.coe}/${a.breaks} + ${b.coe}/${b.breaks}`).join("; ")} | ${dom} of ${of}`);
  }
}
log();
log("Cells are carry-over/breaks for seeds 1, 2, 3. The old fallback columns are rerun with today's venue search, so they are, if anything, better than what the page kept before. A new try dominates when it has no more carry-over and no more breaks than both old tries of its seed, and fewer of one.");

if (process.argv[1] && process.argv[1].endsWith("odd-capped.mjs")) {
  const { writeFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  writeFileSync(fileURLToPath(new URL("./odd-capped.txt", import.meta.url)), out.join("\n") + "\n");
}
