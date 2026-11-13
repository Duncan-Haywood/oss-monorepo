// A negative result kept reproducible (README "Pricing the balanced least", "Two things that did not
// work"): exact block descent over a home-and-away season's pair hosts. For every block of pairs (one
// leg-one round, one leg-two round, two adjacent rounds of a leg, the legs' seam, and a leg-one round
// joined with each leg-two round) every host choice of its pairs is tried with the rest kept, until a
// sweep changes nothing. On the page's 19-team seed-1 tries 0 and 7 (MaxSAT: 85 and 84) it starts at
// 87 and 84 and ends at 87 and 84: the page's grounds are already optimal over every such block, so
// the 2 breaks MaxSAT finds on try 0 need a change spread over more than two rounds' pairs.
//
//   node eval/double-blocks.mjs <teams> <tries, e.g. 0,7> [maxBits 20]
import { carryOverTry } from "../carryover.mjs";
import { countBreaks } from "../orient.mjs";

function roundMatches(opp, n) {
  return opp.map((o) => {
    const ms = [];
    for (let t = 0; t < n; t++) { const u = o[t]; if (u < n && t < u) ms.push([t, u]); }
    return ms;
  });
}
/**
 * Fewer breaks for a home-and-away season's grounds by exact block descent. A season keeps one host
 * per pair (at home in leg one, away in leg two), so a host choice is one bit per pair. The pairs
 * fall into blocks two ways: the matches of one leg-one round, and the matches of one leg-two round
 * (9 pairs at 18 or 19 teams). For a block, or two blocks together (adjacent rounds of one leg, or a
 * leg-one round with a leg-two round they share teams in), every host choice of its pairs is tried
 * (a Gray-code walk: one pair flipped per step, its two teams recounted) with every other pair kept,
 * and the best is kept: the least breaks with each team's leg-one home and away games within one.
 * Sweeps repeat until a whole sweep changes nothing, so the result is a local optimum over every
 * such block, never worse than the start. `venues` (venues[r][t] = 1 at home, each pair's two games
 * at opposite grounds, leg one balanced) is the start. Returns { venues, breaks, sweeps, blocks } (a
 * copy). `maxBits` caps a joint block's pairs (2^maxBits choices). Deterministic.
 */
function polishDoubleBlocks(opp, n, venues, { maxBits = 20, maxSweeps = 50 } = {}) {
  const R2 = opp.length, R = R2 / 2;
  const v = venues.map((x) => Uint8Array.from(x));
  const M = roundMatches(opp, n);
  const pairs = [], pid = new Map();
  M.forEach((ms, r) => ms.forEach(([a, b]) => {
    const key = a * 64 + b;
    if (!pid.has(key)) { pid.set(key, pairs.length); pairs.push({ a, b, r1: -1, r2: -1 }); }
    const p = pairs[pid.get(key)];
    if (r < R) p.r1 = r; else p.r2 = r;
  }));
  if (pairs.some((p) => p.r1 < 0 || p.r2 < 0)) throw new Error("a home-and-away timetable meets every pair once in each leg.");
  const PEN = 1000;
  const cost = (t) => {
    let b = 0, last = -1, h = 0, g = 0;
    for (let r = 0; r < R2; r++) {
      if (opp[r][t] >= n) { last = -1; continue; }
      const x = v[r][t];
      if (x === last) b++;
      last = x;
      if (r < R) { g++; h += x; }
    }
    const d = Math.abs(2 * h - g);
    return b + (d > 1 ? PEN * (d - 1) : 0);
  };
  const tc = new Int32Array(n);
  for (let t = 0; t < n; t++) tc[t] = cost(t);
  const flip = (p) => { v[p.r1][p.a] ^= 1; v[p.r1][p.b] ^= 1; v[p.r2][p.a] ^= 1; v[p.r2][p.b] ^= 1; };
  const g1 = Array.from({ length: R }, () => []), g2 = Array.from({ length: R }, () => []);
  for (const p of pairs) { g1[p.r1].push(p); g2[p.r2 - R].push(p); }
  const blocks = [];
  for (let r = 0; r < R; r++) { blocks.push(g1[r]); blocks.push(g2[r]); }
  for (let r = 0; r + 1 < R; r++) { blocks.push([...g1[r], ...g1[r + 1]]); blocks.push([...g2[r], ...g2[r + 1]]); }
  blocks.push([...g1[R - 1], ...g2[0]]); // across the legs' seam
  // a leg-one round with every leg-two round, pairs counted once
  for (let r = 0; r < R; r++) for (let s = 0; s < R; s++) {
    const seen = new Set(g1[r]); const bl = [...g1[r]];
    for (const p of g2[s]) if (!seen.has(p)) bl.push(p);
    if (bl.length > g1[r].length) blocks.push(bl);
  }
  const usable = blocks.filter((b) => b.length && b.length <= maxBits);
  let sweeps = 0, improved = true, tried = 0;
  while (improved && sweeps < maxSweeps) {
    improved = false; sweeps++;
    for (const bl of usable) {
      tried++;
      const k = bl.length, S = 1 << k;
      const teams = [...new Set(bl.flatMap((p) => [p.a, p.b]))];
      let cur = 0;
      for (const t of teams) cur += tc[t];
      const start = cur;
      let best = cur, bestI = 0;
      // Gray-code walk: state i flips pair ctz(i) relative to state i - 1
      for (let i = 1; i < S; i++) {
        const p = bl[31 - Math.clz32(i & -i)];
        flip(p);
        const ca = cost(p.a), cb = cost(p.b);
        cur += ca + cb - tc[p.a] - tc[p.b];
        tc[p.a] = ca; tc[p.b] = cb;
        if (cur < best) { best = cur; bestI = i; }
      }
      // the walk ends at gray(S - 1) = only the top pair flipped; move to gray(bestI)
      const end = (S - 1) ^ ((S - 1) >>> 1), want = bestI ^ (bestI >>> 1);
      let diff = end ^ want;
      while (diff) { const j = 31 - Math.clz32(diff & -diff); diff &= diff - 1; flip(bl[j]); }
      for (const t of teams) tc[t] = cost(t);
      if (best < start) improved = true;
    }
  }
  let breaks = 0, bad = 0;
  for (let t = 0; t < n; t++) { const c = tc[t]; breaks += c % PEN; bad += Math.floor(c / PEN); }
  return { venues: v, breaks, balanced: bad === 0, sweeps, blocks: tried };
}

const oppOf = (rounds, n) => { const N = n % 2 ? n + 1 : n; return rounds.map((rd) => { const o = new Int16Array(N).fill(N - 1); for (const [a, b] of rd.matches) { o[a] = b; o[b] = a; } if (rd.bye != null) o[rd.bye] = N - 1; return o; }); };
const n = +process.argv[2], maxBits = +process.argv[4] || 20;
for (const i of process.argv[3].split(",").map(Number)) {
  const t = carryOverTry(n, i, { seed: 1, weighted: 8, double: true });
  const opp = oppOf(t.rounds, n);
  const v = t.rounds.map((rd) => { const x = new Uint8Array(opp[0].length); for (const [h] of rd.matches) x[h] = 1; return x; });
  const t0 = Date.now();
  const r = polishDoubleBlocks(opp, n, v, { maxBits });
  console.log(JSON.stringify({ teams: n, i, coe: t.coe, page: t.breaks, polished: r.breaks, recount: countBreaks(r.venues, opp, n), balanced: r.balanced, sweeps: r.sweeps, blocks: r.blocks, s: +((Date.now() - t0) / 1000).toFixed(1) }));
}
