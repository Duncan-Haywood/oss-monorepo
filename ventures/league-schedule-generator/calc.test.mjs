import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRainouts, applyWithdrawals, toDay, dayIso, dayOfWeek, parseDate, parseDateList, parseWeekdays, parseTime, parseTeams, parseBlackouts, parseTimes,
  readSpec, roundRobin, countBreaks, mulberry32, buildSchedule, validateSchedule, teamSchedule, scheduleCsv, standingsCsv, scheduleIcs,
  scheduleText, teamMessages, leaguePageHtml, parseTimeLimits, parseCourtLimits, parseResults, standings, seedOrder, playoffBracket, doubleEliminationBracket, bracketText, sampleFields, encodeFields, decodeFields,
  splitPools, clubPairsInPools, buildPoolPlay, poolAdvancers, parseOfficials, assignOfficials, validateOfficials, playoffRace, remainingFixtures, raceText, restReport, rematchReport, seasonCost, deadlineCheck, slotFairness, parseGrounds, groundClashes, applyGroundSharing,
} from "./calc.mjs";

const D = (iso) => parseDate(iso);
const names = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
const baseSpec = (n, extra = {}) => ({ teams: names(n), double: false, start: D("2026-10-06"), weekdays: [2], skipDays: [], blackouts: {}, courts: [], times: [], seed: 1, minutes: 60, ...extra });

test("day numbers round-trip, reject impossible dates, and know the weekday", () => {
  assert.equal(dayIso(toDay(2026, 2, 28)), "2026-02-28");
  assert.equal(toDay(2026, 2, 29), null);
  assert.equal(dayIso(toDay(2028, 2, 29)), "2028-02-29");
  assert.equal(dayOfWeek(D("2026-10-06")), 2); // Tuesday
  assert.equal(D("10/6/2026"), D("2026-10-06"));
  assert.equal(parseDate("2026-13-01"), null);
});

test("date lists expand ranges, dedupe, and report bad tokens", () => {
  const { days, errors } = parseDateList("2026-12-24, 2026-12-30 to 2027-01-01\n2026-12-24");
  assert.deepEqual(days.map(dayIso), ["2026-12-24", "2026-12-30", "2026-12-31", "2027-01-01"]);
  assert.deepEqual(errors, []);
  assert.equal(parseDateList("tomorrow").errors.length, 1);
  assert.equal(parseDateList("2026-05-02 to 2026-05-01").errors.length, 1);
});

test("weekdays and times parse in several spellings", () => {
  assert.deepEqual(parseWeekdays("Tue, thursday").weekdays, [2, 4]);
  assert.equal(parseWeekdays("Funday").errors.length, 1);
  assert.equal(parseTime("6:30pm"), "18:30");
  assert.equal(parseTime("12am"), "00:00");
  assert.equal(parseTime("7"), "07:00");
  assert.equal(parseTime("25:00"), null);
  assert.deepEqual(parseTimes("18:00, 7pm, 18:00").times, ["18:00", "19:00"]);
});

test("team lists trim, reject duplicates and need two teams", () => {
  assert.deepEqual(parseTeams("  A \n\nB  b\n").teams, ["A", "B b"]);
  assert.equal(parseTeams("A\na").errors.length >= 1, true);
  assert.equal(parseTeams("Only one").errors.length, 1);
});

test("blackouts parse by team name in either phrasing", () => {
  const { blackouts, errors } = parseBlackouts("Hawks: 2026-11-05\nOwls cannot play 2026-11-12 to 2026-11-13\nNobody: 2026-11-01", ["Hawks", "Owls"]);
  assert.deepEqual(blackouts[0].map(dayIso), ["2026-11-05"]);
  assert.deepEqual(blackouts[1].map(dayIso), ["2026-11-12", "2026-11-13"]);
  assert.equal(errors.length, 1);
});

test("hand-computed 4-team round robin matches the circle method", () => {
  const rr = roundRobin(4);
  assert.deepEqual(rr.map((r) => r.matches), [
    [[0, 3], [1, 2]],
    [[3, 1], [2, 0]],
    [[2, 3], [0, 1]],
  ]);
  assert.ok(rr.every((r) => r.bye === null));
});

test("hand-computed 5-team round robin has one bye per round and the right pairs", () => {
  const rr = roundRobin(5);
  assert.equal(rr.length, 5);
  assert.deepEqual(rr[0].matches, [[1, 4], [3, 2]]);
  assert.equal(rr[0].bye, 0);
  assert.deepEqual(rr[1].matches, [[2, 0], [4, 3]]);
  assert.equal(rr[1].bye, 1);
  assert.deepEqual(rr.map((r) => r.bye).sort(), [0, 1, 2, 3, 4]);
});

test("4-team schedule: home/away counts and breaks are the known minimum", () => {
  const s = buildSchedule(baseSpec(4));
  assert.deepEqual(s.stats.home, [2, 1, 2, 1]);
  assert.deepEqual(s.stats.away, [1, 2, 1, 2]);
  assert.deepEqual(s.stats.breaks, [0, 1, 1, 0]);
  assert.equal(s.stats.totalBreaks, 2); // n - 2 is the proven minimum for even n
});

test("5-team schedule: nobody has a home/away break and home equals away", () => {
  const s = buildSchedule(baseSpec(5));
  assert.equal(s.stats.totalBreaks, 0);
  assert.deepEqual(s.stats.home, [2, 2, 2, 2, 2]);
  assert.deepEqual(s.stats.away, [2, 2, 2, 2, 2]);
  assert.deepEqual(s.rounds.map((r) => r.bye), [0, 1, 2, 3, 4]);
});

test("a double round robin plays every pair twice with each side hosting once", () => {
  const s = buildSchedule(baseSpec(4, { double: true }));
  assert.equal(s.rounds.length, 6);
  assert.equal(s.stats.matches, 12);
  assert.deepEqual(s.stats.home, [3, 3, 3, 3]);
  assert.equal(validateSchedule(s).ok, true);
});

test("dates land on the chosen weekday, skip dates are jumped, and rounds are a week apart", () => {
  const s = buildSchedule(baseSpec(4, { skipDays: [D("2026-10-13")] }));
  assert.deepEqual(s.rounds.map((r) => dayIso(r.day)), ["2026-10-06", "2026-10-20", "2026-10-27"]);
  const two = buildSchedule(baseSpec(4, { weekdays: [2, 4] }));
  assert.deepEqual(two.rounds.map((r) => dayIso(r.day)), ["2026-10-06", "2026-10-08", "2026-10-13"]);
});

test("a start date that is not on a playing weekday rolls forward", () => {
  const s = buildSchedule(baseSpec(2, { start: D("2026-10-07") }));
  assert.equal(dayIso(s.rounds[0].day), "2026-10-13");
});

test("a blackout moves only the affected match to a makeup round", () => {
  const spec = baseSpec(4, { blackouts: { 1: [D("2026-10-13")] } });
  const s = buildSchedule(spec);
  assert.equal(s.rounds.filter((r) => r.makeup).length, 1);
  assert.equal(s.stats.matches, 6);
  const day = D("2026-10-13");
  for (const r of s.rounds) if (r.day === day) for (const m of r.matches) assert.ok(m.home !== 1 && m.away !== 1);
  assert.equal(validateSchedule(s).ok, true);
  assert.match(s.notices[0], /makeup/);
});

test("with an odd league a blackout can be absorbed by the team's bye", () => {
  const s = buildSchedule(baseSpec(5, { blackouts: { 3: [D("2026-10-06")] } }));
  assert.equal(s.rounds[0].bye, 3);
  assert.equal(s.rounds.some((r) => r.makeup), false);
  assert.equal(validateSchedule(s).ok, true);
});

test("a date where nobody can play is left unused rather than looping", () => {
  const s = buildSchedule(baseSpec(2, { blackouts: { 0: [D("2026-10-06")] } }));
  assert.equal(dayIso(s.rounds[0].day), "2026-10-13");
  assert.match(s.notices.join(" "), /unused/);
});

test("slot assignment is deterministic for a seed and balances court and time use", () => {
  const spec = baseSpec(8, { courts: ["A", "B"], times: ["18:00", "19:00"] });
  const a = buildSchedule(spec);
  const b = buildSchedule(spec);
  assert.deepEqual(a.rounds.map((r) => r.matches.map((m) => [m.court, m.time])), b.rounds.map((r) => r.matches.map((m) => [m.court, m.time])));
  assert.ok(a.stats.courtSpread <= 2, `court spread ${a.stats.courtSpread}`);
  assert.ok(a.stats.timeSpread <= 2, `time spread ${a.stats.timeSpread}`);
  const other = buildSchedule({ ...spec, seed: 2 });
  assert.equal(validateSchedule(other).ok, true);
});

test("annealing does much better than filling slots in order", () => {
  const spec = baseSpec(10, { courts: ["A", "B", "C"], times: ["18:00", "19:00"] });
  const s = buildSchedule(spec);
  // 9 games per team over 3 courts and 2 times: an even split is 3/3/3 and 5/4
  assert.ok(s.stats.courtSpread <= 2);
  assert.ok(s.stats.timeSpread <= 2);
  const naive = roundRobin(10).map((r) => r.matches.map(([h, a], i) => ({ home: h, away: a, court: i % 3 })));
  const naiveCount = Array.from({ length: 10 }, () => [0, 0, 0]);
  for (const r of naive) for (const m of r) { naiveCount[m.home][m.court]++; naiveCount[m.away][m.court]++; }
  const naiveSpread = Math.max(...naiveCount.map((c) => Math.max(...c) - Math.min(...c)));
  assert.ok(s.stats.courtSpread <= naiveSpread);
});

test("too few courts and time slots for a round is an error that says how many fit", () => {
  assert.throws(() => buildSchedule(baseSpec(8, { courts: ["A"], times: ["18:00"] })), /only fit 1/);
});

test("default courts are created to fit the round", () => {
  const s = buildSchedule(baseSpec(8));
  assert.deepEqual(s.config.courts, ["Court 1", "Court 2", "Court 3", "Court 4"]);
});

test("the validator catches every kind of fault", () => {
  const good = () => buildSchedule(baseSpec(6));
  assert.equal(validateSchedule(good()).ok, true);
  let s = good(); s.rounds[0].matches.pop();
  assert.match(validateSchedule(s).errors.join(" "), /expected 1/);
  s = good(); s.rounds[1].matches[0].away = s.rounds[1].matches[1].home;
  assert.match(validateSchedule(s).errors.join(" "), /plays twice/);
  s = good(); s.rounds[0].matches[0].court = s.rounds[0].matches[1].court; s.rounds[0].matches[0].time = s.rounds[0].matches[1].time;
  assert.match(validateSchedule(s).errors.join(" "), /booked twice/);
  s = good(); for (const m of s.rounds[0].matches) [m.home, m.away] = [m.away, m.home];
  s.rounds.forEach((r) => r.matches.forEach((m) => { if (m.home < 3) [m.home, m.away] = [m.away, m.home]; }));
  assert.match(validateSchedule(s).errors.join(" "), /home and/);
  s = good(); s.rounds[0].day += 1;
  assert.match(validateSchedule(s).errors.join(" "), /not a chosen weekday/);
  s = good(); s.config.skipDays = [s.rounds[2].day];
  assert.match(validateSchedule(s).errors.join(" "), /skip date/);
  s = good(); s.config.blackouts = { 0: [s.rounds[0].day] };
  assert.match(validateSchedule(s).errors.join(" "), /cannot play/);
});

test("the validator catches a double round robin where one side hosts twice", () => {
  const s = buildSchedule(baseSpec(4, { double: true }));
  const m = s.rounds[3].matches[0];
  const twin = s.rounds[0].matches.find((x) => x.home === m.away && x.away === m.home) || s.rounds[0].matches[0];
  [twin.home, twin.away] = [m.home, m.away];
  assert.equal(validateSchedule(s).ok, false);
});

test("random leagues of 2..24 teams validate, single and double, with seeded random inputs", () => {
  const rand = mulberry32(2026);
  for (let n = 2; n <= 24; n++) {
    for (const double of [false, true]) {
      const perRound = Math.floor(n / 2);
      const nTimes = 1 + Math.floor(rand() * 3);
      const nCourts = Math.ceil(perRound / nTimes) + Math.floor(rand() * 2);
      const blackouts = {};
      for (let k = 0; k < 3; k++) {
        const t = Math.floor(rand() * n);
        blackouts[t] = [...(blackouts[t] || []), D("2026-10-06") + 7 * Math.floor(rand() * 6)];
      }
      const spec = baseSpec(n, {
        double, courts: Array.from({ length: nCourts }, (_, i) => `C${i + 1}`),
        times: ["17:00", "18:00", "19:00"].slice(0, nTimes), blackouts, seed: 1 + Math.floor(rand() * 1000),
        skipDays: [D("2026-11-03")], weekdays: [2, 4].slice(0, 1 + Math.floor(rand() * 2)),
      });
      const s = buildSchedule(spec);
      const v = validateSchedule(s);
      assert.deepEqual(v.errors, [], `n=${n} double=${double}`);
      assert.equal(s.stats.matches, (n * (n - 1) / 2) * (double ? 2 : 1), `n=${n}`);
    }
  }
});

test("without blackouts, home/away breaks hit the minimum for every size 2..24", () => {
  for (let n = 2; n <= 24; n++) {
    const s = buildSchedule(baseSpec(n));
    assert.equal(s.stats.totalBreaks, n % 2 === 0 ? Math.max(0, n - 2) : 0, `n=${n}`);
    assert.ok(Math.max(...s.stats.home.map((h, i) => Math.abs(h - s.stats.away[i]))) <= 1, `n=${n}`);
    assert.equal(countBreaks(s).reduce((a, b) => a + b, 0), s.stats.totalBreaks);
  }
});

test("team schedule lists every game and the bye", () => {
  const s = buildSchedule(baseSpec(5));
  const rows = teamSchedule(s, 0);
  assert.equal(rows.length, 5);
  assert.equal(rows.filter((r) => r.bye).length, 1);
  assert.equal(rows.filter((r) => r.venue === "Home").length, 2);
  assert.deepEqual(new Set(rows.filter((r) => !r.bye).map((r) => r.opponent)), new Set(["Team 2", "Team 3", "Team 4", "Team 5"]));
});

test("CSV has a header, one row per match, quoting, and defuses formulas", () => {
  const s = buildSchedule({ ...baseSpec(4), teams: ['=SUM(1)', 'Hawks, The', 'Ow"ls', "Plain"] });
  const csv = scheduleCsv(s);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "Round,Date,Day,Time,Court,Home,Away");
  assert.equal(lines.length, 7);
  assert.match(csv, /'=SUM\(1\)/);
  assert.match(csv, /"Hawks, The"/);
  assert.match(csv, /"Ow""ls"/);
  assert.match(csv, /2026-10-06,Tue/);
});

test("ICS is well formed: one event per match, CRLF, escaped text, per-team filter", () => {
  const s = buildSchedule({ ...baseSpec(4), teams: ["A;1", "B,2", "C", "D"], times: ["18:00"] });
  const all = scheduleIcs(s, null, "20261001T000000Z");
  assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 6);
  assert.equal((all.match(/END:VEVENT/g) || []).length, 6);
  assert.ok(all.startsWith("BEGIN:VCALENDAR\r\n") && all.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(all.replace(/\r\n/g, ""), /[\n\r]/);
  assert.match(all, /A\\;1/);
  assert.match(all, /DTSTART:20261006T180000/);
  assert.match(all, /DTEND:20261006T190000/);
  const one = scheduleIcs(s, 2, "20261001T000000Z");
  assert.equal((one.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(one, /SUMMARY:C vs /);
  const uids = [...all.matchAll(/UID:(.*)\r/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
});

test("ICS uses all-day events when there is no time and carries a match across midnight", () => {
  const s = buildSchedule(baseSpec(2));
  assert.match(scheduleIcs(s, null, "20261001T000000Z"), /DTSTART;VALUE=DATE:20261006/);
  const late = buildSchedule(baseSpec(2, { times: ["23:30"], minutes: 90 }));
  assert.match(scheduleIcs(late, null, "20261001T000000Z"), /DTEND:20261007T010000/);
});

test("ICS lines are folded to 75 bytes", () => {
  const long = "A very long team name that keeps going and going well past the line limit".repeat(2);
  const s = buildSchedule({ ...baseSpec(2), teams: [long, "B"] });
  for (const line of scheduleIcs(s, null, "20261001T000000Z").split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test("plain-text share lists rounds, dates, venues and byes", () => {
  const text = scheduleText(buildSchedule(baseSpec(5)));
  assert.match(text, /5-team single round robin/);
  assert.match(text, /Round 1 - Tue 6 Oct 2026/);
  assert.match(text, /Bye: Team 1/);
  assert.match(text, /\(home\) vs /);
});

test("results parse, and standings order by points then goal difference", () => {
  const teams = ["Hawks", "Owls", "Kites"];
  const { results, errors } = parseResults("Hawks 3 - 1 Owls\nowls 2-2 Kites\nKites 0 - 1 Hawks\nGhosts 1 - 0 Hawks", teams);
  assert.equal(results.length, 3);
  assert.equal(errors.length, 1);
  const rows = standings(teams, results);
  assert.deepEqual(rows.map((r) => [r.name, r.points, r.gd]), [["Hawks", 6, 3], ["Owls", 1, -2], ["Kites", 1, -1]].sort((a, b) => b[1] - a[1] || b[2] - a[2]));
  assert.equal(rows[0].rank, 1);
});

test("a forfeit line awards the win at the walkover score and is ranked like a played result", () => {
  const teams = ["Hawks", "Owls", "Kites"];
  const { results, errors } = parseResults("Hawks w/o Owls\nkites WO hawks\nOwls walkover Kites\nHawks w/o Hawks\nGhosts w/o Owls", teams);
  assert.equal(errors.length, 2);
  assert.deepEqual(results.map((r) => [r.a, r.b, r.ga, r.gb, r.walkover]), [[0, 1, 3, 0, true], [2, 0, 3, 0, true], [1, 2, 3, 0, true]]);
  const rows = standings(teams, results);
  assert.deepEqual(rows.map((r) => [r.name, r.points, r.gd]), [["Hawks", 3, 0], ["Owls", 3, 0], ["Kites", 3, 0]]);
  const one = parseResults("Hawks w/o Owls", teams, { walkover: [1, 0] });
  assert.deepEqual([one.results[0].ga, one.results[0].gb], [1, 0]);
});

test("head-to-head tiebreak splits teams level on points by their own matches first", () => {
  const teams = ["A", "B", "C", "D"];
  const { results } = parseResults("A 5 - 0 C\nB 1 - 0 A\nD 1 - 0 B", teams);
  const names = (rows) => rows.map((r) => r.name).slice(0, 3);
  assert.deepEqual(names(standings(teams, results)), ["A", "D", "B"]);
  assert.deepEqual(names(standings(teams, results, { headToHead: true })), ["D", "B", "A"]);
  // a points leader is never overtaken by a head-to-head result
  const more = parseResults("A 5 - 0 C\nB 1 - 0 A\nD 1 - 0 B\nA 1 - 0 D", teams).results;
  assert.equal(standings(teams, more, { headToHead: true })[0].name, "A");
});

test("bracket seeding follows the standard order", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
});

test("a 5-team play-off gives the top 3 seeds a bye and has k-1 games", () => {
  const b = playoffBracket(["S1", "S2", "S3", "S4", "S5"]);
  assert.equal(b.size, 8);
  assert.equal(b.games, 4);
  const first = b.rounds[0].matches;
  assert.deepEqual(first.filter((m) => m.bye).map((m) => (m.a || m.b).seed).sort(), [1, 2, 3]);
  const real = first.find((m) => !m.bye);
  assert.deepEqual([real.a.seed, real.b.seed].sort(), [4, 5]);
  assert.equal(b.rounds.length, 3);
  assert.deepEqual(b.rounds[1].matches[0].a, { seed: 1, name: "S1" });
  assert.deepEqual(b.rounds[1].matches[0].b, { from: real.id });
});

test("play-off game count is k-1 for every field size 2..24 and 8 teams has no byes", () => {
  for (let k = 2; k <= 24; k++) assert.equal(playoffBracket(names(k)).games, k - 1, `k=${k}`);
  assert.equal(playoffBracket(names(8)).rounds[0].matches.some((m) => m.bye), false);
  assert.equal(playoffBracket(names(2)).rounds.length, 1);
  assert.throws(() => playoffBracket(["only"]));
});

test("play-off rounds are dated after the regular season on the league weekdays", () => {
  const s = buildSchedule(baseSpec(4));
  const b = playoffBracket(["A", "B", "C", "D"], { afterDay: s.stats.lastDay, weekdays: [2], skipDays: [] });
  assert.deepEqual(b.rounds.map((r) => dayIso(r.day)), ["2026-10-27", "2026-11-03"]);
  assert.match(bracketText(b), /Semifinals - Tue 27 Oct 2026/);
});

test("readSpec turns the page fields into a buildable spec and reports every bad field", () => {
  const { spec, errors } = readSpec(sampleFields());
  assert.deepEqual(errors, []);
  assert.equal(validateSchedule(buildSchedule(spec)).ok, true);
  const bad = readSpec({ ...sampleFields(), start: "nope", weekdays: [], times: "noon-ish", teams: "A" });
  assert.ok(bad.errors.length >= 4);
});

test("the example league validates and uses a makeup round for the blackout", () => {
  const { spec } = readSpec(sampleFields());
  const s = buildSchedule(spec);
  assert.equal(validateSchedule(s).ok, true);
  assert.equal(s.stats.matches, 15);
  assert.equal(s.rounds.filter((r) => r.makeup).length, 1);
});

test("share links round-trip every field, including non-ASCII names, and reject junk", () => {
  const f = { ...sampleFields(), teams: "Zoë's Ünited\nFC Ñandú\nA\nB", results: "A 1 - 0 B", rainouts: "2026-10-13 A", withdrawals: "2026-11-03 B", timeLimits: "A: 18:00", courtLimits: "A: Court 1", officials: "Pat (A): Tue max 4", grounds: "A, B" };
  const code = encodeFields(f);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeFields(code), { ...f, seed: 1, minutes: 60, playoffDouble: false, playoffThird: false });
  assert.deepEqual(decodeFields("#s=" + code), decodeFields(code));
  const again = decodeFields(code);
  assert.deepEqual(readSpec(again).spec.teams, readSpec(f).spec.teams);
  for (const junk of ["", null, "!!!", "bm90anNvbg", encodeFields({}).slice(0, 1), "W10"]) assert.equal(decodeFields(junk), null, String(junk));
  assert.equal(decodeFields(encodeFields({ weekdays: ["Tue", "Xyz"] })).weekdays.join(), "Tue");
});

test("rainout moves one team's match to the next free night and keeps the schedule valid", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const day = s.rounds[0].day;
  const before = s.rounds.map((r) => r.matches.length).reduce((a, b) => a + b, 0);
  const r = applyRainouts(s, `${dayIso(day)} A`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.moves.length, 1);
  assert.ok(r.moves[0].to > day);
  assert.equal(r.schedule.rounds.reduce((a, x) => a + x.matches.length, 0), before);
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
  assert.equal(s.rounds[0].matches.length, 2, "input is not mutated");
});

test("rainout of a whole night moves every match and reports bad lines", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const day = s.rounds[0].day;
  const r = applyRainouts(s, `${dayIso(day)}\n2030-01-01\n${dayIso(day)} Nobody`);
  assert.equal(r.moves.length, 2);
  assert.equal(r.errors.length, 3);
  assert.ok(r.schedule.rounds.every((x) => x.day !== day));
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
});

test("rainout respects blackouts", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", blackouts: "A: 2026-10-13", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const r = applyRainouts(s, `${dayIso(s.rounds[0].day)} A`);
  assert.ok(r.moves.every((m) => dayIso(m.to) !== "2026-10-13"));
  assert.equal(validateSchedule(r.schedule).ok, true);
});

const LIMIT_BASE = { teams: "A\nB\nC\nD\nE\nF", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "17:00, 18:00, 19:00" };

test("parseTimeLimits reads teams and times and reports bad lines", () => {
  const r = parseTimeLimits("A: 6pm, 17:00\nZed: 17:00\nB can only play 19:00\nnonsense\nC: late", ["A", "B", "C"]);
  assert.deepEqual(r.limits, { 0: ["17:00", "18:00"], 1: ["19:00"] });
  assert.equal(r.errors.length, 3);
});

test("a team limited to one time is only ever scheduled then, and the validator agrees", () => {
  const { spec, errors } = readSpec({ ...LIMIT_BASE, timeLimits: "A: 17:00\nB: 17:00, 18:00" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  for (const r of s.rounds) for (const m of r.matches) {
    if (m.home === 0 || m.away === 0) assert.equal(m.time, "17:00");
    if (m.home === 1 || m.away === 1) assert.notEqual(m.time, "19:00");
  }
  assert.deepEqual(s.notices.filter((n) => n.includes("only plays")), []);
  assert.equal(validateSchedule(s).ok, true, validateSchedule(s).errors.join(" "));
});

test("an impossible limit is reported as a notice rather than silently broken", () => {
  // three teams limited to the same single time but two matches a round on three courts-times: someone must clash only if slots run out
  const { spec } = readSpec({ ...LIMIT_BASE, courts: "Court 1", timeLimits: "A: 17:00\nB: 17:00\nC: 17:00\nD: 17:00" });
  const s = buildSchedule(spec);
  assert.ok(s.notices.some((n) => n.includes("only plays at")), s.notices.join(" | "));
  assert.equal(validateSchedule(s).ok, false);
});

test("a limit to a time the league does not use is ignored with a notice", () => {
  const { spec } = readSpec({ ...LIMIT_BASE, timeLimits: "A: 21:00" });
  const s = buildSchedule(spec);
  assert.ok(s.notices.some((n) => n.includes("not among")));
  assert.equal(validateSchedule(s).ok, true);
});

test("rainout moves keep a time-limited team at its time", () => {
  const { spec } = readSpec({ ...LIMIT_BASE, timeLimits: "A: 17:00" });
  const s = buildSchedule(spec);
  const r = applyRainouts(s, `${dayIso(s.rounds[0].day)} A`);
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].time, "17:00");
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
});

test("time limits survive a share link", () => {
  const f = { ...sampleFields(), timeLimits: "Lob Squad: 18:00" };
  assert.equal(decodeFields(encodeFields(f)).timeLimits, "Lob Squad: 18:00");
});

test("league web page is self-contained, escapes names, and lists every match", () => {
  const { spec } = readSpec({ ...sampleFields(), teams: "Fish <b>&Chips\nOwls\nHawks\nWolves\nBears" });
  const s = buildSchedule(spec);
  const html = leaguePageHtml(s, { title: "Spring <League>", table: standings(s.teams, []), bracket: playoffBracket(s.teams.slice(0, 4)) });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!html.includes("<b>&Chips") && html.includes("Fish &lt;b&gt;&amp;Chips"));
  assert.ok(html.includes("Spring &lt;League&gt;") && html.includes("<h2>Standings</h2>") && html.includes("<h2>Play-offs</h2>"));
  assert.equal((html.match(/<tr data-t="\d+ \d+">/g) || []).length, s.rounds.reduce((n, r) => n + r.matches.length, 0));
  assert.ok(!/(src|href)=["']https?:/.test(html), "no external requests");
  assert.equal((html.match(/class="bye"/g) || []).length, s.rounds.filter((r) => r.bye !== null && r.bye !== undefined).length);
});

test("snake pools spread the seeds and differ in size by at most one", () => {
  const pools = splitPools(names(10), 3);
  assert.deepEqual(pools.map((p) => p.name), ["Pool A", "Pool B", "Pool C"]);
  assert.deepEqual(pools[0].teams, ["Team 1", "Team 6", "Team 7"]);
  assert.deepEqual(pools[2].teams, ["Team 3", "Team 4", "Team 9", "Team 10"]);
  assert.equal(pools.flatMap((p) => p.teams).length, 10);
  assert.throws(() => splitPools(names(5), 3), /at least 6/);
});

test("pool play builds a valid round robin per pool, honouring a team's blackout", () => {
  const spec = baseSpec(8, { blackouts: { 1: [D("2026-10-06")] } });
  const play = buildPoolPlay(spec, 2);
  assert.equal(play.length, 2);
  for (const p of play) {
    assert.equal(validateSchedule(p.schedule).ok, true);
    assert.equal(p.schedule.teams.length, 4);
  }
  const b = play[1].schedule; // Team 2 is in Pool B
  assert.ok(b.teams.includes("Team 2"));
  const idx = b.teams.indexOf("Team 2");
  assert.ok(!b.rounds[0].matches.some((m) => m.home === idx || m.away === idx) || b.rounds[0].day !== D("2026-10-06"));
});

test("pool advancers seed winners, then runners-up, best record first", () => {
  const A = standings(["a1", "a2", "a3"], [{ a: 0, b: 1, ga: 2, gb: 0 }, { a: 0, b: 2, ga: 1, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 0 }]);
  const B = standings(["b1", "b2", "b3"], [{ a: 0, b: 1, ga: 5, gb: 0 }, { a: 0, b: 2, ga: 5, gb: 0 }, { a: 1, b: 2, ga: 0, gb: 0 }]);
  assert.deepEqual(poolAdvancers([A, B], 2), ["b1", "a1", "a2", "b2"]);
});

// ---- playoff race
test("playoff race: a finished league has its top spots clinched and the rest out", () => {
  const teams = ["A", "B", "C", "D"];
  const res = [[0,1],[0,2],[1,2],[1,3],[2,3],[0,3]].map(([a,b]) => ({ a, b, ga: 1, gb: 0 }));
  const done = playoffRace(teams, res, [], 2);
  assert.equal(done[0].name, "A");
  assert.deepEqual(done.map((r) => r.status), ["clinched", "clinched", "eliminated", "eliminated"]);
});

test("playoff race: clinched and eliminated agree with brute force over every outcome", () => {
  const rnd = mulberry32(7);
  for (let trial = 0; trial < 60; trial++) {
    const n = 3 + Math.floor(rnd() * 3);
    const teams = names(n);
    const fixtures = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) fixtures.push([a, b]);
    const played = fixtures.filter(() => rnd() < 0.5);
    const results = played.map(([a, b]) => ({ a, b, ga: Math.floor(rnd() * 3), gb: Math.floor(rnd() * 3) }));
    const remaining = fixtures.filter((f) => !played.includes(f));
    const spots = 1 + Math.floor(rnd() * (n - 1));
    const rows = playoffRace(teams, results, remaining, spots);
    assert.equal(rows.exact, true);
    // brute force: worst/best rank (ties against / for the team) over all 3^r outcomes
    const base = Array(n).fill(0);
    for (const r of results) { if (r.ga > r.gb) base[r.a] += 3; else if (r.ga < r.gb) base[r.b] += 3; else { base[r.a]++; base[r.b]++; } }
    let combos = [base];
    for (const [a, b] of remaining) combos = combos.flatMap((p) => [[3, 0], [1, 1], [0, 3]].map(([x, y]) => { const q = p.slice(); q[a] += x; q[b] += y; return q; }));
    for (const row of rows) {
      let always = true; let never = true;
      for (const p of combos) {
        const i = row.index;
        const worst = 1 + p.filter((v, j) => j !== i && v >= p[i]).length;
        const bestR = 1 + p.filter((v, j) => j !== i && v > p[i]).length;
        if (worst > spots) always = false;
        if (bestR <= spots) never = false;
      }
      assert.equal(row.status === "clinched", always, `trial ${trial} ${row.name}`);
      assert.equal(row.status === "eliminated", never, `trial ${trial} ${row.name}`);
    }
  }
});

test("playoff race: the bounds used for long fixture lists never contradict the exact answer", () => {
  const rnd = mulberry32(11);
  for (let trial = 0; trial < 40; trial++) {
    const n = 4 + Math.floor(rnd() * 2);
    const fixtures = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) fixtures.push([a, b]);
    const played = fixtures.filter(() => rnd() < 0.6);
    const results = played.map(([a, b]) => ({ a, b, ga: Math.floor(rnd() * 3), gb: Math.floor(rnd() * 3) }));
    const remaining = fixtures.filter((f) => !played.includes(f));
    const spots = 1 + Math.floor(rnd() * (n - 1));
    const exact = playoffRace(names(n), results, remaining, spots);
    const bound = playoffRace(names(n), results, remaining, spots, { exactLimit: -1 });
    assert.equal(bound.exact, false);
    for (const r of bound) {
      const e = exact.find((x) => x.index === r.index);
      if (r.status !== "alive") assert.equal(r.status, e.status, `trial ${trial} ${r.name}`);
    }
  }
  assert.ok(playoffRace(names(8), [], [[0, 1]], 4).every((r) => r.status === "alive"));
});

test("remainingFixtures clears one meeting per result and handles a double round robin", () => {
  const s = buildSchedule(baseSpec(4, { double: true }));
  assert.equal(remainingFixtures(s, []).length, 12);
  const left = remainingFixtures(s, [{ a: 0, b: 1, ga: 1, gb: 0 }, { a: 1, b: 0, ga: 2, gb: 2 }]);
  assert.equal(left.filter(([x, y]) => (x === 0 && y === 1) || (x === 1 && y === 0)).length, 0);
  assert.equal(left.length, 10);
});

test("raceText names each team's position", () => {
  const rows = playoffRace(["A", "B", "C"], [{ a: 0, b: 1, ga: 1, gb: 0 }], [[0, 2], [1, 2]], 1);
  const text = raceText(rows, 1);
  assert.match(text, /A: alive|A: clinched/);
  assert.match(text.split("\n").join(" "), /B:/);
});

test("officials parse team, weekday and cap, and report bad lines", () => {
  const teams = ["Hawks", "Owls", "Lynx", "Bears"];
  const { officials, errors } = parseOfficials("Sam\nPat (Hawks): Tue, Thu\nKit (Owls) max 3\nSam\nZed (Nobody)", teams);
  assert.deepEqual(officials.map((o) => o.name), ["Sam", "Pat", "Kit", "Zed"]);
  assert.equal(officials[1].team, 0);
  assert.deepEqual(officials[1].days, [2, 4]);
  assert.equal(officials[2].max, 3);
  assert.equal(errors.length, 2);
});

test("every match gets an official who obeys the hard rules, balanced", () => {
  const s = buildSchedule(baseSpec(6, { courts: ["A", "B", "C"], times: [] }));
  const teams = s.teams;
  const { officials } = parseOfficials(["Ann", "Bo (Team 1)", "Cy (Team 2)", "Di"].join("\n"), teams);
  const r = assignOfficials(s, officials);
  assert.equal(r.unfilled.length, 0);
  assert.deepEqual(validateOfficials(r.schedule, officials), []);
  // three matches a night need three different officials; with 4 officials loads stay within 1 of each other
  const counts = r.loads.map((l) => l.matches);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join());
  assert.equal(r.total, s.rounds.reduce((a, x) => a + x.matches.length, 0));
});

test("unfillable matches are named with a reason, never silently dropped", () => {
  const s = buildSchedule(baseSpec(4));
  const { officials } = parseOfficials("Ann: Mon\nBo max 1", s.teams);
  const r = assignOfficials(s, officials);
  assert.ok(r.unfilled.length > 0);
  assert.match(r.unfilled[0].reason, /off that weekday|cap/);
  assert.equal(assignOfficials(s, []).unfilled.length, r.total + r.unfilled.length);
  assert.deepEqual(validateOfficials(r.schedule, officials), []);
});

test("the validator catches a broken assignment and the CSV gains an Official column", () => {
  const s = buildSchedule(baseSpec(4));
  const { officials } = parseOfficials("Ann (Team 1)\nBo", s.teams);
  const r = assignOfficials(s, officials);
  const bad = JSON.parse(JSON.stringify(r.schedule));
  const m = bad.rounds[0].matches.find((x) => x.home === 0 || x.away === 0);
  m.official = "Ann";
  assert.ok(validateOfficials(bad, officials).some((e) => /belongs to a team/.test(e)));
  assert.match(scheduleCsv(r.schedule).split("\r\n")[0], /,Official$/);
  assert.doesNotMatch(scheduleCsv(s).split("\r\n")[0], /Official/);
  assert.match(scheduleText(r.schedule), /\[official: /);
});

test("league page and share link carry officials", () => {
  const s = buildSchedule(baseSpec(4));
  const { officials } = parseOfficials("A <b>\nBo", s.teams);
  const r = assignOfficials(s, officials);
  const html = leaguePageHtml(r.schedule);
  assert.match(html, /<th>Official<\/th>/);
  assert.doesNotMatch(html, /<b>/);
  assert.equal(decodeFields(encodeFields({ ...sampleFields(), officials: "Pat" })).officials, "Pat");
});

// ---------------------------------------------------------------- swiss

import { swissRounds, swissStandings, swissPairings, parseSwissResults, validateSwiss, swissText } from "./calc.mjs";

function playSwiss(n, rounds, winner = (a, b) => (a < b ? [1, 0] : [0, 1])) {
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const games = [];
  const byes = [];
  const sheets = [];
  for (let r = 0; r < rounds; r++) {
    const round = swissPairings(players, games, byes);
    assert.deepEqual(validateSwiss(players, games, byes, round), []);
    sheets.push(round);
    if (round.bye !== null) byes.push(round.bye);
    for (const p of round.pairs) { const [ga, gb] = winner(p.white, p.black); games.push({ a: p.white, b: p.black, ga, gb }); }
  }
  return { players, games, byes, sheets };
}

test("swiss round count is ceil(log2 n)", () => {
  assert.equal(swissRounds(8), 3);
  assert.equal(swissRounds(9), 4);
  assert.equal(swissRounds(2), 1);
});

test("swiss round 1 pairs top half against bottom half", () => {
  const players = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const r = swissPairings(players, []);
  const pairs = r.pairs.map((p) => [p.white, p.black].sort((x, y) => x - y).join("-")).sort();
  assert.deepEqual(pairs, ["0-4", "1-5", "2-6", "3-7"]);
  assert.equal(r.bye, null);
});

test("swiss never repeats a pairing and fills every board, even and odd fields", () => {
  for (const n of [4, 5, 8, 9, 12, 13, 16]) {
    const { games, players } = playSwiss(n, swissRounds(n));
    const seen = new Set();
    for (const g of games) {
      const key = [g.a, g.b].sort().join("|");
      assert.ok(!seen.has(key), `rematch with ${n} players`);
      seen.add(key);
    }
    assert.equal(players.length, n);
  }
});

test("swiss gives each bye to a different player and the bye counts as a win", () => {
  const { byes, players, games } = playSwiss(7, 5);
  assert.equal(new Set(byes).size, byes.length);
  const t = swissStandings(players, games, byes);
  assert.ok(t.every((r) => r.byes <= 1));
});

test("swiss leader after log2 rounds with no upsets is the top seed and the table is ordered", () => {
  const { players, games, byes } = playSwiss(8, 3);
  const t = swissStandings(players, games, byes);
  assert.equal(t[0].name, "P1");
  assert.equal(t[0].score, 3);
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].score >= t[i].score);
});

test("swiss colours stay balanced within two", () => {
  const { players, games } = playSwiss(8, 5, (a, b) => (a < b ? [1, 0] : [0, 1]));
  const t = swissStandings(players, games);
  for (const r of t) assert.ok(Math.abs(r.whites - r.blacks) <= 2, `${r.name} ${r.whites}/${r.blacks}`);
});

test("swiss results parse wins, draws and byes, and report unknown names", () => {
  const players = ["Ana", "Ben", "Cy"];
  const { games, byes, errors } = parseSwissResults("Ana 1 - 0 Ben\nCy bye\nZed 1 - 0 Ana\nDee bye", players);
  assert.equal(games.length, 1);
  assert.deepEqual(byes, [2]);
  assert.equal(errors.length, 2);
  const t = swissStandings(players, [{ a: 0, b: 1, ga: 1, gb: 1 }], []);
  assert.equal(t[0].score, 0.5);
});

test("swiss refuses when no rematch-free pairing exists and prints a sheet", () => {
  const players = ["A", "B", "C", "D"];
  const games = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]].map(([a, b]) => ({ a, b, ga: 1, gb: 0 }));
  assert.throws(() => swissPairings(players, games), /rematch/);
  const text = swissText(players, swissPairings(players, []), 1);
  assert.match(text, /Board 1: A \(white\) vs C \(black\)/);
});

test("head-to-head puts the winner of the meeting above a level team with a better goal difference", () => {
  const teams = ["A", "B", "C", "D"];
  const results = [[0, 1, 0, 1], [0, 3, 5, 0], [1, 2, 0, 1], [2, 3, 0, 0], [1, 3, 0, 2]].map(([a, b, ga, gb]) => ({ a, b, ga, gb }));
  assert.deepEqual(names2(standings(teams, results)), ["C", "D", "A", "B"]);
  assert.deepEqual(names2(standings(teams, results, { headToHead: true })), ["C", "D", "B", "A"]);
});
const names2 = (rows) => rows.map((r) => r.name);

test("schedule stats keep one court and time tally per team, no more", () => {
  const s = buildSchedule(baseSpec(4, { courts: ["Court 1", "Court 2"], times: ["18:00", "19:00"] }));
  assert.equal(s.stats.byCourt.length, 4);
  assert.equal(s.stats.byTime.length, 4);
});

test("swiss standings start every player at zero games played", () => {
  const t = swissStandings(["A", "B", "C"], [{ a: 0, b: 1, ga: 1, gb: 0 }], [2]);
  assert.deepEqual(t.map((r) => [r.name, r.played]).sort(), [["A", 1], ["B", 1], ["C", 0]]);
});

test("head-to-head falls back to goals scored in the meetings when points and goal difference are level", () => {
  const results = [[0, 1, 2, 1], [1, 2, 3, 2], [2, 0, 1, 0]].map(([a, b, ga, gb]) => ({ a, b, ga, gb }));
  assert.deepEqual(names2(standings(["A", "B", "C"], results, { headToHead: true })), ["B", "C", "A"]);
});

test("schedule stats count each team's court and time use from zero", () => {
  const s = buildSchedule(baseSpec(4, { courts: ["Court 1", "Court 2"], times: ["18:00", "19:00"] }));
  const total = (rec) => rec.reduce((a, o) => a + Object.values(o).reduce((x, y) => x + y, 0), 0);
  assert.equal(total(s.stats.byCourt), 2 * s.stats.matches);
  assert.equal(total(s.stats.byTime), 2 * s.stats.matches);
});

// ---------------------------------------------------------------- double elimination

function playDouble(names, pick) {
  const b = doubleEliminationBracket(names);
  const win = new Map(), lose = new Map(), losses = new Map(), opponents = [];
  const res = (s) => (s.none ? null : s.seed ? s.name : s.from ? win.get(s.from) : lose.get(s.loserOf));
  let played = 0;
  for (const r of b.rounds) {
    for (const m of r.matches) {
      if (m.dead) continue;
      const x = res(m.a), y = res(m.b);
      if (r.conditional) {
        const gf = opponents.at(-1);
        if (win.get("GF1") === gf.lbTeam) {
          const w = pick(x, y);
          win.set(m.id, w); lose.set(m.id, w === x ? y : x); losses.set(lose.get(m.id), (losses.get(lose.get(m.id)) || 0) + 1); played++;
        }
        continue;
      }
      assert.ok(x !== undefined && y !== undefined, `${m.id} has an unresolved slot`);
      if (x === null || y === null) { assert.ok(m.bye, m.id); win.set(m.id, x ?? y); lose.set(m.id, null); continue; }
      assert.notEqual(x, y, `${m.id} plays itself`);
      const w = pick(x, y);
      win.set(m.id, w); lose.set(m.id, w === x ? y : x);
      losses.set(lose.get(m.id), (losses.get(lose.get(m.id)) || 0) + 1); played++;
      if (m.id === "GF1") opponents.push({ lbTeam: y });
    }
  }
  return { b, played, losses, champion: win.get("GF2") && opponents.at(-1) && win.get("GF1") === opponents.at(-1).lbTeam ? win.get("GF2") : win.get("GF1") };
}

test("double elimination: top seed always winning plays exactly 2k-2 games and nobody loses more than twice", () => {
  for (let k = 3; k <= 17; k++) {
    const names = Array.from({ length: k }, (_, i) => `T${i + 1}`);
    const rank = (n) => Number(n.slice(1));
    const { b, played, losses, champion } = playDouble(names, (x, y) => (rank(x) < rank(y) ? x : y));
    assert.equal(champion, "T1", `k=${k}`);
    assert.equal(played, 2 * k - 2, `k=${k} games`);
    assert.equal(b.games, 2 * k - 2, `k=${k} reported games`);
    assert.equal(b.maxGames, 2 * k - 1);
    for (const [t, n] of losses) if (t) assert.ok(n <= 2, `${t} lost ${n}`);
    assert.equal(losses.get("T1") || 0, 0);
  }
});

test("double elimination: random results always end with one champion, every other team out on two losses", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let k = 3; k <= 17; k++) {
    for (let rep = 0; rep < 20; rep++) {
      const names = Array.from({ length: k }, (_, i) => `T${i + 1}`);
      const { b, played, losses, champion } = playDouble(names, (x, y) => (rnd() < 0.5 ? x : y));
      assert.ok(champion);
      const out = [...losses].filter(([t, n]) => t && n === 2).length;
      assert.equal(out, k - 1, `k=${k}: exactly k-1 teams eliminated`);
      assert.ok((losses.get(champion) || 0) <= 1);
      assert.ok(played === b.games || played === b.maxGames, `k=${k}: ${played}`);
    }
  }
});

test("double elimination: byes, text and refusals", () => {
  const b = doubleEliminationBracket(["A", "B", "C", "D", "E"]);
  assert.equal(b.size, 8);
  assert.ok(b.rounds[0].matches.some((m) => m.bye));
  const txt = bracketText(b);
  assert.match(txt, /double elimination/);
  assert.match(txt, /loser of W1M/);
  assert.match(txt, /Grand final/);
  assert.doesNotMatch(txt, /NaN|undefined/);
  assert.throws(() => doubleEliminationBracket(["A", "B"]), /at least three/);
});

test("a withdrawal removes the team's remaining matches, names who is short, and stays valid", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const total = s.rounds.reduce((a, r) => a + r.matches.length, 0);
  const r = applyWithdrawals(s, "D");
  assert.deepEqual(r.errors, []);
  assert.equal(r.withdrawals[0].removed.length, 3);
  assert.deepEqual(r.withdrawals[0].opponentsShort.map((o) => o.fixtures), [1, 1, 1]);
  assert.equal(r.schedule.rounds.reduce((a, x) => a + x.matches.length, 0), total - 3);
  assert.ok(r.schedule.rounds.every((x) => x.matches.every((m) => m.home !== 3 && m.away !== 3)));
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
  assert.equal(s.rounds.reduce((a, x) => a + x.matches.length, 0), total, "input is not mutated");
});

test("a dated withdrawal keeps matches already played and rejects bad lines", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const second = s.rounds[1].day;
  const r = applyWithdrawals(s, `${dayIso(second)} D\nNobody\n2026-13-45 C\nD`);
  assert.equal(r.withdrawals.length, 1);
  assert.equal(r.withdrawals[0].removed.length, 2);
  assert.ok(r.schedule.rounds[0].matches.some((m) => m.home === 3 || m.away === 3), "the first night's match with D stays");
  assert.equal(r.errors.length, 3);
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
});

test("withdrawals leave a double round robin valid for the teams still playing", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD\nE", start: "2026-10-06", weekdays: "Tue", double: true, courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const r = applyWithdrawals(s, "C");
  const v = validateSchedule(r.schedule);
  assert.equal(v.ok, true, v.errors.join(" "));
});

test("restReport: weekly league has 7-day gaps; adjacent weekdays show back-to-back games", () => {
  const weekly = buildSchedule(baseSpec(4));
  const r = restReport(weekly);
  assert.equal(r.shortest, 7);
  assert.equal(r.longest, 7);
  assert.equal(r.back_to_back, 0);
  assert.equal(r.rows.length, 4);
  assert.ok(r.rows.every((x) => x.games === 3));

  const daily = buildSchedule(baseSpec(4, { weekdays: [2, 3] }));
  const d = restReport(daily);
  assert.equal(d.shortest, 1);
  assert.ok(d.back_to_back > 0);
  // independent recount from the rounds
  let count = 0;
  for (let t = 0; t < 4; t++) {
    const ds = daily.rounds.filter((x) => x.matches.some((m) => m.home === t || m.away === t)).map((x) => x.day).sort((a, b) => a - b);
    for (let k = 1; k < ds.length; k++) if (ds[k] - ds[k - 1] <= 1) count++;
  }
  assert.equal(d.back_to_back, count);
});

test("restReport: longest is the largest gap across all teams, not the last team's", () => {
  const sch = { teams: ["A", "B", "C"], rounds: [
    { day: 0, matches: [{ home: 0, away: 1 }] },
    { day: 10, matches: [{ home: 0, away: 2 }] },
    { day: 12, matches: [{ home: 1, away: 2 }] },
  ] };
  const r = restReport(sch);
  assert.deepEqual(r.rows.map((x) => x.longest), [10, 12, 2]);
  assert.equal(r.longest, 12);
  assert.equal(r.shortest, 2);
});

test("restReport: a single round gives null gaps", () => {
  const r = restReport(buildSchedule(baseSpec(2)));
  assert.equal(r.shortest, null);
  assert.equal(r.longest, null);
});

test("rematchReport: double round-robin gap between each pair's meetings, recounted independently", () => {
  const sch = buildSchedule(baseSpec(4, { double: true }));
  const r = rematchReport(sch);
  assert.equal(r.pairs.length, 6);
  const days = {};
  for (const rd of sch.rounds) for (const m of rd.matches) (days[[m.home, m.away].sort().join("-")] ||= []).push(rd.day);
  const gaps = Object.values(days).map((d) => { assert.equal(d.length, 2); return Math.abs(d[1] - d[0]); });
  assert.equal(r.shortest, Math.min(...gaps));
  assert.equal(r.longest, Math.max(...gaps));
  assert.ok(r.pairs.every((p, i) => i === 0 || r.pairs[i - 1].gap <= p.gap));
  assert.ok(r.shortest >= 7);
});

test("rematchReport: single round-robin has no rematches", () => {
  const r = rematchReport(buildSchedule(baseSpec(4)));
  assert.deepEqual(r, { pairs: [], shortest: null, longest: null });
});

test("parseGrounds: groups known teams, rejects unknown names and single-team lines", () => {
  const teams = names(6);
  const r = parseGrounds("Team 1, team 2\nTeam 3; Team 9\nTeam 4", teams);
  assert.deepEqual(r.groups, [[0, 1]]);
  assert.equal(r.errors.length, 3);
});

test("applyGroundSharing: clubmates are never both at home when it can be avoided, and the schedule stays valid", () => {
  for (const double of [false, true]) {
    const sch = buildSchedule(baseSpec(8, { double, courts: ["A", "B", "C", "D"] }));
    const groups = [[0, 1], [2, 3]];
    const before = groundClashes(sch, groups);
    const r = applyGroundSharing(sch, groups);
    // recount independently from the output rounds
    let clash = 0;
    for (const rd of r.schedule.rounds) {
      const home = rd.matches.map((m) => m.home);
      for (const g of groups) if (g.every((t) => home.includes(t))) clash++;
    }
    assert.equal(clash, r.remainingCount);
    assert.ok(r.remainingCount <= before.count);
    assert.equal(validateSchedule(r.schedule).ok, true);
    assert.equal(r.flips.length > 0, before.count > 0);
    // input untouched; dates and pairings unchanged
    assert.equal(groundClashes(sch, groups).count, before.count);
    const pairs = (s) => s.rounds.map((rd) => rd.day + ":" + rd.matches.map((m) => Math.min(m.home, m.away) + "-" + Math.max(m.home, m.away)).sort().join(",")).join("|");
    assert.equal(pairs(r.schedule), pairs(sch));
  }
});

test("applyGroundSharing: nothing to do leaves the schedule alone; share link keeps grounds", () => {
  const sch = buildSchedule(baseSpec(4));
  const r = applyGroundSharing(sch, [[0, 1]]);
  assert.equal(r.flips.length, groundClashes(sch, [[0, 1]]).count > 0 ? r.flips.length : 0);
  assert.equal(decodeFields(encodeFields({ ...sampleFields(), grounds: "Team 1, Team 2" })).grounds, "Team 1, Team 2");
});

test("standingsCsv lists every team ranked, quoting names with commas", () => {
  const teams = ["Hawks, A", "Owls", "Wolves"];
  const table = standings(teams, [{ a: 0, b: 1, ga: 3, gb: 1 }, { a: 1, b: 2, ga: 2, gb: 2 }]);
  const lines = standingsCsv(table).split("\r\n");
  assert.equal(lines[0], "Rank,Team,Played,Won,Drawn,Lost,For,Against,GD,Points");
  assert.equal(lines[1], '1,"Hawks, A",1,1,0,0,3,1,2,3');
  assert.equal(lines.length, 5);
  assert.equal(lines[4], "");
});

import { americano, validateAmericano, americanoStats, americanoText } from "./calc.mjs";

test("americano: every size 4..24 passes the validator, byes and games stay even", () => {
  for (let n = 4; n <= 24; n++) {
    const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
    for (const courts of [1, 2, 6]) {
      const plan = americano(players, { courts, rounds: 6, seed: n });
      assert.deepEqual(validateAmericano(players, plan), [], `n=${n} courts=${courts}`);
      const st = americanoStats(players, plan);
      assert.ok(Math.max(...st.byes) - Math.min(...st.byes) <= 1, `byes n=${n} courts=${courts}`);
      assert.ok(plan.rounds.every((r) => r.matches.length <= courts));
    }
  }
});

test("americano: 8 players on 2 courts, 7 rounds never repeat a partner and is deterministic", () => {
  const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`);
  const a = americano(players, { courts: 2, rounds: 7, seed: 3 });
  const b = americano(players, { courts: 2, rounds: 7, seed: 3 });
  assert.deepEqual(a.rounds, b.rounds);
  const st = americanoStats(players, a);
  assert.equal(st.repeatPartners, 0);
  assert.ok(st.games.every((g) => g === 7));
});

test("americano: default round count is n-1 only when every player plays each round", () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `P${i}`);
  assert.equal(americano(names(8), { courts: 2 }).rounds.length, 7);
  assert.equal(americano(names(20), { courts: 4 }).rounds.length, 20);
  assert.equal(americano(names(8), { courts: 1 }).rounds.length, 8);
});

test("americano: input errors and text sheet", () => {
  assert.throws(() => americano(["a", "b", "c"]), /at least 4/);
  assert.throws(() => americano(["a", "b", "c", "d"], { courts: 0 }), /court/);
  const players = ["Ana", "Ben", "Cy", "Dee", "Eli"];
  const plan = americano(players, { courts: 1, rounds: 5 });
  const txt = americanoText(players, plan);
  assert.match(txt, /Round 1\n {2}Court 1: \w+ & \w+ vs \w+ & \w+\n {2}Sitting out: \w+/);
  const st = americanoStats(players, plan);
  assert.deepEqual(st.byes, [1, 1, 1, 1, 1]);
});

import { parseMexicanoScores, mexicanoStandings, mexicanoNextRound, mexicanoText } from "./calc.mjs";

test("mexicano: scores parse, bad lines are named, and credit goes to each side", () => {
  const players = ["Ana", "Ben", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"];
  const { games, errors } = parseMexicanoScores("Ana & Ben 21-17 Cy & Dee\nely & Fay 10-10 gus & Hal\nAna & Zed 1-0 Cy & Dee\nnonsense", players);
  assert.equal(games.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /Line 2.*"ely"/);
  assert.match(errors[1], /Line 3.*"Zed"/);
  assert.match(errors[2], /Line 4/);
  const t = mexicanoStandings(players, games);
  assert.deepEqual(t.slice(0, 2).map((r) => r.name), ["Ana", "Ben"]);
  assert.equal(t[0].pf, 21); assert.equal(t[0].diff, 4);
  const dee = t.find((r) => r.name === "Dee");
  assert.equal(dee.pf, 17); assert.equal(dee.losses, 1);
});

test("mexicano: every round places each player once, top four play together, nobody repeats a partner early", () => {
  for (let n = 4; n <= 20; n++) {
    const players = Array.from({ length: n }, (_, i) => `P${i}`);
    for (const courts of [1, 2, 3]) {
      const games = [];
      const rng = mulberry32(n * 10 + courts);
      for (let r = 0; r < 6; r++) {
        const round = mexicanoNextRound(players, games, { courts, seed: 5 });
        const seen = new Set();
        for (const m of round.matches) for (const i of [...m.a, ...m.b]) { assert.ok(!seen.has(i)); seen.add(i); }
        for (const i of round.byes) { assert.ok(!seen.has(i)); seen.add(i); }
        assert.equal(seen.size, n);
        assert.equal(round.matches.length, Math.min(Math.floor(n / 4), courts));
        for (const m of round.matches) games.push({ ...m, sa: Math.floor(rng() * 25), sb: Math.floor(rng() * 25) });
      }
      const played = mexicanoStandings(players, games).map((r) => r.played);
      // sitting out goes to whoever has played most, so games stay within one of even
      assert.ok(Math.max(...played) - Math.min(...played) <= 1, `n=${n} courts=${courts}`);
    }
  }
});

test("mexicano: round one byes go to the lowest random draws among players with equal games", () => {
  const players = Array.from({ length: 7 }, (_, i) => `P${i}`);
  const seed = 11;
  const rng = mulberry32(seed);
  const jitter = players.map(() => rng());
  const expected = [...players.keys()].sort((x, y) => jitter[x] - jitter[y]).slice(0, 3).sort((x, y) => x - y);
  assert.deepEqual(mexicanoNextRound(players, [], { courts: 1, seed }).byes, expected);
});

test("mexicano: after scores, the leaders meet and the standard 1&4 vs 2&3 split is used first", () => {
  const players = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const { games } = parseMexicanoScores("A & B 21-5 C & D\nE & F 5-21 G & H", players);
  const round = mexicanoNextRound(players, games, { courts: 2, seed: 1 });
  // table: A,B (21) then G,H (21) tie on pf and diff -> index order A,B,G,H ; then C,D,E,F
  const top = round.matches[0];
  const names = [...top.a, ...top.b].map((i) => players[i]).sort().join("");
  assert.equal(names, "ABGH");
  // A&B and G&H already partnered, so the split must avoid both pairs
  assert.equal(round.repeatPartners, 0);
  const txt = mexicanoText(players, round, mexicanoStandings(players, games), 2);
  assert.match(txt, /^Round 2/);
  assert.match(txt, /Standings/);
  assert.throws(() => mexicanoNextRound(["a", "b", "c"], []), /at least 4/);
});

test("pool play spreads clubmates across pools without changing sizes or the seed rows", () => {
  const teams = names(8);
  const clubs = [["Team 1", "Team 4"], ["Team 2", "Team 3"]];
  const plain = splitPools(teams, 2);
  assert.equal(clubPairsInPools(plain, clubs), 2);
  const apart = splitPools(teams, 2, clubs);
  assert.equal(clubPairsInPools(apart, clubs), 0);
  assert.deepEqual(apart.map((p) => p.teams.length), [4, 4]);
  assert.deepEqual(apart.flatMap((p) => p.teams).sort(), teams.slice().sort());
  assert.deepEqual(splitPools(teams, 2, clubs), apart, "deterministic");
  // a club bigger than the number of pools cannot be fully separated, but is never made worse
  const big = [["Team 1", "Team 2", "Team 3"]];
  assert.ok(clubPairsInPools(splitPools(teams, 2, big), big) <= clubPairsInPools(splitPools(teams, 2), big));
  assert.deepEqual(splitPools(teams, 2, []), plain);
});

test("points adjustments: deductions and bonuses change the table, the race and the tiebreaks", () => {
  const teams = ["Hawks", "Owls", "Lynx"];
  const pr = parseResults("Hawks 2 - 0 Owls\nOwls 1 - 0 Lynx\nHawks -3 pts (late fee)\nLynx +1\nLynx +1 point", teams);
  assert.deepEqual(pr.errors, []);
  assert.equal(pr.results.length, 2);
  assert.deepEqual(pr.adjustments, { 0: -3, 2: 2 });
  const rows = standings(teams, pr.results, { adjustments: pr.adjustments });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by.Hawks.points, 0);
  assert.equal(by.Hawks.adj, -3);
  assert.equal(by.Owls.points, 3);
  assert.equal(by.Lynx.points, 2);
  assert.deepEqual(rows.map((r) => r.name), ["Owls", "Lynx", "Hawks"]);
  assert.equal(standings(teams, pr.results)[0].name, "Hawks");
  const race = playoffRace(teams, pr.results, [], 1, { adjustments: pr.adjustments });
  assert.equal(race.find((r) => r.name === "Hawks").points, 0);
  assert.equal(race[0].name, "Owls");
});

test("points adjustments: unknown team is reported, a score line is never read as an adjustment", () => {
  const teams = ["Team 5", "Foo"];
  const pr = parseResults("Team 5 3 - 2 Foo\nGhosts -1", teams);
  assert.equal(pr.results.length, 1);
  assert.equal(pr.errors.length, 1);
  assert.deepEqual(pr.adjustments, {});
});

test("team messages give each team only its own fixtures, with byes", () => {
  const s = buildSchedule(baseSpec(5));
  const msgs = teamMessages(s);
  assert.equal(msgs.length, 5);
  assert.match(msgs[0].text, /^Hi Team 1, your fixtures:/);
  assert.match(msgs[0].text, /bye \(no game\)/);
  assert.equal((msgs[0].text.match(/ vs /g) || []).length, 4);
  assert.ok(!msgs[0].text.includes("Team 1 vs"));
});

test("third-place match: loser of each semi-final, same day as the final, one extra game", () => {
  const names = (k) => Array.from({ length: k }, (_, i) => `T${i + 1}`);
  for (let k = 4; k <= 24; k++) {
    const b = playoffBracket(names(k), { thirdPlace: true });
    assert.equal(b.games, k, `k=${k}`);
    const last = b.rounds[b.rounds.length - 1].matches;
    const semis = b.rounds[b.rounds.length - 2].matches.map((m) => m.id);
    assert.deepEqual(last.map((m) => m.id), [last[0].id, "3P"]);
    assert.deepEqual([last[1].a.loserOf, last[1].b.loserOf], semis);
  }
  assert.equal(playoffBracket(names(3), { thirdPlace: true }).games, 2);
  assert.match(bracketText(playoffBracket(names(4), { thirdPlace: true })), /3P: loser of R1M1 vs loser of R1M2/);
});

test("share link keeps the double-elimination and third-place ticks", () => {
  const f = { ...sampleFields(), playoffDouble: true, playoffThird: true };
  const back = decodeFields(encodeFields(f));
  assert.equal(back.playoffDouble, true);
  assert.equal(back.playoffThird, true);
});

test("swiss Sonneborn-Berger counts full opponent score per win and half per draw,", () => {
  // A beat C; C beat D; D beat B; E drew B. Scores: A1 C1 D1 B0.5 E0.5.
  const players = ["A", "B", "C", "D", "E"];
  const games = [
    { a: 0, b: 2, ga: 1, gb: 0 },
    { a: 2, b: 3, ga: 1, gb: 0 },
    { a: 3, b: 1, ga: 1, gb: 0 },
    { a: 4, b: 1, ga: 1, gb: 1 },
  ];
  const t = Object.fromEntries(swissStandings(players, games).map((r) => [r.name, r]));
  assert.equal(t.A.sonnebornBerger, 1); // beat C (1)
  assert.equal(t.C.sonnebornBerger, 1); // beat D (1)
  assert.equal(t.D.sonnebornBerger, 0.5); // beat B (0.5)
  assert.equal(t.E.sonnebornBerger, 0.25); // drew B (0.5) -> half
  assert.equal(t.B.sonnebornBerger, 0.25); // drew E (0.5) -> half
});

test("rainout with '-> date' moves the match to the named day, or refuses and keeps it", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const day = s.rounds[0].day;
  const total = (x) => x.rounds.reduce((a, r) => a + r.matches.length, 0);
  const thu = day + 2;
  const r = applyRainouts(s, `${dayIso(day)} A -> ${dayIso(thu)}`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].to, thu);
  assert.equal(total(r.schedule), total(s));
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
  // a day both teams are already playing is refused and the match stays where it was
  const next = s.rounds[1].day;
  const clash = applyRainouts(s, `${dayIso(day)} A → ${dayIso(next)}`);
  assert.equal(clash.moves.length, 0);
  assert.equal(clash.errors.length, 1);
  assert.equal(total(clash.schedule), total(s));
  // a date that is not after the cancelled night, and a malformed date
  assert.equal(applyRainouts(s, `${dayIso(day)} A -> ${dayIso(day)}`).errors.length, 1);
  assert.equal(applyRainouts(s, `${dayIso(day)} A -> 2026-02-31`).errors.length, 1);
});

test("parseCourtLimits matches court names case-insensitively and reports bad lines", () => {
  const r = parseCourtLimits("A: court 2\nZed: Court 1\nB can only play on Court 1\nC: Pitch 9\nnonsense", ["A", "B", "C"], ["Court 1", "Court 2"]);
  assert.deepEqual(r.limits, { 0: ["Court 2"], 1: ["Court 1"] });
  assert.equal(r.errors.length, 3);
});

test("a team limited to one court is only ever put there, through a rainout too, and the validator agrees", () => {
  const { spec, errors } = readSpec({ ...LIMIT_BASE, courtLimits: "A: Court 2\nB: Court 1, Court 2" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  for (const r of s.rounds) for (const m of r.matches) if (m.home === 0 || m.away === 0) assert.equal(m.court, "Court 2");
  assert.deepEqual(s.notices.filter((n) => n.includes("only plays")), []);
  assert.equal(validateSchedule(s).ok, true, validateSchedule(s).errors.join(" "));
  const r = applyRainouts(s, `${dayIso(s.rounds[0].day)} A`);
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].court, "Court 2");
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
});

test("an unknown court name is an error, and a validator breach is caught", () => {
  const bad = readSpec({ ...LIMIT_BASE, courtLimits: "A: Court 9" });
  assert.ok(bad.errors.some((e) => e.includes("not one of the courts")));
  const { spec } = readSpec({ ...LIMIT_BASE, courtLimits: "A: Court 1" });
  const s = buildSchedule(spec);
  const mt = s.rounds.flatMap((r) => r.matches).find((m) => m.home === 0 || m.away === 0);
  mt.court = "Court 2";
  assert.ok(validateSchedule(s).errors.some((e) => e.includes("only plays on")));
});

test("court limits survive a share link", () => {
  const f = { ...sampleFields(), courtLimits: "Lob Squad: Court 1" };
  assert.equal(decodeFields(encodeFields(f)).courtLimits, "Lob Squad: Court 1");
});

test("slotFairness: names the team behind the widest time and court gap, matches scheduleStats", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD\nE\nF", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00, 19:00" });
  const s = buildSchedule(spec);
  const f = slotFairness(s);
  assert.equal(f.time.spread, s.stats.timeSpread);
  assert.equal(f.court.spread, s.stats.courtSpread);
  const i = s.teams.indexOf(f.time.team);
  assert.equal(s.stats.byTime[i][f.time.most], f.time.mostCount);
  assert.equal(s.stats.byTime[i][f.time.least], f.time.leastCount);
});

test("slotFairness: one court and one slot leave nothing to compare", () => {
  const f = slotFairness(buildSchedule(baseSpec(2, { courts: ["Court 1"], times: ["18:00"] })));
  assert.equal(f.court, null);
  assert.equal(f.time, null);
});

test("seasonCost: court-hours times rate, split across teams rounded up to the cent", () => {
  const sch = buildSchedule(baseSpec(4, { minutes: 90 }));
  const c = seasonCost(sch, { rate: 40, officialFee: 5 });
  assert.equal(c.matches, 6);
  assert.equal(c.courtHours, 9);
  assert.equal(c.courtCost, 360);
  assert.equal(c.officialCost, 30);
  assert.equal(c.total, 390);
  assert.equal(c.perTeam, 97.5);
  // 7 teams: 21 matches x 1h x 10 = 210, split 7 ways
  const odd = seasonCost(buildSchedule(baseSpec(7)), { rate: 10 });
  assert.equal(odd.total, 210);
  assert.equal(odd.perTeam, 30);
  const up = seasonCost(buildSchedule(baseSpec(3)), { rate: 10 });
  assert.equal(up.total, 30);
  assert.equal(up.perTeam, 10);
  const frac = seasonCost(buildSchedule(baseSpec(6)), { rate: 10.01 });
  assert.equal(frac.total, 150.15);
  assert.equal(frac.perTeam, 25.03);
  assert.ok(frac.perTeam * 6 >= frac.total);
  for (const bad of [undefined, "", -1, "abc"]) assert.equal(seasonCost(sch, { rate: bad }), null);
});

test("deadlineCheck: last game against a must-finish date, counting the rounds after it", () => {
  const sch = buildSchedule(baseSpec(4)); // Tuesdays from 2026-10-06, 3 rounds
  const last = sch.rounds[sch.rounds.length - 1].day;
  assert.equal(dayIso(last), "2026-10-20");
  const ok = deadlineCheck(sch, parseDate("2026-10-27"));
  assert.deepEqual([ok.fits, ok.daysSpare, ok.roundsAfter, ok.matchesAfter], [true, 7, 0, 0]);
  const exact = deadlineCheck(sch, last);
  assert.deepEqual([exact.fits, exact.daysSpare], [true, 0]);
  const tight = deadlineCheck(sch, parseDate("2026-10-13"));
  assert.deepEqual([tight.fits, tight.daysSpare, tight.roundsAfter, tight.matchesAfter], [false, -7, 1, 2]);
  assert.equal(deadlineCheck(sch, null), null);
  assert.equal(deadlineCheck(sch, NaN), null);
  assert.equal(deadlineCheck({ rounds: [] }, 5), null);
});

test("standings show each team's last five results, oldest first", async () => {
  const { formString, standings: st } = await import("./calc.mjs");
  const teams = ["A", "B", "C"];
  const results = [
    { a: 0, b: 1, ga: 2, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 1 }, { a: 2, b: 0, ga: 3, gb: 1 },
    { a: 0, b: 1, ga: 0, gb: 0 }, { a: 0, b: 2, ga: 4, gb: 0 }, { a: 1, b: 0, ga: 0, gb: 1 }, { a: 0, b: 2, ga: 2, gb: 1 },
  ];
  assert.equal(formString(0, results, 5), "LDWWW");
  assert.equal(formString(1, results, 5), "LDDL");
  const rows = st(teams, results);
  assert.equal(rows.find((r) => r.name === "A").form, "LDWWW");
});
