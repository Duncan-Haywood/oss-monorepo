// Several games a night (doubleheaders): nights.mjs and the gamesPerNight path of calc.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSchedule, validateSchedule, nightsOf, expandNights, nightWaits, roundRobin, readSpec, encodeFields, decodeFields,
  teamSchedule, restReport, applyRainouts, applyLateTeams, seasonGrid, scheduleText, parseDate,
} from "./calc.mjs";
import { lowCarryOverRounds } from "./carryover.mjs";
import { nightLayout, nightComponents, waitFreePossible, waitFreeNights, planWaitCost, nightRowsExact, rowsWaitFree, sessionBlocks, sessionNights, designedRounds, designedNights, designCandidates, decodeDesign, oddDesigns, waitFreeProvedImpossible } from "./nights.mjs";
import { SESSION_DESIGNS } from "./session-designs.mjs";
import { ODD_DESIGNS } from "./odd-designs.mjs";

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

test("designedRounds: a one-factorisation whose nights of three split into small closed groups", () => {
  for (const n of [8, 12, 16, 24, 32, 36, 48]) {
    const d = designedRounds(n, 3, 2);
    assert.equal(d.length, n - 1, `${n}: n - 1 rounds`);
    const seen = new Set();
    for (const r of d) {
      const inRound = new Set(r.flat());
      assert.equal(inRound.size, n, `${n}: every team once a round`);
      for (const [a, b] of r) { const k = Math.min(a, b) * 100 + Math.max(a, b); assert.ok(!seen.has(k), `${n}: a pair meets once`); seen.add(k); }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  }
  assert.equal(designedRounds(6, 3), null); // too small for a design: the search's job
  assert.equal(designedRounds(12, 2), null);
  // 16 teams: five nights, each four groups of four (an affine plane's parallel classes)
  const d = designedRounds(16, 3, 1);
  for (let i = 0; i < 15; i += 3) {
    const adj = new Map();
    for (const r of d.slice(i, i + 3)) for (const [a, b] of r) { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); }
    for (const [t, ns] of adj) for (const u of ns) for (const v of ns) if (u !== v) assert.ok(adj.get(u).has(v) || u === t, "a night's opponents of a team all meet each other: K4 groups");
  }
});

test("24 teams, 3 games on 6 courts x 6 times: the designed round robin is wait-free where the search was not", () => {
  assert.ok(designedNights(24, 3, 6, 6, 1));
  const s = build(24, 6, 6, 3);
  assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
  perNight(s);
  assert.equal(nightWaits(s).idle, 0);
  for (let t = 0; t < 24; t++) assert.equal(teamSchedule(s, t).filter((r) => !r.bye).length, 23);
  // every seed, not only seed 1
  for (const seed of [2, 3]) assert.equal(nightWaits(build(24, 6, 6, 3, { seed })).idle, 0);
});

test("stored SAT designs: every one a round robin whose nights of three split into closed blocks that fit its sessions", () => {
  assert.ok(SESSION_DESIGNS.length >= 18);
  for (const d of SESSION_DESIGNS) {
    const { n, sessions, hi } = d;
    const rounds = decodeDesign(d);
    assert.equal(rounds.length, n - 1, `${n}/${sessions}: n - 1 rounds`);
    const seen = new Set();
    for (const r of rounds) {
      assert.equal(new Set(r.flat()).size, n, `${n}/${sessions}: every team once a round`);
      for (const [a, b] of r) { const k = Math.min(a, b) * 100 + Math.max(a, b); assert.ok(!seen.has(k), `${n}: a pair meets once`); seen.add(k); }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
    for (let i = 0; i + 3 <= n - 1; i += 3) {
      // components of the night, packed first-fit decreasing into `sessions` blocks of at most hi
      const par = Array.from({ length: n }, (_, v) => v);
      const f = (v) => (par[v] === v ? v : (par[v] = f(par[v])));
      for (const r of rounds.slice(i, i + 3)) for (const [a, b] of r) par[f(a)] = f(b);
      const size = new Map();
      for (let v = 0; v < n; v++) size.set(f(v), (size.get(f(v)) || 0) + 1);
      const bins = Array(sessions).fill(0);
      for (const c of [...size.values()].sort((a, b) => b - a)) { const k = bins.indexOf(Math.min(...bins)); bins[k] += c; }
      assert.ok(Math.max(...bins) <= hi, `${n}/${sessions} night ${i / 3}: blocks ${bins} over ${hi}`);
    }
  }
});

test("40 and 46 teams, 3 games on 7 and 8 courts x 9 times: wait-free from the orbit designs (794 and 1,201 waits before)", () => {
  // eval/session-orbit.py: one night turned by v -> v + 3 (mod n - 1), every night three closed blocks
  for (const [n, c] of [[40, 7], [46, 8]]) {
    assert.ok(SESSION_DESIGNS.some((d) => d.n === n && d.sessions === 3), `${n}: a stored 3-session design`);
    const s = build(n, c, 9, 3);
    assert.ok(validateSchedule(s).ok, `${n}: valid`);
    assert.equal(nightWaits(s).idle, 0, `${n}: no waits`);
  }
});

test("14, 18, 20 and 28 teams, 3 games on the least courts x 6 times: wait-free from a stored design (the search stopped at 2 crossing)", () => {
  for (const [n, c] of [[14, 4], [18, 5], [20, 5], [28, 7]]) {
    assert.ok(designCandidates(n, 3).length >= 1);
    assert.ok(designedNights(n, 3, c, 6, 1), `${n}: a design packs`);
    const s = build(n, c, 6, 3);
    assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
    perNight(s);
    assert.equal(nightWaits(s).idle, 0, `${n} teams on ${c} x 6`);
  }
});

test("stored odd-league designs: each a round robin with one bye a round whose every night lays out back to back on its courts", () => {
  assert.ok(ODD_DESIGNS.length >= 5);
  for (const d of ODD_DESIGNS) {
    const { n, courts: c, times: T } = d;
    const [{ rounds, layouts }] = oddDesigns(n, 3).filter((x) => x.courts === c);
    assert.equal(rounds.length, n, `${n}: n rounds`);
    const seen = new Set();
    const byes = new Set();
    for (const r of rounds) {
      assert.equal(new Set(r.flat()).size, n + 1, `${n}: every team once a round`);
      for (const [a, b] of r) {
        const k = Math.min(a, b) * 100 + Math.max(a, b);
        assert.ok(!seen.has(k), `${n}: a pair meets once`);
        seen.add(k);
        if (b === n) byes.add(a);
      }
    }
    assert.equal(seen.size, ((n + 1) * n) / 2);
    assert.equal(byes.size, n, `${n}: every team sits out once`);
    for (let i = 0; i < n; i += 3) {
      const edges = rounds.slice(i, i + 3).flatMap((r, k) => r.filter(([a, b]) => a < n && b < n).map(([a, b]) => [a, b, k]));
      // the stored rows (the solver's layout), checked here without the tool's search
      const row = edges.map(([a, b]) => layouts[i / 3].get(`${Math.min(a, b)},${Math.max(a, b)}`));
      const load = Array(T).fill(0);
      for (const r of row) { assert.ok(r >= 0 && r < T); load[r]++; }
      assert.ok(Math.max(...load) <= c, `${n} night ${i / 3}: at most ${c} a row`);
      assert.ok(rowsWaitFree(edges, row), `${n} on ${c} x ${T}, night ${i / 3}: back to back`);
    }
  }
});

test("11 teams, 3 games on 3 courts x 6 times: 22 waits to 0 from a stored odd design; byes kept", () => {
  for (const seed of [1, 2, 3]) {
    const s = build(11, 3, 6, 3, { seed });
    assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
    perNight(s);
    assert.equal(nightWaits(s).idle, 0, `seed ${seed}`);
    assert.ok(s.waitFree && s.waitFree.designed);
    for (let t = 0; t < 11; t++) assert.equal(teamSchedule(s, t).filter((r) => !r.bye).length, 10);
  }
  assert.ok(nightWaits(build(11, 3, 6, 3, { waitFree: false })).idle > 0);
});

test("odd leagues of 13 to 25 teams, 3 games on the least courts x 6 times: wait-free from stored designs (25 teams through the stored rows)", () => {
  for (const [n, c] of [[13, 3], [15, 4], [17, 4], [19, 5], [21, 5], [25, 6], [27, 7]]) {
    if (!ODD_DESIGNS.some((d) => d.n === n)) continue;
    const s = build(n, c, 6, 3);
    assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
    perNight(s);
    assert.equal(nightWaits(s).idle, 0, `${n} teams on ${c} x 6`);
  }
});

test("odd leagues at 9 times: stored 9-slot designs on fewer courts than the 6-slot ones, wait-free", () => {
  const nine = ODD_DESIGNS.filter((d) => d.times === 9);
  assert.ok(nine.length >= 3);
  for (const d of nine) {
    // a 9-slot design is kept only when it saves courts over the 6-slot one
    const six = ODD_DESIGNS.find((e) => e.n === d.n && e.times === 6);
    if (six) assert.ok(d.courts < six.courts, `${d.n}: ${d.courts} x 9 beats ${six.courts} x 6`);
  }
  // 21 and 23 on 4, 27 on 5: 1-rotational round robins (eval/odd-cyclic.py), one night's layout shifted;
  // 19 on 3, 25 on 4, 31 on 5 and 37 on 6 (fully booked): one night turned by three k-cycles (eval/odd-orbit.py);
  // 33 on 6, 39 on 7, 45 on 8 and 51 on 9 (2026-11-16): the patterned 1-rotational starter, pattern
  // {0, 1, 2}; 57 on 10 and 63 on 11 are stored the same way (checked row by row above, built in the eval);
  // 29 on 5 and 35 on 6 (n = 3k + 2, where no group of order k works): a large-neighbourhood search that re-deals
  // two nights' pairs at a time with SAT (eval/odd-lns.py, 2026-11-16)
  for (const [n, c] of [[11, 2], [13, 2], [19, 3], [21, 4], [23, 4], [25, 4], [27, 5], [29, 5], [31, 5], [35, 6], [33, 6], [37, 6], [39, 7], [45, 8], [51, 9]]) {
    const s = build(n, c, 9, 3);
    assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
    perNight(s);
    assert.equal(nightWaits(s).idle, 0, `${n} teams on ${c} x 9`);
    assert.ok(nightWaits(build(n, c, 9, 3, { waitFree: false })).idle > 0, `${n}: the plain layout keeps waits`);
  }
  // a 6-slot design still serves a league with 9 slots and its courts
  assert.equal(nightWaits(build(11, 3, 9, 3)).idle, 0);
});

test("5 and 7 teams on 1 court and 7 on 2 courts x 9 times: proved to keep a wait", () => {
  for (const [n, c] of [[5, 1], [7, 1], [7, 2]]) assert.equal(waitFreeProvedImpossible(n, 3, c, 9), true);
  assert.equal(waitFreeProvedImpossible(9, 3, 2, 9), false);
  const s = build(7, 2, 9, 3);
  assert.ok(s.notices.some((x) => x.includes("need at least 3 courts") && x.includes("checked for every possible 7-team season on 2 courts")), s.notices.join(" | "));
});

test("7, 8 and 9 teams, 3 games on 2 courts x 6 times: proved to keep a wait, and the hint asks for 3 courts", () => {
  assert.equal(waitFreeProvedImpossible(7, 3, 2, 6), true);
  assert.equal(waitFreeProvedImpossible(9, 3, 2, 6), true);
  assert.equal(waitFreeProvedImpossible(7, 3, 3, 6), false);
  assert.equal(waitFreePossible(4, 3, 2, 6, 3), true); // the one-night count allows it
  for (const n of [7, 8, 9]) {
    const s = build(n, 2, 6, 3);
    assert.ok(nightWaits(s).idle > 0);
    assert.ok(s.notices.some((x) => x.includes("need at least 3 courts") && x.includes("none has every team's games back to back")), s.notices.join(" | "));
    assert.equal(nightWaits(build(n, 3, 6, 3)).idle, 0, `${n} on 3 courts`);
  }
});

test("44 teams, 3 games on 11 courts x 6 times, seed 2, search off: no team booked twice at one time (a clash once cost less than six idle slots)", () => {
  const s = build(44, 11, 6, 3, { seed: 2, waitFree: false });
  assert.ok(validateSchedule(s).ok, validateSchedule(s).errors.join("; "));
});

test("26 teams, 3 games on 5 courts x 9 times: the season's usage-guided layout falls back to the plain exact one, 0 waits", () => {
  const s = build(26, 5, 9, 3);
  assert.ok(validateSchedule(s).ok);
  assert.equal(nightWaits(s).idle, 0);
});
