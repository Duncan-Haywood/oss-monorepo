import test from "node:test";
import assert from "node:assert/strict";
import { parseTrf, trfToResults, swissToTrf, pairingsList, trfNames } from "./trf.mjs";
import { parseSwissResults, swissPairings, swissStandings, validateSwiss } from "./calc.mjs";

// The two FIDE 2025 Dutch-rules examples (criteria C5 and C9) as bbpPairings's test suite encodes
// them (github.com/BieremaBoyzProgramming/bbpPairings, test/tests/dutch_2025_C5 and _C9,
// Apache-2.0), with the pairings bbpPairings must produce.
const pl = (id, rating, pts, rounds) => `001 ${String(id).padStart(4)}      Test${String(id).padStart(4, "0")} Player${String(id).padStart(4, "0")}               ${rating}                            ${pts.toFixed(1).padStart(4)} ${String(id).padStart(4)}${rounds}`;
const C5 = ["012 Dutch 2025 C5 test",
  pl(1, 2720, 2, "     4 w 1     2 b 1"), pl(2, 2701, 1, "     5 b 1     1 w 0"), pl(3, 2697, 2, "     6 w 1     4 b 1"),
  pl(4, 2689, 0, "     1 b 0     3 w 0  0000 - Z"), pl(5, 2673, 1, "     2 w 0     6 b 1"), pl(6, 2664, 0, "     3 b 0     5 w 0"), "XXR 3"].join("\n");
const C9 = ["012 Dutch 2025 C9 test",
  pl(1, 2720, 1, "     3 w 1"), pl(2, 2701, 1, "     4 b 1"), pl(3, 2697, 0, "     1 b 0"), pl(4, 2689, 0, "     2 w 0"), pl(5, 2673, 0, "  0000 - Z"), "XXR 3"].join("\n");

function pairTrf(text, opts = {}) {
  const box = trfToResults(parseTrf(text));
  const p = parseSwissResults(box.results, box.players);
  assert.deepEqual(p.errors, []);
  const round = swissPairings(box.players, p.games, p.byes, p.withdrawn, { ...p, groupOrder: "seed", ...opts });
  assert.deepEqual(validateSwiss(box.players, p.games, p.byes, round, [...p.withdrawn, ...p.absent]).filter((x) => !/already had a bye/.test(x)), []);
  return { box, p, round };
}

test("parseTrf reads the fixed columns: start rank, name, rating, points and each round's block", () => {
  const t = parseTrf(C5);
  assert.deepEqual(t.errors, []);
  assert.equal(t.name, "Dutch 2025 C5 test");
  assert.equal(t.totalRounds, 3);
  assert.equal(t.players.length, 6);
  assert.deepEqual([t.players[0].name, t.players[0].rating, t.players[0].points], ["Test0001 Player0001", 2720, 2]);
  assert.deepEqual(t.players[3].rounds, [{ opponent: 0, colour: "B", result: "0" }, { opponent: 2, colour: "W", result: "0" }, { opponent: null, colour: null, result: "Z" }]);
});

test("FIDE 2025 C5 example: an absence entered for round 3 takes the player out, pairs as bbpPairings", () => {
  const { p, round } = pairTrf(C5);
  assert.equal(p.rounds, 2);
  assert.deepEqual(p.absent, [3]);
  assert.equal(pairingsList(round), "3\n1 5\n3 2\n6 0\n");
});

test("FIDE 2025 C9 example: the bye goes to the lowest player with no unplayed game, as bbpPairings", () => {
  const { p, round } = pairTrf(C9);
  assert.deepEqual(p.unplayed, [0, 0, 0, 0, 1]);
  assert.equal(pairingsList(round), "3\n2 1\n3 5\n4 0\n");
  // Without the unplayed-games rule the bye would fall to the bottom seed, who already missed round 1.
  const plain = pairTrf(C9, { unplayed: null }).round;
  assert.equal(plain.bye, 4);
});

test("forfeits: no colour, the two may meet again, and the winner cannot then take the pairing bye", () => {
  const P = ["A", "B", "C", "D", "E"];
  const p = parseSwissResults("A 1 - 0 B\nD forfeits to C\nE bye", P);
  assert.deepEqual(p.errors, []);
  assert.equal(p.games.length, 1);
  assert.deepEqual(p.byeBlocked, [2]);
  assert.equal(swissStandings(P, p.games, p.byes, { extra: p.extra }).find((r) => r.name === "C").score, 1);
  assert.equal(swissStandings(P, p.games, p.byes, { extra: p.extra }).find((r) => r.name === "C").whites, 0);
  // "w/o" is read the same way.
  assert.deepEqual(parseSwissResults("C w/o D", P).events.map((e) => e.kind), ["forfeit"]);
  const r = swissPairings(P, p.games, p.byes, p.withdrawn, p);
  assert.notEqual(r.bye, 2);
  assert.notEqual(r.bye, 4);
  // C and D did not play, so they may be paired again.
  const met = new Set(p.games.flatMap((g) => [`${g.a}|${g.b}`, `${g.b}|${g.a}`]));
  assert.ok(!met.has("2|3"));
});

test("requested byes: half and full points; a full-point bye blocks the pairing bye, a half-point one does not", () => {
  const P = ["A", "B", "C", "D", "E"];
  const p = parseSwissResults("A 1 - 0 B\nC 1 - 1 D\nE full bye\nA 0 - 1 C\nB 1 - 0 E\nD half bye", P);
  assert.deepEqual(p.errors, []);
  assert.equal(p.rounds, 2);
  assert.deepEqual(p.extra, [0, 0, 0, 0.5, 1]);
  assert.deepEqual(p.byeBlocked, [4]);
  assert.deepEqual(p.absent, []);
  assert.deepEqual(p.unplayed, [0, 0, 0, 1, 1]);
  const table = swissStandings(P, p.games, p.byes, { extra: p.extra });
  assert.deepEqual(Object.fromEntries(table.map((r) => [r.name, r.score])), { A: 1, B: 1, C: 1.5, D: 1, E: 1 });
});

test("a half-point bye written a round ahead takes that player out of the next round only", () => {
  const P = ["A", "B", "C", "D", "E"];
  const p = parseSwissResults("A 1 - 0 B\nC 1 - 0 D\nE bye\nD half bye", P);
  assert.deepEqual(p.absent, [3]);
  assert.deepEqual(p.extra, [0, 0, 0, 0, 0]);
  const r = swissPairings(P, p.games, p.byes, p.withdrawn, p);
  assert.ok(!r.pairs.some((x) => x.white === 3 || x.black === 3));
  assert.equal(r.bye, null);
  assert.equal(r.pairs.length, 2);
});

test("round trip: page results -> TRF -> page results keep every score, unplayed round and the next pairing", () => {
  const P = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus"];
  const text = [
    "Ana 1 - 0 Dee", "Eli 0 - 1 Ben", "Cy 1 - 1 Fay", "Gus bye",
    "Ben 1 - 1 Ana", "Fay forfeits to Gus", "Dee 1 - 0 Cy", "Eli half bye",
    "Ana 1 - 0 Gus", "Cy 0 - 1 Ben", "Dee 1 - 0 Eli", "Fay absent",
  ].join("\n");
  const p = parseSwissResults(text, P);
  assert.deepEqual(p.errors, []);
  const trf = swissToTrf(P, p, { name: "Club Swiss", totalRounds: 5 });
  assert.match(trf, /^012 Club Swiss\n001    1      Ana /);
  assert.match(trf, /\nXXR 5\n$/);
  const back = parseTrf(trf);
  assert.deepEqual(back.errors, []);
  const box = trfToResults(back);
  assert.deepEqual(box.errors, []);
  assert.deepEqual(box.players, P);
  const q = parseSwissResults(box.results, box.players);
  assert.deepEqual(q.errors, []);
  const scores = (x) => swissStandings(P, x.games, x.byes, { extra: x.extra }).map((r) => [r.name, r.score, r.buchholz]);
  assert.deepEqual(scores(q), scores(p));
  assert.deepEqual(q.unplayed, p.unplayed);
  assert.deepEqual(q.byeBlocked.sort(), p.byeBlocked.sort());
  for (const row of back.players) assert.equal(row.points, swissStandings(P, p.games, p.byes, { extra: p.extra }).find((r) => r.index === row.id - 1).score);
  const a = swissPairings(P, p.games, p.byes, p.withdrawn, p);
  const b = swissPairings(P, q.games, q.byes, q.withdrawn, q);
  assert.equal(pairingsList(a), pairingsList(b));
});

test("trfNames keeps names the results box can read back", () => {
  assert.deepEqual(trfNames([{ id: 1, name: "Smith, Jo" }, { id: 2, name: "Smith, Jo" }, { id: 3, name: "Walk Out" }, { id: 4, name: "Lee  Bye" }]),
    ["Smith, Jo", "Smith, Jo (2)", "Walk Out (3)", "Lee Bye (4)"]);
});

test("parseTrf names a bad round block and a missing opponent line", () => {
  const t = parseTrf([pl(1, 2000, 1, "     9 w 1"), pl(2, 2000, 0, "     1 x 1")].join("\n"));
  assert.ok(t.errors.some((e) => /round 1 reads/.test(e)));
  assert.ok(t.errors.some((e) => /start rank 9/.test(e)));
});
