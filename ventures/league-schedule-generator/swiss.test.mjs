import test from "node:test";
import assert from "node:assert/strict";
import { swissPairings, swissPairingsGreedy, swissStandings, colourClaim, floatHistory, exchangeFor, dutchFloaters, mdpFloaters } from "./swiss.mjs";
import { validateSwiss } from "./calc.mjs";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** Play an event with random results (draws too); returns the state before each round. */
function simulate(pairer, n, rounds, seed) {
  const r = rng(seed);
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const games = [];
  const byes = [];
  const states = [];
  for (let k = 0; k < rounds; k++) {
    states.push({ games: games.slice(), byes: byes.slice() });
    const round = pairer(players, games, byes);
    assert.deepEqual(validateSwiss(players, games, byes, round), []);
    for (const p of round.pairs) {
      const u = r();
      games.push({ a: p.white, b: p.black, ga: u < 0.45 ? 1 : u < 0.6 ? 1 : 0, gb: u < 0.45 ? 0 : u < 0.6 ? 1 : 1 });
    }
    if (round.bye !== null) byes.push(round.bye);
  }
  return { players, games, byes, states };
}

test("round 1: top half meets bottom half, top seed white on board 1, colours alternate", () => {
  const players = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const r = swissPairings(players, []);
  assert.deepEqual(r.pairs, [{ white: 0, black: 4 }, { white: 5, black: 1 }, { white: 2, black: 6 }, { white: 7, black: 3 }]);
  assert.equal(r.bye, null);
  assert.equal(r.method, "bracket");
  assert.deepEqual(swissPairings(players, [], [], [], { pairing: "matching" }).pairs, r.pairs);
});

test("no player ever gets one colour three times running or a colour gap past 2 (30 events, 8-40 players)", () => {
  for (let s = 0; s < 30; s++) {
    const n = 8 + (s * 7) % 33;
    const { players, games, byes } = simulate(swissPairings, n, 7, s);
    for (const row of swissStandings(players, games, byes)) {
      assert.ok(Math.abs(row.whites - row.blacks) <= 2, `${row.name} ${row.whites}/${row.blacks}`);
      assert.ok(!/WWW|BBB/.test(row.last.join("")), `${row.name} ${row.last.join("")}`);
    }
  }
});

/** Every rematch-free perfect matching of the even field (bye taken out), scored like the pairer's top tiers. */
function bestPossible(players, games, byes, bye) {
  const table = new Map(swissStandings(players, games, byes).map((r) => [r.index, r]));
  const met = new Set(games.flatMap((g) => [`${g.a}|${g.b}`, `${g.b}|${g.a}`]));
  const ids = players.map((_, i) => i).filter((i) => i !== bye);
  let best = null;
  const go = (left, abs, sq) => {
    if (!left.length) { const key = [abs, sq]; if (!best || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) best = key; return; }
    const [x, ...rest] = left;
    for (const y of rest) {
      if (met.has(`${x}|${y}`)) continue;
      const cx = colourClaim(table.get(x));
      const cy = colourClaim(table.get(y));
      const clash = cx.colour && cx.colour === cy.colour && Math.min(cx.strength, cy.strength) === 3 ? 1 : 0;
      const d = Math.round(Math.abs(table.get(x).score - table.get(y).score) * 2);
      go(rest.filter((z) => z !== y), abs + clash, sq + d * d);
    }
  };
  go(ids, 0, 0);
  return best;
}

// The whole-round matching (pairing: "matching") minimises the total squared score gap; the
// bracket-by-bracket default pairs the top bracket first, as the Dutch rules do, and may not.
test("matching: each round is optimal: no rematch-free round has fewer absolute clashes, or as few and a smaller squared score gap (exhaustive, 6-10 players)", () => {
  let checked = 0;
  for (let s = 0; s < 24; s++) {
    const n = 6 + (s % 5);
    const { players, states } = simulate(swissPairings, n, 4, 100 + s);
    for (const { games, byes } of states) {
      // lookahead off: with it on, a round may give up a little to keep the next round possible
      const round = swissPairings(players, games, byes, [], { lookahead: false, pairing: "matching" });
      const table = new Map(swissStandings(players, games, byes).map((r) => [r.index, r]));
      let abs = 0, sq = 0;
      for (const p of round.pairs) {
        const ca = colourClaim(table.get(p.white));
        const cb = colourClaim(table.get(p.black));
        if (ca.colour && ca.colour === cb.colour && Math.min(ca.strength, cb.strength) === 3) abs++;
        const d = Math.round(Math.abs(table.get(p.white).score - table.get(p.black).score) * 2);
        sq += d * d;
      }
      const best = bestPossible(players, games, byes, round.bye);
      assert.deepEqual([abs, sq], best, `seed ${s} n=${n} round ${games.length}`);
      checked++;
    }
  }
  assert.ok(checked >= 90);
});

test("the bye goes to the lowest scorer who has not had one, and never twice while others are waiting", () => {
  const { players, byes, games } = simulate(swissPairings, 9, 7, 5);
  assert.equal(new Set(byes).size, byes.length);
  // in round 2 the bye goes to someone on 0 points
  const s = simulate(swissPairings, 9, 2, 6);
  const before = new Map(swissStandings(s.players, s.states[1].games, s.states[1].byes).map((r) => [r.index, r]));
  const r2 = swissPairings(s.players, s.states[1].games, s.states[1].byes);
  const lowest = Math.min(...[...before.values()].filter((r) => r.byes === 0).map((r) => r.score));
  assert.equal(before.get(r2.bye).score, lowest);
  assert.ok(players.length && games.length);
});

test("when every remaining round has a forbidden colour pairing, it still pairs and counts the clashes", () => {
  const players = ["A", "B", "C", "D"];
  // A and D have had white twice, B and C black twice; only A-D and B-C are left
  const games = [[0, 1], [3, 2], [0, 2], [3, 1]].map(([a, b]) => ({ a, b, ga: 1, gb: 0 }));
  const r = swissPairings(players, games);
  assert.deepEqual(validateSwiss(players, games, [], r), []);
  assert.equal(r.clashes.absolute, 2);
});

test("lookahead: the 6-player event that trapped itself after round 3 now pairs a 4th round", () => {
  const players = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const games = [[0, 3], [4, 1], [2, 5], [1, 0], [5, 4], [3, 2]].map(([a, b]) => ({ a, b, ga: 1, gb: 0 }));
  // the round the pairer took without lookahead in this position (seed 20 of the optimality test)
  const trap = [[0, 5], [4, 3], [2, 1]];
  const plain = swissPairings(players, games, [], [], { lookahead: false });
  const key = (r) => r.pairs.map((p) => [p.white, p.black].sort().join("-")).sort().join(" ");
  const look = swissPairings(players, games);
  const next = (r) => {
    const g2 = games.concat(r.pairs.map((p) => ({ a: p.white, b: p.black, ga: 1, gb: 0 })));
    return () => swissPairings(players, g2);
  };
  assert.doesNotThrow(next(look));
  assert.equal(key(plain), trap.map((p) => p.slice().sort().join("-")).sort().join(" "));
  if (key(plain) === trap.map((p) => p.slice().sort().join("-")).sort().join(" ")) assert.throws(next(plain), /rematch/);
});

test("refuses when every player has met everyone", () => {
  const players = ["A", "B", "C", "D"];
  const games = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]].map(([a, b]) => ({ a, b, ga: 1, gb: 0 }));
  assert.throws(() => swissPairings(players, games), /rematch/);
  assert.throws(() => swissPairingsGreedy(players, games), /rematch/);
});

test("withdrawn players are left out and a 150-player round pairs in under a second", () => {
  const { players, games, byes } = simulate(swissPairings, 150, 3, 9);
  const t0 = performance.now();
  const r = swissPairings(players, games, byes, [0, 1, 2]);
  assert.ok(performance.now() - t0 < 1000);
  assert.deepEqual(validateSwiss(players, games, byes, r, [0, 1, 2]), []);
  assert.equal(r.pairs.length, 73);
  assert.notEqual(r.bye, null);
});

test("floatHistory: downfloats, upfloats and byes per round, byes placed by round", () => {
  // Round 1: A beats B (level), C bye. Round 2: C v A (level), B bye. Round 3: B (1) v C (2), A bye.
  const games = [{ a: 0, b: 1, ga: 1, gb: 0 }, { a: 2, b: 0, ga: 1, gb: 0 }, { a: 1, b: 2, ga: 0, gb: 1 }];
  const { history, rounds } = floatHistory(["A", "B", "C"], games, [2, 1, 0]);
  assert.equal(rounds, 3);
  assert.deepEqual(history.get(0), [null, null, "down"]);
  assert.deepEqual(history.get(1), [null, "down", "up"]);
  assert.deepEqual(history.get(2), ["down", null, "down"]);
});

test("repeat floats: a downfloat is not repeated when a round without one exists (FIDE C.14 before C.15)", () => {
  // After two rounds A and F have 2, E and D 1, B and C 0. A floated down to B in round 2 (B up).
  const players = ["A", "B", "C", "D", "E", "F"];
  const games = [{ a: 0, b: 3, ga: 1, gb: 0 }, { a: 4, b: 1, ga: 1, gb: 0 }, { a: 2, b: 5, ga: 0, gb: 1 },
    { a: 1, b: 0, ga: 0, gb: 1 }, { a: 5, b: 4, ga: 1, gb: 0 }, { a: 3, b: 2, ga: 1, gb: 0 }];
  const key = (r) => r.pairs.map((p) => [p.white, p.black].sort().join("-")).sort();
  const off = swissPairings(players, games, [], [], { repeatFloats: false });
  const on = swissPairings(players, games);
  assert.deepEqual(off.repeats, { down: 1, up: 0 });
  assert.deepEqual(key(off), ["0-4", "1-2", "3-5"]);
  // With the rule A meets F (level); B floats up again instead, which FIDE ranks below a repeat downfloat.
  assert.deepEqual(on.repeats, { down: 0, up: 1 });
  assert.deepEqual(key(on), ["0-5", "1-3", "2-4"]);
  assert.equal(on.floaters, off.floaters);
});

test("matching: repeat floats: every round is within the Dutch-order slack of the fewest weighted repeat floats among rounds equal on the higher tiers", () => {
  const W = { rd1: 488, ru1: 244, rd2: 122, ru2: 61 };
  for (let s = 0; s < 24; s++) {
    const n = 6 + (s % 5);
    const { players, states } = simulate(swissPairings, n, 5, 300 + s);
    for (const { games, byes } of states) {
      const table = new Map(swissStandings(players, games, byes).map((r) => [r.index, r]));
      const { history, rounds } = floatHistory(players, games, byes);
      const ago = (i, k) => history.get(i)?.[rounds - k] ?? null;
      const met = new Set(games.flatMap((g) => [`${g.a}|${g.b}`, `${g.b}|${g.a}`]));
      const half = (i) => Math.round(table.get(i).score * 2);
      const claim = (i) => colourClaim(table.get(i));
      // Higher tiers (absolute, squared score gap, strong, mild) and weighted repeat floats of a round.
      const cost = (pairs, bye) => {
        let tiers = [0, 0, 0, 0];
        let f = 0;
        for (const [x, y] of pairs) {
          const cx = claim(x), cy = claim(y);
          if (cx.colour && cx.colour === cy.colour) tiers[[0, 3, 2, 1][Math.min(cx.strength, cy.strength)]]++;
          const d = Math.abs(half(x) - half(y));
          tiers[1] += d * d * 1000;
          if (d) {
            const [dn, up] = half(x) > half(y) ? [x, y] : [y, x];
            if (ago(dn, 1) === "down") f += W.rd1; if (ago(dn, 2) === "down") f += W.rd2;
            if (ago(up, 1) === "up") f += W.ru1; if (ago(up, 2) === "up") f += W.ru2;
          }
        }
        if (bye !== null) {
          tiers[1] += half(bye) ** 2 * 1000;
          if (ago(bye, 1) === "down") f += W.rd1; if (ago(bye, 2) === "down") f += W.rd2;
        }
        return { tiers: tiers.join(","), f };
      };
      const all = [];
      const fewestByes = Math.min(...players.map((_, i) => table.get(i).byes));
      const rec = (left, acc, bye) => {
        if (!left.length) { all.push(cost(acc, bye)); return; }
        if (left.length % 2 === 1 && bye === null) {
          for (const b of left) if (table.get(b).byes === fewestByes) rec(left.filter((q) => q !== b), acc, b);
          return;
        }
        const [x, ...rest] = left;
        for (const y of rest) if (!met.has(`${x}|${y}`)) rec(rest.filter((q) => q !== y), [...acc, [x, y]], bye);
      };
      rec(players.map((_, i) => i), [], null);
      const round = swissPairings(players, games, byes, [], { lookahead: false, pairing: "matching" });
      const chosen = cost(round.pairs.map((p) => [p.white, p.black]), round.bye);
      const same = all.filter((c) => c.tiers === chosen.tiers);
      const best = Math.min(...same.map((c) => c.f));
      assert.ok(chosen.f <= best + 60 * Math.ceil(n / 2), `n=${n} seed=${s}: chosen ${chosen.f}, best ${best}`);
    }
  }
});

test("Dutch order: round 1 of a 104-player field pairs seed i with seed i + 52 on every board", () => {
  // Real events (eval/swiss-vs-published.md): weights that tie for neighbouring rows of S1 swapped
  // partners on adjacent boards; w_i = h - i keeps the pairing exactly in order.
  const P = Array.from({ length: 104 }, (_, i) => `P${i + 1}`);
  const r = swissPairings(P, [], []);
  assert.equal(r.pairs.length, 52);
  for (const p of r.pairs) assert.equal(Math.abs(p.white - p.black), 52);
});

test("Dutch order: an S1 player meets S2, not another S1 player, when a transposition gives the colours", () => {
  // 8 players on 1 point after round 1 (the winners), 8 on 0. In the 1-point group the top half is
  // seeds 1, 3, 5, 7 and the bottom half 9, 11, 13, 15. The old order cost let S1 meet S1 nearly free.
  const P = Array.from({ length: 16 }, (_, i) => `P${i + 1}`);
  const games = [];
  for (let i = 0; i < 8; i++) games.push(i % 2 === 0 ? { a: 2 * i, b: 2 * i + 1, ga: 1, gb: 0 } : { a: 2 * i + 1, b: 2 * i, ga: 0, gb: 1 });
  const r = swissPairings(P, games, [], [], { groupOrder: "seed" });
  const top = new Set([0, 2, 4, 6]);
  const winners = new Set([0, 2, 4, 6, 8, 10, 12, 14]);
  for (const p of r.pairs) {
    if (!winners.has(p.white) || !winners.has(p.black)) continue;
    assert.ok(top.has(p.white) !== top.has(p.black), `${P[p.white]} v ${P[p.black]} pairs two of the same half`);
  }
});

// Bracket-by-bracket pairing (pairing: "bracket", eval/swiss-bracket-dutch.md).
const bracket = (players, games, byes) => swissPairings(players, games, byes, [], { pairing: "bracket", groupOrder: "seed" });
const boards = (r) => r.pairs.map((p) => [p.white, p.black].sort((a, b) => a - b).join("-")).sort();

test("bracket: round 2 pairs each score group S1 against S2, colours before order", () => {
  const players = ["1", "2", "3", "4", "5", "6", "7", "8"];
  // Round 1 (1-5, 6-2, 3-7, 8-4): the top half all win.
  const games = [{ a: 0, b: 4, ga: 1, gb: 0 }, { a: 5, b: 1, ga: 0, gb: 1 }, { a: 2, b: 6, ga: 1, gb: 0 }, { a: 7, b: 3, ga: 0, gb: 1 }];
  const r = bracket(players, games, []);
  assert.equal(r.method, "bracket");
  // 1 v 3 and 2 v 4 would both repeat white for 1 and 3: a colour preference outranks the order (C12).
  assert.deepEqual(boards(r), ["0-3", "1-2", "4-7", "5-6"]);
});

test("bracket: the lowest player of an odd group floats down and meets the top of the next group", () => {
  const players = ["1", "2", "3", "4", "5", "6", "7", "8"];
  // Round 1: 1, 2, 3 win; 4 and 8 draw. Groups: {1,2,3} on 1, {4,8} on 0.5, {5,6,7} on 0.
  const games = [{ a: 0, b: 4, ga: 1, gb: 0 }, { a: 5, b: 1, ga: 0, gb: 1 }, { a: 2, b: 6, ga: 1, gb: 0 }, { a: 7, b: 3, ga: 1, gb: 1 }];
  const r = bracket(players, games, []);
  // 1 v 2; 3 floats to the 0.5 group and meets its top resident, 4; 8 floats on and meets 5; 6 v 7.
  assert.deepEqual(boards(r), ["0-1", "2-3", "4-7", "5-6"]);
  assert.equal(r.floaters, 2);
});

test("bracket: whole simulated events stay valid (no rematch, one bye each, absolute colours kept)", () => {
  for (const [n, rounds, seed] of [[7, 5, 1], [12, 6, 2], [23, 7, 3], [40, 8, 4], [9, 7, 5]]) {
    const { states } = simulate((p, g, b) => bracket(p, g, b), n, rounds, seed);
    assert.equal(states.length, rounds);
  }
});

test("exchangeFor: FIDE C.04.3 4.3 exchange order (fewest moved, smallest BSN-sum difference, highest S1 BSN out)", () => {
  // Six players in BSN order 1..6, S1 = {1, 2, 3}. Player 1 has met all of S2, so one exchange is
  // needed. The smallest exchange swaps 3 and 4 (difference 1): S1 = {1, 2, 4}, S2 = {3, 5, 6},
  // whose first transposition is 1-3, 2-5, 4-6 (the older boundary rule gave 1-3, 2-4, 5-6).
  const met = new Set(["1|4", "1|5", "1|6"]);
  const allowed = (x, y) => !met.has(`${x}|${y}`) && !met.has(`${y}|${x}`);
  const ex = exchangeFor([1, 2, 3, 4, 5, 6], { allowed, qOf: () => 0, qMax: 1 });
  assert.deepEqual(ex, { s1: [1, 2, 4], s2: [3, 5, 6] });
  // (b): with 1-3 also met, 3<->4 cannot work and 2<->4 (difference 2) is next.
  met.add("1|3");
  assert.deepEqual(exchangeFor([1, 2, 3, 4, 5, 6], { allowed, qOf: () => 0, qMax: 1 }), { s1: [1, 3, 4], s2: [2, 5, 6] });
  // (c): 1 and 2 have both met 5 and 6, so 3<->4 fails; 2<->4 and 3<->5 both work at difference 2,
  // and the rule moves the higher S1 BSN, 3.
  const met3 = new Set(["1|5", "1|6", "2|5", "2|6"]);
  const allowed3 = (x, y) => !met3.has(`${x}|${y}`) && !met3.has(`${y}|${x}`);
  assert.deepEqual(exchangeFor([1, 2, 3, 4, 5, 6], { allowed: allowed3, qOf: () => 0, qMax: 1 }), { s1: [1, 2, 5], s2: [3, 4, 6] });
  // No exchange needed: null (the caller pairs S1 against S2 as before).
  assert.deepEqual(exchangeFor([1, 2, 3, 4], { allowed: () => true, qOf: () => 0, qMax: 1 }), { s1: [1, 2], s2: [3, 4], none: true });
});

// Colour criteria as bracketMate's stage B builds them: [absolute, strong, mild, down1, up1, down2, up2].
const floatCtx = ({ wants, met = [], downLast = [] }) => {
  const metS = new Set(met.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  return {
    allowed: (x, y) => !metS.has(`${x}|${y}`),
    crit: (x, y) => [0, 0, wants[x] === wants[y] ? 1 : 0, 0, 0, 0, 0],
    fa: (x, k) => (k === 1 && downLast.includes(x) ? "down" : null),
  };
};

test("dutchFloaters: the last S2 player floats when every candidate is as good (Graz 2026 round 9, the 7-point bracket)", () => {
  // Three players on 7 points, all due white, none floated lately: S1 = {7}, S2 = {11, 21}.
  // The arbiters' program paired 7-11 and floated 21; stage A had floated 11 for a better colour
  // fit with its partner in the next bracket, which the Dutch rules do not weigh.
  const ctx = floatCtx({ wants: { 7: "W", 11: "W", 21: "W" } });
  assert.deepEqual(dutchFloaters([7, 11], [21], { ...ctx, order: [7, 11, 21] }), [21]);
  assert.deepEqual(dutchFloaters([7, 21], [11], { ...ctx, order: [7, 11, 21] }), [21]);
  // 21 floated down last round: 21 stays, 11 floats (C.14 before Dutch order).
  const ctx2 = floatCtx({ wants: { 7: "W", 11: "W", 21: "W" }, downLast: [21] });
  assert.deepEqual(dutchFloaters([7, 11], [21], { ...ctx2, order: [7, 11, 21] }), [11]);
});

test("dutchFloaters: an exchange is tried in article 4.3 order before an S1 player floats (chesshouse 2026 round 9, 6 points)", () => {
  // Five players, S1 = {6, 12}, S2 = {13, 17, 25}. 6 and 13 have met; 25 floated down last round;
  // 13 is due black, the rest white. Best value: one shared colour, no repeat float. Two
  // one-exchange candidates reach it, both with S1' = {6, 13}: 6-12 13-25 (17 floats) and 6-17
  // 13-25 (12 floats); S2' = {12, 17, 25} in order gives 6-12 first, as published.
  const ctx = floatCtx({ wants: { 6: "W", 12: "W", 13: "B", 17: "W", 25: "W" }, met: [[6, 13]], downLast: [25] });
  assert.deepEqual(dutchFloaters([6, 12, 13, 25], [17], { ...ctx, order: [6, 12, 13, 17, 25] }), [17]);
});

test("mdpFloaters: the MDP takes the earliest resident first, even when that changes who floats (Budapest A 2026 round 8)", () => {
  // MDP 25 and residents 1, 2, 9 are due black; 4, 18, 22 white. 1 has met 18 and 22, 9 has met 18.
  // Stage A's floater was 9 (1-4, 25-18); the Dutch order pairs 25-4 first, so 1 floats.
  const due = new Map([[25, "B"], [1, "B"], [2, "B"], [9, "B"], [4, "W"], [18, "W"], [22, "W"]]);
  const met = new Set(["1-18", "1-22", "9-18"]);
  const allowed = (x, y) => !met.has(`${Math.min(x, y)}-${Math.max(x, y)}`);
  const crit = (x, y) => [0, 0, due.get(x) === due.get(y) ? 1 : 0, 0, 0, 0, 0];
  const opts = { allowed, crit, fa: () => null, order: [25, 1, 2, 4, 9, 18, 22] };
  assert.deepEqual(mdpFloaters([25], [1, 2, 4, 9, 18, 22], 1, opts), [1]);
  // Without the rematches the MDP still takes 4, and the remainder's own order decides later.
  met.clear();
  assert.equal(mdpFloaters([25], [1, 2, 4, 9, 18, 22], 1, opts).length, 1);
});

test("lexRadix keeps all seven criteria in a 51-player bracket (C.16 was dropped)", async () => {
  const { lexRadix } = await import("./swiss.mjs");
  const U = Array.from({ length: 51 }, (_, i) => i + 1);
  // Colour clashes possible on every board; two players floated down two rounds ago.
  const crit = (x, y) => [0, 0, (x + y) % 2, 0, 0, 0, 0];
  const fv = (x) => [0, 0, 0, 0, 0, x === 50 || x === 51 ? 1 : 0, 0];
  const XR = 27, RB = U.length + 2;
  const { q, qM } = lexRadix(U, 26, XR * RB * (U.length + 1), { allowed: () => true, crit, floatVec: fv });
  assert.ok(q(fv(51)) > 0, "C.16 still has a digit");
  // One more mild clash outweighs every C.16 count a matching can reach.
  assert.ok(q([0, 0, 1, 0, 0, 0, 0]) > q([0, 0, 0, 0, 0, 2, 0]));
  assert.ok(qM * XR * RB * (U.length + 1) <= 2 ** 50);
  // The old radix (players + 1 per digit) had room for only 5 digits here.
  let nc = 7;
  while (nc > 1 && 52 ** nc * XR * RB * 52 > 2 ** 50) nc--;
  assert.equal(nc, 5);
});

test("initial colour (FIDE C.04.3 E.5): round 1 alternates from the drawn colour; 'B' gives the top seed black", () => {
  const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const w = swissPairings(players, [], [], [], { groupOrder: "seed" });
  const b = swissPairings(players, [], [], [], { groupOrder: "seed", initialColour: "B" });
  assert.deepEqual(w.pairs.map((p) => [p.white, p.black]), [[0, 4], [5, 1], [2, 6], [7, 3]]);
  assert.deepEqual(b.pairs.map((p) => [p.white, p.black]), w.pairs.map((p) => [p.black, p.white]));
  assert.throws(() => swissPairings(players, [], [], [], { initialColour: "white" }), /initialColour/);
});

test("initial colour: two players with no colour claim later on follow E.5 by the higher one's pairing number", () => {
  // Round 1: only P1 v P2 played; P3-P6 sat out (zero byes), so in round 2 they have no claim.
  const players = ["P1", "P2", "P3", "P4", "P5", "P6"];
  const games = [{ a: 0, b: 1, ga: 1, gb: 0 }];
  const byes = [];
  const opts = { groupOrder: "seed", extra: null, absent: [] };
  for (const initialColour of ["W", "B"]) {
    const round = swissPairings(players, games, byes, [], { ...opts, initialColour });
    const claimless = round.pairs.filter((p) => p.white >= 2 && p.black >= 2);
    assert.ok(claimless.length >= 1);
    for (const p of claimless) {
      const hi = Math.min(p.white, p.black);
      const hiWhite = (hi % 2 === 0) === (initialColour === "W"); // index even = odd pairing number
      assert.equal(p.white === hi, hiWhite, `${initialColour}: board ${players[p.white]}-${players[p.black]}`);
    }
  }
});
