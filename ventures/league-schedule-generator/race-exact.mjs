// League schedule generator, race-exact.mjs: clinched and eliminated, proved past the full enumeration.
//
// `playoffRace` works through every outcome of the remaining fixtures when there are at most 12 of them
// (3^12). Past that it used safe bounds that treat every rival as able to win all its games at once,
// even rivals who still play each other, so a team two points clear with three weeks left read "alive"
// long after it could not be caught. This module answers the same questions exactly, by branch and bound,
// inside a node budget; when the budget runs out it says so and the caller keeps the safe bounds, so a
// "clinched" or "eliminated" is still never wrong.
//
// For team i the questions are:
//   worst rank  = 1 + the most other teams that can finish level with or above i  (i loses every game left)
//   worst won   = 1 + the most other teams that can finish strictly above i        (same, ties won)
//   best rank   = 1 + the fewest other teams that must finish strictly above i     (i wins every game left)
// Losing every game is i's worst case and winning every game its best because the outcome that gives i
// least also gives its opponent most (`monotone` checks the point system has such outcomes).
//
// Inside the search three facts cut the tree. A team already over the line, or one that cannot reach it
// even by winning out, no longer matters: its games are settled the way that helps the question (its
// opponent takes the most, or the least, points). Only games between two teams still in doubt branch.
// And for "fewest above", a game between two teams that both sit just under the line, where every result
// pushes one of them over, forces one more team above: a greedy matching on those games is a lower bound.

export const RACE_NODE_BUDGET = 20000;
// magic numbers ask one question per total; past this many nodes per team the safe number stands
export const RACE_MAGIC_BUDGET = 1000;

/** Whether the outcome list has a result giving one side its least and the other its most, both ways. */
export function monotone(outcomes) {
  const xs = outcomes.map((o) => o[0]);
  const ys = outcomes.map((o) => o[1]);
  const lo = Math.min(...xs, ...ys), hi = Math.max(...xs, ...ys);
  return outcomes.some(([x, y]) => x === lo && y === hi) && outcomes.some(([x, y]) => x === hi && y === lo);
}

/**
 * Most (`maximise`) or fewest teams among `pts` (indices other than `skip`) that can end with at least `T`
 * points, given `games` ([a, b] still to play, none involving `skip`) and the point `outcomes`.
 * Returns { value, proved, nodes }. When `proved` is false the search ran out of budget and `value` is
 * only the best outcome found, not a bound; use the caller's safe bound instead.
 * `stopAt` asks a yes/no question instead: can the count reach stopAt (maximise: >= stopAt; minimise:
 * <= stopAt)? Then it returns { value: null, proved, reached, nodes }.
 */
export function extremeCount(pts, games, T, { maximise, outcomes, skip = -1, budget = RACE_NODE_BUDGET, stopAt = null }) {
  const n = pts.length;
  const top = Math.max(...outcomes.flat());
  const bot = Math.min(...outcomes.flat());
  let nodes = 0;
  // a decision question starts just short of its answer, so the search prunes everything that cannot reach it
  let incumbent = stopAt == null ? (maximise ? -1 : Infinity) : (maximise ? stopAt - 1 : stopAt + 1);
  let out = false;

  const rec = (p, gs) => {
    if (out) return;
    if (++nodes > budget) { out = true; return; }
    p = p.slice();
    // settle every game a decided team plays, until nothing changes
    let live = gs;
    for (;;) {
      const rem = new Array(n).fill(0);
      for (const [a, b] of live) { rem[a]++; rem[b]++; }
      const state = new Array(n);
      for (let t = 0; t < n; t++) {
        if (t === skip) { state[t] = 0; continue; }
        state[t] = p[t] >= T ? 1 : p[t] + rem[t] * top < T ? -1 : 2; // 1 over, -1 cannot reach, 2 in doubt
      }
      const next = [];
      let changed = false;
      for (const g of live) {
        const [a, b] = g;
        const da = state[a] === 2, db = state[b] === 2;
        if (da && db) { next.push(g); continue; }
        changed = true;
        if (da) p[a] += maximise ? top : bot;
        else if (db) p[b] += maximise ? top : bot;
      }
      live = next;
      if (!changed) {
        let over = 0, doubt = 0;
        for (let t = 0; t < n; t++) { if (state[t] === 1) over++; else if (state[t] === 2) doubt++; }
        return branch(p, live, rem, state, over, doubt);
      }
    }
  };

  const branch = (p, live, rem, state, over, doubt) => {
    if (maximise) {
      if (over + doubt <= incumbent) return;
      if (live.length === 0) { incumbent = Math.max(incumbent, over); return; }
    } else {
      // forced games: every result takes one of the two over the line
      const used = new Uint8Array(n);
      let forced = 0;
      for (const [a, b] of live) {
        if (used[a] || used[b]) continue;
        const ca = T - 1 - p[a], cb = T - 1 - p[b];
        if (outcomes.every(([x, y]) => x > ca || y > cb)) { used[a] = used[b] = 1; forced++; }
      }
      if (over + forced >= incumbent) return;
      if (live.length === 0) { incumbent = Math.min(incumbent, over); return; }
    }
    // branch on a game of the team with least room: points still needed (maximise) or still allowed (minimise)
    let pick = 0, bestKey = Infinity;
    for (let g = 0; g < live.length; g++) {
      const [a, b] = live[g];
      const room = (t) => (maximise ? p[t] + rem[t] * top - T : T - 1 - p[t]);
      const k = Math.min(room(a), room(b));
      if (k < bestKey) { bestKey = k; pick = g; }
    }
    const [a, b] = live[pick];
    const rest = live.slice(0, pick).concat(live.slice(pick + 1));
    const order = outcomes.slice().sort((o1, o2) => (maximise ? o2[0] + o2[1] - (o1[0] + o1[1]) : o1[0] + o1[1] - (o2[0] + o2[1])));
    for (const [x, y] of order) {
      const q = p.slice(); q[a] += x; q[b] += y;
      rec(q, rest);
      if (out) return;
      if (stopAt != null && (maximise ? incumbent >= stopAt : incumbent <= stopAt)) return;
    }
  };

  rec(pts, games);
  const stopped = stopAt != null && (maximise ? incumbent >= stopAt : incumbent <= stopAt);
  // decision: `reached` says the count can be pushed to stopAt (true) or proved it cannot (false)
  if (stopAt != null) return { value: null, proved: !out || stopped, reached: stopped, nodes };
  return { value: incumbent, proved: !out, nodes };
}

/**
 * Exact best rank, worst rank and worst rank with ties won for team `i`, or null for each one the budget
 * could not settle. `pts` are points so far, `remaining` the fixtures left ([a, b]).
 */
export function exactRanks(pts, remaining, i, outcomes, { budget = RACE_NODE_BUDGET, spots = null } = {}) {
  const top = Math.max(...outcomes.flat());
  const bot = Math.min(...outcomes.flat());
  const others = remaining.filter(([a, b]) => a !== i && b !== i);
  // i loses out: its opponents take the most
  const low = pts.slice();
  for (const [a, b] of remaining) {
    if (a === i) { low[a] += bot; low[b] += top; } else if (b === i) { low[b] += bot; low[a] += top; }
  }
  // i wins out: its opponents take the least
  const high = pts.slice();
  for (const [a, b] of remaining) {
    if (a === i) { high[a] += top; high[b] += bot; } else if (b === i) { high[b] += top; high[a] += bot; }
  }
  const opts = { outcomes, skip: i, budget };
  const ask = (p, T, maximise) => {
    const r = extremeCount(p, others, T, { ...opts, maximise });
    if (r.proved || spots == null) return { value: r.proved ? r.value : null, proved: r.proved, nodes: r.nodes };
    // the full answer is out of budget; the one question the status needs may not be
    const stopAt = maximise ? spots : spots - 1;
    const d = extremeCount(p, others, T, { ...opts, maximise, stopAt });
    return { value: null, proved: false, decided: d.proved ? (d.reached ? "reached" : "not") : null, stopAt, nodes: r.nodes + d.nodes };
  };
  const worst = ask(low, low[i], true);
  const worstWon = ask(low, low[i] + 1, true);
  const best = ask(high, high[i] + 1, false);
  return { worst, worstWon, best };
}

// Magic numbers (2026-11-23). "e more points clinch it" must hold however the e points come: from wins
// against the teams that also chase the place (which takes points off them) or from draws, and with every
// other game going the worst way. For a given e the question is whether some completion gives team i
// exactly e points from its own games and still leaves k or more rivals level with or above it (a tie at
// the cut counts against i, as "clinched" does). i's own games branch too, with the running total checked
// against what its unplayed games can still add up to. The magic number is the smallest e such that no
// total from e up to winning out can be stopped.

/** Every total `games` games can give one side: sums[r] is the Set of totals from r games. */
export function ownTotals(outcomes, games) {
  const vals = [...new Set(outcomes.flat())];
  const sums = [new Set([0])];
  for (let r = 1; r <= games; r++) {
    const s = new Set();
    for (const t of sums[r - 1]) for (const v of vals) s.add(t + v);
    sums.push(s);
  }
  return sums;
}

/**
 * Can the others stop team `i` clinching one of `k` places when it takes exactly `e` points from its
 * games left? Returns { stops: true | false | null, nodes } (null: out of budget, so assume it can).
 */
export function canStopAt(pts, remaining, i, e, k, outcomes, { budget = RACE_NODE_BUDGET, sums = null } = {}) {
  const n = pts.length;
  const top = Math.max(...outcomes.flat());
  const T = pts[i] + e;
  const pair = Math.max(...outcomes.map(([x, y]) => x + y));
  const mine = remaining.filter(([a, b]) => a === i || b === i).length;
  sums = sums ?? ownTotals(outcomes, mine);
  let nodes = 0, out = false, found = false;

  const rec = (p, gs, s, free) => {
    if (found || out) return;
    if (++nodes > budget) { out = true; return; }
    p = p.slice();
    let live = gs;
    for (;;) {
      const rem = new Array(n).fill(0);
      for (const [a, b] of live) { rem[a]++; rem[b]++; }
      const state = new Array(n);
      for (let t = 0; t < n; t++) state[t] = t === i ? 0 : p[t] >= T ? 1 : p[t] + rem[t] * top < T ? -1 : 2;
      const next = [];
      let changed = false;
      for (const g of live) {
        const [a, b] = g;
        if (a === i || b === i) {
          const o = a === i ? b : a;
          if (state[o] === 2) next.push(g);
          else { free++; changed = true; } // only i's total depends on it now
          continue;
        }
        const da = state[a] === 2, db = state[b] === 2;
        if (da && db) { next.push(g); continue; }
        changed = true;
        if (da) p[a] += top; else if (db) p[b] += top;
      }
      live = next;
      if (changed) continue;
      let over = 0, doubt = 0, ownLive = 0;
      for (let t = 0; t < n; t++) { if (state[t] === 1) over++; else if (state[t] === 2) doubt++; }
      for (const [a, b] of live) if (a === i || b === i) ownLive++;
      if (!sums[free + ownLive].has(e - s)) return; // i cannot end on exactly e from here
      if (over + doubt < k) return;
      if (over >= k) { found = true; return; } // the rest can go any way that leaves i on exactly e
      if (live.length === 0) return;
      // supply bound: the games left hand the chasers at most `pair` points each between two of them and
      // `top` from a game against i, so at most as many reach T as the smallest needs that supply covers
      let supply = 0;
      for (const [a, b] of live) supply += a === i || b === i ? top : pair;
      const needs = [];
      for (let t = 0; t < n; t++) if (state[t] === 2) needs.push(T - p[t]);
      needs.sort((x, y) => x - y);
      let reach = 0;
      for (const d of needs) { if (d > supply) break; supply -= d; reach++; }
      if (over + reach < k) return;
      let pick = 0, bestKey = Infinity;
      for (let g = 0; g < live.length; g++) {
        const [a, b] = live[g];
        const room = (t) => (t === i ? Infinity : p[t] + rem[t] * top - T);
        const key = Math.min(room(a), room(b));
        if (key < bestKey) { bestKey = key; pick = g; }
      }
      const [a, b] = live[pick];
      const rest = live.slice(0, pick).concat(live.slice(pick + 1));
      const own = a === i || b === i;
      // try first the results that give the chaser most
      const order = outcomes.slice().sort((o1, o2) => (own ? (a === i ? o2[1] - o1[1] : o2[0] - o1[0]) : o2[0] + o2[1] - (o1[0] + o1[1])));
      for (const [x, y] of order) {
        const q = p.slice(); q[a] += x; q[b] += y;
        rec(q, rest, s + (a === i ? x : b === i ? y : 0), free);
        if (found || out) return;
      }
      return;
    }
  };
  rec(pts.slice(), remaining, 0, 0);
  return { stops: found ? true : out ? null : false, nodes };
}

/**
 * The smallest number of extra points that clinches one of `k` places for team `i` however they come,
 * or null when even winning out can be stopped (or the budget ran out before any total was proved).
 * Totals i cannot reach are skipped, so the answer is always one i can score. `proved` is false when the
 * budget ran out partway, in which case the value is still safe, only perhaps higher than it need be.
 * `budget` is shared by all the totals asked; `known` skips the totals a safe bound already settled.
 */
export function exactMagic(pts, remaining, i, k, outcomes, { budget = RACE_MAGIC_BUDGET, known = null } = {}) {
  const mine = remaining.filter(([a, b]) => a === i || b === i).length;
  const sums = ownTotals(outcomes, mine);
  // `known`: a total already proved to clinch, with every total above it (the safe bound's number)
  let totals = [...sums[mine]].filter((e) => e >= 1).sort((x, y) => y - x);
  let magic = null, nodes = 0, proved = true;
  if (known != null) { magic = known; totals = totals.filter((e) => e < known); }
  // one budget shared by every total asked, so a wide race costs no more than one question
  for (const e of totals) {
    if (nodes >= budget) { proved = false; break; }
    const r = canStopAt(pts, remaining, i, e, k, outcomes, { budget: budget - nodes, sums });
    nodes += r.nodes;
    if (r.stops === false) { magic = e; continue; }
    if (r.stops === null) proved = false;
    break;
  }
  return { magic, proved, nodes };
}
