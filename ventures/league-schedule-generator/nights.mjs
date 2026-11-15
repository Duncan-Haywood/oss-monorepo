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
