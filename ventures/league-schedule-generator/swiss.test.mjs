import test from "node:test";
import assert from "node:assert/strict";
import { swissPairings, swissPairingsGreedy, swissStandings, colourClaim } from "./swiss.mjs";
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
  assert.equal(r.method, "matching");
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

test("each round is optimal: no rematch-free round has fewer absolute clashes, or as few and a smaller squared score gap (exhaustive, 6-10 players)", () => {
  let checked = 0;
  for (let s = 0; s < 24; s++) {
    const n = 6 + (s % 5);
    const { players, states } = simulate(swissPairings, n, 4, 100 + s);
    for (const { games, byes } of states) {
      // lookahead off: with it on, a round may give up a little to keep the next round possible
      const round = swissPairings(players, games, byes, [], { lookahead: false });
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
