// Swiss-system pairing for chess, go, Magic, board-game and racket clubs. Pure functions, one
// sibling module (blossom.mjs). calc.mjs re-exports everything here, so the page and older callers
// keep importing from calc.mjs.
//
// swissPairings pairs a whole round at once as a maximum-weight perfect matching (blossom.mjs):
// every pair of players who have not met is an edge, and the edge's weight is a large constant less
// a penalty, so the heaviest perfect matching is the round with the smallest total penalty. The
// penalty is built in tiers, each one larger than everything below it can add up to:
//
//   1. a pairing where both players have an absolute claim on the same colour (FIDE C.04.1: colour
//      difference past 1, or the same colour twice running) is left out altogether, and only let
//      back in, at the top tier, when no round exists without one;
//   2. score difference, squared in half points, so one big float costs more than two small ones;
//   3. both players with a strong claim (colour difference of 1) on the same colour;
//   4. both players with a mild claim (they alternated last round) on the same colour;
//   5. repeat floats (FIDE C.14-C.17): a player who floated down last round floating down again
//      (a bye counts as a downfloat), one who floated up floating up again, then two rounds back;
//   6. Dutch order: inside a score group the top half meets the bottom half (1 v 5, 2 v 6 ...), the
//      player who floats down is the lowest of their group and meets the highest of the next group.
//
// Rematches are never edges. An odd field adds a bye vertex, joined to players who have not had a
// bye, priced so the bye goes to the lowest scorer, lowest seed first. The old pairer, kept as
// swissPairingsGreedy for the side-by-side in eval/swiss-matching.txt, pairs one player at a time
// with backtracking under a node budget; it floats more players than needed and hands out
// absolute colour clashes (eval/swiss-matching.txt).
//
// One round of lookahead: if the best round would leave no rematch-free round after it, each of
// its boards is forbidden in turn and the best round that keeps a next round possible is taken
// instead (small fields played deep, where a 6-player event can trap itself after round 3).

import { maxWeightMatching } from "./blossom.mjs";

/**
 * Score table: win 1, draw 0.5, bye counts as a win. Buchholz = sum of opponents' scores, then
 * Sonneborn-Berger breaks ties. `extra` (per player) adds points from unplayed rounds: requested
 * byes and forfeit wins (parseSwissResults).
 */
export function swissStandings(players, games, byes = [], { win = 1, draw = 0.5, extra = null } = {}) {
  const rows = players.map((name, i) => ({ index: i, name, score: 0, played: 0, opponents: [], whites: 0, blacks: 0, last: [], beaten: [], drawn: [] }));
  for (const g of games) {
    const A = rows[g.a];
    const B = rows[g.b];
    A.played++; B.played++;
    A.opponents.push(g.b); B.opponents.push(g.a);
    A.whites++; B.blacks++;
    A.last.push("W"); B.last.push("B");
    if (g.ga > g.gb) { A.score += win; A.beaten.push(g.b); }
    else if (g.ga < g.gb) { B.score += win; B.beaten.push(g.a); }
    else { A.score += draw; B.score += draw; A.drawn.push(g.b); B.drawn.push(g.a); }
  }
  for (const i of byes) rows[i].score += win;
  if (extra) rows.forEach((r, i) => { r.score += extra[i] ?? 0; });
  for (const r of rows) {
    r.buchholz = r.opponents.reduce((s, o) => s + rows[o].score, 0);
    // Sonneborn-Berger: full opponent score for each win, half for each draw. Rewards beating the strong.
    r.sonnebornBerger = r.beaten.reduce((s, o) => s + rows[o].score, 0) + r.drawn.reduce((s, o) => s + rows[o].score, 0) * (draw / win);
  }
  const byeSet = new Map();
  for (const i of byes) byeSet.set(i, (byeSet.get(i) ?? 0) + 1);
  for (const r of rows) r.byes = byeSet.get(r.index) ?? 0;
  rows.sort((x, y) => y.score - x.score || y.buchholz - x.buchholz || y.sonnebornBerger - x.sonnebornBerger || x.index - y.index);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * A player's colour claim for the next game (FIDE C.04.1, simplified): `colour` is "W", "B" or
 * null, `strength` 3 absolute (colour difference past 1, or the same colour in the last two
 * games), 2 strong (difference of 1), 1 mild (level, alternate from the last game), 0 none.
 */
export function colourClaim(row) {
  const cd = row.whites - row.blacks;
  const run = row.last.slice(-2);
  if (cd > 1 || (run.length === 2 && run[0] === "W" && run[1] === "W")) return { colour: "B", strength: 3 };
  if (cd < -1 || (run.length === 2 && run[0] === "B" && run[1] === "B")) return { colour: "W", strength: 3 };
  if (cd === 1) return { colour: "B", strength: 2 };
  if (cd === -1) return { colour: "W", strength: 2 };
  if (row.last.length) return { colour: row.last[row.last.length - 1] === "W" ? "B" : "W", strength: 1 };
  return { colour: null, strength: 0 };
}

// Tier sizes. Score differences are capped at 30 half points (15 points), so tier 2 sums to at most
// 100 boards x 900 x 1e8 = 9e12 < 1e13; every edge weight stays below 2^53 with room for the duals.
const ABS = 1e13;
const SCORE = 1e8;
const STRONG = 5e5;
const MILD = 4e3;
const ORDER_CAP = 30;
// FIDE C.04.3 (2025) C.9: the pairing bye goes to the player with the fewest unplayed games, after
// score differences and before colours. Three unplayed games at most count (3 x 2.5e7 < SCORE),
// and one step outweighs a strong-colour clash on every board of a 98-player round.
const UNPLAYED = 2.5e7;
const UNPLAYED_CAP = 3;
// Repeat floats (FIDE C.04.3 C.14-C.17), below the colour tiers as in the Dutch rules: a player who
// floated down last round floating down again, one who floated up last round floating up again,
// then the same two rounds back. Each step is worth more than the Dutch-order tier can add on one
// board (at most 2 x ORDER_CAP), so on a board a repeat float always outweighs the order; across a
// whole round the tiers here and the mild-colour tier above are weighed, not strictly ranked.
const RD1 = 488;
const RU1 = 244;
const RD2 = 122;
const RU2 = 61;

/**
 * Who floated in each earlier round. Games are in the order they were played (as the colour rules
 * already assume); a player's k-th appearance (game or bye) is their round k. Byes carry no round of
 * their own, so `byes[k]` is taken as round k's bye (one per round in an odd field), unless
 * `byeRounds[k]` gives its round (0-based). Returns Map player -> array per round of "down", "up"
 * or null: down when the player's score before the round was above the opponent's, or they took
 * the pairing bye (FIDE counts a bye as a downfloat); up when below.
 */
export function floatHistory(players, games, byes = [], byeRounds = null, { gameRounds = null, extraRounds = [] } = {}) {
  const appear = new Map();
  const at = (i) => appear.get(i) ?? 0;
  const rounds = [];
  const slot = (r) => (rounds[r] ??= { games: [], byes: [] });
  const pendingBye = new Map();
  byes.forEach((p, k) => {
    const r = byeRounds?.[k] ?? k;
    if (!pendingBye.has(p)) pendingBye.set(p, []);
    pendingBye.get(p).push(r);
  });
  for (const list of pendingBye.values()) list.sort((a, b) => a - b);
  const placeBye = (p) => {
    const r = Math.max(pendingBye.get(p).shift(), at(p));
    slot(r).byes.push(p);
    appear.set(p, r + 1);
  };
  for (const [k, g] of games.entries()) {
    // A bye listed for this round or earlier comes before the game in that player's sequence.
    let r = gameRounds?.[k] ?? Math.max(at(g.a), at(g.b));
    for (let moved = true; moved;) {
      moved = false;
      for (const p of [g.a, g.b]) {
        const list = pendingBye.get(p);
        if (list?.length && list[0] <= r) { placeBye(p); moved = true; }
      }
      if (gameRounds?.[k] == null) r = Math.max(at(g.a), at(g.b));
    }
    slot(r).games.push(g);
    appear.set(g.a, r + 1); appear.set(g.b, r + 1);
  }
  for (const [p, list] of pendingBye) while (list.length) placeBye(p);
  // Points from unplayed rounds (requested byes, forfeit wins) count from the end of their round.
  for (const e of extraRounds) slot(e.round).extra = [...(slot(e.round).extra ?? []), e];
  const score = new Map(players.map((_, i) => [i, 0]));
  const hist = new Map(players.map((_, i) => [i, []]));
  for (let r = 0; r < rounds.length; r++) {
    const R = rounds[r] ?? { games: [], byes: [] };
    for (const h of hist.values()) h[r] = null;
    for (const g of R.games) {
      const sa = score.get(g.a);
      const sb = score.get(g.b);
      if (sa > sb) { hist.get(g.a)[r] = "down"; hist.get(g.b)[r] = "up"; }
      else if (sa < sb) { hist.get(g.a)[r] = "up"; hist.get(g.b)[r] = "down"; }
    }
    for (const p of R.byes) hist.get(p)[r] = "down";
    for (const g of R.games) {
      if (g.ga > g.gb) score.set(g.a, score.get(g.a) + 1);
      else if (g.ga < g.gb) score.set(g.b, score.get(g.b) + 1);
      else { score.set(g.a, score.get(g.a) + 0.5); score.set(g.b, score.get(g.b) + 0.5); }
    }
    for (const p of R.byes) score.set(p, score.get(p) + 1);
    for (const e of R.extra ?? []) score.set(e.player, score.get(e.player) + e.points);
  }
  return { history: hist, rounds: rounds.length };
}

/**
 * Pair the next Swiss round as one weighted matching. `players` are in seed order (strongest
 * first); games are `{a, b, ga, gb}` with a = white. Returns
 * { pairs: [{white, black}], bye, floaters, clashes: {absolute, strong, mild}, method: "matching" }.
 * Boards run from the top score down. Throws when no round without a rematch exists.
 */
export function swissPairings(players, games, byes = [], withdrawn = [], {
  lookahead = true, repeatFloats = true, byeRounds = null,
  extra = null, extraRounds = [], gameRounds = null, byeBlocked = [], unplayed = null, absent = [], groupOrder = "buchholz",
} = {}) {
  const gone = new Set([...withdrawn, ...absent]);
  const n = players.length - gone.size;
  if (n < 2) throw new Error("Swiss pairing needs at least 2 players still in the event.");
  const table = swissStandings(players, games, byes, { extra });
  // FIDE's Dutch rules order a score group by pairing number (seed); the page's default orders it
  // by Buchholz, then Sonneborn-Berger, as its standings do.
  if (groupOrder === "seed") table.sort((x, y) => y.score - x.score || x.index - y.index);
  const order = table.map((r) => r.index).filter((i) => !gone.has(i));
  const noBye = new Set(byeBlocked);
  const info = new Map(table.map((r) => [r.index, r]));
  const met = new Set();
  for (const g of games) { met.add(`${g.a}|${g.b}`); met.add(`${g.b}|${g.a}`); }
  const half = (i) => Math.round(info.get(i).score * 2);
  const claim = new Map(order.map((i) => [i, colourClaim(info.get(i))]));
  // Last round's and the round before's float for each player (null when level or absent).
  const { history: fh, rounds: played } = floatHistory(players, games, byes, byeRounds, { gameRounds, extraRounds });
  const floatAgo = (i, k) => fh.get(i)?.[played - k] ?? null;
  const repeatCost = (down, up) => {
    if (!repeatFloats) return 0;
    let c = 0;
    if (down !== undefined) { if (floatAgo(down, 1) === "down") c += RD1; if (floatAgo(down, 2) === "down") c += RD2; }
    if (up !== undefined) { if (floatAgo(up, 1) === "up") c += RU1; if (floatAgo(up, 2) === "up") c += RU2; }
    return c;
  };

  // Score groups in table order, and each player's place inside their group.
  const groupOf = new Map();
  const groups = [];
  for (const i of order) {
    const s = half(i);
    if (!groups.length || half(groups[groups.length - 1][0]) !== s) groups.push([]);
    groups[groups.length - 1].push(i);
    groupOf.set(i, groups.length - 1);
  }
  const posInGroup = new Map();
  for (const g of groups) g.forEach((i, k) => posInGroup.set(i, k));

  const v = order.length;
  const odd = v % 2 === 1;
  const byeVertex = odd ? v : -1;
  const vertexOf = new Map(order.map((i, k) => [i, k]));

  const pairPenalty = (x, y, allowAbsolute) => {
    const cx = claim.get(x);
    const cy = claim.get(y);
    let p = 0;
    if (cx.colour && cx.colour === cy.colour) {
      const s = Math.min(cx.strength, cy.strength);
      if (s === 3) { if (!allowAbsolute) return null; p += ABS; }
      else if (s === 2) p += STRONG;
      else if (s === 1) p += MILD;
    }
    const d = Math.min(30, Math.abs(half(x) - half(y)));
    p += SCORE * d * d;
    if (d === 0) {
      const g = groups[groupOf.get(x)];
      const h = Math.floor(g.length / 2);
      const [a, b] = [posInGroup.get(x), posInGroup.get(y)].sort((m, k) => m - k);
      p += Math.min(ORDER_CAP, Math.abs(b - a - h));
    } else {
      const [hi, lo] = half(x) > half(y) ? [x, y] : [y, x];
      const gHi = groups[groupOf.get(hi)];
      p += Math.min(ORDER_CAP, gHi.length - 1 - posInGroup.get(hi)) + Math.min(ORDER_CAP, posInGroup.get(lo));
      p += repeatCost(hi, lo);
    }
    return p;
  };

  const build = (allowAbsolute) => {
    const raw = [];
    for (let a = 0; a < v; a++) {
      for (let b = a + 1; b < v; b++) {
        const x = order[a];
        const y = order[b];
        if (met.has(`${x}|${y}`)) continue;
        const p = pairPenalty(x, y, allowAbsolute);
        if (p !== null) raw.push([a, b, p]);
      }
    }
    if (odd) {
      const fresh = order.filter((i) => info.get(i).byes === 0 && !noBye.has(i));
      const pool = fresh.length ? fresh : order;
      const fewest = Math.min(...pool.map((i) => info.get(i).byes));
      for (const i of pool) {
        if (info.get(i).byes !== fewest) continue;
        const fromBottom = v - 1 - vertexOf.get(i);
        const d = Math.min(30, half(i));
        // The bye's distance from the bottom counts twice, so it outweighs the Dutch order of the
        // boards it frees (FIDE's 2025 C9 example: bye to seed 4, not seed 3, both on 0 points);
        // 2 x ORDER_CAP = 60 stays under the smallest repeat-float step (61).
        const missed = Math.min(UNPLAYED_CAP, unplayed?.[i] ?? 0);
        raw.push([vertexOf.get(i), byeVertex, SCORE * d * d + UNPLAYED * missed + 2 * Math.min(ORDER_CAP, fromBottom) + repeatCost(i, undefined) + (fresh.length ? 0 : ABS)]);
      }
    }
    let top = 0;
    for (const e of raw) if (e[2] > top) top = e[2];
    return raw.map(([a, b, p]) => [a, b, top + 1 - p]);
  };

  const size = odd ? v + 1 : v;
  let mate = null;
  let edges = null;
  for (const allowAbsolute of [false, true]) {
    edges = build(allowAbsolute);
    const m = maxWeightMatching(size, edges, { maxCardinality: true });
    if (m.every((x) => x >= 0)) { mate = m; break; }
  }
  if (mate && lookahead && !nextRoundPossible(mate)) {
    // Forbid each chosen board in turn; keep the heaviest round that leaves a next round.
    const weightOf = (m) => edges.reduce((s, [a, b, w]) => s + (m[a] === b ? w : 0), 0);
    let best = null;
    for (let a = 0; a < size; a++) {
      const b = mate[a];
      if (a > b) continue;
      const m = maxWeightMatching(size, edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))), { maxCardinality: true });
      if (!m.every((x) => x >= 0) || !nextRoundPossible(m)) continue;
      const w = weightOf(m);
      if (!best || w > best.w) best = { m, w };
    }
    if (best) mate = best.m;
  }
  function nextRoundPossible(m) {
    const after = [];
    const hadBye = new Set(order.filter((i) => info.get(i).byes > 0 || noBye.has(i)));
    for (let a = 0; a < v; a++) if (m[a] === byeVertex) hadBye.add(order[a]);
    const byeOk = order.some((i) => !hadBye.has(i));
    for (let a = 0; a < v; a++) {
      for (let b = a + 1; b < v; b++) {
        if (m[a] === b || met.has(`${order[a]}|${order[b]}`)) continue;
        after.push([a, b, 1]);
      }
      if (odd && (!byeOk || !hadBye.has(order[a]))) after.push([a, byeVertex, 1]);
    }
    return maxWeightMatching(size, after, { maxCardinality: true }).every((x) => x >= 0);
  }
  if (!mate) throw new Error("No pairing without a rematch exists. Stop here: every player has met everyone they can.");

  let bye = null;
  const matched = [];
  for (let a = 0; a < v; a++) {
    const b = mate[a];
    if (b === byeVertex) { bye = order[a]; continue; }
    if (a < b) matched.push([order[a], order[b]]);
  }
  matched.sort((p, q) => Math.max(half(q[0]), half(q[1])) - Math.max(half(p[0]), half(p[1])) ||
    Math.min(vertexOf.get(p[0]), vertexOf.get(p[1])) - Math.min(vertexOf.get(q[0]), vertexOf.get(q[1])));

  const clashes = { absolute: 0, strong: 0, mild: 0 };
  let floaters = 0;
  // Players floating the same way as last round (a bye counts as a downfloat).
  const repeats = { down: 0, up: 0 };
  if (bye !== null && floatAgo(bye, 1) === "down") repeats.down++;
  const firstRound = games.length === 0;
  const pairs = matched.map(([x, y], board) => {
    if (half(x) !== half(y)) {
      floaters++;
      const [d, u] = half(x) > half(y) ? [x, y] : [y, x];
      if (floatAgo(d, 1) === "down") repeats.down++;
      if (floatAgo(u, 1) === "up") repeats.up++;
    }
    const [hi, lo] = vertexOf.get(x) < vertexOf.get(y) ? [x, y] : [y, x];
    if (firstRound) {
      // Round 1: the top seed has white on board 1, then colours alternate down the boards.
      return board % 2 === 0 ? { white: hi, black: lo } : { white: lo, black: hi };
    }
    const ch = claim.get(hi);
    const cl = claim.get(lo);
    if (ch.colour && ch.colour === cl.colour) {
      const s = Math.min(ch.strength, cl.strength);
      if (s === 3) clashes.absolute++; else if (s === 2) clashes.strong++; else clashes.mild++;
    }
    const white = whiteGoesTo(info.get(hi), ch, info.get(lo), cl) === "hi" ? hi : lo;
    return { white, black: white === hi ? lo : hi };
  });
  return { pairs, bye, floaters, clashes, repeats, method: "matching" };
}

/**
 * Who takes white, "hi" (higher-ranked) or "lo", FIDE order: when the claims differ both get what
 * they want; otherwise the stronger claim wins, then the larger colour difference, then colours
 * alternate from the most recent game where the two had different colours, then the higher-ranked
 * player gets their claim.
 */
function whiteGoesTo(rh, ch, rl, cl) {
  if (ch.colour !== cl.colour) {
    if (ch.colour === null) return cl.colour === "W" ? "lo" : "hi";
    return ch.colour === "W" ? "hi" : "lo";
  }
  if (ch.colour === null) return "hi";
  const claimant = (who) => (ch.colour === "W" ? who : who === "hi" ? "lo" : "hi");
  if (ch.strength !== cl.strength) return claimant(ch.strength > cl.strength ? "hi" : "lo");
  const dh = Math.abs(rh.whites - rh.blacks);
  const dl = Math.abs(rl.whites - rl.blacks);
  if (dh !== dl) return claimant(dh > dl ? "hi" : "lo");
  for (let k = 1; k <= Math.min(rh.last.length, rl.last.length); k++) {
    const a = rh.last[rh.last.length - k];
    const b = rl.last[rl.last.length - k];
    if (a !== b) return a === "B" ? "hi" : "lo";
  }
  return claimant("hi");
}

/**
 * The previous pairer, kept for comparison (eval/swiss-matching.txt): one player at a time, top of
 * the table first, backtracking under a 200,000-node budget, colours fixed after the pairs.
 */
export function swissPairingsGreedy(players, games, byes = [], withdrawn = []) {
  const gone = new Set(withdrawn);
  const n = players.length - gone.size;
  if (n < 2) throw new Error("Swiss pairing needs at least 2 players still in the event.");
  const table = swissStandings(players, games, byes);
  const order = table.map((r) => r.index).filter((i) => !gone.has(i));
  const info = new Map(table.map((r) => [r.index, r]));
  const met = new Set();
  for (const g of games) { met.add(`${g.a}|${g.b}`); met.add(`${g.b}|${g.a}`); }
  let bye = null;
  let pool = order.slice();
  if (n % 2 === 1) {
    for (let k = order.length - 1; k >= 0; k--) {
      if (info.get(order[k]).byes === 0) { bye = order[k]; break; }
    }
    if (bye === null) bye = order[order.length - 1];
    pool = order.filter((i) => i !== bye);
  }
  const scoreOf = (i) => info.get(i).score;
  let budget = 200000;
  const solve = (left) => {
    if (!left.length) return [];
    if (--budget < 0) return null;
    const p = left[0];
    const rest = left.slice(1);
    const group = rest.filter((q) => scoreOf(q) === scoreOf(p));
    const ideal = Math.floor((group.length + 1) / 2);
    const cands = rest
      .map((q, k) => {
        const g = group.indexOf(q);
        return { q, k, d: Math.abs(scoreOf(p) - scoreOf(q)), r: g < 0 ? 0 : Math.abs(g + 1 - ideal) };
      })
      .filter((c) => !met.has(`${p}|${c.q}`))
      .sort((x, y) => x.d - y.d || x.r - y.r || x.k - y.k);
    for (const c of cands) {
      const tail = solve(rest.filter((q) => q !== c.q));
      if (tail) return [[p, c.q], ...tail];
    }
    return null;
  };
  const matching = solve(pool);
  if (!matching) throw new Error("No pairing without a rematch exists. Stop here: every player has met everyone they can.");
  let floaters = 0;
  const pairs = matching.map(([x, y]) => {
    if (scoreOf(x) !== scoreOf(y)) floaters++;
    const [hi, lo] = order.indexOf(x) < order.indexOf(y) ? [x, y] : [y, x];
    const colourNeed = (i) => {
      const r = info.get(i);
      const run = r.last.slice(-2);
      if (run.length === 2 && run[0] === run[1]) return run[0] === "W" ? -3 : 3;
      return r.blacks - r.whites;
    };
    return colourNeed(hi) >= colourNeed(lo) ? { white: hi, black: lo } : { white: lo, black: hi };
  });
  return { pairs, bye, floaters, method: "greedy" };
}
