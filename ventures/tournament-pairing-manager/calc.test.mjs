import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePlayers, seedPlayers, recommendedSwissRounds, swissStandings, pairSwissRound, validateSwiss,
  seedPositions, buildBracket, resolveBracket, pruneResults, bracketText, roundName,
  standingsCsv, pairingsText, serializeState, parseState, sampleFields, BYE,
} from "./calc.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const mk = (n, rated = true) => parsePlayers(Array.from({ length: n }, (_, i) => `Player ${i + 1}${rated ? `, ${2000 - i * 7}` : ""}`).join("\n")).players;

test("parsePlayers reads names, ratings in two styles, and rejects duplicates", () => {
  const { players, errors } = parsePlayers("Ana Souza, 1610\nBen (1655)\n  Cy   Young \nana souza\n\n");
  assert.deepEqual(players.map((p) => [p.name, p.rating]), [["Ana Souza", 1610], ["Ben", 1655], ["Cy Young", null]]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /listed twice/);
});

test("a name that is only digits stays a name", () => {
  const { players } = parsePlayers("2048\nTeam 7");
  assert.equal(players[0].name, "2048");
  assert.equal(players[1].name, "Team");
  assert.equal(players[1].rating, 7);
});

test("seedPlayers orders by rating, then list order", () => {
  const { players } = parsePlayers("A, 1500\nB, 1700\nC\nD, 1700");
  assert.deepEqual(seedPlayers(players).map((p) => p.name), ["B", "D", "A", "C"]);
});

test("recommended Swiss rounds is ceil(log2 n)", () => {
  assert.deepEqual([2, 3, 4, 5, 8, 9, 16, 17, 32].map(recommendedSwissRounds), [1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("round one pairs the top half against the bottom half", () => {
  const players = mk(8);
  const r = pairSwissRound(players, [], { colours: false });
  assert.deepEqual(r.pairings.map((p) => [p.a, p.b]), [["p1", "p5"], ["p2", "p6"], ["p3", "p7"], ["p4", "p8"]]);
});

test("odd field: round one gives the bye to the lowest seed", () => {
  const players = mk(7);
  const r = pairSwissRound(players, []);
  assert.deepEqual(r.byes, ["p7"]);
  assert.equal(r.pairings.length, 3);
});

test("standings: hand-computed scores and tiebreaks for a 4 player event", () => {
  const players = mk(4);
  const rounds = [
    { pairings: [{ a: "p1", b: "p3", result: "a" }, { a: "p2", b: "p4", result: "draw" }], byes: [] },
    { pairings: [{ a: "p1", b: "p2", result: "draw" }, { a: "p3", b: "p4", result: "a" }], byes: [] },
  ];
  const s = Object.fromEntries(swissStandings(players, rounds).map((r) => [r.id, r]));
  assert.equal(s.p1.score, 1.5);
  assert.equal(s.p2.score, 1);
  assert.equal(s.p3.score, 1);
  assert.equal(s.p4.score, 0.5);
  // p1 met p3 (1) and p2 (1): Buchholz 2, cut-1 1, SB = 1*1 + 0.5*1 = 1.5
  assert.equal(s.p1.buchholz, 2);
  assert.equal(s.p1.buchholzCut1, 1);
  assert.equal(s.p1.sonnebornBerger, 1.5);
  assert.equal(s.p1.rank, 1);
});

test("players level on every tiebreak share a rank and are flagged tied", () => {
  const players = mk(2);
  const rounds = [{ pairings: [{ a: "p1", b: "p2", result: "draw" }], byes: [] }];
  const s = swissStandings(players, rounds);
  assert.deepEqual(s.map((r) => r.rank), [1, 1]);
  assert.ok(s.every((r) => r.tied));
});

test("byes score the configured points and do not count as opponents", () => {
  const players = mk(3);
  const rounds = [{ pairings: [{ a: "p1", b: "p2", result: "a" }], byes: ["p3"] }];
  const s = Object.fromEntries(swissStandings(players, rounds, { bye: 1 }).map((r) => [r.id, r]));
  assert.equal(s.p3.score, 1);
  assert.equal(s.p3.byes, 1);
  assert.equal(s.p3.opps.length, 0);
  const s2 = Object.fromEntries(swissStandings(players, rounds, { bye: 0.5 }).map((r) => [r.id, r]));
  assert.equal(s2.p3.score, 0.5);
});

test("a 3-1-0 scoring scheme is honoured", () => {
  const players = mk(2);
  const rounds = [{ pairings: [{ a: "p1", b: "p2", result: "draw" }], byes: [] }];
  const s = swissStandings(players, rounds, { win: 3, draw: 1 });
  assert.deepEqual(s.map((r) => r.score), [1, 1]);
});

// Full random events: no rematches, one game per player per round, bye fairness.
for (const n of [4, 5, 6, 7, 8, 9, 11, 12, 15, 16, 17, 24, 31, 32]) {
  test(`Swiss event with ${n} players: ${recommendedSwissRounds(n) + 1} rounds, no rematches, byes spread`, () => {
    const players = mk(n);
    const rand = rng(n * 7919);
    const rounds = [];
    const total = Math.min(n - 1, recommendedSwissRounds(n) + 1);
    for (let r = 0; r < total; r++) {
      const p = pairSwissRound(players, rounds, { colours: r % 2 === 0 });
      assert.deepEqual(p.notes, [], `round ${r + 1}: ${p.notes}`);
      assert.equal(p.pairings.length * 2 + p.byes.length, n);
      rounds.push({
        pairings: p.pairings.map((x) => {
          const u = rand();
          return { ...x, result: u < 0.15 ? "draw" : u < 0.6 ? "a" : "b" };
        }),
        byes: p.byes,
      });
    }
    const v = validateSwiss(players, rounds);
    assert.ok(v.ok, v.errors.join("; "));
    for (const c of v.byes.values()) assert.equal(c, 1);
  });
}

test("score groups stay tight: after strict-seed results the leaders meet", () => {
  const players = mk(8);
  const rounds = [];
  for (let r = 0; r < 3; r++) {
    const p = pairSwissRound(players, rounds, {});
    const num = (id) => Number(id.slice(1));
    rounds.push({ pairings: p.pairings.map((x) => ({ ...x, result: num(x.a) < num(x.b) ? "a" : "b" })), byes: [] });
  }
  const s = swissStandings(players, rounds);
  assert.equal(s[0].id, "p1");
  assert.equal(s[0].score, 3);
  assert.ok(s.slice(1).every((x) => x.score < 3));
  const last = rounds[2].pairings.find((x) => x.a === "p1" || x.b === "p1");
  const opp = last.a === "p1" ? last.b : last.a;
  const before = swissStandings(players, rounds.slice(0, 2)).find((x) => x.id === opp);
  assert.equal(before.score, 2);
});

test("withdrawn players are skipped", () => {
  const players = mk(6);
  const r = pairSwissRound(players, [], { withdrawn: ["p6", "p5"] });
  const ids = new Set(r.pairings.flatMap((p) => [p.a, p.b]));
  assert.ok(!ids.has("p6") && !ids.has("p5"));
  assert.equal(r.pairings.length, 2);
});

test("colour mode: nobody gets three of the same colour in a row over a 6 round event", () => {
  const players = mk(16);
  const rand = rng(99);
  const rounds = [];
  for (let r = 0; r < 6; r++) {
    const p = pairSwissRound(players, rounds, { colours: true });
    rounds.push({ pairings: p.pairings.map((x) => ({ ...x, result: rand() < 0.5 ? "a" : "b" })), byes: p.byes });
  }
  for (const pl of players) {
    const seq = rounds.map((r) => { const g = r.pairings.find((x) => x.a === pl.id || x.b === pl.id); return g ? (g.a === pl.id ? "W" : "B") : null; }).filter(Boolean).join("");
    assert.doesNotMatch(seq, /WWW|BBB/, `${pl.id}: ${seq}`);
  }
});

test("when every opponent has been met, a rematch is reported, not hidden", () => {
  const players = mk(4);
  const rounds = [];
  for (let r = 0; r < 3; r++) {
    const p = pairSwissRound(players, rounds, {});
    rounds.push({ pairings: p.pairings.map((x) => ({ ...x, result: "draw" })), byes: [] });
  }
  const p4 = pairSwissRound(players, rounds, {});
  assert.ok(p4.notes.some((n) => /rematch/i.test(n)));
});

// ---------- brackets ----------

test("standard seed positions", () => {
  assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.equal(seedPositions(16).length, 16);
});

test("single elimination: match count, byes for top seeds, round names", () => {
  const b = buildBracket(6);
  assert.equal(b.size, 8);
  assert.equal(b.matches.length, 7);
  const seeded = seedPlayers(mk(6));
  const res = resolveBracket(b, seeded, {});
  const byes = b.matches.filter((m) => res.states.get(m.id).status === "bye");
  assert.equal(byes.length, 2);
  assert.deepEqual(byes.map((m) => res.states.get(m.id).winner).sort(), ["p1", "p2"]);
  assert.equal(roundName(b, b.matches[0]), "Quarterfinal");
  assert.equal(roundName(b, b.matches[b.matches.length - 1]), "Final");
});

test("single elimination with 2 players is one match; 1 player throws", () => {
  assert.equal(buildBracket(2).matches.length, 1);
  assert.throws(() => buildBracket(1));
  assert.throws(() => buildBracket(2, { format: "double" }));
});

function playOut(b, seeded, rand, preferHigherSeed = false) {
  const results = {};
  for (let guard = 0; guard < 200; guard++) {
    const res = resolveBracket(b, seeded, results);
    if (!res.ready.length) return { results, res };
    for (const id of res.ready) {
      const s = res.states.get(id);
      const num = (p) => Number(p.slice(1));
      results[id] = preferHigherSeed ? (num(s.a) < num(s.b) ? s.a : s.b) : rand() < 0.5 ? s.a : s.b;
    }
  }
  throw new Error("bracket never finished");
}

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 16, 17, 25, 32]) {
  test(`single elimination with ${n} players plays n-1 matches and crowns one champion`, () => {
    const seeded = seedPlayers(mk(n));
    const b = buildBracket(n);
    const { results, res } = playOut(b, seeded, rng(n));
    assert.equal(Object.keys(results).length, n - 1);
    assert.ok(res.champion);
    assert.equal(res.played, n - 1);
  });
  if (n >= 3) test(`double elimination with ${n} players: everyone out after two losses, one champion`, () => {
    const seeded = seedPlayers(mk(n));
    for (const reset of [true, false]) {
      const b = buildBracket(n, { format: "double", reset });
      for (const seedVal of [1, 2, 3]) {
        const { results, res } = playOut(b, seeded, rng(n * 31 + seedVal));
        assert.ok(res.champion, "champion");
        const losses = new Map(seeded.map((p) => [p.id, 0]));
        for (const [id, w] of Object.entries(results)) {
          const s = res.states.get(id);
          losses.set(s.loser, (losses.get(s.loser) ?? 0) + 1);
          assert.equal(s.winner, w);
        }
        for (const [p, l] of losses) {
          if (p === res.champion) assert.ok(l <= 1, `champion ${p} lost ${l}`);
          else if (!reset && p === res.states.get("GF").loser) assert.ok(l === 1 || l === 2, `GF loser without a reset has ${l} losses`);
          else assert.equal(l, 2, `${p} should have exactly two losses, has ${l}`);
        }
        const real = Object.keys(results).length;
        assert.ok(real === 2 * n - 2 || (reset && real === 2 * n - 1), `${real} matches for ${n}`);
      }
    }
  });
}

test("double elimination: the reset is played only when the losers-bracket player wins the first grand final", () => {
  const seeded = seedPlayers(mk(4));
  const b = buildBracket(4, { format: "double" });
  const num = (p) => Number(p.slice(1));
  const fav = playOut(b, seeded, null, true);
  assert.equal(fav.res.states.get("GF2").status, "skipped");
  assert.equal(fav.res.champion, "p1");
  const results = {};
  for (let g = 0; g < 50; g++) {
    const res = resolveBracket(b, seeded, results);
    if (!res.ready.length) break;
    for (const id of res.ready) {
      const s = res.states.get(id);
      if (id === "GF") results[id] = s.b;
      else if (id === "GF2") results[id] = s.a;
      else results[id] = num(s.a) < num(s.b) ? s.a : s.b;
    }
  }
  const fin = resolveBracket(b, seeded, results);
  assert.equal(fin.states.get("GF2").status, "done");
  assert.equal(fin.champion, results.GF2);
});

test("double elimination, 8 players, favourites win: at most two rematches in the whole bracket", () => {
  const seeded = seedPlayers(mk(8));
  const b = buildBracket(8, { format: "double" });
  const { results, res } = playOut(b, seeded, null, true);
  const pairs = new Set();
  let rematches = 0;
  for (const m of b.matches) {
    const s = res.states.get(m.id);
    if (s.status !== "done" || m.id === "GF" || m.id === "GF2") continue;
    const key = [s.a, s.b].sort().join("|");
    if (pairs.has(key)) rematches++;
    pairs.add(key);
  }
  assert.ok(rematches <= 2, `rematches: ${rematches}`);
  assert.equal(Object.keys(results).length, 14);
});

test("third place playoff exists for single elimination of 4+ players", () => {
  const b = buildBracket(8, { thirdPlace: true });
  assert.equal(b.matches.length, 8);
  const seeded = seedPlayers(mk(8));
  const { res } = playOut(b, seeded, rng(5));
  assert.equal(res.states.get("3RD").status, "done");
});

test("changing an earlier result drops the results that depended on it", () => {
  const seeded = seedPlayers(mk(4));
  const b = buildBracket(4);
  const results = { "W1-1": "p1", "W1-2": "p2", "W2-1": "p1" };
  assert.equal(resolveBracket(b, seeded, results).champion, "p1");
  const changed = { ...results, "W1-1": "p4" };
  const pruned = pruneResults(b, seeded, changed);
  assert.deepEqual(Object.keys(pruned).sort(), ["W1-1", "W1-2"]);
});

test("bracketText lists matches by round and names the champion", () => {
  const seeded = seedPlayers(mk(4));
  const b = buildBracket(4);
  const { results } = playOut(b, seeded, null, true);
  const text = bracketText(b, seeded, results, (id) => seeded.find((p) => p.id === id).name);
  assert.match(text, /SEMIFINAL/);
  assert.match(text, /FINAL/);
  assert.match(text, /CHAMPION: Player 1/);
});

test("a bye never reaches the champion slot", () => {
  const b = buildBracket(3, { format: "double" });
  const seeded = seedPlayers(mk(3));
  const { res } = playOut(b, seeded, rng(1));
  assert.notEqual(res.champion, BYE);
});

// ---------- exports ----------

test("standings CSV quotes names with commas and has a header", () => {
  const players = [{ id: "p1", name: "Smith, John", rating: null, order: 0 }, { id: "p2", name: "Doe", rating: null, order: 1 }];
  const csv = standingsCsv(swissStandings(players, []));
  assert.match(csv, /^Rank,Player,Rating,/);
  assert.match(csv, /"Smith, John"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("pairings text shows boards, colours, results and byes", () => {
  const players = mk(3);
  const round = { pairings: [{ a: "p1", b: "p2", result: "draw" }], byes: ["p3"] };
  const t = pairingsText(players, round, 2, true);
  assert.match(t, /Round 2/);
  assert.match(t, /Board 1: Player 1 \(W\) v Player 2 \(B\)  1\/2-1\/2/);
  assert.match(t, /Bye: Player 3/);
});

test("saved state round-trips and rejects other files", () => {
  const { players } = parsePlayers(sampleFields().players);
  const text = serializeState({ players, rounds: [], results: {} });
  const back = parseState(text);
  assert.equal(back.state.players.length, 8);
  assert.ok(parseState("{}").error);
  assert.ok(parseState("not json").error);
  assert.ok(parseState(JSON.stringify({ app: "tournament-pairing-manager", version: 1, players: [{ id: 1 }] })).error);
});
