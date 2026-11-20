import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay } from "./calc.mjs";
import { golfSchedule } from "./golf.mjs";
import { golfPlayoffs, golfPlayoffsText, golfPlayoffsCsv, flightSizes } from "./golf-playoffs.mjs";

const START = toDay(2027, 4, 28);
const T = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
const recapOf = (n, ties = []) => ({ standings: T(n).map((team, i) => ({ team, place: i + 1, points: 100 - i, holesWon: 50, ...(ties.includes(i) ? { points: 100 - i + 1 } : {}) })) });

test("flight sizes are even with the larger flights first", () => {
  assert.deepEqual(flightSizes(10, 3), [4, 3, 3]);
  assert.deepEqual(flightSizes(8, 2), [4, 4]);
});

test("two flights of four: semifinals then finals, finals on the same last night", () => {
  const s = golfSchedule({ teams: T(8), weeks: 10, start: START });
  const p = golfPlayoffs(recapOf(8), s);
  assert.deepEqual(p.errors, []);
  assert.equal(p.nights.length, 2);
  assert.equal(p.nights[0].day, s.weeks[9].day + 7);
  assert.deepEqual(p.nights.map((n) => n.groups.length), [4, 2]);
  // Seeds 1 v 4 and 2 v 3 in flight A; the standings' next four make flight B.
  assert.deepEqual(p.nights[0].groups.slice(0, 2).map((g) => [g.a, g.b]), [["#1 Team 1", "#4 Team 4"], ["#2 Team 2", "#3 Team 3"]]);
  assert.deepEqual(p.nights[0].groups.slice(2).map((g) => g.a), ["#1 Team 5", "#2 Team 6"]);
  assert.deepEqual(p.nights[1].groups.map((g) => [g.flight, g.round]), [["A", "Final"], ["B", "Final"]]);
  assert.equal(p.nights[0].nine, s.weeks[9].nine === "front" ? "back" : "front");
  assert.notEqual(p.nights[1].nine, p.nights[0].nine);
});

test("a short flight waits so every final is on the last night; tee times run in order", () => {
  const s = golfSchedule({ teams: T(10), weeks: 9, start: START, firstTee: "16:30", interval: 10 });
  const p = golfPlayoffs(recapOf(10), s, { sizes: [8, 2] });
  assert.deepEqual(p.errors, []);
  assert.equal(p.nights.length, 3);
  assert.deepEqual(p.nights.map((n) => n.groups.map((g) => g.flight).join("")), ["AAAA", "AA", "AB"]);
  assert.deepEqual(p.nights[2].groups.map((g) => g.slot), ["16:30", "16:40"]);
  assert.equal(p.nights[1].groups.length, 2);
});

test("byes, third place, last-first order, shotgun holes", () => {
  const s = golfSchedule({ teams: T(12), weeks: 11, start: START, startType: "shotgun" });
  const p = golfPlayoffs(recapOf(12), s, { flights: 2, sizes: undefined, thirdPlace: true, flightOrder: "last-first" });
  // 6 + 6: first round has 2 matches (seeds 3-6) and byes for 1 and 2.
  assert.equal(p.flights[0].bracket.rounds[0].matches.filter((m) => m.bye).length, 2);
  assert.equal(p.nights.length, 3);
  assert.match(p.nights[0].groups[0].slot, /^Hole /);
  assert.equal(p.nights[0].groups[0].flight, "B");
  assert.ok(p.nights[2].groups.some((g) => g.id === "A-3P"));
  assert.match(golfPlayoffsText(p), /Winner of A-R1M2/);
});

test("a tie across the cut is named, not broken", () => {
  const s = golfSchedule({ teams: T(8), weeks: 10, start: START });
  const r = recapOf(8);
  r.standings[4].points = r.standings[3].points;
  const p = golfPlayoffs(r, s);
  assert.equal(p.warnings.length, 1);
  assert.match(p.warnings[0], /Team 4 and Team 5 are level/);
});

test("bad input is refused in words", () => {
  const s = golfSchedule({ teams: T(8), weeks: 10, start: START });
  assert.match(golfPlayoffs(recapOf(3), s, { flights: 2 }).errors[0], /cannot make 2 flights/);
  assert.match(golfPlayoffs(recapOf(8), s, { sizes: [6, 4] }).errors[0], /need 10 teams/);
  assert.match(golfPlayoffs({ standings: [] }, s).errors[0], /cards first/);
  assert.match(golfPlayoffs(recapOf(8), s, { nights: [s.weeks[9].day + 7] }).errors[0], /needs 2 nights/);
  assert.match(golfPlayoffsCsv(golfPlayoffs(recapOf(8), s)), /^Night,Date,Nine,Start,Flight/);
});

test("a team name that looks like a formula stays text in the CSV", () => {
  const s = golfSchedule({ teams: T(8), weeks: 10, start: START });
  const r = recapOf(8);
  r.standings[0].team = "=SUM(A1:A9)";
  const csv = golfPlayoffsCsv(golfPlayoffs(r, s));
  assert.match(csv, /#1 =SUM\(A1:A9\)/);
  assert.doesNotMatch(csv, /(^|,)"?[=+@\t\r]/m);
  assert.doesNotMatch(csv, /(^|,)"?-(?!\d)/m);
});
