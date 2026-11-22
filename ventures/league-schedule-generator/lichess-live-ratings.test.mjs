import { test } from "node:test";
import assert from "node:assert/strict";
import { ratingsBefore, reseed } from "./eval/lichess-live-ratings.mjs";

const trf = {
  name: "t", totalRounds: 1,
  players: [
    { id: 1, name: "A", rating: 1600, rounds: [{ opponent: 1, colour: "W", result: "1" }] },
    { id: 2, name: "B", rating: 1590, rounds: [{ opponent: 0, colour: "B", result: "0" }] },
    { id: 3, name: "C", rating: 1500, rounds: [null] },
  ],
};

test("K = 0 keeps the file's ratings; a win is backed out downward, a loss upward", () => {
  assert.deepEqual(ratingsBefore(trf, 1, 0), [1600, 1590, 1500]);
  const r = ratingsBefore(trf, 1, 20);
  assert.ok(r[0] < 1600 && r[1] > 1590 && r[2] === 1500);
  assert.ok(r[1] > r[0], "B was the higher-rated player before the game");
});

test("reseed re-numbers by rating and keeps every pairing", () => {
  const { trf: t, oldId } = reseed(trf, ratingsBefore(trf, 1, 20));
  assert.deepEqual(t.players.map((p) => p.name), ["B", "A", "C"]);
  assert.equal(t.players[0].rounds[0].opponent, 1);
  assert.equal(t.players[1].rounds[0].opponent, 0);
  assert.deepEqual([1, 2, 3].map(oldId), [2, 1, 3]);
});
