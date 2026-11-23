// League schedule generator, pools.mjs: Pool play: snake-drafted pools, clubs kept apart, advancers and crossover seeds.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { nextPow2, seedOrder } from "./brackets.mjs";

// ---------------------------------------------------------------- pool play

/**
 * Splits teams (listed best seed first) into `k` pools by snake draft: seeds 1..k go to pools A..,
 * the next k go back the other way, and so on, so no pool collects all the strong seeds. Pool sizes
 * differ by at most one. Returns [{ name: "Pool A", teams: [...] }]. Optional `clubs` (arrays of team
 * names) are spread across pools where possible by swapping teams of the same snake row, so the seed
 * spread and pool sizes are kept.
 */
export function splitPools(teams, k, clubs = []) {
  if (!Number.isInteger(k) || k < 1) throw new Error("Pools must be a whole number, 1 or more.");
  if (teams.length < 2 * k) throw new Error(`${k} pools need at least ${2 * k} teams (two each); you have ${teams.length}.`);
  const pools = Array.from({ length: k }, (_, i) => ({ name: `Pool ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`, teams: [] }));
  teams.forEach((t, i) => {
    const row = Math.floor(i / k);
    const col = i % k;
    pools[row % 2 === 0 ? col : k - 1 - col].teams.push(t);
  });
  if (k > 1 && clubs.length) separateClubs(pools, clubs);
  return pools;
}

/**
 * Clubs are lists of team names that belong together (a club with several age-group teams, or teams
 * sharing a ground). Number of same-club pairs that sit in one pool; 0 means every club is spread out.
 */
export function clubPairsInPools(pools, clubs) {
  let n = 0;
  for (const p of pools) for (const c of clubs) { const m = c.filter((t) => p.teams.includes(t)).length; n += m * (m - 1) / 2; }
  return n;
}

// Swap teams of the same snake row between pools (so sizes and the seed spread stay as drawn) while a
// swap lowers the number of same-club pairs sharing a pool. Greedy and deterministic.
function separateClubs(pools, clubs) {
  const k = pools.length;
  let best = clubPairsInPools(pools, clubs);
  for (let guard = 0; best > 0 && guard < 200; guard++) {
    let move = null;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
      for (let i = 0; i < Math.min(pools[a].teams.length, pools[b].teams.length); i++) { const j = i; // the i-th team of any pool came from snake row i
        const x = pools[a].teams[i], y = pools[b].teams[j];
        pools[a].teams[i] = y; pools[b].teams[j] = x;
        const score = clubPairsInPools(pools, clubs);
        pools[a].teams[i] = x; pools[b].teams[j] = y;
        if (score < best && (!move || score < move.score)) move = { a, b, i, j, score };
      }
    }
    if (!move) break;
    const { a, b, i, j, score } = move;
    [pools[a].teams[i], pools[b].teams[j]] = [pools[b].teams[j], pools[a].teams[i]];
    best = score;
  }
}

/**
 * Play-off seeding from pool tables: every pool winner first (best record first), then every
 * runner-up, and so on, taking `perPool` from each pool. Ties across pools break on points, goal
 * difference, goals for, then pool order. `tables` is one standings() result per pool.
 */
export function poolAdvancers(tables, perPool) {
  const out = [];
  for (let place = 0; place < perPool; place++) {
    const tier = tables.map((t, p) => ({ row: t[place], p })).filter((x) => x.row)
      .sort((x, y) => y.row.points - x.row.points || y.row.gd - x.row.gd || y.row.gf - x.row.gf || x.p - y.p);
    out.push(...tier.map((x) => x.row.name));
  }
  return out;
}

/**
 * Bracket round (1 = first round) in which the teams on bracket lines `i` and `j` (0-based positions
 * in seedOrder) can first meet: the lowest level at which both sit in the same block.
 */
function meetRound(i, j) {
  let r = 0;
  while (i !== j) { i >>= 1; j >>= 1; r++; }
  return r;
}

/**
 * Crossover play-off seeds from pool tables: winners still come before runners-up, and so on, but
 * within each place the order is chosen so teams from the same pool meet as late as the bracket
 * allows (A1 v B2, B1 v A2 rather than a pool rematch in the first knockout round). The objective is
 * lexicographic: fewest possible same-pool meetings in round 1, then round 2, ..., then the least
 * movement from the best-record order of poolAdvancers (a move near the top weighs more). Swaps inside each place first, then an exact
 * pruned search over the places' orderings (capped at SEED_SEARCH_NODES nodes; the swap answer
 * stands if the cap is hit). Returns { seeds, pools (pool index per seed), meetings (same-pool pairings possible per
 * round), plain (the same counts for the poolAdvancers order) }.
 */
const SEED_SEARCH_NODES = 300000;
export function poolPlayoffSeeds(tables, perPool) {
  const tiers = [];
  for (let place = 0; place < perPool; place++) {
    const tier = tables.map((t, p) => ({ row: t[place], p })).filter((x) => x.row)
      .sort((x, y) => y.row.points - x.row.points || y.row.gd - x.row.gd || y.row.gf - x.row.gf || x.p - y.p)
      .map((x) => ({ name: x.row.name, p: x.p }));
    if (tier.length) tiers.push(tier);
  }
  const base = tiers.flat();
  const n = base.length;
  if (n < 2) return { seeds: base.map((x) => x.name), pools: base.map((x) => x.p), meetings: [], plain: [] };
  const size = nextPow2(n);
  const order = seedOrder(size);
  const line = new Array(n + 1);
  order.forEach((s, i) => { if (s <= n) line[s] = i; });
  const rounds = Math.log2(size);
  const homeSeed = new Map(base.map((x, i) => [x.name, i]));
  const score = (arr) => {
    const v = new Array(rounds + 1).fill(0);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (arr[a].p === arr[b].p) v[meetRound(line[a + 1], line[b + 1]) - 1]++;
    v[rounds] = arr.reduce((s, x, i) => s + Math.abs(homeSeed.get(x.name) - i) * (n - Math.min(i, homeSeed.get(x.name))), 0); // moving a top seed costs more
    return v;
  };
  const less = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
  const cur = base.slice();
  let best = score(cur);
  const starts = [];
  let off = 0;
  for (const t of tiers) { starts.push([off, off + t.length]); off += t.length; }
  for (let guard = 0; guard < 10000; guard++) {
    let move = null;
    for (const [lo, hi] of starts) for (let a = lo; a < hi; a++) for (let b = a + 1; b < hi; b++) {
      if (cur[a].p === cur[b].p) continue;
      [cur[a], cur[b]] = [cur[b], cur[a]];
      const v = score(cur);
      [cur[a], cur[b]] = [cur[b], cur[a]];
      if (less(v, move ? move.v : best)) move = { a, b, v };
    }
    if (!move) break;
    [cur[move.a], cur[move.b]] = [cur[move.b], cur[move.a]];
    best = move.v;
  }
  // Swaps can stall in a local optimum (3 pools x 4 advancers did), so an exact depth-first search
  // over each place's orderings follows, pruned whenever a partial vector is already lex-worse than
  // the best (every count only grows as seeds are added), and stopped after SEED_SEARCH_NODES nodes.
  const tierOf = [];
  starts.forEach(([lo, hi], t) => { for (let i = lo; i < hi; i++) tierOf[i] = t; });
  const used = new Set();
  const pick = new Array(n);
  const v = new Array(rounds + 1).fill(0);
  let nodes = 0;
  const lexGreater = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  const dfs = (a) => {
    if (++nodes > SEED_SEARCH_NODES) return;
    if (a === n) { if (less(v, best)) { best = v.slice(); for (let i = 0; i < n; i++) cur[i] = pick[i]; } return; }
    const [lo, hi] = starts[tierOf[a]];
    for (let m = lo; m < hi; m++) {
      if (used.has(m)) continue;
      const x = base[m];
      const added = [];
      for (let b = 0; b < a; b++) if (pick[b].p === x.p) { const r = meetRound(line[a + 1], line[b + 1]) - 1; v[r]++; added.push(r); }
      const d = Math.abs(m - a) * (n - Math.min(a, m));
      v[rounds] += d;
      if (!lexGreater(v, best) && (a + 1 < n || less(v, best))) { used.add(m); pick[a] = x; dfs(a + 1); used.delete(m); }
      v[rounds] -= d;
      for (const r of added) v[r]--;
    }
  };
  dfs(0);
  return { seeds: cur.map((x) => x.name), pools: cur.map((x) => x.p), meetings: best.slice(0, rounds), plain: score(base).slice(0, rounds) };
}
