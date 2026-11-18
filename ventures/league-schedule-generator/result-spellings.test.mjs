import test from "node:test";
import assert from "node:assert/strict";
import { parseResults } from "./calc.mjs";

const teams = ["Hawks", "Owls", "Red Sox", "St. Mary's"];
const one = (line) => {
  const r = parseResults(line, teams);
  assert.deepEqual(r.errors, [], line);
  assert.equal(r.results.length, 1, line);
  return r.results[0];
};

test("every way of writing Hawks 3, Owls 2 gives the same result", () => {
  for (const l of ["Hawks 3-2 Owls", "Hawks 3 – 2 Owls", "Hawks 3−2 Owls", "Hawks 3:2 Owls", "Hawks 3 v 2 Owls", "Hawks 3 Owls 2",
    "Hawks beat Owls 3-2", "Hawks vs Owls 3-2", "Hawks v. Owls 3-2".replace("v.", "vs."), "hawks 3-2 owls.", "Hawks 3-2 Owls (OT)"]) {
    const r = one(l);
    assert.deepEqual([r.a, r.b, r.ga, r.gb, !!r.walkover], [0, 1, 3, 2, false], l);
  }
});

test("'lost to' keeps the typed order and scores", () => {
  const r = one("Owls lost to Hawks 2-3");
  assert.deepEqual([r.a, r.b, r.ga, r.gb], [1, 0, 2, 3]);
});

test("a (forfeit) note marks a walkover but keeps the typed score", () => {
  const r = one("Hawks 5-0 Owls (forfeit)");
  assert.deepEqual([r.ga, r.gb, r.walkover], [5, 0, true]);
});

test("semicolons separate results and names with dots still match", () => {
  const r = parseResults("Hawks 3-2 Owls; Red Sox 1-0 St. Mary's", teams);
  assert.deepEqual(r.errors, []);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[1].b, 3);
});

test("unknown names and garbage are still reported", () => {
  assert.match(parseResults("Hawks 3-2 Wolves", teams).errors[0], /Wolves/);
  assert.equal(parseResults("hello there", teams).errors.length, 1);
  assert.equal(parseResults("Hawks 3-2 Hawks", teams).errors.length, 1);
});

test("points adjustments still parse", () => {
  const r = parseResults("Hawks -3 pts (late fee)", teams);
  assert.deepEqual(r.adjustments, { 0: -3 });
});
