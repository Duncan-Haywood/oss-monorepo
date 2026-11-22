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

// Tier sizes. Score differences are capped at 30 half points (15 points), so one board's tier 2 is
// at most 900 x 1e8 = 9e10 < ABS. ABS was 1e13 until 2026-11-21; it came down to 1e12 so the order
// tier could be FINE times finer (below). A round now prefers an absolute clash only over 10,000
// squared half points of extra score gaps, which no real round reaches.
const ABS = 1e12;
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

// Edge penalties are built in units of 1/FINE of the tiers above, so the Dutch-order tier can rank
// boards more finely than the integer steps the tiers leave it. ABS (1e12) is still above all a
// board's lower tiers (at most SCORE x 900 + 3 x UNPLAYED + STRONG, about 9.0e10), and ABS x FINE
// (2.0e15) keeps twice the largest weight under 2^53, so every weight and dual stays an exact
// integer. The legacy order scales by FINE and pairs exactly as before (eval/swiss-vs-published.md).
const FINE = 2048;

/**
 * The Dutch-order cost of pairing positions a < b of one score group of size n, in 1/FINE units,
 * at most 60 x FINE (under the smallest repeat-float step, RU2 x FINE).
 *
 * FIDE's Dutch system pairs S1 (the top floor(n/2)) against S2 in order, tries every transposition
 * of S2 in lexicographic order before any exchange between S1 and S2 (C.04.3, articles 4.2-4.3).
 * So an S1-S2 board costs w_i x j (S1 position i, S2 position j, w_i = h - i): the sum is least
 * for S2 in order, and a deviation near the top of S1 costs more than one lower down, as in a
 * lexicographic order. A same-half board (an exchange)
 * costs more than any S1-S2 board, less when its players sit next to the S1/S2 boundary.
 */
function dutchOrderFine(a, b, n, order) {
  const h = Math.floor(n / 2);
  if (a < h && b >= h) {
    // w_i = h - i falls by at least 1 a row, so swapping two rows' partners is never a tie.
    const i = a;
    const j = b - h;
    const w = order === "lex2" ? (h - i) * (h - i) : h - i;
    const top = order === "lex2" ? h * h * h : h * h;
    const room = FINE * 29;
    return top <= room ? w * j : Math.floor((w * j * room) / top);
  }
  const e = a < h ? (h - 1 - a) + (h - 1 - b) : (a - h) + (b - h);
  return FINE * 30 + Math.min(FINE * 30, Math.floor((e * FINE * 30) / Math.max(1, 2 * n)));
}

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
  dutchOrder = "lex", pairing = "bracket", exchange = "dutch", mdpFirst = true, transpose = true,
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
      if (dutchOrder === "legacy") return p * FINE + FINE * Math.min(ORDER_CAP, Math.abs(b - a - h));
      return p * FINE + dutchOrderFine(a, b, g.length, dutchOrder);
    }
    const [hi, lo] = half(x) > half(y) ? [x, y] : [y, x];
    const gHi = groups[groupOf.get(hi)];
    p += Math.min(ORDER_CAP, gHi.length - 1 - posInGroup.get(hi)) + Math.min(ORDER_CAP, posInGroup.get(lo));
    p += repeatCost(hi, lo);
    return p * FINE;
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
        raw.push([vertexOf.get(i), byeVertex, FINE * (SCORE * d * d + UNPLAYED * missed + 2 * Math.min(ORDER_CAP, fromBottom) + repeatCost(i, undefined) + (fresh.length ? 0 : ABS))]);
      }
    }
    let top = 0;
    for (const e of raw) if (e[2] > top) top = e[2];
    return raw.map(([a, b, p]) => [a, b, top + 1 - p]);
  };

  const size = odd ? v + 1 : v;
  let mate = null;
  let edges = null;
  // Bracket by bracket first when asked; when it finds no round, or (with lookahead) its round
  // would leave no rematch-free round after it, the whole-round matching below pairs instead.
  let method = "matching";
  if (pairing === "bracket") {
    mate = bracketMate({ v, size, odd, byeVertex, order, vertexOf, groups, half, claim, met, info, noBye, floatAgo, repeatFloats, unplayed, dutchOrder, exchange, mdpFirst, transpose });
    if (mate && lookahead && !nextRoundPossible(mate)) mate = null;
    if (mate) method = "bracket";
  }
  if (!mate) for (const allowAbsolute of [false, true]) {
    edges = build(allowAbsolute);
    const m = maxWeightMatching(size, edges, { maxCardinality: true });
    if (m.every((x) => x >= 0)) { mate = m; break; }
  }
  if (mate && method !== "bracket" && lookahead && !nextRoundPossible(mate)) {
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
  return { pairs, bye, floaters, clashes, repeats, method };
}

/**
 * Bracket-by-bracket pairing (`pairing: "bracket"`), closer to how FIDE's Dutch rules (C.04.3)
 * work than one matching for the whole round. Score brackets are paired from the top down; the
 * players a bracket cannot or should not pair (its downfloaters) join the next bracket as
 * moved-down players (MDPs). Each bracket takes two stages:
 *
 *   A. One matching over every player still unpaired, so the rest of the round stays pairable
 *      (C4). Weights, tier above tier on each board: a board inside the bracket (C5, most pairs),
 *      score differences (C6), boards in the next bracket for the players who float into it (C7),
 *      colours, repeat floats, a coarse Dutch order. Its boards inside the bracket fix who is
 *      paired there and who floats down.
 *   B. On the players paired in the bracket only, the best colour-and-float value is found and
 *      held, and partners are fixed one S1 player at a time from the top: each takes the earliest
 *      S2 player (then the S1 player nearest the S1/S2 boundary, an exchange) that still allows
 *      that value. MDPs are S1 against the residents first; the residents left are the remainder
 *      and split into their own S1 and S2, as in the rules. When the remainder (or a homogeneous
 *      bracket) needs an exchange between S1 and S2, `exchangeFor` picks it in the order of article
 *      4.3 and the S1 players then take their partners only from the new S2 (`exchange: "dutch"`,
 *      the default; `"boundary"` keeps the earlier rule, S1 partners offered from the boundary up).
 *
 * Returns a `mate` array over vertices (the pairer's order, plus the bye vertex in an odd field),
 * or null when no round without a rematch exists. eval/swiss-bracket-dutch.md has the measurements.
 */
function bracketMate(ctx) {
  const { v, size, odd, byeVertex, order, vertexOf, groups, half, claim, met, info, noBye, floatAgo, repeatFloats, unplayed } = ctx;
  const dutchExchange = ctx.exchange !== "boundary";
  const mdpFirst = ctx.mdpFirst !== false;
  const transpose = ctx.transpose !== false;
  const out = new Array(size).fill(-1);
  const left = new Set(order);
  const met2 = (x, y) => met.has(`${x}|${y}`);
  const BASE = 2 ** 46, PAIR = 2 ** 40, ABS_A = 2 ** 39, PSD = 2 ** 24, UNP = 2 ** 20, NEXT = 2 ** 22, STR = 2 ** 18, MLD = 2 ** 14, FLT = 2 ** 10;
  // Colour clash between two players: 3 absolute, 2 strong, 1 mild, 0 none.
  const clash = (x, y) => {
    const cx = claim.get(x), cy = claim.get(y);
    return cx.colour && cx.colour === cy.colour ? Math.min(cx.strength, cy.strength) : 0;
  };
  const fa = (i, k) => (repeatFloats ? floatAgo(i, k) : null);
  const fresh = order.filter((i) => info.get(i).byes === 0 && !noBye.has(i));
  const byePool = new Set(fresh.length ? fresh : order);
  if (byePool.size) {
    const fewest = Math.min(...[...byePool].map((i) => info.get(i).byes));
    for (const i of [...byePool]) if (info.get(i).byes !== fewest) byePool.delete(i);
  }
  // FIDE 2025 C5, above every bracket: the pairing bye goes to the lowest score that still lets the
  // rest of the round pair (the 2025 C5 example: 6 on 0 takes it, so 1 and 3 on 2 points cannot
  // meet, because 2 and 5 already have). Scores are tried from the bottom up.
  if (odd && byePool.size) {
    const scores = [...new Set([...byePool].map(half))].sort((a, b) => a - b);
    for (const sc of scores) {
      const pool = [...byePool].filter((i) => half(i) === sc);
      const e = [];
      for (let a = 0; a < v; a++) {
        for (let b = a + 1; b < v; b++) if (!met2(order[a], order[b])) e.push([a, b, 1]);
        if (pool.includes(order[a])) e.push([a, v, 1]);
      }
      if (maxWeightMatching(v + 1, e, { maxCardinality: true }).every((z) => z >= 0)) {
        for (const i of [...byePool]) if (half(i) !== sc) byePool.delete(i);
        break;
      }
    }
  }
  let byeTaken = !odd;
  let mdps = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const residents = groups[gi].filter((i) => left.has(i));
    const M = mdps.slice().sort((x, y) => half(y) - half(x) || vertexOf.get(x) - vertexOf.get(y));
    const bracket = [...M, ...residents];
    if (!bracket.length) continue;
    const inB = new Set(bracket);
    const next = new Set(groups[gi + 1] ?? []);
    const last = gi === groups.length - 1;
    const posM = new Map(M.map((x, k) => [x, k]));
    const posR = new Map(residents.map((x, k) => [x, k]));
    const posB = new Map(bracket.map((x, k) => [x, k]));
    const m1 = Math.min(M.length, residents.length);
    let remPos = new Map(residents.slice(m1).map((x, k) => [x, k]));
    // Coarse Dutch order for stage A, 0..1000.
    const orderA = (x, y) => {
      const mx = posM.has(x), my = posM.has(y);
      if (mx && my) return 1000;
      if (mx || my) {
        const [m, r] = mx ? [x, y] : [y, x];
        const i = posM.get(m), j = posR.get(r);
        return Math.min(900, Math.floor((900 * (Math.max(1, m1 - i) * j)) / Math.max(1, m1 * residents.length)));
      }
      // The remainder: residents no MDP takes. Until stage A has run once, the residents after the
      // first m1; after, the ones its MDP boards left (see the second stage-A pass below).
      if (!remPos.has(x) || !remPos.has(y)) return 700;
      const n = remPos.size;
      const a = Math.min(remPos.get(x), remPos.get(y));
      const b = Math.max(remPos.get(x), remPos.get(y));
      const h = Math.floor(n / 2);
      if (a < h && b >= h) return Math.floor((600 * (h - a) * (b - h)) / Math.max(1, h * h));
      return 700;
    };
    const floatCost = (down, up) => {
      let c = 0;
      if (down !== undefined) { if (fa(down, 1) === "down") c += 8; if (fa(down, 2) === "down") c += 2; }
      if (up !== undefined) { if (fa(up, 1) === "up") c += 4; if (fa(up, 2) === "up") c += 1; }
      return c;
    };
    const verts = order.filter((i) => left.has(i));
    const idx = new Map(verts.map((x, k) => [x, k]));
    const bv = verts.length;
    const useBye = !byeTaken;
    // Stage A's weight of one board; `top` keeps only the tiers above colours (C.4 to C.7 and the
    // bye's), which a different choice of downfloaters must match (see dutchFloaters below).
    const edgeW = (x, y, allowAbsolute, top = false) => {
      if (met2(x, y)) return null;
      const c = clash(x, y);
      if (c === 3 && !allowAbsolute) return null;
      let w = BASE - (c === 3 ? ABS_A : 0);
      const ix = inB.has(x), iy = inB.has(y);
      if (ix && iy) {
        const d = Math.min(30, Math.abs(half(x) - half(y)));
        w += PAIR - PSD * d * d;
        if (top) return w;
        w -= (c === 2 ? STR : c === 1 ? MLD : 0) + orderA(x, y);
        if (d) { const [hi, lo] = half(x) > half(y) ? [x, y] : [y, x]; w -= FLT * floatCost(hi, lo); }
      } else if (ix || iy) {
        const [p, o] = ix ? [x, y] : [y, x];
        const d = Math.min(30, Math.abs(half(p) - half(o)));
        w -= PSD * d * d;
        // FIDE C.7 judges a downfloater by the pairs and score differences it leaves the next
        // bracket, not by its colours or its partner's floats there: those belong to the next
        // bracket's own pairing (2026-11-22: counting them chose the wrong floater).
        if (next.has(o)) {
          w += NEXT;
          if (top) return w;
          w -= FLT * floatCost(p, undefined);
          w -= Math.floor((500 * (bracket.length - 1 - posB.get(p))) / Math.max(1, bracket.length));
        }
      } else if (next.has(x) && next.has(y)) w += NEXT;
      return w;
    };
    const byeW = (x, top = false) => {
      let w = BASE - (fresh.length ? 0 : ABS_A);
      if (inB.has(x)) {
        w -= PSD * Math.min(30, half(x)) ** 2 + UNP * Math.min(3, unplayed?.[x] ?? 0);
        if (top) return w;
        w -= FLT * floatCost(x, undefined) + Math.floor((1000 * (v - 1 - vertexOf.get(x))) / Math.max(1, v));
      }
      return w;
    };
    // One matching over `vs` (default: every player still unpaired). `ban`: players who may not
    // be paired inside the bracket. Returns the matching (index into vs; vs.length is the bye).
    const stageA = (allowAbsolute, vs = verts, ban = null) => {
      const edges = [];
      const nb = vs.length;
      for (let a = 0; a < nb; a++) {
        for (let b = a + 1; b < nb; b++) {
          const x = vs[a], y = vs[b];
          if (ban && inB.has(x) && inB.has(y) && (ban.has(x) || ban.has(y))) continue;
          const w = edgeW(x, y, allowAbsolute);
          if (w !== null) edges.push([a, b, w]);
        }
        if (useBye && byePool.has(vs[a])) edges.push([a, nb, byeW(vs[a])]);
      }
      const n = nb + (useBye ? 1 : 0);
      const m = maxWeightMatching(n, edges, { maxCardinality: true });
      return m.length === n && m.every((z) => z >= 0) ? m : null;
    };
    const topOf = (m, vs, allowAbsolute) => {
      let t = 0;
      // Less BASE per board: every perfect matching has as many boards, and the sum stays exact.
      for (let a = 0; a < vs.length; a++) {
        const z = m[a];
        if (z === vs.length) t += byeW(vs[a], true) - BASE;
        else if (z > a) t += edgeW(vs[a], vs[z], allowAbsolute, true) - BASE;
      }
      return t;
    };
    let allowAbs = false;
    let mA = stageA(false);
    if (!mA) { allowAbs = true; mA = stageA(true); }
    if (!mA) return null;
    // When the MDPs did not take the first m1 residents (a rematch, a colour), the remainder is
    // another set, and its S1/S2 split decides who floats (FIDE C.04.3: the remainder is paired
    // as a homogeneous bracket). Re-run stage A once with the remainder its MDP boards leave.
    if (M.length) {
      const taken = new Set();
      for (const x of M) { const z = mA[idx.get(x)]; if (z >= 0 && z < bv && posR.has(verts[z])) taken.add(verts[z]); }
      const rem = residents.filter((x) => !taken.has(x));
      if (rem.some((x, k) => remPos.get(x) !== k) || rem.length !== remPos.size) {
        remPos = new Map(rem.map((x, k) => [x, k]));
        mA = stageA(allowAbs) ?? mA;
      }
    }
    const paired = [];
    const floaters = [];
    for (const x of bracket) {
      const z = mA[idx.get(x)];
      if (z === bv) {
        if (last) { out[vertexOf.get(x)] = byeVertex; out[byeVertex] = vertexOf.get(x); byeTaken = true; left.delete(x); }
        else floaters.push(x);
      } else if (inB.has(verts[z])) paired.push(x);
      else floaters.push(x);
    }
    // Stage B: hold the best colour-and-float value, fix partners in Dutch order.
    const P = new Set(paired);
    const R = paired.length / 2 + 1;
    const B = paired.length + 1;
    const crit = (x, y) => {
      const c = clash(x, y);
      const k = [c === 3 ? 1 : 0, c === 2 ? 1 : 0, c === 1 ? 1 : 0, 0, 0, 0, 0];
      if (half(x) !== half(y)) {
        const [hi, lo] = half(x) > half(y) ? [x, y] : [y, x];
        if (fa(hi, 1) === "down") k[3] = 1;
        if (fa(lo, 1) === "up") k[4] = 1;
        if (fa(hi, 2) === "down") k[5] = 1;
        if (fa(lo, 2) === "up") k[6] = 1;
      }
      return k;
    };
    // Every board also carries a small Dutch-order bonus (DO, at most 8), so the optimal matching
    // tends to already be in Dutch order and the shortcut in fixFrom fires; s's own preference
    // (unit U) outweighs all those bonuses together, and colours and floats (unit B x U) outweigh both.
    const DO = 8;
    const U = (paired.length / 2) * DO + 1;
    let nCrit = 7;
    while (nCrit > 1 && R ** nCrit * B * U > 2 ** 50) nCrit--;
    const qMax = R ** nCrit;
    const qOf = (x, y) => crit(x, y).slice(0, nCrit).reduce((s, b, k) => s + b * R ** (nCrit - 1 - k), 0);
    const fixPair = (x, y) => {
      out[vertexOf.get(x)] = vertexOf.get(y); out[vertexOf.get(y)] = vertexOf.get(x);
      P.delete(x); P.delete(y); left.delete(x); left.delete(y);
    };
    // The last optimal matching found (player -> partner). Fixing one board of it keeps the rest
    // optimal for the players left, so when it already gives s their best-ranked allowed partner,
    // that board is taken without a new matching (round 1 of a big field needs only one).
    let cur = null;
    const allowed = (x, y) => !met2(x, y) && (allowAbs || clash(x, y) !== 3);
    // bip: when set, only boards between bip.a (S1 after an exchange) and bip.b (S2) are allowed.
    let bip = null;
    const crossOk = (x, y) => !bip || (bip.a.has(x) && bip.b.has(y)) || (bip.a.has(y) && bip.b.has(x));
    const fixFrom = (S1, S2) => {
      for (const s of S1) {
        if (!P.has(s)) continue;
        const rest = order.filter((i) => P.has(i));
        const li = new Map(rest.map((x, k) => [x, k]));
        const hRest = Math.floor(rest.length / 2);
        const rank = new Map();
        let r = 0;
        for (const t of S2) if (P.has(t) && t !== s) rank.set(t, r++);
        for (const t of [...S1].reverse()) if (P.has(t) && t !== s && !rank.has(t)) rank.set(t, r++);
        for (const t of rest) if (t !== s && !rank.has(t)) rank.set(t, r++);
        if (cur) {
          let bestT = null;
          for (const [t, k] of rank) if (allowed(s, t) && crossOk(s, t) && (bestT === null || k < rank.get(bestT))) bestT = t;
          if (bestT !== null && cur.get(s) === bestT) { fixPair(s, bestT); continue; }
        }
        const edges = [];
        for (let a = 0; a < rest.length; a++) {
          for (let b = a + 1; b < rest.length; b++) {
            const x = rest[a], y = rest[b];
            if (met2(x, y)) continue;
            if (clash(x, y) === 3 && !allowAbs) continue;
            if (!crossOk(x, y)) continue;
            let w = (qMax - qOf(x, y)) * B * U;
            if (x === s) w += (B - 1 - rank.get(y)) * U;
            else if (y === s) w += (B - 1 - rank.get(x)) * U;
            w += DO - Math.min(DO, Math.abs(b - a - hRest));
            edges.push([a, b, w + 1]);
          }
        }
        const m = maxWeightMatching(rest.length, edges, { maxCardinality: true });
        const z = m[li.get(s)];
        if (z < 0) return false;
        cur = new Map(rest.map((x, k) => [x, m[k] >= 0 ? rest[m[k]] : null]));
        fixPair(s, rest[z]);
      }
      return true;
    };
    let pm = M.filter((x) => P.has(x));
    let pr = residents.filter((x) => P.has(x));
    // MDPs first, as the Dutch rules generate candidates: an MDP takes the earliest resident that
    // keeps the best colour-and-float value even when that changes WHICH residents float down
    // (stage A fixed the resident downfloaters before any MDP was placed). Each MDP is placed on
    // a matching over the paired players plus stage A's resident downfloaters, with one "float"
    // slot per downfloater that any resident may take; the new downfloaters are kept only if stage
    // A, with them barred from the bracket, reaches the same C.4-C.7 value (2026-11-22).
    const fr0 = last ? [] : floaters.filter((x) => posR.has(x) && mA[idx.get(x)] !== bv);
    if (mdpFirst && fr0.length && pm.length) {
      const F2 = mdpFloaters(pm, residents.filter((x) => P.has(x) || fr0.includes(x)), fr0.length, { allowed, crit, fa, order });
      if (F2 && !F2.every((x) => fr0.includes(x))) {
        const vs = order.filter((x) => left.has(x));
        const base = stageA(allowAbs, vs);
        const alt = stageA(allowAbs, vs, new Set(F2));
        if (base && alt && topOf(alt, vs, allowAbs) === topOf(base, vs, allowAbs)) {
          const out2 = new Set(F2);
          for (const x of fr0) if (!out2.has(x)) { P.add(x); floaters.splice(floaters.indexOf(x), 1); }
          for (const x of F2) if (!fr0.includes(x)) { P.delete(x); floaters.push(x); }
          cur = null;
          pm = M.filter((x) => P.has(x));
          pr = residents.filter((x) => P.has(x));
        }
      }
    }
    if (!fixFrom(pm, pr)) return null;
    let rem = residents.filter((x) => P.has(x));
    // Who floats out of the remainder. Stage A picked downfloaters with a coarse order; the rules
    // pick them as a by-product of the first candidate in Dutch order (C.04.3 article 4: S1 takes
    // the earliest S2 players that still reach the best value; whoever is left in S2 floats).
    // dutchFloaters replays that over the remainder plus stage A's resident downfloaters, then the
    // choice is kept only if stage A, with those players barred from the bracket, still reaches the
    // same value on C.4 to C.7 (the round completes, as many pairs, the same score differences and
    // next-bracket pairs).
    const fr = last ? [] : floaters.filter((x) => posR.has(x) && mA[idx.get(x)] !== bv);
    if (fr.length && rem.length >= 2 && rem.length + fr.length <= DUTCH_FLOAT_CAP) {
      const F2 = dutchFloaters(rem, fr, { allowed, crit, fa, order });
      if (F2 && !F2.every((x) => fr.includes(x))) {
        const vs = order.filter((x) => left.has(x));
        const base = stageA(allowAbs, vs);
        const alt = stageA(allowAbs, vs, new Set(F2));
        if (base && alt && topOf(alt, vs, allowAbs) === topOf(base, vs, allowAbs)) {
          const out2 = new Set(F2);
          for (const x of fr) if (!out2.has(x)) { P.add(x); floaters.splice(floaters.indexOf(x), 1); }
          for (const x of F2) if (!fr.includes(x)) { P.delete(x); floaters.push(x); }
          cur = null;
          rem = residents.filter((x) => P.has(x));
        }
      }
    }
    const h = Math.floor(rem.length / 2);
    let ex = dutchExchange ? exchangeFor(rem, { allowed, qOf, qMax }) : null;
    if (ex?.none && !transpose) ex = null;
    if (ex) {
      cur = null;
      bip = { a: new Set(ex.s1), b: new Set(ex.s2) };
      const ok = fixFrom(ex.s1, ex.s2);
      bip = null;
      if (!ok) return null;
    } else if (!fixFrom(rem.slice(0, h), rem.slice(h))) return null;
    // Players of S2 left to pair with each other (when an exchange used up S1): same rule.
    const tail = order.filter((x) => P.has(x));
    if (tail.length && !fixFrom(tail, tail)) return null;
    if (P.size) return null;
    mdps = floaters;
  }
  if (mdps.length) return null;
  return out;
}

// Brackets larger than this keep stage A's downfloaters (dutchFloaters runs one matching per player).
const DUTCH_FLOAT_CAP = 160;

/**
 * Downfloaters of a homogeneous remainder in Dutch order. `rem` is the remainder stage A pairs
 * (even), `fr` the residents it floats; both in the pairer's order. S1 is the first rem.length / 2
 * players of rem + fr in that order, S2 the rest (so the floaters come out of S2 unless an exchange
 * says otherwise). The best colour-and-float value and the fewest exchanges that reach it come from
 * one matching, where floating costs a player's own repeat-downfloat criteria (C.14, C.16) and an
 * S1 player paired inside S1 or floating counts one exchange. With exchanges needed, the exchange
 * sets are tried in the order of article 4.3 (as in exchangeFor) until one lets S1 pair wholly
 * against S2 at that value. Then each player in turn, S1 first, takes the best-ranked partner (S2
 * in order, then S1 from the boundary up, then floating) that keeps that value. Returns the players
 * left floating, or null.
 */
export function dutchFloaters(rem, fr, { allowed, crit, fa, order }, budget = 4000) {
  const inU = new Set([...rem, ...fr]);
  const U = order.filter((x) => inU.has(x));
  const nP = rem.length / 2;
  const R2 = U.length + 1;
  const RB = U.length + 2;
  const XR = nP + 2;
  let nc = 7;
  while (nc > 1 && R2 ** nc * XR * RB * (U.length + 1) > 2 ** 50) nc--;
  const qM = R2 ** nc;
  const q = (k) => k.slice(0, nc).reduce((s, b, j) => s + b * R2 ** (nc - 1 - j), 0);
  const qFloat = (x) => q([0, 0, 0, fa(x, 1) === "down" ? 1 : 0, 0, fa(x, 2) === "down" ? 1 : 0, 0]);
  // One matching over `list` plus `dummies` float seats. Tiers: colour-and-float value, then
  // exchanges, then (when `s` is set) s's rank. Returns { m, q, x } or null.
  const solve = (S1, list, dummies, s = null, rank = null, floatRank = 0) => {
    const n = list.length;
    const edges = [];
    for (let a = 0; a < n; a++) {
      const x = list[a];
      for (let b = a + 1; b < n; b++) {
        const y = list[b];
        if (!allowed(x, y)) continue;
        const xc = S1.has(x) && S1.has(y) ? 1 : 0;
        let w = ((qM - q(crit(x, y))) * XR + XR - 1 - xc) * RB + 1;
        if (x === s) w += RB - 1 - rank.get(y);
        else if (y === s) w += RB - 1 - rank.get(x);
        edges.push([a, b, w]);
      }
      const xf = S1.has(x) ? 1 : 0;
      for (let d = 0; d < dummies; d++) edges.push([a, n + d, ((qM - qFloat(x)) * XR + XR - 1 - xf) * RB + 1 + (x === s ? RB - 1 - floatRank : 0)]);
    }
    const m = maxWeightMatching(n + dummies, edges, { maxCardinality: true });
    if (!m.every((z) => z >= 0)) return null;
    let qs = 0, xs = 0;
    for (let a = 0; a < n; a++) {
      const z = m[a];
      if (z >= n) { qs += qFloat(list[a]); if (S1.has(list[a])) xs++; }
      else if (z > a) { qs += q(crit(list[a], list[z])); if (S1.has(list[a]) && S1.has(list[z])) xs++; }
    }
    return { m, q: qs, x: xs };
  };
  const greedy = (S1) => {
    const rest = new Set(U);
    let dummies = fr.length;
    const out = [];
    for (const s of U) {
      if (!rest.has(s)) continue;
      const list = U.filter((x) => rest.has(x));
      const rank = new Map();
      let r = 0;
      for (const t of list) if (t !== s && !S1.has(t)) rank.set(t, r++);
      for (const t of [...list].reverse()) if (t !== s && S1.has(t)) rank.set(t, r++);
      const res = solve(S1, list, dummies, s, rank, r);
      if (!res) return null;
      const z = res.m[list.indexOf(s)];
      rest.delete(s);
      if (z >= list.length) { out.push(s); dummies--; } else rest.delete(list[z]);
    }
    return dummies === 0 ? out : null;
  };
  const S1 = new Set(U.slice(0, nP));
  const first = solve(S1, U, fr.length);
  if (!first) return null;
  const j = first.x;
  if (j === 0) return greedy(S1);
  // Exchange sets of size j, in article 4.3 order: (b) smallest BSN sum moved in minus moved out,
  // (c) highest different BSN moved out of S1, (d) lowest different BSN moved out of S2.
  const h = nP, n = U.length;
  const choose = (k, r) => { let c = 1; for (let i = 0; i < r; i++) c = (c * (k - i)) / (i + 1); return c; };
  if (j > h || j > n - h || choose(h, j) * choose(n - h, j) > budget) return greedy(S1);
  const subsets = (lo, hi, r) => {
    const outS = [];
    const rec = (start, acc) => {
      if (acc.length === r) { outS.push(acc.slice()); return; }
      for (let i = start; i < hi; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(lo, []);
    return outS;
  };
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const cands = [];
  for (const a of subsets(0, h, j)) for (const b of subsets(h, n, j)) cands.push({ a, b, d: sum(b) - sum(a) });
  const desc = (x) => x.slice().sort((p, q2) => q2 - p);
  const cmpHigh = (x, y) => { const X = desc(x), Y = desc(y); for (let i = 0; i < X.length; i++) if (X[i] !== Y[i]) return Y[i] - X[i]; return 0; };
  const cmpLow = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  cands.sort((p, q2) => p.d - q2.d || cmpHigh(p.a, q2.a) || cmpLow(p.b, q2.b));
  for (const c of cands) {
    const outA = new Set(c.a.map((i) => U[i]));
    const S1x = new Set([...U.slice(0, h).filter((x) => !outA.has(x)), ...c.b.map((i) => U[i])]);
    const r = solve(S1x, U, fr.length);
    if (r && r.q === first.q && r.x === 0) return greedy(S1x);
  }
  return greedy(S1);
}

/**
 * Resident downfloaters of a heterogeneous bracket when its MDPs are paired first, in Dutch
 * order (C.04.3: candidates are generated MDP by MDP, each taking the earliest resident that
 * still reaches the best colour-and-float value, before the remainder is looked at). `mdps` are
 * the MDPs paired in the bracket and `res` the residents that are paired or float down (in the
 * pairer's order); `nf` of the residents float. Each MDP in turn is fixed to its best-ranked
 * partner on one matching over the players left plus `nf` float seats only residents may take
 * (a seat costs the repeat-downfloat criteria, as in dutchFloaters). Returns the residents left
 * on float seats once every MDP is placed, or null.
 */
export function mdpFloaters(mdps, res, nf, { allowed, crit, fa, order }) {
  const inU = new Set([...mdps, ...res]);
  const U = order.filter((x) => inU.has(x));
  const isM = new Set(mdps);
  const boards = (U.length + nf) / 2;
  const R2 = boards + 1;
  const RB = U.length + 2;
  let nc = 7;
  while (nc > 1 && R2 ** nc * RB * (U.length + 1) > 2 ** 50) nc--;
  const qM = R2 ** nc;
  const q = (k) => k.slice(0, nc).reduce((s, b, j) => s + b * R2 ** (nc - 1 - j), 0);
  const qFloat = (x) => q([0, 0, 0, fa(x, 1) === "down" ? 1 : 0, 0, fa(x, 2) === "down" ? 1 : 0, 0]);
  const solve = (list, s = null, rank = null) => {
    const n = list.length;
    const edges = [];
    for (let a = 0; a < n; a++) {
      const x = list[a];
      for (let b = a + 1; b < n; b++) {
        const y = list[b];
        if (!allowed(x, y)) continue;
        let w = (qM - q(crit(x, y))) * RB + 1;
        if (x === s) w += RB - 1 - rank.get(y);
        else if (y === s) w += RB - 1 - rank.get(x);
        edges.push([a, b, w]);
      }
      if (!isM.has(x)) for (let d = 0; d < nf; d++) edges.push([a, n + d, (qM - qFloat(x)) * RB + 1]);
    }
    const m = maxWeightMatching(n + nf, edges, { maxCardinality: true });
    return m.every((z) => z >= 0) ? m : null;
  };
  const rest = new Set(U);
  for (const s of mdps) {
    if (!rest.has(s)) continue;
    const list = U.filter((x) => rest.has(x));
    const rank = new Map();
    let r = 0;
    for (const t of list) if (t !== s && !isM.has(t)) rank.set(t, r++);
    for (const t of list) if (t !== s && isM.has(t)) rank.set(t, r++);
    const m = solve(list, s, rank);
    if (!m) return null;
    const z = m[list.indexOf(s)];
    if (z >= list.length) return null;
    rest.delete(s); rest.delete(list[z]);
  }
  const list = U.filter((x) => rest.has(x));
  const m = solve(list);
  if (!m) return null;
  return list.filter((x, a) => m[a] >= list.length);
}

/**
 * FIDE C.04.3 article 4.3, exchanges in a homogeneous bracket or remainder. `rem` is in BSN order
 * (BSN = index + 1), S1 its top half. Every candidate pairs S1 with S2 after some exchange, so the
 * best colour-and-float value over all candidates is the best over all perfect matchings of `rem`.
 * The rules take the first candidate, in exchange order, that reaches that value:
 *   (a) fewest players exchanged, (b) smallest (sum of BSNs moved S2 -> S1) - (sum moved S1 -> S2),
 *   (c) the highest different BSN moved out of S1, (d) the lowest different BSN moved out of S2.
 * The fewest exchanges any optimal pairing needs equals its fewest S1-S1 boards, found with one
 * matching; exchange sets of that size are then tried in order until one admits an optimal S1-S2
 * pairing. Returns { s1, s2 } (each in BSN order) for the caller to take the first transposition
 * of, or null to leave the bracket to the older boundary-first rule (no exchange needed, or more
 * than `budget` sets to try).
 */
export function exchangeFor(rem, { allowed, qOf, qMax }, budget = 4000) {
  const n = rem.length, h = n / 2;
  if (n < 4 || n % 2) return null;
  const W = h + 1;
  const edges = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (!allowed(rem[a], rem[b])) continue;
      const cross = a < h && b >= h ? 1 : 0;
      edges.push([a, b, (qMax - qOf(rem[a], rem[b])) * W + cross + 1]);
    }
  }
  const m = maxWeightMatching(n, edges, { maxCardinality: true });
  if (m.some((z) => z < 0)) return null;
  let best = 0, j = 0;
  for (let a = 0; a < n; a++) {
    const b = m[a];
    if (b > a) { best += qOf(rem[a], rem[b]); if (b < h) j++; }
  }
  // No exchange needed: S1 still takes its partners from S2 only (a transposition), never from
  // S1 (2026-11-22: an S1-S1 board reached the same value and let S1's first player take an
  // earlier S2 partner than any transposition gives).
  if (j === 0) return { s1: rem.slice(0, h), s2: rem.slice(h), none: true };
  const choose = (k, r) => { let c = 1; for (let i = 0; i < r; i++) c = (c * (k - i)) / (i + 1); return c; };
  if (choose(h, j) ** 2 > budget) return null;
  const subsets = (lo, hi, r) => {
    const outS = [];
    const rec = (start, acc) => {
      if (acc.length === r) { outS.push(acc.slice()); return; }
      for (let i = start; i < hi; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(lo, []);
    return outS;
  };
  const A = subsets(0, h, j); // indices moved out of S1
  const Bs = subsets(h, n, j); // indices moved out of S2
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const cands = [];
  for (const a of A) for (const b of Bs) cands.push({ a, b, d: sum(b) - sum(a) });
  const desc = (x) => x.slice().sort((p, q) => q - p);
  const cmpHigh = (x, y) => { const X = desc(x), Y = desc(y); for (let i = 0; i < X.length; i++) if (X[i] !== Y[i]) return Y[i] - X[i]; return 0; };
  const cmpLow = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  cands.sort((p, q) => p.d - q.d || cmpHigh(p.a, q.a) || cmpLow(p.b, q.b));
  for (const c of cands) {
    const outA = new Set(c.a), outB = new Set(c.b);
    const s1 = [], s2 = [];
    for (let i = 0; i < n; i++) ((i < h ? !outA.has(i) : outB.has(i)) ? s1 : s2).push(i);
    const e = [];
    for (let a = 0; a < h; a++) {
      for (let b = 0; b < h; b++) {
        const x = rem[s1[a]], y = rem[s2[b]];
        if (allowed(x, y)) e.push([a, h + b, qMax - qOf(x, y) + 1]);
      }
    }
    const mm = maxWeightMatching(n, e, { maxCardinality: true });
    if (mm.some((z) => z < 0)) continue;
    let q = 0;
    for (let a = 0; a < h; a++) q += qOf(rem[s1[a]], rem[s2[mm[a] - h]]);
    if (q === best) return { s1: s1.map((i) => rem[i]), s2: s2.map((i) => rem[i]) };
  }
  return null;
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
