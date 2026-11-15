// Several games a night (doubleheaders): nights.mjs and the gamesPerNight path of calc.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule, validateSchedule, nightsOf, expandNights, nightWaits, roundRobin, readSpec, encodeFields, decodeFields,
  teamSchedule, restReport, applyRainouts, applyLateTeams, seasonGrid, scheduleText, parseDate,
} from "./calc.mjs";
import { lowCarryOverRounds } from "./carryover.mjs";
import { nightLayout, nightComponents, waitFreePossible, waitFreeNights, planWaitCost, nightRowsExact, rowsWaitFree, sessionBlocks, sessionNights } from "./nights.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const times = (k) => Array.from({ length: k }, (_, i) => `${18 + i}:00`);
const courts = (k) => Array.from({ length: k }, (_, i) => `C${i + 1}`);
const build = (n, c, t, g, extra = {}) => buildSchedule({ teams: names(n), start: parseDate("2026-01-06"), weekdays: [2], courts: courts(c), times: times(t), gamesPerNight: g, seed: 1, ...extra });

function perNight(s) {
  for (const r of s.rounds) {
    const at = new Map();
    for (const m of r.matches) for (const x of [m.home, m.away]) {
      if (!at.has(x)) at.set(x, []);
      at.get(x).push(m.time);
    }
    for (const [, ts] of at) {
      assert.ok(ts.length <= s.config.gamesPerNight, "no team plays more than the night's games");
      assert.equal(new Set(ts).size, ts.length, "no team plays two games at one time");
    }
  }
}

test("nightsOf groups consecutive rounds within a leg and keeps each match's round", () => {
  const plan = roundRobin(6, { double: true });
  const nights = nightsOf(plan, 2);
  assert.equal(nights.length, 6); // 5 rounds a leg -> 3 nights a leg, never mixing legs
  assert.ok(nights.every((x) => x.matches.every(([h, a, k]) => Number.isInteger(h) && Number.isInteger(a) && Number.isInteger(k))));
  assert.deepEqual(nights.map((x) => x.leg), [0, 0, 0, 1, 1, 1]);
  assert.equal(nights[2].matches.length, 3); // the leg's fifth round plays alone
  assert.equal(nightsOf(plan, 1), plan);
  const odd = nightsOf(roundRobin(5), 2);
  assert.deepEqual(odd[0].sitOut.length, 2);
  assert.equal(odd[0].bye, null);
});

test("a doubleheader season is valid, and every team plays back to back at 8, 12, 16 and 20 teams on two games, four times", () => {
  for (const [n, c] of [[8, 2], [12, 3], [16, 4], [20, 5]]) {
    const s = build(n, c, 4, 2);
    const v = validateSchedule(s);
    assert.ok(v.ok, `${n} teams: ${v.errors.join("; ")}`);
    perNight(s);
    assert.equal(nightWaits(s).idle, 0, `${n} teams wait between games`);
    assert.ok(s.waitFree && s.waitFree.before > 0 && s.waitFree.after === 0, `${n} teams: the plain circle order is not wait-free, the search fixes it`);
    assert.equal(s.rounds.length, Math.ceil((n - 1) / 2));
    // every team still meets every other team once, and plays n - 1 games
    for (let t = 0; t < n; t++) assert.equal(teamSchedule(s, t).filter((r) => !r.bye).length, n - 1);
  }
});

test("without the search the plain circle method leaves teams waiting (the measured gap the search closes)", () => {
  const s = build(8, 2, 4, 2, { waitFree: false });
  assert.ok(validateSchedule(s).ok);
  assert.ok(nightWaits(s).idle > 0);
  assert.ok(s.notices.some((x) => x.includes("wait(s)")));
});

test("double round robin and odd leagues stay valid with doubleheaders", () => {
  const d = build(8, 2, 4, 2, { double: true });
  assert.ok(validateSchedule(d).ok, validateSchedule(d).errors.join("; "));
  assert.equal(nightWaits(d).idle, 0);
  for (const n of [7, 9, 11]) {
    const s = build(n, Math.ceil(Math.floor(n / 2) / 2), 4, 2);
    const v = validateSchedule(s);
    assert.ok(v.ok, `${n}: ${v.errors.join("; ")}`);
    perNight(s);
  }
  const t = build(12, 6, 3, 3);
  assert.ok(validateSchedule(t).ok);
  perNight(t);
});

test("one game a night is the old schedule exactly", () => {
  const spec = { teams: names(8), start: parseDate("2026-01-06"), weekdays: [2], courts: courts(2), times: times(2), seed: 3 };
  assert.deepEqual(buildSchedule({ ...spec, gamesPerNight: 1 }), buildSchedule(spec));
});

test("impossible settings are refused with the reason", () => {
  assert.throws(() => build(8, 4, 1, 2), /at least 2 time slots/);
  assert.throws(() => build(8, 1, 2, 2), /8 matches a night/);
  assert.throws(() => build(8, 4, 4, 5), /from 1 to 4/);
});

test("the validator catches a team booked twice at one time on a doubleheader night", () => {
  const s = build(8, 2, 4, 2);
  const r = s.rounds[0];
  const m = r.matches.find((x) => x.home === r.matches[0].home && x !== r.matches[0]) || r.matches.find((x) => (x.home === r.matches[0].home || x.away === r.matches[0].home) && x !== r.matches[0]);
  const free = s.config.courts.find((c) => !r.matches.some((x) => x.court === c && x.time === r.matches[0].time));
  if (free) { m.time = r.matches[0].time; m.court = free; } else { m.time = r.matches[0].time; }
  assert.ok(validateSchedule(s).errors.some((e) => e.includes("two games at") || e.includes("booked twice")));
});

test("waitFreePossible: windows of g rows, two teams a court per row", () => {
  assert.equal(waitFreePossible(10, 2, 4, 3), false); // every window covers the middle row: 8 teams fit
  assert.equal(waitFreePossible(8, 2, 4, 3), true);
  assert.equal(waitFreePossible(30, 2, 6, 5), false); // 24 at most
  assert.equal(waitFreePossible(8, 2, 2, 4), true);
  assert.equal(waitFreePossible(8, 3, 4, 2), false);
  const s = build(10, 4, 3, 2);
  assert.ok(s.notices.some((x) => /at least 5 courts/.test(x)), s.notices.join(" | "));
});

test("nightLayout packs 4-cycles two to a pair of rows; one long cycle does not fit", () => {
  // rounds 0 and 1 on 8 teams as two 4-cycles: 0-1,2-3 / 1-2,3-0 and 4-5,6-7 / 5-6,7-4
  const edges = [[0, 1, 0], [2, 3, 0], [4, 5, 0], [6, 7, 0], [1, 2, 1], [3, 0, 1], [5, 6, 1], [7, 4, 1]];
  assert.equal(nightComponents(edges, 2).length, 2);
  const lay = nightLayout(edges, 2, 2, 4);
  assert.equal(lay.unplaced, 0);
  for (const t of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const rows = edges.map((e, i) => (e[0] === t || e[1] === t ? lay.row[i] : -1)).filter((x) => x >= 0).sort();
    assert.equal(rows[1] - rows[0], 1, `team ${t} plays back to back`);
  }
  const cycle8 = [[0, 1, 0], [2, 3, 0], [4, 5, 0], [6, 7, 0], [1, 2, 1], [3, 4, 1], [5, 6, 1], [7, 0, 1]];
  assert.equal(nightLayout(cycle8, 2, 2, 4).unplaced, 8);
});

test("waitFreeNights keeps a valid round robin and reaches zero on 8 teams", () => {
  const plan = roundRobin(8);
  assert.equal(planWaitCost([], 8, 2, 2, 4), 0);
  const r = waitFreeNights(plan, 8, 2, 2, 4, { seed: 1, starts: [() => lowCarryOverRounds(8, { seed: 1, effort: 0.25, breakWeight: 10 }).rounds] });
  const seen = new Set();
  for (const round of r.rounds) {
    const inRound = new Set();
    for (const [h, a] of round.matches) { assert.ok(!inRound.has(h) && !inRound.has(a)); inRound.add(h); inRound.add(a); seen.add(`${Math.min(h, a)}-${Math.max(h, a)}`); }
  }
  assert.equal(seen.size, 28);
  assert.ok(r.before > 0);
  assert.equal(r.after, 0);
});

test("the setting rides in readSpec and the share link", () => {
  const f = { teams: names(6).join("\n"), start: "2026-01-06", weekdays: ["Tue"], times: "18:00, 19:00", gamesPerNight: "2" };
  assert.equal(readSpec(f).spec.gamesPerNight, 2);
  assert.ok(readSpec({ ...f, gamesPerNight: "9" }).errors.length);
  assert.equal(readSpec({ ...f, gamesPerNight: "" }).spec.gamesPerNight, undefined);
  assert.equal(decodeFields(encodeFields(f)).gamesPerNight, "2");
  assert.equal(decodeFields(encodeFields({ ...f, gamesPerNight: "" })).gamesPerNight, "");
});

test("team views, rest, grid and text show both games of a night", () => {
  const s = build(8, 2, 4, 2);
  const rows = teamSchedule(s, 0);
  assert.equal(rows.length, 7);
  assert.equal(rows.filter((x) => x.day === s.rounds[0].day).length, 2);
  const rest = restReport(s);
  assert.equal(rest.back_to_back, 0); // two games on one night are not back-to-back nights
  assert.equal(rest.rows[0].games, 7);
  assert.ok(seasonGrid(s).rows[0][1].includes(" / "));
  assert.ok(scheduleText(s).includes("18:00"));
  // breaks and carry-over are read round by round
  assert.equal(expandNights(s).rounds.length, 7);
});

test("rainouts and a late team keep a doubleheader season valid", () => {
  const s = build(8, 2, 4, 2);
  const rr = applyRainouts(s, s.rounds[1].day ? `${new Date(s.rounds[1].day * 86400000).toISOString().slice(0, 10)}` : "");
  assert.ok(rr.moves.length > 0);
  assert.ok(validateSchedule(rr.schedule).ok, validateSchedule(rr.schedule).errors.join("; "));
  perNight(rr.schedule);
  const late = applyLateTeams(s, `${new Date(s.rounds[1].day * 86400000).toISOString().slice(0, 10)} T3`);
  assert.ok(validateSchedule(late.schedule).ok, validateSchedule(late.schedule).errors.join("; "));
  perNight(late.schedule);
});

test("blackouts still go to makeup rounds and the season stays valid", () => {
  const s = build(8, 2, 4, 2, { blackouts: { 0: [parseDate("2026-01-13")] } });
  assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
  perNight(s);
  assert.ok(!s.rounds.some((r) => r.day === parseDate("2026-01-13") && r.matches.some((m) => m.home === 0 || m.away === 0)));
});

test("waitFreePossible counts an odd league's shorter windows and needs an even number of teams per row", () => {
  // 9 teams, 3 games, 3 courts x 4 times: 12 matches fill all 12 slots; six 3-game and three
  // 2-game windows cannot share the rows (the old bound, full teams only, said yes)
  assert.equal(waitFreePossible(6, 3, 3, 4), true);
  assert.equal(waitFreePossible(6, 3, 3, 4, 3), false);
  assert.equal(waitFreePossible(6, 3, 4, 4, 3), true);
  // 7 teams on 2 courts x 5 times: the counts fit but one row would hold an odd number of teams
  assert.equal(waitFreePossible(4, 3, 2, 5, 3), false);
  assert.equal(waitFreePossible(4, 3, 3, 5, 3), true);
  const s = build(9, 3, 4, 3);
  assert.ok(s.notices.some((x) => /at least 4 courts/.test(x)), s.notices.join(" | "));
});

test("nightRowsExact lays out a night match by match, or says it cannot", () => {
  // K4 on teams 0-3 in three rounds: one component, two matches a row, needs 2 courts x 3 rows
  const k4 = [[0, 1, 0], [2, 3, 0], [0, 2, 1], [1, 3, 1], [0, 3, 2], [1, 2, 2]];
  const row = nightRowsExact(k4, 2, 3);
  assert.ok(row && rowsWaitFree(k4, row));
  assert.equal(nightRowsExact(k4, 1, 6), null); // one court: a team's three games need three rows, its opponents' too
  // a team with games in rows 0 and 2 waits
  assert.equal(rowsWaitFree([[0, 1, 0], [0, 2, 1]], [0, 2]), false);
  assert.equal(rowsWaitFree([[0, 1, 0], [0, 2, 1]], [1, 2]), true);
});

test("nightLayout no longer calls a night wait-free when a team skips the middle round", () => {
  // odd-league night: team 4 sits out round 1, plays rounds 0 and 2
  const edges = [[0, 1, 0], [2, 4, 0], [0, 2, 1], [1, 3, 1], [3, 4, 2], [1, 2, 2]];
  const lay = nightLayout(edges, 3, 2, 4, null, { exact: 0 });
  if (lay.unplaced === 0) assert.ok(rowsWaitFree(edges, lay.row));
});

test("sessionBlocks: closed blocks for two sessions a night", () => {
  assert.deepEqual(sessionBlocks(12, 3, 3, 6), [6, 6]);
  assert.deepEqual(sessionBlocks(10, 3, 3, 6), [6, 4]);
  assert.equal(sessionBlocks(12, 3, 6, 6), null); // one session holds everyone
  assert.equal(sessionBlocks(11, 3, 3, 6), null); // odd league
  assert.equal(sessionBlocks(12, 3, 3, 5), null); // one session of three rows only
});

test("12 teams, 3 games on 3 courts x 6 times: every night two closed groups of six, nobody waits", () => {
  // every slot is booked, so each night must split into two groups of six that only play each other
  const s = build(12, 3, 6, 3);
  assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
  perNight(s);
  assert.equal(nightWaits(s).idle, 0);
  for (let t = 0; t < 12; t++) assert.equal(teamSchedule(s, t).filter((r) => !r.bye).length, 11);
  // and with the search off the circle method leaves waits
  assert.ok(nightWaits(build(12, 3, 6, 3, { waitFree: false })).idle > 0);
});

test("12 teams, 2 games on 3 courts x 4 times is wait-free (the last two-game gap of the eval)", () => {
  const s = build(12, 3, 4, 2);
  assert.ok(validateSchedule(s).ok);
  assert.equal(nightWaits(s).idle, 0);
});
