// Shift candidates in the home-and-away season, part two (2026-11-12). The double search
// (lowCarryOverDoubleRounds) had taken each built-in starter with shift venues as a leg one since
// 2026-11-11, but not (a) the capped shift candidates the single search gained on 2026-11-12
// (lowCarryOverCappedRounds from each shift start), nor (b) the 16 and 32 shift starters, which only
// a field-size league (15 or 31 teams) uses. Now both are leg ones; a season is kept only when its
// carry-over + 1000 x repeats + weight x breaks is strictly lower.
//
//   node eval/shift-double-capped.mjs [weight] [seeds,] [sizes...]   # eval/shift-double-capped.txt
//
// "Before" is what main did: at field sizes (8, 15, 16, 31, 32) the default (the field branch,
// `fieldShift`, is off by default) against `fieldShift: true`; elsewhere `shiftCapped: false`
// against `shiftCapped: true` (every size; the shipped default, "small", caps only up to 16 slots). Every
// season is checked as valid and every figure recounted from the rounds.
import { lowCarryOverDoubleRounds, carryOver, fieldApplies } from "../carryover.mjs";

const weight = Number(process.argv[2] || 10);
const seeds = (process.argv[3] || "1,2").split(",").map(Number);
const sizes = process.argv.length > 4 ? process.argv.slice(4).map(Number) : Array.from({ length: 32 }, (_, i) => i + 9);

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
function repeatsOf(n, rounds) {
  const R = rounds.length / 2, lastA = Array(n).fill(-1), firstB = Array(n).fill(-1);
  rounds.forEach((r, i) => { for (const [h, a] of r.matches) { if (i < R) { lastA[h] = a; lastA[a] = h; } else { if (firstB[h] < 0) firstB[h] = a; if (firstB[a] < 0) firstB[a] = h; } } });
  let c = 0; for (let t = 0; t < n; t++) if (lastA[t] >= 0 && lastA[t] === firstB[t]) c++;
  // odd league: the same team sitting out the last round of leg one and the first of leg two
  if (n % 2 && rounds[R - 1].bye != null && rounds[R - 1].bye === rounds[R].bye) c++;
  return c;
}
function check(n, rounds) {
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
const fmt = (x) => x.toLocaleString("en-US");

console.log(`Home-and-away season, break weight ${weight}, effort 1: carry-over / breaks (score = carry-over + 1000 x repeats + ${weight} x breaks), before -> now`);
console.log("| Teams | Seed | Before | Now | Score | Start | Time before / now |");
console.log("|---|---|---|---|---|---|---|");
for (const n of sizes) for (const seed of seeds) {
  const N = n % 2 ? n + 1 : n;
  const field = fieldApplies(N);
  const old = field ? {} : { shiftCapped: false }, now = field ? { fieldShift: true } : { shiftCapped: true };
  let t0 = Date.now();
  const a = lowCarryOverDoubleRounds(n, { seed, breakWeight: weight, ...old });
  const ta = (Date.now() - t0) / 1000; t0 = Date.now();
  const b = lowCarryOverDoubleRounds(n, { seed, breakWeight: weight, ...now });
  const tb = (Date.now() - t0) / 1000;
  check(n, a.rounds); check(n, b.rounds);
  const sc = (r) => { const c = coeOf(n, r.rounds), k = breaksOf(n, r.rounds), p = repeatsOf(n, r.rounds); return { c, k, p, s: c + 1000 * p + weight * k }; };
  const A = sc(a), B = sc(b);
  if (B.s > A.s) throw new Error(`${n} seed ${seed}: worse (${A.s} -> ${B.s})`);
  const mark = B.s < A.s ? "**" : "";
  console.log(`| ${n} | ${seed} | ${fmt(A.c)} / ${A.k} | ${mark}${fmt(B.c)} / ${B.k}${mark} | ${B.s < A.s ? `${fmt(A.s)} -> ${fmt(B.s)}` : "unchanged"} | ${b.start ?? "-"}${b.mirrored ? ", mirror" : ""} | ${ta.toFixed(1)} / ${tb.toFixed(1)} s |`);
}
