// Doubleheader nights: who waits between games, and a round robin rearranged so nobody has to.
//
// On a night where each team plays `g` games (g consecutive rounds of the round robin), a team
// waits when its games are not in back-to-back time slots. Put the night's matches on a graph
// (teams are nodes, each match an edge labelled by its round): every connected component can be
// laid out on its own run of g consecutive time rows, round k of the component in row s + p(k) for
// some order p, and then every team in it plays back to back. A night is wait-free in this layout
// when the components pack into the rows without any row needing more matches than there are
// courts. With two games a night the components are even cycles, alternating the two rounds, so
// the question is how long the cycles are: the circle method's consecutive rounds join all teams in
// one long cycle (8 teams on 2 courts and 4 times cannot be packed), while a different
// one-factorisation can split the night into 4-cycles that fit two to a pair of rows.
//
// `nightLayout` packs one night (greedy, largest component first) and reports the matches it could
// not place wait-free. `waitFreeNights` searches the round robin itself (partial round swaps and
// round swaps between nights, the moves of carryover.mjs) for a plan whose nights all pack, then
// sets home and away with assignVenues. Pure and seeded: the same input gives the same plan.

import { assignVenues } from "./carryover.mjs";

function rand32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function permutations(k) {
  if (k <= 1) return [[0]];
  const out = [];
  for (const p of permutations(k - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), k - 1, ...p.slice(i)]);
  return out;
}
const PERMS = [null, permutations(1), permutations(2), permutations(3), permutations(4)];

/**
 * Components of a night: `edges` is [[a, b, k]] (k = the round within the night, 0..g-1).
 * Returns [{ count[k] (matches of round k), edges[] (indexes into `edges`) }].
 */
export function nightComponents(edges, g) {
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [a, b] of edges) { if (!parent.has(a)) parent.set(a, a); if (!parent.has(b)) parent.set(b, b); }
  for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }
  const byRoot = new Map();
  edges.forEach(([a, , k], i) => {
    const r = find(a);
    if (!byRoot.has(r)) byRoot.set(r, { count: Array(g).fill(0), edges: [] });
    const c = byRoot.get(r);
    c.count[k]++;
    c.edges.push(i);
  });
  return [...byRoot.values()];
}

/**
 * Packs one night's components into `times` rows of `courts` matches. Each component takes rows
 * s..s+g-1, its rounds in some order, so its teams play back to back. Largest components first;
 * each goes where the busiest row it touches ends lowest. Returns { unplaced (matches in components
 * that fit nowhere), row[] (a time row per edge, or -1 for an unplaced one), score }: score is 0
 * for a wait-free night, else the unplaced matches weighted far above the sum of squared sizes of
 * the components that did not fit (smaller components pack more easily, so the search can climb).
 */
export function nightLayout(edges, g, courts, times, usage = null) {
  // with `usage` (usage[team][row]: games so far in that time row), placements are first chosen to
  // even out each team's time rows across the season, then by peak load; kept only when it packs as
  // many matches wait-free as the peak-first layout
  if (usage) {
    const fair = layoutOnce(edges, g, courts, times, usage);
    const plain = layoutOnce(edges, g, courts, times, null);
    return fair.unplaced <= plain.unplaced ? fair : plain;
  }
  return layoutOnce(edges, g, courts, times, null);
}

/**
 * A layout for every night of a season in order, each chosen to even out the teams' time rows given
 * the nights before it (see nightLayout's `usage`). `nights` is [edges], n the team count.
 * Returns [row[]] (one per night).
 */
export function seasonLayout(nights, n, g, courts, times) {
  const usage = Array.from({ length: n }, () => Array(times).fill(0));
  return nights.map((edges) => {
    if (!edges) return null;
    const { row } = nightLayout(edges, g, courts, times, usage);
    edges.forEach(([a, b], i) => { if (row[i] >= 0) { usage[a][row[i]]++; usage[b][row[i]]++; } });
    return row;
  });
}

function layoutOnce(edges, g, courts, times, usage) {
  const comps = nightComponents(edges, g).sort((x, y) => Math.max(...y.count) - Math.max(...x.count) || y.edges.length - x.edges.length);
  const load = Array(times).fill(0);
  const row = Array(edges.length).fill(-1);
  let unplaced = 0;
  let spread = 0;
  const perms = PERMS[g] || [Array.from({ length: g }, (_, i) => i)];
  for (const c of comps) {
    const used = c.count.map((x, k) => (x ? k : -1)).filter((k) => k >= 0);
    const span = used.length;
    let best = null;
    for (let s = 0; s + span <= times; s++) {
      for (const p of PERMS[span] || [used.map((_, i) => i)]) {
        let ok = true, peak = 0;
        for (let i = 0; i < span && ok; i++) {
          const l = load[s + p[i]] + c.count[used[i]];
          if (l > courts) ok = false; else peak = Math.max(peak, l);
        }
        if (!ok) continue;
        let skew = 0;
        if (usage) for (let i = 0; i < span; i++) for (const e of c.edges) if (edges[e][2] === used[i]) skew += usage[edges[e][0]][s + p[i]] + usage[edges[e][1]][s + p[i]];
        if (!best || skew < best.skew || (skew === best.skew && peak < best.peak)) best = { s, p, peak, skew };
      }
    }
    if (!best) { unplaced += c.edges.length; spread += c.edges.length * c.edges.length; continue; }
    const rowOf = new Map(used.map((k, i) => [k, best.s + best.p[i]]));
    for (const k of used) load[rowOf.get(k)] += c.count[k];
    for (const i of c.edges) row[i] = rowOf.get(edges[i][2]);
  }
  void perms;
  return { unplaced, row, score: unplaced ? unplaced * 10000 + spread : 0 };
}

/**
 * Whether `teams` teams can each play g games back to back on one night of `courts` x `times`
 * at all: a team's games fill a window of g consecutive time rows, and a row holds at most
 * 2 x courts teams. The most teams that fit is a small integer programme over how many windows
 * start at each row (enumerated; above 7 start rows it answers true without checking). With
 * g + 1 time rows, for example, every window covers the middle rows, so 10 teams cannot all play
 * two games back to back on 4 courts and 3 times: at most 8 fit in the middle row.
 */
export function waitFreePossible(teams, g, courts, times) {
  const starts = times - g + 1;
  if (starts < 1) return false;
  if (starts > 7) return true;
  const cap = 2 * courts;
  const load = Array(times).fill(0);
  const go = (s, left) => {
    if (left === 0) return true;
    if (s === starts) return false;
    let room = cap;
    for (let r = s; r < s + g; r++) room = Math.min(room, cap - load[r]);
    for (let a = Math.min(room, left); a >= 0; a--) {
      for (let r = s; r < s + g; r++) load[r] += a;
      const ok = go(s + 1, left - a);
      for (let r = s; r < s + g; r++) load[r] -= a;
      if (ok) return true;
    }
    return false;
  };
  return go(0, teams);
}

/** Matches (as edges) of the rounds `rs` of opp, real teams only. */
function nightEdges(opp, rs, n) {
  const edges = [];
  rs.forEach((r, k) => {
    const o = opp[r];
    for (let t = 0; t < o.length; t++) if (t < o[t] && o[t] < n) edges.push([t, o[t], k]);
  });
  return edges;
}

/** The nights of a single round robin of R rounds, g at a time: [[r0, r1, ...], ...]. */
export function nightGroups(R, g) {
  const out = [];
  for (let i = 0; i < R; i += g) out.push(Array.from({ length: Math.min(g, R - i) }, (_, k) => i + k));
  return out;
}

function oppOfRounds(rounds, N, n) {
  return rounds.map((r) => {
    const o = new Int16Array(N);
    for (const [h, a] of r.matches) { o[h] = a; o[a] = h; }
    if (N > n) { const b = r.bye; o[b] = N - 1; o[N - 1] = b; }
    return o;
  });
}

/** Unplaced matches over every night of `opp` (see nightLayout). */
export function planWaitCost(opp, n, g, courts, times) {
  let c = 0;
  for (const rs of nightGroups(opp.length, g)) c += nightLayout(nightEdges(opp, rs, n), g, courts, times).unplaced;
  return c;
}

/**
 * A single round robin for n teams whose nights of g games pack wait-free on `courts` x `times`,
 * searched from `rounds` (the plan as roundRobin returns it, leg 0 only). Hill climb with sideways
 * moves over (a) swapping two whole rounds between nights and (b) partial round swaps: in rounds r
 * and s the matches form even cycles, and trading the r and s opponents of every team on one cycle
 * keeps both rounds perfect matchings and every pair meeting once. Returns { rounds, before, after,
 * evals, start }: `before` and `after` are planWaitCost of the given and returned plans, `start`
 * 0 for `rounds` or i + 1 for starts[i] (each a round list or a function returning one, tried only
 * while no plan is wait-free yet). When nothing better is found the given rounds come back
 * unchanged (same objects).
 */
export function waitFreeNights(rounds, n, g, courts, times, { seed = 1, evals = null, starts = [] } = {}) {
  // the circle method's consecutive rounds often join every team in one cycle, and partial swaps
  // along a whole-round cycle change nothing, so other one-factorisations (`starts`, e.g. a
  // carry-over timetable) are searched too when the first does not reach zero
  // in an odd league g teams sit out one game each night; the rest must fit whole windows
  const full = n % 2 ? Math.max(0, n - g) : n;
  if (!waitFreePossible(full, g, courts, times)) {
    const c = planWaitCost(oppOfRounds(rounds, n % 2 ? n + 1 : n, n), n, g, courts, times);
    return { rounds, before: c, after: c, evals: 0, possible: false };
  }
  let best = searchNights(rounds, n, g, courts, times, { seed, evals });
  for (let i = 0; i < starts.length && best.after > 0; i++) {
    const s = typeof starts[i] === "function" ? starts[i]() : starts[i];
    const r = searchNights(s, n, g, courts, times, { seed: seed + i + 1, evals });
    if (r.after < best.after) best = { ...r, before: best.before, start: i + 1 };
  }
  return best;
}

function searchNights(rounds, n, g, courts, times, { seed = 1, evals = null } = {}) {
  const N = n % 2 ? n + 1 : n;
  const R = rounds.length;
  const opp = oppOfRounds(rounds, N, n);
  const groups = nightGroups(R, g);
  const nightOf = Array(R);
  groups.forEach((rs, i) => rs.forEach((r) => { nightOf[r] = i; }));
  const nightCost = groups.map((rs) => nightLayout(nightEdges(opp, rs, n), g, courts, times).score);
  const before0 = planWaitCost(opp, n, g, courts, times);
  const before = nightCost.reduce((a, b) => a + b, 0);
  if (before === 0 || groups.length < 2) return { rounds, before: before0, after: before0, evals: 0 };
  const budget = Number.isInteger(evals) && evals >= 0 ? evals : Math.min(20000, Math.max(3000, Math.floor(1e7 / (N * N * g))));
  const rand = rand32((seed >>> 0) * 2654435761 + 977);
  let cur = before, best = before, bestOpp = opp.map((o) => o.slice());
  let used = 0;
  const recost = (i) => nightLayout(nightEdges(opp, groups[i], n), g, courts, times).score;
  while (used < budget && best > 0) {
    used++;
    const r = Math.floor(rand() * R);
    let s = Math.floor(rand() * (R - 1));
    if (s >= r) s++;
    const nr = nightOf[r], ns = nightOf[s];
    if (nr === ns) continue;
    let undo;
    if (rand() < 0.25) {
      const t = opp[r]; opp[r] = opp[s]; opp[s] = t;
      undo = () => { const u = opp[r]; opp[r] = opp[s]; opp[s] = u; };
    } else {
      const t0 = Math.floor(rand() * N);
      const cyc = [];
      let x = t0;
      do { cyc.push(x); const y = opp[r][x]; cyc.push(y); x = opp[s][y]; } while (x !== t0);
      if (cyc.length === N) continue; // the whole round: same as a round swap
      const swap = () => { for (const v of cyc) { const a = opp[r][v]; opp[r][v] = opp[s][v]; opp[s][v] = a; } };
      swap();
      undo = swap;
    }
    const cr = recost(nr), cs = recost(ns);
    const next = cur - nightCost[nr] - nightCost[ns] + cr + cs;
    if (next <= cur) {
      nightCost[nr] = cr; nightCost[ns] = cs; cur = next;
      if (cur < best) { best = cur; bestOpp = opp.map((o) => o.slice()); }
    } else undo();
  }
  const after = planWaitCost(bestOpp, n, g, courts, times);
  if (after >= before0) return { rounds, before: before0, after: before0, evals: used };
  const venues = assignVenues(bestOpp, n, seed);
  const out = bestOpp.map((o, r) => {
    const matches = [];
    let bye = null;
    for (let t = 0; t < N; t++) {
      const u = o[t];
      if (t > u) continue;
      if (u >= n) { bye = t; continue; }
      matches.push(venues[r][t] ? [t, u] : [u, t]);
    }
    return { leg: 0, matches, bye };
  });
  return { rounds: out, before: before0, after, evals: used };
}
