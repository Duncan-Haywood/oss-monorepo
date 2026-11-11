// Starters picked on carry-over plus a price per break (2026-11-11, after eval/starter-climb.mjs).
//
// STARTERS holds, per size, the starter with the least carry-over. Its home/away pattern is
// whatever comes with it, and with a break weight the search starts from it anyway. This script
// keeps a wide pool of near-best starters from the same climb (cyclic sum D^2 within `slack` of
// the best) and rescores every one on the exact non-cyclic carry-over plus `weight` x the breaks
// of the full venue search (assignVenues), the score lowCarryOverRounds minimises.
//
// The start does not matter. Start t's round r is start 0's round r + t, and renaming every
// ordinary team u to u - t (team p stays) turns one into the other, so carry-over and the best
// home/away are the same at every start (checked below on every entry: the full non-cyclic count
// at every start). bestStarterOpp's loop over starts only moves the greedy venue pass's ties.
//
// node eval/starter-breaks.mjs [seconds per size and parity] [weight] [sizes...]
//   (default 20 s, weight 10, sizes: every size with a built-in starter)
// Output: one JSON line per size and parity, then the STARTERS_WEIGHTED literal for carryover.mjs.
import { carryOverFromOpponents, starterOpp, assignVenues, STARTERS, STARTERS_WEIGHTED } from "../carryover.mjs";
import { climb, toPairs } from "./starter-climb.mjs";

const secs = Number(process.argv[2] || 20);
const weight = Number(process.argv[3] || 10);
const POOL = Number(process.env.POOL || 250);
const sizes = process.argv.length > 4 ? process.argv.slice(4).map(Number) : Object.keys(STARTERS).map(Number);

const seqs = (opp, n) => Array.from({ length: n }, (_, t) => opp.map((o) => o[t]).filter((u) => u < n));
const pairsOf = ([step, ...flat]) => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]); return { step, pairs: out }; };

function breaksOf(opp, n) {
  const v = assignVenues(opp, n, 1, 4);
  let b = 0;
  for (let t = 0; t < n; t++) {
    let last = null;
    for (let r = 0; r < opp.length; r++) {
      if (opp[r][t] >= n) { last = null; continue; }
      if (last === v[r][t]) b++;
      last = v[r][t];
    }
  }
  return b;
}

function scoreOf(N, n, { step, pairs }) {
  const opp = starterOpp(N, pairs, { step, start: 0 });
  const coe = carryOverFromOpponents(seqs(opp, n)).value;
  const breaks = breaksOf(opp, n);
  return { coe, breaks, score: coe + weight * breaks };
}

function startInvariant(N, n, s) {
  const vals = new Set();
  for (let start = 0; start < N - 1; start++) vals.add(carryOverFromOpponents(seqs(starterOpp(N, s.pairs, { step: s.step, start }), n)).value);
  return vals.size === 1;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const table = {};
  for (const N of sizes) {
    const p = N - 1;
    table[N] = {};
    for (const [key, n] of [["even", N], ["odd", N - 1]]) {
      const odd = key === "odd";
      const cur = pairsOf(STARTERS[N][key]);
      if (!startInvariant(N, n, cur)) throw new Error(`carry-over depends on the start at N=${N} ${key}`);
      const base = scoreOf(N, n, cur);
      const prevW = STARTERS_WEIGHTED[N]?.[key];
      const prev = prevW ? scoreOf(N, n, pairsOf(prevW)) : null;
      const r = climb(N, odd, secs * 1000, N * 104729 + (odd ? 7 : 3), 6 + Math.floor(p / 4), POOL);
      let pick = { ...base, entry: STARTERS[N][key], from: "STARTERS" };
      if (prev && prev.score < pick.score) pick = { ...prev, entry: prevW, from: "STARTERS_WEIGHTED" };
      const t0 = Date.now();
      for (const c of r.pool) {
        const s = { step: 1, pairs: toPairs(c.f, p) };
        const e = scoreOf(N, n, s);
        if (e.score < pick.score || (e.score === pick.score && e.coe < pick.coe)) pick = { ...e, entry: [1, ...s.pairs.flat()], from: "climb" };
      }
      console.log(JSON.stringify({ N, teams: n, weight, least: { coe: base.coe, breaks: base.breaks, score: base.score }, kept: { coe: pick.coe, breaks: pick.breaks, score: pick.score, from: pick.from }, pool: r.pool.length, rescoreSeconds: +((Date.now() - t0) / 1000).toFixed(1) }));
      table[N][key] = pick.from === "STARTERS" ? null : pick.entry;
    }
  }
  console.log(`export const STARTERS_WEIGHTED = {`);
  for (const [N, e] of Object.entries(table)) {
    const parts = ["even", "odd"].filter((k) => e[k]).map((k) => `${k}: [${e[k].join(", ")}]`);
    if (parts.length) console.log(`  ${N}: { ${parts.join(", ")} },`);
  }
  console.log("};");
}
