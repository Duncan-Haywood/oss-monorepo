// Shift venues for a home-and-away season (2026-11-11). lowCarryOverRounds has scored the built-in
// starters with their closed-form "shift" home/away since earlier today (eval/shift-search.mjs), but
// lowCarryOverDoubleRounds never saw them: every leg one came from a searched start. Now, with a
// break weight, each built-in starter with shift venues is also a leg one; leg two is searched
// against its host as usual, and the plain mirror is tried too. Kept only when strictly better on the
// search's own score (carry-over + 1000 x repeats + weight x breaks).
//
//   node eval/shift-double.mjs [weight] [sizes...]     # output in eval/shift-double.txt
//
// Every carry-over and break figure is recounted from the rounds, not taken from the search.
import { lowCarryOverDoubleRounds, carryOver } from "../carryover.mjs";

const weight = Number(process.argv[2] || 10);
const sizes = process.argv.length > 3 ? process.argv.slice(3).map(Number) : [11, 13, 17, 19, 21, 23, 25, 26, 27, 29];

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
function check(n, rounds) {
  // a valid home-and-away season: each pair meets twice, once at each ground, once per leg; every
  // team n - 1 home games
  const seen = new Map(), home = new Array(n).fill(0);
  for (const r of rounds) for (const [h, a] of r.matches) {
    const k = `${h}>${a}`;
    if (seen.has(k)) throw new Error(`${n}: ${k} twice`);
    seen.set(k, r.leg); home[h]++;
  }
  if (seen.size !== n * (n - 1)) throw new Error(`${n}: ${seen.size} games`);
  for (const [k, leg] of seen) { const [h, a] = k.split(">"); if (seen.get(`${a}>${h}`) === leg) throw new Error(`${n}: ${k} same leg both ways`); }
  if (home.some((x) => x !== n - 1)) throw new Error(`${n}: unbalanced`);
}
const coeOf = (n, rounds) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;

console.log(`Home-and-away season, break weight ${weight}, seed 1, effort 1: carry-over / breaks (score), shift: false -> default`);
console.log("| Teams | Before | Now | Score | Start |");
console.log("|---|---|---|---|---|");
for (const n of sizes) {
  const t0 = Date.now();
  const a = lowCarryOverDoubleRounds(n, { seed: 1, breakWeight: weight, shift: false });
  const b = lowCarryOverDoubleRounds(n, { seed: 1, breakWeight: weight });
  check(n, a.rounds); check(n, b.rounds);
  const ca = coeOf(n, a.rounds), ba = breaksOf(n, a.rounds), cb = coeOf(n, b.rounds), bb = breaksOf(n, b.rounds);
  const s = (c, k) => (c + weight * k).toLocaleString("en-US");
  console.log(`| ${n} | ${ca.toLocaleString("en-US")} / ${ba} | ${cb.toLocaleString("en-US")} / ${bb} | ${s(ca, ba)} -> ${s(cb, bb)} | ${b.start}${b.mirrored ? ", mirror" : ""} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
