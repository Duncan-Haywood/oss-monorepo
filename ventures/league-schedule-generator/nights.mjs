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
import { ALPHA, SESSION_DESIGNS } from "./session-designs.mjs";
import { ODD_DESIGNS } from "./odd-designs.mjs";

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
export function nightLayout(edges, g, courts, times, usage = null, { exact = EXACT_NODES } = {}) {
  // with `usage` (usage[team][row]: games so far in that time row), placements are first chosen to
  // even out each team's time rows across the season, then by peak load; kept only when it packs as
  // many matches wait-free as the peak-first layout
  let out;
  if (usage) {
    const fair = layoutOnce(edges, g, courts, times, usage);
    const plain = layoutOnce(edges, g, courts, times, null);
    out = fair.unplaced <= plain.unplaced ? fair : plain;
  } else out = layoutOnce(edges, g, courts, times, null);
  // when whole rounds of components do not pack, a match-by-match layout often still does
  if (out.unplaced && exact > 0) {
    const row = nightRowsExact(edges, courts, times, { nodes: exact, usage });
    if (row) return { unplaced: 0, row, score: 0, exact: true };
    // the usage order can spend the node budget where the plain order finds a layout at once
    // (2026-11-15: 26 teams, 3 games on 5 courts x 9 times, six of nine circle nights; the
    // season kept 69 waits that planWaitCost, laid out without usage, said were not there)
    if (usage) {
      const plainRow = nightRowsExact(edges, courts, times, { nodes: exact });
      if (plainRow) return { unplaced: 0, row: plainRow, score: 0, exact: true };
    }
    // a stored design's own rows (odd-designs.mjs) when the search ran out of nodes
    const known = knownLayout(edges, courts, times);
    if (known) return { unplaced: 0, row: known, score: 0, exact: true, known: true };
  }
  return out;
}

/** Search nodes nightLayout gives nightRowsExact when the component layout leaves a match out. */
export const EXACT_NODES = 3000;

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

function contiguous(rows) {
  let lo = Infinity, hi = -Infinity;
  for (const r of rows) { if (r < lo) lo = r; if (r > hi) hi = r; }
  return hi - lo + 1 === rows.length;
}

/** Positions (into `used`) of the rounds each team of component c plays, for teams missing one. */
function gappedTeams(edges, c, used) {
  const by = new Map();
  for (const e of c.edges) for (const t of [edges[e][0], edges[e][1]]) {
    if (!by.has(t)) by.set(t, []);
    by.get(t).push(used.indexOf(edges[e][2]));
  }
  const out = [];
  for (const pos of by.values()) if (pos.length > 1 && pos.length < used.length) out.push(pos);
  return out;
}

/** Whether every team's games in `row` (one per edge, -1 = unplaced) sit in distinct adjacent rows. */
export function rowsWaitFree(edges, row) {
  const at = new Map();
  edges.forEach(([a, b], i) => { for (const t of [a, b]) { if (!at.has(t)) at.set(t, []); at.get(t).push(row[i]); } });
  for (const rs of at.values()) {
    if (rs.some((r) => r < 0)) return false;
    if (new Set(rs).size !== rs.length || !contiguous(rs)) return false;
  }
  return true;
}

/**
 * An exact layout of one night, match by match: each match gets a time row so that every team's
 * games take distinct, adjacent rows and no row holds more than `courts` matches. Unlike the
 * component layout it may split a round of one component over several rows, which is what three
 * games a night need: there the night's graph is 3-regular and its components are rarely small
 * enough to sit whole rounds side by side. Depth-first search, the match with the fewest open rows
 * first; `nodes` caps the work. With `usage` (usage[team][row]) rows a pair has used least are
 * tried first, so a season's time rows stay even. Returns row[] or null (none found in the budget).
 */
export function nightRowsExact(edges, courts, times, { nodes = 20000, usage = null } = {}) {
  const E = edges.length;
  if (E > courts * times) return null;
  const teams = new Map();
  edges.forEach(([a, b]) => { for (const t of [a, b]) teams.set(t, (teams.get(t) || 0) + 1); });
  for (const d of teams.values()) if (d > times) return null;
  const deg = new Map(teams);
  const lo = new Map(), hi = new Map(), usedBy = new Map();
  for (const t of teams.keys()) { lo.set(t, Infinity); hi.set(t, -Infinity); usedBy.set(t, 0); }
  const load = Array(times).fill(0);
  const row = Array(E).fill(-1);
  let left = nodes;
  const fits = (t, r) => {
    if (usedBy.get(t) & (1 << r)) return false;
    const l = Math.min(lo.get(t), r), h = Math.max(hi.get(t), r);
    return h - l <= deg.get(t) - 1;
  };
  const domain = (i) => {
    const [a, b] = edges[i];
    const out = [];
    for (let r = 0; r < times; r++) if (load[r] < courts && fits(a, r) && fits(b, r)) out.push(r);
    return out;
  };
  const set = (i, r) => {
    const [a, b] = edges[i];
    row[i] = r; load[r]++;
    const saved = [lo.get(a), hi.get(a), lo.get(b), hi.get(b)];
    for (const t of [a, b]) { lo.set(t, Math.min(lo.get(t), r)); hi.set(t, Math.max(hi.get(t), r)); usedBy.set(t, usedBy.get(t) | (1 << r)); }
    return () => {
      row[i] = -1; load[r]--;
      lo.set(a, saved[0]); hi.set(a, saved[1]); lo.set(b, saved[2]); hi.set(b, saved[3]);
      for (const t of [a, b]) usedBy.set(t, usedBy.get(t) & ~(1 << r));
    };
  };
  const teamList = [...teams.keys()];
  const forced = Array(times).fill(0);
  // every row a team's window must cover, whatever its start, holds that team once: count the
  // teams still to play in each such row and refuse when they cannot fit beside the booked matches
  const roomy = () => {
    forced.fill(0);
    for (const t of teamList) {
      const d = deg.get(t), l = lo.get(t), h = hi.get(t);
      const wMax = l === Infinity ? times - d : Math.min(l, times - d);
      const wMin = l === Infinity ? 0 : Math.max(0, h - d + 1);
      const u = usedBy.get(t);
      for (let r = wMax; r <= wMin + d - 1; r++) if (!(u & (1 << r))) forced[r]++;
    }
    for (let r = 0; r < times; r++) if (2 * load[r] + forced[r] > 2 * courts) return false;
    return true;
  };
  const go = (placed) => {
    if (placed === E) return true;
    if (left-- <= 0) return false;
    if (!roomy()) return false;
    let pick = -1, dom = null;
    for (let i = 0; i < E; i++) {
      if (row[i] >= 0) continue;
      const d = domain(i);
      if (!d.length) return false;
      if (!dom || d.length < dom.length) { pick = i; dom = d; if (d.length === 1) break; }
    }
    if (usage) {
      const [a, b] = edges[pick];
      dom.sort((x, y) => usage[a][x] + usage[b][x] - usage[a][y] - usage[b][y] || x - y);
    }
    for (const r of dom) {
      const undo = set(pick, r);
      if (go(placed + 1)) return true;
      undo();
      if (left <= 0) return false;
    }
    return false;
  };
  return go(0) ? row : null;
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
    // a team that sits out one of the component's rounds (an odd league's bye) plays the others,
    // and they must land in adjacent rows too: e.g. rounds 0 and 2 of three may not be rows s and s+2
    const gapped = gappedTeams(edges, c, used);
    let best = null;
    for (let s = 0; s + span <= times; s++) {
      for (const p of PERMS[span] || [used.map((_, i) => i)]) {
        let ok = true, peak = 0;
        for (let i = 0; i < span && ok; i++) {
          const l = load[s + p[i]] + c.count[used[i]];
          if (l > courts) ok = false; else peak = Math.max(peak, l);
        }
        if (!ok) continue;
        if (gapped.length && !gapped.every((pos) => contiguous(pos.map((i) => p[i])))) continue;
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
 * `short` more teams play g - 1 games (an odd league's night: the g teams that sit out one of its
 * rounds); their shorter windows share the rows too. Odd leagues with every slot booked fail here:
 * 9 teams, 3 games, 3 courts x 4 times has 12 matches in 12 slots, and no way to fit both kinds.
 * Each row also holds an even number of teams (two per match): 7 teams, 3 games, 2 courts x 5
 * times passes the counts but not the parity, and checking all 32,970 such nights found none
 * wait-free (eval/three-game-nights.txt).
 */
export function waitFreePossible(teams, g, courts, times, short = 0) {
  const kinds = [[g, teams], [g - 1, short]].filter(([w, k]) => k > 0 && w > 0);
  if (!kinds.length) return true;
  if (kinds.some(([w]) => w > times)) return false;
  if (times - Math.min(...kinds.map(([w]) => w)) + 1 > 7) return true;
  const cap = 2 * courts;
  const load = Array(times).fill(0);
  // place kind q's windows start by start; within a start as many as the rows allow, most first
  const go = (q, s, left) => {
    // a row holds two teams per match, so every row's count of teams must be even
    if (q === kinds.length) return load.every((x) => x % 2 === 0);
    const [w, total] = kinds[q];
    if (left === 0) return go(q + 1, 0, q + 1 < kinds.length ? kinds[q + 1][1] : 0);
    if (s + w > times) return false;
    let room = cap;
    for (let r = s; r < s + w; r++) room = Math.min(room, cap - load[r]);
    for (let a = Math.min(room, left); a >= 0; a--) {
      for (let r = s; r < s + w; r++) load[r] += a;
      const ok = go(q, s + 1, left - a);
      for (let r = s; r < s + w; r++) load[r] -= a;
      if (ok) return true;
    }
    void total;
    return false;
  };
  return go(0, 0, kinds[0][1]);
}

/**
 * Whole seasons proved to have no wait-free layout although waitFreePossible (a count over one
 * night) allows it: [teams, games, courts, times]. Each is a proof about the whole round robin, not
 * one night: 7 teams on 2 courts x 6 times (eval/odd-night-sat.py, UNSAT: every 7-team season with
 * 3 games a night has a wait), 8 teams on 2 x 6 (no two edge-disjoint splits into two K4s,
 * eval/three-game-nights.txt part 3), 9 teams on 2 x 6 (every slot booked forces one night shape,
 * and no three nights of it cover the 36 pairs: eval/nine-on-two.py by exhaustion, and
 * odd-night-sat.py --shape UNSAT), 12 teams on 2 x 9 (three K4s a night, three nights,
 * eval/session-design-sat.txt), 5 teams on 1 court x 6 (odd-night-sat.py, UNSAT), and at 9 times
 * (2026-11-15, latest) 5 and 7 teams on 1 court and 7 on 2 (odd-night-sat.py without the shape
 * constraints, UNSAT in 0.0, 0.0 and 12 s; eval/odd-night-sat.txt).
 */
export const PROVED_NO_WAIT_FREE = [[5, 3, 1, 6], [7, 3, 2, 6], [8, 3, 2, 6], [9, 3, 2, 6], [12, 3, 2, 9], [5, 3, 1, 9], [7, 3, 1, 9], [7, 3, 2, 9]];

/** True when a season of `n` teams, g games a night, on courts x times is proved to keep a wait. */
export function waitFreeProvedImpossible(n, g, courts, times) {
  return PROVED_NO_WAIT_FREE.some(([a, b, c, d]) => a === n && b === g && c === courts && d === times);
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
  if (!waitFreePossible(full, g, courts, times, n % 2 ? Math.min(g, n) : 0)) {
    const c = planWaitCost(oppOfRounds(rounds, n % 2 ? n + 1 : n, n), n, g, courts, times);
    return { rounds, before: c, after: c, evals: 0, possible: false };
  }
  // two or more sessions a night (times >= 2g): also search for nights that split into closed
  // blocks (sessionNights). Its moves, like searchNights', are trades along two-round cycles, and
  // those never leave the swap class of the starting round robin: from the circle method 12 teams
  // on 3 games, 3 courts x 6 times stop at exactly 14 crossing matches on every seed, while a
  // carry-over timetable as the start reaches zero. So each start gets both searches.
  const sessions = Boolean(sessionBlocks(n, g, courts, times));
  const tryStart = (rs, sd, label, best) => {
    const a = searchNights(rs, n, g, courts, times, { seed: sd, evals });
    let b = best && best.after <= a.after ? best : { ...a, before: best ? best.before : a.before, start: label };
    if (b.after > 0 && sessions) {
      const r = sessionNights(rs, n, g, courts, times, { seed: sd, evals: sessionEvals });
      if (r.after < b.after) b = { ...r, before: best ? best.before : r.before, start: label, sessions: true };
    }
    return b;
  };
  // a designed round robin first (designedNights): when it packs, no search is needed. Odd
  // leagues have stored designs of their own (oddDesigns, 2026-11-15): no session blocks there.
  if (sessions || (n % 2 && g === 3 && ODD_DESIGNS.some((d) => d.n === n))) {
    const d = designedNights(n, g, courts, times, seed);
    if (d) {
      const before = planWaitCost(oppOfRounds(rounds, n % 2 ? n + 1 : n, n), n, g, courts, times);
      if (before > 0) return { rounds: d.rounds, before, after: 0, evals: 0, start: "design", sessions: true, designed: true };
    }
  }
  let best = tryStart(rounds, seed, 0, null);
  for (let i = 0; i < starts.length && best.after > 0; i++) {
    const s = typeof starts[i] === "function" ? starts[i]() : starts[i];
    best = tryStart(s, seed + i + 1, i + 1, best);
  }
  return best;
}

/**
 * Block sizes for a night of several sessions: with `times` >= 2g a night holds floor(times / g)
 * sessions of g rows, and a block of b teams that only play each other fills one session's rows
 * with b / 2 matches a row. Returns the fewest even block sizes (each at least g + 1, at most
 * 2 x courts, as equal as possible) that cover the n teams, or null when one block is enough (a
 * single session: the plain search's job), the league is odd (its byes break a block's order), or
 * the teams do not fit.
 */
export function sessionBlocks(n, g, courts, times) {
  const S = Math.floor(times / g);
  if (n % 2 || S < 2 || g < 2) return null;
  const k = Math.ceil(n / (2 * courts));
  if (k < 2 || k > S) return null;
  const pairs = n / 2;
  const sizes = Array.from({ length: k }, (_, i) => 2 * (Math.floor(pairs / k) + (i < pairs % k ? 1 : 0)));
  if (sizes.some((b) => b < g + 1 || b > 2 * courts)) return null;
  return sizes;
}

/**
 * A round robin whose nights each split into closed blocks (sessionBlocks): every match of a night
 * joins two teams of one block, so each block plays its g rounds as perfect matchings of its own
 * teams and fills one session back to back. This is the shape the component layout cannot reach
 * by itself when a night needs two sessions: 12 teams, 3 games on 3 courts x 6 times books all 18
 * slots, so every night must be two groups of six that only meet each other.
 *
 * Simulated annealing over the round robin and a block per team per night: the cost is the
 * night's matches that cross blocks. Moves: swap two teams' blocks on one night, swap two whole
 * rounds between nights, and partial round swaps (the cycle trade of searchNights). Returns the
 * same shape as searchNights; with no zero-cost plan found, the given rounds come back.
 */
export function sessionNights(rounds, n, g, courts, times, { seed = 1, evals = 400000 } = {}) {
  const sizes = sessionBlocks(n, g, courts, times);
  const opp0 = oppOfRounds(rounds, n, n);
  const before0 = planWaitCost(opp0, n, g, courts, times);
  const none = { rounds, before: before0, after: before0, evals: 0 };
  if (!sizes) return none;
  const R = rounds.length;
  const groups = nightGroups(R, g);
  const nightOf = Array(R);
  groups.forEach((rs, i) => rs.forEach((r) => { nightOf[r] = i; }));
  const rand = rand32((seed >>> 0) * 2246822519 + 3266489917);
  const opp = opp0.map((o) => o.slice());
  // a block id per team per night, sizes as given, shuffled
  const block = groups.map(() => {
    const ids = sizes.flatMap((b, j) => Array(b).fill(j));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    return ids;
  });
  const crossOf = (ni) => {
    let c = 0;
    const b = block[ni];
    for (const r of groups[ni]) for (let t = 0; t < n; t++) if (t < opp[r][t] && b[t] !== b[opp[r][t]]) c++;
    return c;
  };
  const cost = groups.map((_, i) => crossOf(i));
  let cur = cost.reduce((a, b) => a + b, 0);
  let used = 0;
  let temp = 1.0;
  const cool = Math.pow(0.02 / temp, 1 / Math.max(1, evals));
  const accept = (d) => d <= 0 || rand() < Math.exp(-d / temp);
  while (used < evals && cur > 0) {
    used++;
    temp *= cool;
    const m = rand();
    if (m < 0.6) {
      // two teams of one night trade blocks
      const ni = Math.floor(rand() * groups.length);
      const b = block[ni];
      const x = Math.floor(rand() * n);
      let y = Math.floor(rand() * n);
      if (b[x] === b[y]) continue;
      let d = 0;
      for (const r of groups[ni]) {
        const ox = opp[r][x], oy = opp[r][y];
        if (ox === y) continue; // x and y meet: still crossing after the trade
        d += (b[ox] === b[y] ? 0 : 1) - (b[ox] === b[x] ? 0 : 1);
        d += (b[oy] === b[x] ? 0 : 1) - (b[oy] === b[y] ? 0 : 1);
      }
      if (accept(d)) { const t = b[x]; b[x] = b[y]; b[y] = t; cost[ni] += d; cur += d; }
      continue;
    }
    const r = Math.floor(rand() * R);
    let s2 = Math.floor(rand() * (R - 1));
    if (s2 >= r) s2++;
    const nr = nightOf[r], ns = nightOf[s2];
    if (nr === ns) continue;
    let undo;
    if (m < 0.7) {
      const t = opp[r]; opp[r] = opp[s2]; opp[s2] = t;
      undo = () => { const u = opp[r]; opp[r] = opp[s2]; opp[s2] = u; };
    } else {
      const t0 = Math.floor(rand() * n);
      const cyc = [];
      let x = t0;
      do { cyc.push(x); const y = opp[r][x]; cyc.push(y); x = opp[s2][y]; } while (x !== t0);
      if (cyc.length === n) continue;
      const swap = () => { for (const v of cyc) { const a = opp[r][v]; opp[r][v] = opp[s2][v]; opp[s2][v] = a; } };
      swap();
      undo = swap;
    }
    const cr = crossOf(nr), cs = crossOf(ns);
    const d = cr + cs - cost[nr] - cost[ns];
    if (accept(d)) { cost[nr] = cr; cost[ns] = cs; cur += d; } else undo();
  }
  if (cur > 0) return { ...none, evals: used, crossing: cur };
  const after = planWaitCost(opp, n, g, courts, times);
  if (after >= before0) return { ...none, evals: used };
  const venues = assignVenues(opp, n, seed);
  const out = opp.map((o, r) => {
    const matches = [];
    for (let t = 0; t < n; t++) { const u = o[t]; if (t < u) matches.push(venues[r][t] ? [t, u] : [u, t]); }
    return { leg: 0, matches, bye: null };
  });
  return { rounds: out, before: before0, after, evals: used };
}

/**
 * A round robin built from a design rather than searched, for three games a night in two or more
 * sessions (sessionBlocks): an ordered list of n - 1 rounds (each a list of [a, b] pairs over
 * 0..n-1) whose consecutive triples (rounds 0-2, 3-5, ...) each split into small closed groups, and
 * whose last (n - 1) mod 3 rounds make a short last night. null when no design is known for n.
 *
 * - n a power of two (8 to 64): round r pairs t with t XOR r. A night of rounds {a, b, c} joins
 *   the cosets of the subspace they span, so a night whose third round is a XOR b is four K4s
 *   (every team plays the other three of its group of four) and any other night is groups of
 *   eight (cubes). The nights are chosen to hold as many K4 triples as possible (a partial spread,
 *   found by a capped exact search): 16 teams get five, every night in groups of four.
 * - n a multiple of 12: two halves A and B of m = n / 2 teams. Rounds 1 to m - 1 play the circle
 *   method inside each half at once (the first floor((m - 1) / 3) triples: two groups of m); the m
 *   cross rounds pair a in A with b = a + k (mod m) in B, and the shifts {k, k + m/3, k + 2m/3}
 *   make a night of m/3 groups of six (a K3,3 each: three teams of A against three of B). The two
 *   rounds left over from the halves are the short last night.
 * - any other even n of 10 to 48 (2026-11-15): a stored design (session-designs.mjs) found by a
 *   SAT solver (eval/session-design-sat.py): every night two closed blocks of at most 2 x
 *   ceil(n / 4) teams, the least courts on 6 time slots. Three-session designs are stored too;
 *   designedNights tries every candidate (designCandidates) and keeps the first that packs.
 *
 * `seed` relabels the teams (same structure, a different season per seed).
 */
export function designedRounds(n, g, seed = 1) {
  const c = designCandidates(n, g);
  return c.length ? relabel(c[0], n, seed) : null;
}

/**
 * Every known design for n teams and g games, in the order designedNights tries them: the
 * algebraic ones (XOR, halves) first, then the stored SAT designs (session-designs.mjs, 2026-11-15:
 * every even league of 10 to 48 teams in two sessions, and three-session ones), each with the
 * session count and largest block it was built for.
 */
export function designCandidates(n, g) {
  if (g !== 3 || !Number.isInteger(n) || n < 8) return [];
  const out = [];
  if ((n & (n - 1)) === 0 && n <= 64) out.push(xorDesign(n));
  else if (n % 12 === 0) out.push(halvesDesign(n));
  for (const d of SESSION_DESIGNS) if (d.n === n) out.push(decodeDesign(d));
  return out;
}

/** A stored design (session-designs.mjs) as n - 1 rounds of [a, b] pairs. */
export function decodeDesign({ n, code }) {
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let t = 0; t < n; t++) { const u = ALPHA.indexOf(code[r * n + t]); if (t < u) pairs.push([t, u]); }
    rounds.push(pairs);
  }
  return rounds;
}

/**
 * Stored round robins for odd leagues of n teams, 3 games a night (odd-designs.mjs, found by
 * eval/odd-night-sat.py): each as n rounds of [a, b] pairs over n + 1 teams, team n the bye, with
 * the courts and times its nights were laid out back to back on. An odd league has no closed
 * session blocks (three teams sit out one game each night), so these were solved with the layout
 * itself, match by match. [] when none is stored.
 */
export function oddDesigns(n, g = 3) {
  if (g !== 3 || !Number.isInteger(n) || n % 2 === 0) return [];
  return ODD_DESIGNS.filter((d) => d.n === n).map((d) => {
    const N = n + 1;
    const rounds = [];
    for (let r = 0; r < n; r++) {
      const pairs = [];
      for (let t = 0; t < N; t++) { const u = ALPHA.indexOf(d.code[r * N + t]); if (t < u) pairs.push([t, u]); }
      rounds.push(pairs);
    }
    // the solver's rows per night (`layout`), as Map("a,b" -> row) for the night's matches
    const layouts = [];
    let at = 0;
    for (let s = 0; s < n; s += 3) {
      const pairs = rounds.slice(s, s + 3).flat().filter(([a, b]) => a < n && b < n).map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
      pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const m = new Map();
      for (const [a, b] of pairs) m.set(`${a},${b}`, d.layout ? ALPHA.indexOf(d.layout[at++]) : -1);
      layouts.push(m);
    }
    return { rounds, courts: d.courts, times: d.times, layouts };
  });
}

/**
 * Layouts known to pack, by night: key edgeKey(edges) -> Map("a,b" -> row). designedNights
 * registers an odd design's stored rows here (relabelled), and nightLayout uses one only when its
 * own search finds nothing, after checking it (rows in range, at most `courts` a row, every team
 * back to back). Why: a fully booked night of 25 teams on 6 courts x 6 times has a layout the
 * match-by-match search needs up to 100,000 nodes to find (EXACT_NODES is 3,000). Bounded.
 */
const KNOWN_LAYOUTS = new Map();
const KNOWN_LAYOUTS_MAX = 2048;

function edgeKey(edges) {
  return edges.map(([a, b]) => (a < b ? `${a},${b}` : `${b},${a}`)).sort().join(";");
}

function rememberLayout(pairRows) {
  const key = [...pairRows.keys()].sort().join(";");
  if (KNOWN_LAYOUTS.has(key)) KNOWN_LAYOUTS.delete(key);
  KNOWN_LAYOUTS.set(key, pairRows);
  while (KNOWN_LAYOUTS.size > KNOWN_LAYOUTS_MAX) KNOWN_LAYOUTS.delete(KNOWN_LAYOUTS.keys().next().value);
}

/** A remembered layout of this night (rememberLayout) that fits courts x times, as row[], or null. */
function knownLayout(edges, courts, times) {
  const m = KNOWN_LAYOUTS.get(edgeKey(edges));
  if (!m) return null;
  const row = edges.map(([a, b]) => m.get(a < b ? `${a},${b}` : `${b},${a}`));
  const load = Array(times).fill(0);
  for (const r of row) { if (!(r >= 0 && r < times) || ++load[r] > courts) return null; }
  return rowsWaitFree(edges, row) ? row : null;
}

function relabel(rounds, n, seed, fixed = n) {
  // teams at or above `fixed` keep their label (an odd design's bye team)
  const rand = rand32((seed >>> 0) * 2654435761 + 40503);
  const lab = Array.from({ length: Math.max(n, fixed) }, (_, i) => i);
  n = Math.min(n, fixed);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = lab[i]; lab[i] = lab[j]; lab[j] = t; }
  return rounds.map((r) => r.map(([a, b]) => [lab[a], lab[b]]));
}

function xorDesign(n) {
  // most disjoint triples {a, b, a ^ b} of the nonzero rounds (a partial spread), exact with a cap
  const R = n - 1;
  const lines = [];
  for (let a = 1; a < n; a++) for (let b = a + 1; b < n; b++) { const c = a ^ b; if (c > b) lines.push([a, b, c]); }
  const used = new Uint8Array(n);
  let best = [], cur = [], nodes = 0;
  const cap = Math.floor(R / 3);
  const go = (from) => {
    if (++nodes > 200000 || best.length === cap) return;
    if (cur.length > best.length) best = cur.slice();
    for (let i = from; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (used[a] || used[b] || used[c]) continue;
      if (cur.length + 1 + Math.floor((R - 3 * (cur.length + 1)) / 3) <= best.length) return;
      used[a] = used[b] = used[c] = 1; cur.push(lines[i]);
      go(i + 1);
      cur.pop(); used[a] = used[b] = used[c] = 0;
      if (best.length === cap) return;
    }
  };
  go(0);
  const order = best.flat();
  const inBest = new Set(order);
  for (let r = 1; r < n; r++) if (!inBest.has(r)) order.push(r);
  return order.map((r) => { const out = []; for (let t = 0; t < n; t++) if (t < (t ^ r)) out.push([t, t ^ r]); return out; });
}

function halvesDesign(n) {
  const m = n / 2;
  // circle method on m teams (m even), as pairs
  const circle = [];
  for (let r = 0; r < m - 1; r++) {
    const pairs = [[r, m - 1]];
    for (let k = 1; k < m / 2; k++) pairs.push([(r + k) % (m - 1), (r - k + m - 1) % (m - 1)]);
    circle.push(pairs);
  }
  const within = circle.map((r) => [...r, ...r.map(([a, b]) => [a + m, b + m])]);
  const cross = (k) => Array.from({ length: m }, (_, a) => [a, m + ((a + k) % m)]);
  const full = Math.floor(within.length / 3) * 3;
  const crossRounds = [];
  for (let k = 0; k < m / 3; k++) crossRounds.push(cross(k), cross(k + m / 3), cross(k + (2 * m) / 3));
  return [...within.slice(0, full), ...crossRounds, ...within.slice(full)];
}

/**
 * The designed round robin (designedRounds) as a plan, when its nights all pack wait-free on
 * `courts` x `times`: { rounds, after: 0 } with venues set by assignVenues, or null.
 */
export function designedNights(n, g, courts, times, seed = 1) {
  let opp = null;
  const N = n % 2 ? n + 1 : n;
  const odd = n % 2 ? oddDesigns(n, g).filter((d) => d.courts <= courts && d.times <= times) : [];
  const cands = n % 2 ? odd.map((d) => d.rounds) : designCandidates(n, g);
  // the layout search (nightRowsExact, EXACT_NODES) depends on the team labels: a fully booked odd
  // night of 21 teams packs under some relabellings and runs out of nodes under others, so an odd
  // design gets a few more relabellings of the same seed (seed, then seed + 1000k), the first that
  // packs kept. Even designs keep the one relabelling they always had.
  const tries = n % 2 ? ODD_RELABELS : 1;
  for (const [ci, c] of cands.entries()) {
    for (let k = 0; k < tries && !opp; k++) {
      const sd = k ? seed + 1000 * k : seed;
      const d = relabel(c, N, sd, n);
      if (n % 2 && odd[ci].layouts) {
        // the same relabelling applied to the design's stored rows (relabel maps pairs in order)
        const lab = relabel([[...Array(N).keys()].map((t) => [t, t])], N, sd, n)[0].map(([x]) => x);
        for (const m of odd[ci].layouts) {
          const out = new Map();
          for (const [key, r] of m) {
            if (r < 0) continue;
            const [a, b] = key.split(",").map(Number);
            const x = lab[a], y = lab[b];
            out.set(x < y ? `${x},${y}` : `${y},${x}`, r);
          }
          if (out.size === m.size) rememberLayout(out);
        }
      }
      const o = d.map((r) => { const x = new Int16Array(N); for (const [a, b] of r) { x[a] = b; x[b] = a; } return x; });
      if (planWaitCost(o, n, g, courts, times) === 0) opp = o;
    }
    if (opp) break;
  }
  if (!opp) return null;
  const venues = assignVenues(opp, n, seed);
  const rounds = opp.map((o, r) => {
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
  return { rounds, after: 0 };
}

/** Relabellings designedNights tries per seed for an odd design before giving up on it. */
export const ODD_RELABELS = 8;

/** Moves sessionNights may try inside waitFreeNights. */
export const sessionEvals = 1000000;

function searchNights(rounds, n, g, courts, times, { seed = 1, evals = null } = {}) {
  const N = n % 2 ? n + 1 : n;
  const R = rounds.length;
  const opp = oppOfRounds(rounds, N, n);
  const groups = nightGroups(R, g);
  const nightOf = Array(R);
  groups.forEach((rs, i) => rs.forEach((r) => { nightOf[r] = i; }));
  const nightCost = groups.map((rs) => nightLayout(nightEdges(opp, rs, n), g, courts, times, null, { exact: 0 }).score);
  const before0 = planWaitCost(opp, n, g, courts, times);
  const before = nightCost.reduce((a, b) => a + b, 0);
  if (before === 0 || groups.length < 2) return { rounds, before: before0, after: before0, evals: 0 };
  const budget = Number.isInteger(evals) && evals >= 0 ? evals : Math.min(20000, Math.max(3000, Math.floor(1e7 / (N * N * g))));
  const rand = rand32((seed >>> 0) * 2654435761 + 977);
  let cur = before, best = before, bestOpp = opp.map((o) => o.slice());
  let used = 0;
  const recost = (i) => nightLayout(nightEdges(opp, groups[i], n), g, courts, times, null, { exact: 0 }).score;
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
