// Time and court limits: the exact per-round pass and the conflicts named before the build (2026-11-18).
import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, validateSchedule, parseDate, legalRoundSlots, limitConflicts, readSpec } from "./calc.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);

test("legalRoundSlots finds an assignment that keeps every limit, keeping legal slots where it can", () => {
  const ms = [{ home: 0, away: 1, slot: 0 }, { home: 2, away: 3, slot: 1 }];
  // match 0 may only use slot 1; match 1 may use either
  const legal = (m, k) => (m.home === 0 ? k === 1 : true);
  assert.deepEqual(legalRoundSlots(ms, [0, 1], legal), [1, 0]);
  const keep = [{ home: 0, away: 1, slot: 1 }, { home: 2, away: 3, slot: 0 }];
  assert.deepEqual(legalRoundSlots(keep, [0, 1], legal), [1, 0]);
  assert.equal(legalRoundSlots(ms, [0, 1], (m, k) => k === 1), null);
});

test("limitConflicts names a pair with no time in common and a crowded time", () => {
  const teams = ["Aces", "Topspin", "Love All", "Deuce"];
  const c = limitConflicts(teams, { times: ["18:30", "20:00"], courts: ["C1", "C2"], timeLimits: { 0: ["18:30"], 1: ["20:00"] } });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, "pair");
  assert.deepEqual(c[0].teams, ["Aces", "Topspin"]);
  const crowd = limitConflicts(names(8), { times: ["18:00", "19:00"], courts: ["C1"], timeLimits: { 0: ["18:00"], 1: ["18:00"], 2: ["18:00"] } });
  assert.equal(crowd.length, 1);
  assert.equal(crowd[0].kind, "times");
  assert.match(crowd[0].text, /3 teams .* hold 1 match/);
  assert.match(crowd[0].text, /too few even when they all play each other/);
  const some = limitConflicts(names(8), { times: ["18:00", "19:00"], courts: ["C1", "C2"], timeLimits: { 0: ["18:00"], 1: ["18:00"], 2: ["18:00"] } });
  assert.match(some[0].text, /unless enough of them play each other/);
  const court = limitConflicts(names(6), { times: ["18:00"], courts: ["A", "B", "C"], courtLimits: { 0: ["A"], 1: ["B"] } });
  assert.equal(court[0].kind, "pair");
  assert.match(court[0].text, /court limit/);
  assert.deepEqual(limitConflicts(names(6), { times: ["18:00", "19:00"], courts: ["C1", "C2"], timeLimits: { 0: ["18:00"], 1: ["18:00", "19:00"] } }), []);
});

test("buildSchedule puts the conflict first among its notices and keeps every limit when it can", () => {
  const { spec, errors } = readSpec({ teams: "Aces\nBaseliners\nNet Rushers\nTopspin\nLove All\nDeuce Crew", start: "2027-01-12", weekdays: ["Tue"], courts: "Court 1", times: "18:30\n20:00\n21:30", timeLimits: "Aces: 18:30\nTopspin: 20:00" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.match(s.notices[0], /^Limits that cannot all be kept: Aces only plays at 18:30 and Topspin only at 20:00/);
  // a feasible league: every limit kept in every round, on many seeds
  for (let seed = 1; seed <= 25; seed++) {
    const t = buildSchedule({ teams: names(10), start: parseDate("2027-01-05"), weekdays: [2], courts: ["C1", "C2"], times: ["18:00", "19:00", "20:00"], timeLimits: { 0: ["18:00"], 1: ["18:00", "19:00"], 2: ["18:00", "20:00"], 3: ["18:00", "19:00"] }, courtLimits: { 4: ["C2"] }, seed });
    const v = validateSchedule(t);
    assert.deepEqual(v.errors.filter((e) => /only plays/.test(e)), [], `seed ${seed}`);
    assert.ok(!t.notices.some((n) => /cannot all be kept/.test(n)));
  }
});
