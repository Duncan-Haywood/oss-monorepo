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
