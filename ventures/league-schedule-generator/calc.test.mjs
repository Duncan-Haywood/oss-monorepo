import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRainouts, changeNotices, dayLabel, applyPinnedMatches, applyWithdrawals, applyLateTeams, toDay, dayIso, dayOfWeek, parseDate, parseDateList, parseWeekdays, parseTime, parseTeams, parseBlackouts, parseTimes,
  readSpec, roundRobin, countBreaks, mulberry32, buildSchedule, validateSchedule, teamSchedule, scheduleCsv, scheduleCalendarCsv, seasonGrid, seasonGridCsv, standingsCsv, scheduleIcs,
  scheduleText, teamMessages, officialMessages, leaguePageHtml, scoreSheetsHtml, parseTimeLimits, parseCourtLimits, parseCourtClosures, parseResults, standings, seedOrder, playoffBracket, doubleEliminationBracket, bracketText, sampleFields, encodeFields, decodeFields,
  weeklyUpdate, splitPools, clubPairsInPools, buildPoolPlay, poolAdvancers, parseOfficials, assignOfficials, validateOfficials, playoffRace, playoffOdds, remainingFixtures, resultsCheck, overdueResults, gamesLeft, scheduleStrength, raceText, restReport, byeReport, homeAwayReport, rematchReport, seasonCost, deadlineCheck, slotFairness, oneDayTimetable, oneDayText, parseGrounds, groundClashes, applyGroundSharing, parseLinkedTeams, linkedClashes, separateLinkedTeams,
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
  // Pasted from elsewhere: one comma line, numbered list, spreadsheet columns, quotes.
  assert.deepEqual(parseTeams("Hawks, Owls; Eagles,Lions").teams, ["Hawks", "Owls", "Eagles", "Lions"]);
  assert.deepEqual(parseTeams("1. Hawks\n2) Owls\n3. Eagles").teams, ["Hawks", "Owls", "Eagles"]);
  assert.deepEqual(parseTeams("- Hawks\n• Owls").teams, ["Hawks", "Owls"]);
  assert.deepEqual(parseTeams("Hawks\tCoach A\nOwls\tCoach B").teams, ["Hawks", "Owls"]);
  assert.deepEqual(parseTeams('"Hawks"\n“Owls”').teams, ["Hawks", "Owls"]);
  // Commas on a multi-line list, and a numeral that is part of a name, are left alone.
  assert.deepEqual(parseTeams("Smith, J. XI\nOwls").teams, ["Smith, J. XI", "Owls"]);
  assert.deepEqual(parseTeams("1. FC Köln\nOwls").teams, ["1. FC Köln", "Owls"]);
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
  const f = { ...sampleFields(), teams: "Zoë's Ünited\nFC Ñandú\nA\nB", results: "A 1 - 0 B", pins: "A v B -> 2026-12-01", rainouts: "2026-10-13 A", withdrawals: "2026-11-03 B", timeLimits: "A: 18:00", courtLimits: "A: Court 1", courtClosures: "Court 2: 2026-10-13", officials: "Pat (A): Tue max 4", grounds: "A, B", linked: "A, B" };
  const code = encodeFields(f);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeFields(code), { ...f, seed: 1, minutes: 60, playoffDouble: false, playoffThird: false, scoring: "", rounds: "" });
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

// ---- playoff odds
test("playoff odds: a finished table gives 1 or 0, race verdicts agree, and chances add up to the number of spots", () => {
  const teams = ["A", "B", "C", "D"];
  const res = [[0,1],[0,2],[1,2],[1,3],[2,3],[0,3]].map(([a, b]) => ({ a, b, ga: 1, gb: 0 }));
  assert.deepEqual(playoffOdds(teams, res, [], 2).map((r) => r.chance), [1, 1, 0, 0]);
  const rnd = mulberry32(11);
  for (let trial = 0; trial < 30; trial++) {
    const n = 3 + Math.floor(rnd() * 4);
    const fixtures = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) fixtures.push([a, b]);
    const played = fixtures.filter(() => rnd() < 0.5);
    const results = played.map(([a, b]) => ({ a, b, ga: Math.floor(rnd() * 3), gb: Math.floor(rnd() * 3) }));
    const remaining = fixtures.filter((f) => !played.includes(f));
    const spots = 1 + Math.floor(rnd() * (n - 1));
    const odds = playoffOdds(names(n), results, remaining, spots, { runs: 500 });
    assert.ok(Math.abs(odds.reduce((s, r) => s + r.chance, 0) - spots) < 1e-9);
    const race = playoffRace(names(n), results, remaining, spots);
    race.forEach((row) => {
      if (row.status === "clinched") assert.equal(odds[row.index].chance, 1);
      if (row.status === "eliminated") assert.ok(odds[row.index].chance <= 0.5);
    });
    assert.deepEqual(odds, playoffOdds(names(n), results, remaining, spots, { runs: 500 }));
  }
});

test("playoff odds: a leader with a points cushion is likelier than a team that has lost every game", () => {
  const teams = ["Strong", "Mid", "Weak", "Mid2"];
  const results = [
    { a: 0, b: 1, ga: 3, gb: 0 }, { a: 0, b: 2, ga: 2, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 0 },
  ];
  const remaining = [[0, 3], [1, 3], [2, 3]];
  const o = playoffOdds(teams, results, remaining, 2);
  assert.ok(o[0].chance > o[2].chance + 0.3, JSON.stringify(o));
  assert.ok(o[0].expected > o[2].expected);
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

test("gamesLeft counts each team's unplayed fixtures", () => {
  const s = buildSchedule(baseSpec(4, { double: true }));
  assert.deepEqual(gamesLeft(4, remainingFixtures(s, [])), [6, 6, 6, 6]);
  const left = gamesLeft(4, remainingFixtures(s, [{ a: 0, b: 1, ga: 1, gb: 0 }]));
  assert.deepEqual(left, [5, 5, 6, 6]);
});

test("scheduleStrength averages the points per game of opponents still to play", () => {
  const s = buildSchedule(baseSpec(4, {}));
  const results = [{ a: 0, b: 1, ga: 2, gb: 0 }, { a: 2, b: 3, ga: 1, gb: 1 }];
  const table = standings(s.teams, results);
  const rem = remainingFixtures(s, results);
  const st = scheduleStrength(table, rem);
  const ppg = (i) => table.find((r) => r.index === i).points / 1;
  for (let i = 0; i < 4; i++) {
    const opps = rem.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a));
    assert.equal(st[i].games, opps.length);
    assert.ok(Math.abs(st[i].avg - opps.reduce((t, j) => t + ppg(j), 0) / opps.length) < 1e-9);
  }
  assert.equal(scheduleStrength(standings(s.teams, []), remainingFixtures(s, []))[0].avg, null);
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

test("streakOf and the standings streak count the current run over the whole season, not just the form window", async () => {
  const { streakOf, standings: st } = await import("./calc.mjs");
  assert.equal(streakOf(""), "");
  assert.equal(streakOf("WDLWW"), "W2");
  assert.equal(streakOf("WWWWWWD"), "D1");
  const teams = ["A", "B"];
  const results = Array.from({ length: 7 }, () => ({ a: 0, b: 1, ga: 1, gb: 0 }));
  const rows = st(teams, results);
  assert.equal(rows[0].form, "WWWWW");
  assert.equal(rows[0].streak, "W7");
  assert.equal(rows[1].streak, "L7");
});

test("homeAwayReport: counts and longest runs match a hand-built sequence", () => {
  const sch = { teams: ["A", "B", "C"], rounds: [
    { day: 14, matches: [{ home: 0, away: 2 }] },
    { day: 0, matches: [{ home: 0, away: 1 }] },
    { day: 7, matches: [{ home: 0, away: 2 }] },
    { day: 21, matches: [{ home: 1, away: 0 }] },
  ] };
  const r = homeAwayReport(sch);
  assert.deepEqual(r.rows[0], { team: "A", home: 3, away: 1, longestHome: 3, longestAway: 1 });
  assert.deepEqual(r.rows[2], { team: "C", home: 0, away: 2, longestHome: 0, longestAway: 2 });
  assert.equal(r.longestRun, 3);
  assert.deepEqual(r.worst, [{ team: "A", kind: "home" }]);
});

test("homeAwayReport: generated leagues keep home and away within one and runs of at most two", () => {
  for (const n of [4, 5, 6, 8, 9]) {
    const r = homeAwayReport(buildSchedule(baseSpec(n)));
    for (const x of r.rows) assert.ok(Math.abs(x.home - x.away) <= 1, `${n} teams: ${x.team}`);
    assert.ok(r.longestRun <= 2, `${n} teams run ${r.longestRun}`);
  }
});

test("crossTable: scores from each row team's side, in standings order, repeats joined", async () => {
  const { crossTable } = await import("./calc.mjs");
  const teams = ["A", "B", "C"];
  const results = [{ a: 0, b: 1, ga: 2, gb: 0 }, { a: 1, b: 0, ga: 1, gb: 1 }, { a: 2, b: 0, ga: 3, gb: 1 }];
  const t = crossTable(teams, results);
  assert.deepEqual(t.heads, ["A", "B", "C"]);
  assert.deepEqual(t.rows[0].cells, ["·", "2-0, 1-1", "1-3"]);
  assert.deepEqual(t.rows[1].cells, ["0-2, 1-1", "·", ""]);
  const r = crossTable(teams, results, [2, 0, 1]);
  assert.deepEqual(r.heads, ["C", "A", "B"]);
  assert.deepEqual(r.rows[0].cells, ["·", "3-1", ""]);
});

test("parsePointSystem: 3-1-0 default, 2-1-0 / slashes / spaces, refuses a system that rewards losing", async () => {
  const { parsePointSystem } = await import("./calc.mjs");
  assert.deepEqual(parsePointSystem(""), { win: 3, draw: 1, loss: 0, error: null });
  assert.deepEqual(parsePointSystem("2-1-0"), { win: 2, draw: 1, loss: 0, error: null });
  assert.deepEqual(parsePointSystem("2/1/0"), { win: 2, draw: 1, loss: 0, error: null });
  assert.deepEqual(parsePointSystem("3 2 1"), { win: 3, draw: 2, loss: 1, error: null });
  for (const bad of ["abc", "1-2-0", "2-2-0", "3-1"]) {
    const p = parsePointSystem(bad);
    assert.ok(p.error, bad);
    assert.equal(p.win, 3);
  }
});

test("a 2-1-0 points system changes the table and the play-off race", async () => {
  const { parsePointSystem } = await import("./calc.mjs");
  const teams = ["A", "B", "C"];
  const results = [{ a: 0, b: 1, ga: 1, gb: 0 }, { a: 1, b: 2, ga: 1, gb: 1 }, { a: 2, b: 0, ga: 0, gb: 0 }];
  const pts = parsePointSystem("2-1-0");
  const t = standings(teams, results, pts);
  assert.deepEqual(t.map((r) => [r.name, r.points]), [["A", 3], ["C", 2], ["B", 1]]);
  const t3 = standings(teams, results);
  assert.equal(t3[0].points, 4);
  const race = playoffRace(teams, results, [], 1, pts);
  assert.equal(race[0].name, "A");
});

test("the points system survives a share link", () => {
  const f = { ...sampleFields(), scoring: "2-1-0" };
  assert.equal(decodeFields(encodeFields(f)).scoring, "2-1-0");
});

test("seasonRecords: biggest win, highest-scoring game, best attack and defence; walkovers and all-draw seasons handled", async () => {
  const { seasonRecords } = await import("./calc.mjs");
  const teams = ["A", "B", "C"];
  assert.equal(seasonRecords(teams, []), null);
  const r = seasonRecords(teams, [{ a: 0, b: 1, ga: 4, gb: 0 }, { a: 1, b: 2, ga: 2, gb: 3 }, { a: 2, b: 0, ga: 3, gb: 0, walkover: true }]);
  assert.equal(r.biggestWin, "A 4-0 B");
  assert.equal(r.highestScoring, "B 2-3 C");
  assert.equal(r.bestAttack.team, "C");
  assert.equal(r.bestAttack.perGame, 3);
  assert.equal(r.bestDefence.team, "C");
  assert.equal(r.bestDefence.perGame, 1);
  assert.equal(seasonRecords(teams, [{ a: 0, b: 1, ga: 1, gb: 1 }]).biggestWin, null);
});

test("resultsCheck flags a duplicated result line and a pair that never meets", () => {
  const s = buildSchedule(baseSpec(4));
  const { results } = parseResults("Team 1 2 - 1 Team 2\nTeam 1 2 - 1 Team 2\nTeam 3 0 - 0 Team 4", s.teams);
  const msgs = resultsCheck(s, results);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Team 1 and Team 2 meet once in the schedule but 2 results/);
  assert.deepEqual(resultsCheck(s, results.slice(1)), []);
  const dbl = buildSchedule(baseSpec(4, { double: true }));
  assert.deepEqual(resultsCheck(dbl, results.slice(0, 2)), []);
  const pools = { rounds: [{ matches: [{ home: 0, away: 1 }] }], teams: ["A", "B", "C"] };
  assert.match(resultsCheck(pools, [{ a: 0, b: 2, ga: 1, gb: 0 }])[0], /A and C are not scheduled to meet/);
});

test("a late-joining team plays nothing before its first night and keeps every pairing", () => {
  const s = buildSchedule(baseSpec(6, { courts: ["A", "B", "C"] }));
  const from = D("2026-10-20");
  const r = applyLateTeams(s, "2026-10-20 Team 6");
  assert.deepEqual(r.errors, []);
  assert.equal(r.joins[0].moved.length, s.rounds.filter((x) => x.day < from).flatMap((x) => x.matches).filter((m) => m.home === 5 || m.away === 5).length);
  for (const round of r.schedule.rounds) if (round.day < from) for (const m of round.matches) assert.ok(m.home !== 5 && m.away !== 5);
  assert.deepEqual(validateSchedule(r.schedule).errors, []);
  assert.equal(r.schedule.rounds.flatMap((x) => x.matches).length, s.rounds.flatMap((x) => x.matches).length);
  assert.equal(s.rounds.flatMap((x) => x.matches).filter((m) => m.home === 5 || m.away === 5).length, 5);
});

test("late joiner: other teams' matches do not move, input is not mutated, bad lines are reported", () => {
  const s = buildSchedule(baseSpec(4, { courts: ["A", "B"] }));
  const before = JSON.stringify(s);
  const r = applyLateTeams(s, "2026-10-20 Team 4\nnonsense\n2026-10-20 Nobody\n2026-10-27 Team 4");
  assert.equal(JSON.stringify(s), before);
  assert.equal(r.errors.length, 3);
  const key = (sch) => sch.rounds.flatMap((x) => x.matches.filter((m) => m.home !== 3 && m.away !== 3).map((m) => `${x.day}|${m.home}|${m.away}|${m.court}`)).sort();
  assert.deepEqual(key(r.schedule), key(s));
  assert.equal(applyLateTeams(s, "").joins.length, 0);
});

test("late joiner respects blackouts, time limits and double round robins", () => {
  const spec = baseSpec(4, { double: true, courts: ["A"], times: ["18:00", "19:00"], blackouts: { 0: [D("2026-10-27")] }, timeLimits: { 3: ["19:00"] } });
  const s = buildSchedule(spec);
  const r = applyLateTeams(s, "2026-10-20 Team 4");
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateSchedule(r.schedule).errors, []);
  for (const round of r.schedule.rounds) for (const m of round.matches) if (m.home === 3 || m.away === 3) assert.equal(m.time, "19:00");
  assert.equal(r.schedule.rounds.flatMap((x) => x.matches).filter((m) => m.home === 3 || m.away === 3).length, 6);
});

test("weeklyUpdate: last round's scores, the table and the next round; handles no results and a finished season", async () => {
  const { weeklyUpdate, buildSchedule: bs, readSpec: rs } = await import("./calc.mjs");
  const spec = baseSpec(4);
  const s = buildSchedule(spec);
  const [r0, r1] = s.rounds;
  const res = r0.matches.map((m, i) => ({ a: m.away, b: m.home, ga: i + 1, gb: 0 }));
  const text = weeklyUpdate(s, res);
  assert.match(text, /Round 1 results/);
  const m0 = r0.matches[0];
  assert.ok(text.includes(`${m0.homeName} 0 - 1 ${m0.awayName}`), "score is shown home first even when typed away first");
  assert.match(text, /Table\n {2}1\./);
  assert.match(text, new RegExp(`Next up: ${r1.label}`));
  assert.ok(!text.includes("That was the last round"));
  assert.match(weeklyUpdate(s, []), /^Next up: Round 1/);
  assert.ok(!weeklyUpdate(s, []).includes("Table"));
  const all = [];
  for (const r of s.rounds) for (const m of r.matches) all.push({ a: m.home, b: m.away, ga: 1, gb: 1 });
  const done = weeklyUpdate(s, all);
  assert.match(done, /That was the last round/);
  assert.ok(!done.includes("Next up"));
  assert.equal(weeklyUpdate({ ...s, rounds: [] }, []), "");
});

test("overdueResults lists played-date matches with no typed result, earliest meeting first", () => {
  const s = buildSchedule(baseSpec(4, { double: true }));
  const flat = s.rounds.flatMap((r) => r.matches.map((m) => ({ ...m, day: r.day }))).sort((a, b) => a.day - b.day);
  const lastDay = flat[flat.length - 1].day;
  assert.equal(overdueResults(s, [], lastDay + 1).length, flat.length);
  assert.equal(overdueResults(s, [], flat[0].day).length, 0);
  const { results } = parseResults("Team 1 2 - 1 Team 2", s.teams);
  const od = overdueResults(s, results, lastDay + 1);
  assert.equal(od.length, flat.length - 1);
  const firstMeeting = flat.find((m) => [m.home, m.away].sort().join() === "0,1");
  assert.ok(!od.some((m) => m.day === firstMeeting.day && [m.home, m.away].sort().join() === "0,1"));
  assert.ok(od.every((m, i) => i === 0 || od[i - 1].day <= m.day));
});

test("official messages list only that official's matches, in schedule order, and match the loads", () => {
  const s = buildSchedule(baseSpec(6, { courts: ["A", "B", "C"], times: [] }));
  const { officials } = parseOfficials(["Ann", "Bo (Team 1)", "Cy (Team 2)", "Di"].join("\n"), s.teams);
  const r = assignOfficials(s, officials);
  const msgs = officialMessages(r.schedule);
  assert.equal(msgs.length, r.loads.filter((l) => l.matches > 0).length);
  for (const m of msgs) {
    assert.equal((m.text.match(/ vs /g) || []).length, m.matches);
    assert.equal(m.matches, r.loads.find((l) => l.name === m.official).matches);
    assert.match(m.text, new RegExp(`^Hi ${m.official}, the matches you are officiating \\(${m.matches}\\):`));
  }
  const bo = msgs.find((m) => m.official === "Bo");
  assert.ok(!bo.text.includes("Team 1 vs") && !bo.text.includes("vs Team 1"));
  assert.deepEqual(officialMessages(s), []); // no officials assigned, nothing to send
});

test("byeReport: odd leagues give each team one bye per leg, recounted independently; even leagues none", () => {
  for (const double of [false, true]) for (const n of [3, 5, 7, 9]) {
    const sch = buildSchedule(baseSpec(n, { double }));
    const r = byeReport(sch);
    const want = new Map();
    for (const rd of sch.rounds) {
      const playing = new Set();
      for (const m of rd.matches) { playing.add(m.home); playing.add(m.away); }
      if (rd.makeup) continue;
      for (let i = 0; i < n; i++) if (!playing.has(i)) want.set(i, (want.get(i) || 0) + 1);
    }
    assert.equal(r.rows.length, n);
    for (const row of r.rows) assert.equal(row.byes.length, want.get(sch.teams.indexOf(row.team)), `${row.team} n=${n} double=${double}`);
    assert.ok(r.rows.every((row) => row.byes.length === (double ? 2 : 1)));
    assert.equal(r.consecutive.length, r.rows.filter((row) => row.consecutive).length);
  }
  assert.deepEqual(byeReport(buildSchedule(baseSpec(6))), { rows: [], consecutive: [], first: [], last: [] });
});

import { parseLadderResults, ladderStandings, ladderChallenges, ladderText } from "./calc.mjs";

test("ladder: results parse, bad lines are named", () => {
  const P = ["Ana", "Ben", "Cy", "Dee"];
  const ok = parseLadderResults("Cy beat Ana\n# note\nDee def. Ben", P);
  assert.deepEqual(ok.results, [{ winner: 2, loser: 0 }, { winner: 3, loser: 1 }]);
  const bad = parseLadderResults("Zed beat Ana\nAna beat Ana\nnonsense", P);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /"Zed"/);
});

test("ladder: a challenger who wins takes the rung and the others drop one; a defender's win changes nothing", () => {
  const P = ["Ana", "Ben", "Cy", "Dee"];
  let s = ladderStandings(P, [{ winner: 2, loser: 0 }]);
  assert.deepEqual(s.order, [2, 0, 1, 3]);
  s = ladderStandings(P, [{ winner: 0, loser: 3 }]);
  assert.deepEqual(s.order, [0, 1, 2, 3]);
  assert.equal(s.moves[0].held, true);
  s = ladderStandings(P, [{ winner: 3, loser: 1 }, { winner: 3, loser: 0 }]);
  assert.deepEqual(s.order, [3, 0, 1, 2]);
  assert.deepEqual(s.played, [1, 1, 0, 2]);
});

test("ladder: swap mode trades only the two places, and reach flags long challenges without blocking them", () => {
  const P = ["A", "B", "C", "D", "E", "F"];
  const s = ladderStandings(P, [{ winner: 5, loser: 0 }], { reach: 2, move: "swap" });
  assert.deepEqual(s.order, [5, 1, 2, 3, 4, 0]);
  assert.deepEqual(s.outOfReach, [{ n: 1, winner: 5, loser: 0, rungs: 5 }]);
  assert.equal(ladderStandings(P, [{ winner: 2, loser: 0 }], { reach: 2 }).outOfReach.length, 0);
  assert.throws(() => ladderStandings(["solo"], []), /at least 2/);
});

test("ladder: challenge list and text sheet", () => {
  const P = ["Ana", "Ben", "Cy", "Dee"];
  const s = ladderStandings(P, [{ winner: 2, loser: 0 }]);
  const ch = ladderChallenges(s.order, 2);
  assert.deepEqual(ch[0].may, []);
  assert.deepEqual(ch[3].may, [1, 0]);
  const txt = ladderText(P, s, { reach: 2 });
  assert.match(txt, /1\. Cy {2}\(1 played\)/);
  assert.match(txt, /Dee -> Ben, Ana/);
});

test("official calendar holds only that official's matches, as events they can import", () => {
  const s = buildSchedule(baseSpec(6, { courts: ["A", "B", "C"], times: ["18:00"] }));
  const { officials } = parseOfficials(["Ann", "Bo (Team 1)", "Cy (Team 2)", "Di"].join("\n"), s.teams);
  const r = assignOfficials(s, officials);
  for (const o of r.loads.filter((l) => l.matches > 0)) {
    const ics = scheduleIcs(r.schedule, null, "20261001T000000Z", o.name);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, o.matches);
    assert.match(ics, new RegExp(`X-WR-CALNAME:${o.name} officiating`));
    assert.match(ics, /SUMMARY:Officiate: /);
  }
  const bo = scheduleIcs(r.schedule, null, "20261001T000000Z", "Bo");
  assert.doesNotMatch(bo, /Team 1 vs|vs Team 1/);
  assert.equal((scheduleIcs(r.schedule, null, "20261001T000000Z", "Nobody").match(/BEGIN:VEVENT/g) || []).length, 0);
});

test("swiss withdrawals: a player who is out keeps their games but is never paired again", () => {
  const players = ["A", "B", "C", "D", "E", "F"];
  const { games, byes, withdrawn, errors } = parseSwissResults("A 1 - 0 D\nB 1 - 0 E\nC 1 - 0 F\nB out\nb OUT\nZed out", players);
  assert.deepEqual(withdrawn, [1]);
  assert.equal(errors.length, 1);
  const round = swissPairings(players, games, byes, withdrawn);
  assert.deepEqual(validateSwiss(players, games, byes, round, withdrawn), []);
  const used = round.pairs.flatMap((p) => [p.white, p.black]).concat(round.bye ?? []);
  assert.ok(!used.includes(1));
  assert.equal(used.length, 5);
  assert.notEqual(round.bye, null);
  assert.equal(swissStandings(players, games, byes).find((r) => r.name === "B").score, 1);
});

test("swiss withdrawals: even field after a drop-out has no bye, and too few players is refused", () => {
  const players = ["A", "B", "C", "D", "E"];
  const r = swissPairings(players, [], [], [4]);
  assert.equal(r.bye, null);
  assert.equal(r.pairs.length, 2);
  assert.throws(() => swissPairings(["A", "B", "C"], [], [], [0, 1]), /at least 2/);
});

test("shorter season: 8 rounds of a 12-team league gives each team 8 games against 8 different opponents, and validates", () => {
  const { errors, spec } = readSpec({ teams: names(12).join("\n"), double: false, start: "2026-10-06", weekdays: ["Tue"], rounds: "8" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  assert.equal(s.rounds.length, 8);
  assert.deepEqual(validateSchedule(s).errors, []);
  const opp = names(12).map(() => new Set());
  const games = names(12).map(() => 0);
  for (const r of s.rounds) for (const m of r.matches) { opp[m.home].add(m.away); opp[m.away].add(m.home); games[m.home]++; games[m.away]++; }
  assert.ok(games.every((g) => g === 8));
  assert.ok(opp.every((o) => o.size === 8));
  assert.ok(s.notices.some((n) => n.startsWith("Shorter season: 8 of 11 rounds")));
});

test("shorter season: every length of every league size from 3 to 14 passes the independent validator", () => {
  for (const double of [false, true]) {
    for (let n = 3; n <= 14; n++) {
      const full = roundRobin(n, { double }).length;
      for (let k = 1; k < full; k++) {
        const { errors, spec } = readSpec({ teams: names(n).join("\n"), double, start: "2026-10-06", weekdays: ["Tue"], rounds: String(k) });
        assert.deepEqual(errors, []);
        assert.deepEqual(validateSchedule(buildSchedule(spec)).errors, [], `${n} teams, ${k} rounds, double=${double}`);
      }
    }
  }
});

test("shorter season: blank or full length builds the whole round robin, too many rounds is refused, and it rides the share link", () => {
  const f = { teams: names(6).join("\n"), start: "2026-10-06", weekdays: ["Tue"] };
  assert.equal(readSpec({ ...f, rounds: "" }).spec.rounds, null);
  assert.equal(readSpec({ ...f, rounds: "5" }).spec.rounds, null);
  assert.match(readSpec({ ...f, rounds: "9" }).errors.join(" "), /only 5 round/);
  assert.match(readSpec({ ...f, rounds: "0" }).errors.join(" "), /whole number/);
  assert.equal(decodeFields(encodeFields({ ...sampleFields(), rounds: "4" })).rounds, "4");
});

test("nextSeasonFields keeps the league, clears last season's dated inputs and moves the start", async () => {
  const { nextSeasonFields } = await import("./calc.mjs");
  const f = { ...sampleFields(), results: "Net Ninjas 3 - 2 Lob Squad", rainouts: "2026-10-13 Lob Squad", withdrawals: "2026-11-03 Lob Squad -> 2026-11-10", lateTeams: "2026-11-03 Newbies", finishBy: "2026-12-15", timeLimits: "Dink Dynasty: 18:00" };
  const last = D("2026-12-08");
  const r = nextSeasonFields(f, { lastDay: last, gapWeeks: 8 });
  assert.equal(r.fields.start, "2027-02-02"); // 8 weeks on, already a Tuesday
  assert.equal(dayOfWeek(D(r.fields.start)), 2);
  assert.deepEqual(r.dropped, ["Lob Squad"]);
  assert.deepEqual(r.added, ["Newbies"]);
  assert.ok(!r.fields.teams.includes("Lob Squad") && r.fields.teams.endsWith("Newbies"));
  for (const k of ["skip", "blackouts", "results", "rainouts", "withdrawals", "lateTeams", "finishBy"]) assert.equal(r.fields[k], "");
  assert.equal(r.fields.seed, 2);
  assert.equal(r.fields.courts, f.courts);
  assert.equal(r.fields.timeLimits, "Dink Dynasty: 18:00");
  // snaps forward to a chosen weekday; falls back to a year after the old start when unbuilt
  assert.equal(nextSeasonFields({ ...f }, { lastDay: D("2026-12-09"), gapWeeks: 0 }).fields.start, "2026-12-15");
  assert.equal(nextSeasonFields(f).fields.start, "2027-10-05");
  // the rolled fields build a clean schedule
  const spec = readSpec(r.fields);
  assert.ok(buildSchedule(spec.spec ?? spec).rounds.length > 0);
});

test("one-day timetable: every pair meets once, nobody plays twice in a slot, slots match the how-long table", () => {
  for (let n = 3; n <= 16; n++) for (const courts of [1, 2, 3, 4]) {
    const tt = oneDayTimetable(names(n), { courts, start: "09:00", matchMinutes: 40, changeoverMinutes: 5 });
    const seen = new Set();
    for (const s of tt.slots) {
      const inSlot = new Set();
      assert.ok(s.matches.length <= courts);
      for (const m of s.matches) {
        assert.ok(!inSlot.has(m.home) && !inSlot.has(m.away), `team twice in a slot n=${n}`);
        inSlot.add(m.home); inSlot.add(m.away);
        const key = [m.home, m.away].sort().join("-");
        assert.ok(!seen.has(key)); seen.add(key);
      }
    }
    assert.equal(seen.size, n * (n - 1) / 2);
    const rr = roundRobin(n);
    assert.equal(tt.slots.length, rr.reduce((s, r) => s + Math.ceil(r.matches.length / courts), 0));
  }
});

test("one-day timetable: clock times step by match plus changeover, double doubles the games, bad input is refused", () => {
  const tt = oneDayTimetable(["A", "B", "C", "D"], { courts: 2, start: "9am", matchMinutes: 30, changeoverMinutes: 10 });
  assert.deepEqual(tt.slots.map((s) => s.time), ["09:00", "09:40", "10:20"]);
  assert.equal(tt.slots[0].end, "09:30");
  assert.equal(tt.finish, "10:50");
  assert.equal(oneDayTimetable(names(5), { double: true }).games, 20);
  assert.match(oneDayText(tt), /Court 2: .* v .*\nLast game ends 10:50 \(6 games, 3 time slots\)\./s);
  assert.throws(() => oneDayTimetable(["A", "B"], {}), /three teams/);
  assert.throws(() => oneDayTimetable(names(4), { start: "soon" }), /Start time/);
  assert.throws(() => oneDayTimetable(names(4), { courts: 0 }), /Courts/);
});

test("separateLinkedTeams: linked teams are moved to different times, only the time changes, schedule stays valid", () => {
  for (const double of [false, true]) {
    const sch = buildSchedule(baseSpec(8, { double, courts: ["A"], times: ["18:00", "19:00", "20:00", "21:00"] }));
    const groups = [[0, 1], [2, 3]];
    const before = linkedClashes(sch, groups);
    const r = separateLinkedTeams(sch, groups);
    // recount independently from the output rounds
    let clash = 0;
    for (const rd of r.schedule.rounds) for (const g of groups) {
      const times = rd.matches.filter((m) => g.includes(m.home) || g.includes(m.away)).map((m) => m.time);
      const ms = rd.matches.filter((m) => g.includes(m.home) || g.includes(m.away));
      if (ms.length === 2 && ms[0].time === ms[1].time && !(g.includes(ms[0].home) && g.includes(ms[0].away))) clash++;
      void times;
    }
    assert.equal(clash, r.remainingCount);
    assert.equal(r.remainingCount, 0);
    assert.ok(before.count > 0 || r.moves.length === 0);
    assert.equal(validateSchedule(r.schedule).ok, true);
    assert.equal(linkedClashes(sch, groups).count, before.count);
    const pairs = (s) => s.rounds.map((rd) => rd.day + ":" + rd.matches.map((m) => m.home + "-" + m.away + "@" + m.court).sort().join(",")).join("|");
    assert.equal(pairs(r.schedule), pairs(sch));
  }
});

test("separateLinkedTeams: one time slot cannot be fixed and is reported; two linked teams who meet are no clash", () => {
  const sch = buildSchedule(baseSpec(4, { courts: ["A", "B"], times: [] }));
  const r = separateLinkedTeams(sch, [[0, 1]]);
  assert.equal(r.moves.length, 0);
  assert.equal(r.remainingCount, linkedClashes(sch, [[0, 1]]).count);
  assert.equal(r.schedule.rounds.every((rd) => rd.matches.length === 2), true);
  const both = linkedClashes(sch, [[0, 1]]);
  for (const c of both.clashes) assert.ok(c.teams.length >= 2);
  // teams 0 and 1 meet once; that round is not a clash for them alone
  const meet = sch.rounds.find((rd) => rd.matches.some((m) => [m.home, m.away].sort().join() === "0,1"));
  assert.ok(!both.clashes.some((c) => c.round === meet.label));
});

test("parseLinkedTeams and share link", () => {
  const r = parseLinkedTeams("Team 1, Team 2\nTeam 3, Nobody", names(4));
  assert.deepEqual(r.groups, [[0, 1]]);
  assert.match(r.errors[0], /^Linked teams:/);
  assert.equal(decodeFields(encodeFields({ ...sampleFields(), linked: "Team 1, Team 2" })).linked, "Team 1, Team 2");
});

// ---------------------------------------------------------------- court closures

test("parseCourtClosures reads dates and ranges per court and reports bad lines", () => {
  const r = parseCourtClosures("court 2: 2026-11-03, 2026-11-10 to 2026-11-12\nCourt 9: 2026-11-03\nCourt 1: soon\nnonsense", ["Court 1", "Court 2"]);
  assert.deepEqual(r.closures, { "Court 2": [D("2026-11-03"), D("2026-11-10"), D("2026-11-11"), D("2026-11-12")] });
  assert.equal(r.errors.length, 3);
});

test("a closed court is never used that night, the schedule stays valid, and a share link keeps it", () => {
  const closedDay = D("2026-10-13");
  const { spec, errors } = readSpec({ ...LIMIT_BASE, courtClosures: "Court 2: 2026-10-13" });
  assert.deepEqual(errors, []);
  const s = buildSchedule(spec);
  const night = s.rounds.find((r) => r.day === closedDay);
  assert.ok(night.matches.length > 0);
  for (const m of night.matches) assert.notEqual(m.court, "Court 2");
  assert.equal(validateSchedule(s).ok, true, validateSchedule(s).errors.join(" "));
  const f = { ...sampleFields(), courtClosures: "Court 2: 2026-10-13" };
  assert.equal(decodeFields(encodeFields(f)).courtClosures, "Court 2: 2026-10-13");
});

test("when too few courts are open, the overflow moves to a makeup round and every pair still meets once", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD\nE\nF", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2, Court 3", courtClosures: "Court 2: 2026-10-13\nCourt 3: 2026-10-13" });
  const s = buildSchedule(spec);
  const night = s.rounds.find((r) => r.day === D("2026-10-13"));
  assert.equal(night.matches.length, 1);
  assert.ok(s.rounds.some((r) => r.makeup));
  assert.ok(s.notices.some((n) => n.includes("court slot")));
  assert.equal(validateSchedule(s).ok, true, validateSchedule(s).errors.join(" "));
});

test("a rainout is never moved onto a closed court, and the validator flags a booking on one", () => {
  const { spec } = readSpec({ ...LIMIT_BASE, courtClosures: "Court 1: 2026-10-20\nCourt 2: 2026-10-20" });
  const s = buildSchedule(spec);
  assert.equal(s.rounds.find((r) => r.day === D("2026-10-20")), undefined);
  const r = applyRainouts(s, `${dayIso(s.rounds[0].day)} Team`.replace("Team", "A"));
  assert.ok(r.moves.every((m) => m.to !== D("2026-10-20")));
  const bad = buildSchedule(readSpec({ ...LIMIT_BASE, courtClosures: "Court 2: 2026-10-13" }).spec);
  bad.rounds.find((x) => x.day === D("2026-10-13")).matches[0].court = "Court 2";
  assert.ok(validateSchedule(bad).errors.some((e) => e.includes("is closed")));
});

test("changeNotices names each moved match once for the group and only own changes per team", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const day = s.rounds[0].day;
  const r = applyRainouts(s, `${dayIso(day)} A`);
  const n = changeNotices(r.moves);
  const m = r.moves[0];
  assert.equal(r.moves.length, 1);
  assert.ok(n.group.includes(`${m.home} v ${m.away}`));
  assert.ok(n.group.includes(`was ${dayLabel(m.from)}`) && n.group.includes(dayLabel(m.to)));
  assert.deepEqual(n.teams.map((x) => x.team).sort(), [m.home, m.away].sort());
  for (const x of n.teams) assert.ok(x.text.startsWith(`Hi ${x.team},`) && x.text.includes("unchanged"));
  const home = n.teams.find((x) => x.team === m.home).text;
  assert.ok(home.includes(`vs ${m.away} (home)`));
  assert.ok(n.teams.find((x) => x.team === m.away).text.includes(`at ${m.home} (away)`));
});

test("changeNotices is empty when nothing moved and tolerates junk input", () => {
  for (const x of [[], null, undefined, "x"]) assert.deepEqual(changeNotices(x), { group: "", teams: [] });
});

test("a pinned derby moves to a chosen later or earlier date and the schedule stays valid", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00" });
  const s = buildSchedule(spec);
  const count = (x) => x.rounds.reduce((a, r) => a + r.matches.length, 0);
  const lastDay = s.rounds[s.rounds.length - 1].day;
  const meet = (x, a, b) => x.rounds.flatMap((r) => r.matches.map((m) => ({ day: r.day, m }))).find(({ m }) => [m.homeName, m.awayName].sort().join() === [a, b].sort().join());
  const later = applyPinnedMatches(s, `A v B -> ${dayIso(lastDay + 3)}`);
  assert.deepEqual(later.errors, []);
  assert.equal(later.pins.length, 1);
  assert.equal(meet(later.schedule, "A", "B").day, lastDay + 3);
  assert.equal(count(later.schedule), count(s));
  assert.equal(validateSchedule(later.schedule).ok, true, validateSchedule(later.schedule).errors.join(" "));
  const firstDay = s.rounds[0].day;
  const opener = meet(s, "C", "D").day === firstDay ? ["A", "B"] : ["C", "D"];
  const earlier = applyPinnedMatches(s, `${opener[0]} vs ${opener[1]} -> ${dayIso(firstDay - 7)}`);
  assert.deepEqual(earlier.errors, []);
  assert.equal(meet(earlier.schedule, ...opener).day, firstDay - 7);
  assert.equal(earlier.schedule.rounds[0].day, firstDay - 7, "rounds stay in date order");
  assert.equal(validateSchedule(earlier.schedule).ok, true, validateSchedule(earlier.schedule).errors.join(" "));
  assert.equal(meet(s, "A", "B").day <= lastDay, true, "input is not mutated");
});

test("pinning both legs of a double round robin moves each once, and bad lines are named", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00", double: true });
  const s = buildSchedule(spec);
  const d1 = dayIso(s.rounds[s.rounds.length - 1].day + 7);
  const d2 = dayIso(s.rounds[s.rounds.length - 1].day + 14);
  const r = applyPinnedMatches(s, `A v B -> ${d1}\nB v A -> ${d2}\nA v B -> ${d1}`);
  const days = r.schedule.rounds.flatMap((x) => x.matches.filter((m) => [m.homeName, m.awayName].sort().join() === "A,B").map(() => dayIso(x.day)));
  assert.deepEqual(days.sort().slice(-2), [d1, d2]);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /already pinned|every meeting/);
  const bad = applyPinnedMatches(s, "A v A -> 2026-12-01\nA v Z -> 2026-12-01\nA v B\nA v B -> 2026-02-31");
  assert.equal(bad.errors.length, 4);
  assert.equal(bad.pins.length, 0);
  assert.equal(validateSchedule(r.schedule).ok, true, validateSchedule(r.schedule).errors.join(" "));
});

test("a pin onto a night a team is blacked out is refused and the match stays put", () => {
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-10-06", weekdays: "Tue", courts: "Court 1, Court 2", times: "18:00", blackouts: "A: 2026-12-01" });
  const s = buildSchedule(spec);
  const r = applyPinnedMatches(s, "A v B -> 2026-12-01");
  assert.equal(r.pins.length, 0);
  assert.equal(r.errors.length, 1);
  assert.deepEqual(r.schedule.rounds.map((x) => x.day), s.rounds.map((x) => x.day));
});

test("redteam: match length bounds are inclusive at 5 and 600 minutes", () => {
  const f = sampleFields();
  const ok = (minutes) => readSpec({ ...f, minutes: String(minutes) }).errors.every((e) => !/Match length/.test(e));
  assert.equal(ok(5), true);
  assert.equal(ok(600), true);
  assert.equal(ok(4), false);
  assert.equal(ok(601), false);
});

test("redteam: decodeFields accepts a share fragment of exactly 20000 characters and rejects 20001+", () => {
  let code = null;
  for (let n = 14000; n < 16000; n++) {
    const c = encodeFields({ ...sampleFields(), notes: "x".repeat(n), teams: "A\nB\nC\nD".padEnd(n, "q") });
    if (c.length === 20000) { code = c; break; }
    if (c.length > 20000) break;
  }
  assert.ok(code, "found a code of exactly 20000 characters");
  assert.notEqual(decodeFields(code), null);
  assert.equal(decodeFields(code + "A"), null);
});

test("redteam: weeklyUpdate table ignores head-to-head unless asked (default is goal-difference order)", () => {
  const s = buildSchedule(baseSpec(4));
  const t = s.teams;
  // same fixture as the standings head-to-head test: A, D, B level on 3 points, A ahead on goal difference
  const results = [
    { a: 0, b: 2, ga: 5, gb: 0 },
    { a: 1, b: 0, ga: 1, gb: 0 },
    { a: 3, b: 1, ga: 1, gb: 0 },
  ];
  const order = (text) => [...text.matchAll(/^ {2}\d\. (.+?) - /gm)].map((m) => m[1]).slice(0, 3);
  assert.deepEqual(order(weeklyUpdate(s, results)), [t[0], t[3], t[1]]);
  assert.deepEqual(order(weeklyUpdate(s, results, { headToHead: true })), [t[3], t[1], t[0]]);
});

// red team 2026-10-19: guards for mutants the suite let through
test("parseTeams: exactly two teams is enough, one is not", () => {
  assert.deepEqual(parseTeams("Reds\nBlues"), { teams: ["Reds", "Blues"], errors: [] });
  assert.match(parseTeams("Reds").errors[0], /at least two teams/);
});

test("americano: each round lists its byes in ascending player order", () => {
  const plan = americano(names(10), { courts: 2, rounds: 6, seed: 4 });
  for (const round of plan.rounds) {
    assert.ok(round.byes.length > 0);
    assert.deepEqual(round.byes, [...round.byes].sort((x, y) => x - y));
  }
});

test("late joiner: a saved schedule without courtLimits still places the moved matches", () => {
  const s = buildSchedule(baseSpec(6, { courts: ["A", "B", "C"] }));
  delete s.config.courtLimits;
  const r = applyLateTeams(s, "2026-10-20 Team 6");
  assert.deepEqual(r.errors, []);
});

test("score sheets give every round its own page, escape names and stay self-contained", () => {
  const { spec } = readSpec({ ...sampleFields(), teams: "Fish <b>&Chips\nOwls\nHawks\nWolves\nBears" });
  const s = buildSchedule(spec);
  const html = scoreSheetsHtml(s, { title: "Spring <League>" });
  assert.ok(html.startsWith("<!doctype html>") && html.includes("Spring &lt;League&gt;"));
  assert.ok(!html.includes("<b>&Chips") && html.includes("Fish &lt;b&gt;&amp;Chips"));
  assert.equal((html.match(/class="sheet"/g) || []).length, s.rounds.length);
  assert.equal((html.match(/class="f"/g) || []).length, s.rounds.reduce((n, r) => n + r.matches.length, 0));
  assert.equal((html.match(/class="bye"/g) || []).length, s.rounds.filter((r) => r.bye !== null && r.bye !== undefined).length);
  assert.ok(!/(src|href)=["']https?:/.test(html));
});

test("oneDayTimetable minRest: every pair meets once, no team twice in a slot, rest met when courts allow", () => {
  for (const [n, courts, rest] of [[8, 2, 1], [10, 2, 1], [12, 3, 1], [6, 1, 1], [8, 1, 2], [9, 2, 1], [16, 4, 1]]) {
    const tt = oneDayTimetable(names(n), { courts, minRest: rest });
    const pairs = new Map();
    for (const s of tt.slots) {
      const seen = new Set();
      assert.ok(s.matches.length <= courts);
      for (const m of s.matches) {
        assert.ok(!seen.has(m.home) && !seen.has(m.away), `team twice in slot, n=${n}`);
        seen.add(m.home); seen.add(m.away);
        const k = [m.home, m.away].sort().join("-");
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
    }
    assert.equal(pairs.size, n * (n - 1) / 2);
    assert.ok([...pairs.values()].every((v) => v === 1));
    assert.ok(tt.restSlots >= rest, `rest ${tt.restSlots} < ${rest} for n=${n}`);
    const plain = oneDayTimetable(names(n), { courts });
    assert.equal(tt.games, plain.games);
  }
  assert.ok(oneDayTimetable(names(8), { courts: 2, minRest: 1 }).restSlots >= 1);
  assert.ok(oneDayTimetable(names(12), { courts: 3, minRest: 1 }).restSlots >= 1);
  assert.equal(oneDayTimetable(names(5), { double: true, minRest: 1 }).games, 20);
  assert.throws(() => oneDayTimetable(names(4), { minRest: 9 }), /Rest slots/);
  assert.match(oneDayText(oneDayTimetable(names(8), { courts: 2, minRest: 1 })), /Every team rests at least 1 slot/);
});

test("season grid has one cell per team per round and agrees with the schedule", () => {
  for (const n of [4, 5, 7]) {
    const sched = buildSchedule(baseSpec(n, { double: true }));
    const { header, rows } = seasonGrid(sched);
    assert.equal(header.length, sched.rounds.length + 1);
    assert.equal(rows.length, n);
    sched.rounds.forEach((r, ri) => {
      for (const m of r.matches) {
        assert.equal(rows[m.home][ri + 1], `v ${m.awayName}`);
        assert.equal(rows[m.away][ri + 1], `@ ${m.homeName}`);
      }
      if (r.bye !== null && r.bye !== undefined) assert.equal(rows[r.bye][ri + 1], "BYE");
    });
    // every team's non-blank cells equal its game count plus byes
    rows.forEach((row, i) => assert.equal(row.slice(1).filter(Boolean).length, teamSchedule(sched, i).length));
  }
  const csv = seasonGridCsv(buildSchedule(baseSpec(4)));
  assert.equal(csv.split("\r\n")[0].split(",")[0], "Team");
});

test("a make-up date the organiser names on a skip date is honoured and the validator accepts it", async () => {
  const { readSpec, buildSchedule, applyRainouts, validateSchedule, dayIso } = await import("./calc.mjs");
  const { spec } = readSpec({ teams: "A\nB\nC\nD", start: "2026-09-01", weekdays: "Tue", skip: "2026-10-31", times: "18:00", courts: "C1, C2", seed: 1, minutes: 60 });
  const s = buildSchedule(spec);
  const first = s.rounds[0];
  const r = applyRainouts(s, `${dayIso(first.day)} -> 2026-10-31`);
  assert.equal(r.errors.length, 0);
  assert.ok(r.moves.every((m) => dayIso(m.to) === "2026-10-31"));
  assert.deepEqual(validateSchedule(r.schedule).errors, []);
});

test("calendar CSV: Google/Outlook columns, 12-hour times, one team's matches, midnight rollover", () => {
  const s = buildSchedule(baseSpec(4, { times: ["18:30"] }));
  const lines = scheduleCalendarCsv(s).trim().split("\r\n");
  assert.equal(lines[0], "Subject,Start Date,Start Time,End Date,End Time,All Day Event,Description,Location,Private");
  assert.equal(lines.length, 7);
  const day = scheduleCalendarCsv(buildSchedule(baseSpec(4))).split("\r\n")[1];
  assert.match(day, /,True,Round 1,/);
  const m = s.rounds[0].matches[0];
  const [y, mo, d] = dayIso(s.rounds[0].day).split("-");
  assert.ok(lines[1].startsWith(`${m.homeName} vs ${m.awayName},${mo}/${d}/${y},`));
  assert.match(lines[1], /,\d{1,2}:\d\d (AM|PM),\d\d\/\d\d\/\d{4},\d{1,2}:\d\d (AM|PM),False,/);
  const one = scheduleCalendarCsv(s, 0).trim().split("\r\n");
  assert.equal(one.length - 1, s.rounds.filter((r) => r.matches.some((x) => x.home === 0 || x.away === 0)).length);
  assert.ok(one.slice(1).every((l) => l.includes(s.teams[0])));
  const late = { ...s, config: { ...s.config, minutes: 90 }, rounds: [{ ...s.rounds[0], matches: [{ ...m, time: "23:30" }] }] };
  const row = scheduleCalendarCsv(late).trim().split("\r\n")[1].split(",");
  assert.equal(row[2], "11:30 PM");
  assert.equal(row[4], "1:00 AM");
  assert.notEqual(row[1], row[3]);
});

test("playoffRace clinchedUnlessTied matches a brute force over every outcome", () => {
  const rand = mulberry32(7);
  for (let t = 0; t < 120; t++) {
    const n = 3 + Math.floor(rand() * 4);
    const spots = 1 + Math.floor(rand() * (n - 1));
    const pairs = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
    const results = [];
    const remaining = [];
    for (const [a, b] of pairs) {
      const u = rand();
      if (u < 0.5) results.push({ a, b, ga: Math.floor(rand() * 3), gb: Math.floor(rand() * 3) });
      else if (remaining.length < 7) remaining.push([a, b]);
    }
    const rows = playoffRace(names(n), results, remaining, spots);
    const base = Array(n).fill(0);
    for (const r of results) {
      if (r.ga > r.gb) base[r.a] += 3; else if (r.ga < r.gb) base[r.b] += 3; else { base[r.a]++; base[r.b]++; }
    }
    const worstWon = Array(n).fill(1);
    const walk = (f, cur) => {
      if (f === remaining.length) {
        for (let i = 0; i < n; i++) worstWon[i] = Math.max(worstWon[i], 1 + cur.filter((p, j) => j !== i && p > cur[i]).length);
        return;
      }
      const [a, b] = remaining[f];
      for (const [x, y] of [[3, 0], [1, 1], [0, 3]]) { const c = cur.slice(); c[a] += x; c[b] += y; walk(f + 1, c); }
    };
    walk(0, base);
    for (const r of rows) {
      assert.equal(r.clinchedUnlessTied, r.status === "alive" && worstWon[r.index] <= spots, `league ${t} team ${r.index}`);
      if (r.clinchedUnlessTied) assert.ok(r.worstRank > spots);
    }
  }
});
