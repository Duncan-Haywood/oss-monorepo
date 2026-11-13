import { test } from "node:test";
import assert from "node:assert/strict";
import { gamesFromSwiss, gamesFromBracket, eloExpected, eloRatings, glicko2Update, glickoVolatility, glickoRatings, ratingsCsv, GLICKO_DEFAULTS } from "./ratings.mjs";
import { parsePlayers, buildBracket, resolveBracket, seedPlayers, pairSwissRound, parseState, serializeState, BYE } from "./calc.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} vs ${b}`);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("Glicko-2 reproduces the worked example in Glickman's 'Example of the Glicko-2 system'", () => {
  // Player 1500 / RD 200 / volatility 0.06, tau 0.5, beats 1400/30, loses to 1550/100 and 1700/300.
  // The paper reports r' = 1464.06, RD' = 151.52, sigma' = 0.05999.
  const out = glicko2Update({ rating: 1500, rd: 200, vol: 0.06 }, [{ rating: 1400, rd: 30 }, { rating: 1550, rd: 100 }, { rating: 1700, rd: 300 }], [1, 0, 0], 0.5);
  close(out.rating, 1464.06, 0.01, "rating");
  close(out.rd, 151.52, 0.01, "RD");
  close(out.vol, 0.05999, 0.00001, "volatility");
});

// Step 5 solved a second way: plain bisection on the same f, with a bracket found by doubling.
function bisectVolatility(phi, sigma, delta, v, tau) {
  const a = Math.log(sigma * sigma);
  const f = (x) => { const ex = Math.exp(x); return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau); };
  let lo = a - 1, hi = a + 1;
  while (f(lo) < 0) lo -= 1;
  while (f(hi) > 0) hi += 1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 4);
}

test("the Illinois volatility search agrees with bisection on 2,000 random players", () => {
  const r = rng(7);
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const me = { rating: 1000 + r() * 1600, rd: 30 + r() * 320, vol: 0.03 + r() * 0.1 };
    const n = 1 + Math.floor(r() * 9);
    const opps = Array.from({ length: n }, () => ({ rating: 1000 + r() * 1600, rd: 30 + r() * 320 }));
    const scores = opps.map(() => [0, 0.5, 1][Math.floor(r() * 3)]);
    const tau = 0.3 + r() * 0.9;
    const mu = (me.rating - 1500) / 173.7178, phi = me.rd / 173.7178;
    let vInv = 0, sum = 0;
    for (let j = 0; j < n; j++) {
      const pj = opps[j].rd / 173.7178, gj = 1 / Math.sqrt(1 + 3 * pj * pj / Math.PI ** 2);
      const e = 1 / (1 + Math.exp(-gj * (mu - (opps[j].rating - 1500) / 173.7178)));
      vInv += gj * gj * e * (1 - e); sum += gj * (scores[j] - e);
    }
    const v = 1 / vInv;
    const a = glickoVolatility(phi, me.vol, v * sum, v, tau);
    const b = bisectVolatility(phi, me.vol, v * sum, v, tau);
    worst = Math.max(worst, Math.abs(a - b) / b);
    assert.ok(Number.isFinite(glicko2Update(me, opps, scores, tau).rating));
  }
  assert.ok(worst < 1e-5, `worst relative gap ${worst}`);
});

test("Glicko-2: a player with no games keeps the rating and the RD grows by step 6", () => {
  const out = glicko2Update({ rating: 1700, rd: 80, vol: 0.06 }, [], []);
  assert.equal(out.rating, 1700);
  close(out.rd, Math.sqrt(80 ** 2 + (0.06 * 173.7178) ** 2), 1e-9);
  assert.equal(out.vol, 0.06);
});

test("Glicko-2: unrated players start at 1500 / 350 / 0.06 and the row says so", () => {
  const players = [{ id: "a", name: "A", rating: null }, { id: "b", name: "B", rating: 1600, rd: 60 }];
  const rows = glickoRatings(players, [{ a: "a", b: "b", s: 1 }]);
  assert.equal(rows[0].assumed, true);
  assert.equal(rows[0].before, GLICKO_DEFAULTS.rating);
  assert.equal(rows[0].rdBefore, 350);
  assert.ok(rows[0].change > 100, "an upset win from a new player moves a long way");
  assert.ok(rows[1].change < 0 && rows[1].change > -30, "a settled player moves a little");
  assert.ok(rows[1].rdAfter < 70);
  const filled = glickoRatings([{ id: "a", name: "A", rating: null }, { id: "c", name: "C", rating: 1600 }], [{ a: "a", b: "c", s: 0 }], { rd: 90 });
  assert.equal(filled[0].rdBefore, 350, "a new player keeps RD 350");
  assert.equal(filled[1].rdBefore, 90, "a rated player with no RD takes the default given");
});

test("Elo: expected score and K-factor change match the formula by hand", () => {
  close(eloExpected(1600, 1400), 1 / (1 + 10 ** -0.5), 1e-12);
  close(eloExpected(2400, 1400, true), 1 / (1 + 10 ** -1), 1e-12);
  close(eloExpected(2400, 1400, false), 1 / (1 + 10 ** -2.5), 1e-12);
  const players = [{ id: "a", name: "A", rating: 1600 }, { id: "b", name: "B", rating: 1400 }, { id: "c", name: "C", rating: null }];
  const rows = eloRatings(players, [{ a: "a", b: "b", s: 1 }, { a: "a", b: "c", s: 0 }], { k: 20 });
  close(rows[0].change, 20 * (1 - 1 / (1 + 10 ** -0.5)), 1e-9, "A gains");
  close(rows[1].change, -rows[0].change, 1e-9, "zero-sum between two rated players with the same K");
  assert.equal(rows[0].skipped, 1, "the game against an unrated player is not rated");
  assert.equal(rows[2].after, null);
  assert.equal(rows[2].skipped, 1);
});

test("Elo over a random event is zero-sum when every player is rated", () => {
  const r = rng(3);
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, rating: 1200 + Math.round(r() * 900) }));
  const games = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(r() * 12); let b = Math.floor(r() * 11); if (b >= a) b += 1;
    games.push({ a: `p${a}`, b: `p${b}`, s: [0, 0.5, 1][Math.floor(r() * 3)] });
  }
  const rows = eloRatings(players, games, { k: 32, cap400: true });
  close(rows.reduce((t, x) => t + x.change, 0), 0, 1e-9);
});

test("games come from Swiss results (byes and unplayed boards left out) and from bracket matches", () => {
  const rounds = [{ pairings: [{ a: "p1", b: "p2", result: "a" }, { a: "p3", b: "p4", result: "draw" }, { a: "p5", b: "p6", result: null }], byes: ["p7"] }];
  assert.deepEqual(gamesFromSwiss(rounds), [{ a: "p1", b: "p2", s: 1 }, { a: "p3", b: "p4", s: 0.5 }]);
  const { players } = parsePlayers("A, 1800\nB, 1700\nC, 1600\nD, 1500\nE, 1400");
  const b = buildBracket(players.length, { format: "single" });
  const s = seedPlayers(players);
  let res = resolveBracket(b, s, {});
  const results = {};
  for (let guard = 0; guard < 10 && !res.champion; guard++) {
    for (const id of res.ready) results[id] = res.states.get(id).a;
    res = resolveBracket(b, s, results);
  }
  const games = gamesFromBracket(b, res, BYE);
  assert.equal(games.length, players.length - 1, "n - 1 matches decide a single-elimination event");
  assert.ok(games.every((x) => x.a !== BYE && x.b !== BYE && x.s === 1));
});

test("a Swiss event played to the end gives finite ratings for everyone", () => {
  const { players } = parsePlayers(Array.from({ length: 9 }, (_, i) => `P${i}, ${1300 + i * 50}, ${60 + i * 20}`).join("\n"));
  const rounds = [];
  for (let k = 0; k < 4; k++) {
    const p = pairSwissRound(players, rounds, {});
    rounds.push({ pairings: p.pairings.map((x, i) => ({ ...x, result: ["a", "b", "draw"][(k + i) % 3] })), byes: p.byes });
  }
  const games = gamesFromSwiss(rounds);
  for (const row of glickoRatings(players, games)) {
    assert.ok(Number.isFinite(row.after) && Number.isFinite(row.rdAfter) && row.rdAfter > 0, row.name);
  }
  const csv = ratingsCsv(glickoRatings(players, games), "glicko2");
  assert.equal(csv.trim().split("\r\n").length, players.length + 1);
  assert.match(ratingsCsv(eloRatings(players, games, {}), "elo"), /^Player,Rating before/);
});

test("parsePlayers reads an optional RD and volatility, and saved files keep them", () => {
  const { players } = parsePlayers("Ana Souza, 1610, 85\nBen, 1655, 120, 0.07\nCy, 1500\nTeam 7");
  assert.deepEqual(players.map((p) => [p.name, p.rating, p.rd ?? null, p.vol ?? null]), [["Ana Souza", 1610, 85, null], ["Ben", 1655, 120, 0.07], ["Cy", 1500, null, null], ["Team", 7, null, null]]);
  const back = parseState(serializeState({ players, format: "swiss", rounds: [] })).state.players;
  assert.equal(back[1].rd, 120);
  assert.equal(back[1].vol, 0.07);
});
