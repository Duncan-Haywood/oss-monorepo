import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseScheduleImport, importedSchedule, importSummary, splitMatchup, readDate, readTime, guessSeparator, delimitedRows } from "./importschedule.mjs";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { dayIso, validateSchedule, scheduleIcs, applyRainouts, teamSnapCsv, sampleFields, readSpec, buildSchedule } from "./calc.mjs";

const SHEET = [
  "Date\tTime\tHome\tAway\tField",
  "Tue 10/6/2026\t6:30 PM\tHawks\tOwls\tField 1",
  "Tue 10/6/2026\t6:30 PM\tFalcons\tRavens\tField 2",
  "10/13/2026\t7:45 pm\tOwls\tFalcons\tField 1",
  "10/13/2026\t7:45 pm\tRavens\tHawks\tField 2",
  "10/20/2026\t18:30\thawks \tfalcons\tField 1",
  "10/20/2026\tTBD\tOwls\tBYE\tField 2",
].join("\n");

test("cells: matchups, dates, times and separators", () => {
  assert.deepEqual(splitMatchup("Hawks vs Owls"), { home: "Hawks", away: "Owls" });
  assert.deepEqual(splitMatchup("Hawks v. Owls"), { home: "Hawks", away: "Owls" });
  assert.deepEqual(splitMatchup("Owls @ Hawks"), { home: "Hawks", away: "Owls" });
  assert.deepEqual(splitMatchup("Owls at Hawks"), { home: "Hawks", away: "Owls" });
  assert.deepEqual(splitMatchup("Game: FC Rovers - Old Boys"), { home: "FC Rovers", away: "Old Boys" });
  assert.equal(splitMatchup("Team Photo Day"), null);
  assert.equal(dayIso(readDate("Tuesday, October 6, 2026")), "2026-10-06");
  assert.equal(dayIso(readDate("10/6/26")), "2026-10-06");
  assert.equal(dayIso(readDate("6/10/2026", { dayFirst: true })), "2026-10-06");
  assert.equal(dayIso(readDate("2026-10-06T18:30:00")), "2026-10-06");
  assert.equal(readDate("someday"), null);
  assert.equal(readTime("6:30 PM"), "18:30");
  assert.equal(readTime("6:30pm"), "18:30");
  assert.equal(readTime("6.30 p.m."), "18:30");
  assert.equal(readTime("18:30:00"), "18:30");
  assert.equal(readTime("19h15"), "19:15");
  assert.equal(readTime("noon"), "12:00");
  assert.equal(readTime("TBD"), "");
  assert.equal(readTime("evening"), null);
  assert.equal(guessSeparator("a\tb\tc,d"), "\t");
  assert.equal(guessSeparator("a;b;c"), ";");
  assert.equal(guessSeparator("a,b,c"), ",");
  assert.deepEqual(delimitedRows('Date,Game\n2026-10-06,"Hawks, Jr. vs Owls"\n', ","), [["Date", "Game"], ["2026-10-06", "Hawks, Jr. vs Owls"]]);
});

test("a sheet pasted from a spreadsheet: teams merged by case, byes and TBDs left out with a note", () => {
  const p = parseScheduleImport(SHEET);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.teams, ["Hawks", "Owls", "Falcons", "Ravens"]);
  assert.equal(p.games.length, 5);
  assert.deepEqual(p.games.map((g) => g.time), ["18:30", "18:30", "19:45", "19:45", "18:30"]);
  assert.match(p.warnings.join(" "), /1 row\(s\) with a bye/);
  assert.equal(importSummary(p), "5 games, 4 teams, 2026-10-06 to 2026-10-20.");
});

test("importedSchedule: the builder's shape, valid, and every output and rainout runs on it", () => {
  const p = parseScheduleImport(SHEET);
  const s = importedSchedule(p, { minutes: 75 });
  assert.equal(s.rounds.length, 3);
  assert.deepEqual(s.rounds.map((r) => dayIso(r.day)), ["2026-10-06", "2026-10-13", "2026-10-20"]);
  assert.deepEqual(s.config.courts, ["Field 1", "Field 2"]);
  assert.deepEqual(s.config.times, ["18:30", "19:45"]);
  assert.deepEqual(s.config.weekdays, [2]);
  assert.equal(s.stats.matches, 5);
  // a file need not be a round robin: only pair counts may differ from one, nothing structural
  assert.deepEqual(validateSchedule(s).errors.filter((e) => !/meet \d+ time/.test(e)), []);
  // fixture ids count meetings of a pair, as assignFixtureIds does
  assert.deepEqual(s.rounds[0].matches.map((m) => m.fixture), ["0-1-0", "2-3-0"]);
  assert.equal(s.rounds[2].matches[0].fixture, "0-2-0");
  const ics = scheduleIcs(s, 0);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /DTSTART[^\n]*20261006T183000/);
  // a rainout moves the game to the next free Tuesday in the slot it had
  const r = applyRainouts(s, "2026-10-13 Owls");
  assert.deepEqual(r.errors, []);
  const moved = r.schedule.rounds.flatMap((x) => x.matches.map((m) => ({ ...m, day: x.day }))).find((m) => m.homeName === "Owls" && m.awayName === "Falcons");
  assert.equal(dayIso(moved.day), "2026-10-27");
  const ts = teamSnapCsv(s, { division: "Adult A" });
  assert.deepEqual(ts.errors, []);
  assert.match(ts.csv, /10\/06\/2026,6:30 PM,7:45 PM/);
});

test("platform exports: one matchup column, away @ home, practices skipped, scores read", () => {
  const csv = [
    "Event Type,Date,Start Time,Game,Location,Home Score,Away Score",
    "Game,2026-04-11,9:00 AM,Owls @ Hawks,Lions Park,3,2",
    "Practice,2026-04-12,9:00 AM,Hawks practice,Lions Park,,",
    "Game,2026-04-18,9:00 AM,Hawks vs Ravens,Lions Park,,",
  ].join("\n");
  const p = parseScheduleImport(csv);
  assert.deepEqual(p.errors, []);
  assert.equal(p.games.length, 2);
  assert.equal(p.teams[p.games[0].home], "Hawks");
  assert.deepEqual(p.results, ["Hawks 3 - 2 Owls"]);
  assert.match(p.warnings.join(" "), /1 row\(s\) that are not games/);
});

test("European CSV: semicolons, day-first dates found from the column, and a date-time column", () => {
  const p = parseScheduleImport("Datum en tijd;Thuis;Uit\nStart;Home;Away\n".split("\n").slice(1).join("\n") + "25/09/2026 20:00;Ajax Zaal;Kampong\n02/10/2026 20:00;Kampong;Ajax Zaal\n");
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.games.map((g) => dayIso(g.day)), ["2026-09-25", "2026-10-02"]);
  assert.deepEqual(p.games.map((g) => g.time), ["20:00", "20:00"]);
  assert.match(p.warnings.join(" "), /day first/);
});

test("a calendar feed (.ics) imports its games and leaves other events out", () => {
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "BEGIN:VEVENT", "UID:a", "DTSTART;TZID=America/Chicago:20261006T183000", "SUMMARY:Hawks vs Owls", "LOCATION:Court 1\\, Rec Center", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b", "DTSTART:20261013T194500", "SUMMARY:Owls a", " t Hawks", "LOCATION:Court 2", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c", "DTSTART;VALUE=DATE:20261020", "SUMMARY:End of season party", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const p = parseScheduleImport(ics);
  assert.deepEqual(p.errors, []);
  assert.equal(p.games.length, 2);
  assert.equal(p.games[0].court, "Court 1, Rec Center");
  assert.equal(p.games[1].time, "19:45");
  assert.equal(p.teams[p.games[1].home], "Hawks");
});

test("a doubleheader night in the file is kept as one", () => {
  const p = parseScheduleImport("Date,Time,Home,Away,Court\n2026-10-06,18:00,A,B,C1\n2026-10-06,19:00,B,A,C1\n");
  const s = importedSchedule(p);
  assert.equal(s.config.gamesPerNight, 2);
  assert.deepEqual(validateSchedule(s).errors.filter((e) => !/meet \d+ time/.test(e)), []);
});

test("bad rows are named by line and the rest still import; clashes are warned", () => {
  const p = parseScheduleImport("Date,Time,Home,Away,Court\n2026-10-06,18:00,A,B,C1\nnot a date,18:00,C,D,C1\n2026-10-06,later,C,D,C2\n2026-10-06,18:00,A,A,C2\n2026-10-06,18:00,C,A,C1\n");
  assert.equal(p.games.length, 2);
  assert.match(p.errors[0], /^Line 3: "not a date" is not a date/);
  assert.match(p.errors[1], /^Line 4: "later" is not a time/);
  assert.match(p.errors[2], /^Line 5: A cannot play itself/);
  assert.match(p.warnings.join(" "), /C1 at 18:00 on 2026-10-06 is also used by line 2/);
  assert.match(p.warnings.join(" "), /A is down for two games at 18:00/);
  assert.match(parseScheduleImport("Team,Coach\nHawks,Sam\n").errors[0], /needs a date column/);
  assert.match(parseScheduleImport("").errors[0], /Paste or upload/);
});

test("buildLeague runs on an imported season: standings from the file's scores plus typed ones", () => {
  const f = { ...sampleFields(), imported: "Date,Time,Home,Away,Field,Home Score,Away Score\n2026-10-06,18:00,Hawks,Owls,F1,2,1\n2026-10-13,18:00,Owls,Hawks,F1,,\n", results: "Owls 4 - 0 Hawks", playoff: 2, minutes: 90 };
  const out = buildLeague(f);
  assert.equal(out.error, undefined);
  assert.deepEqual(out.schedule.teams, ["Hawks", "Owls"]);
  assert.equal(out.schedule.config.minutes, 90);
  assert.deepEqual(out.table.map((r) => [r.name, r.played]), [["Owls", 2], ["Hawks", 2]]);
  assert.ok(out.bracket);
  // emptying the box goes back to the built season
  assert.deepEqual(buildLeague({ ...f, imported: "" }).schedule.teams, buildSchedule(readSpec(sampleFields()).spec).teams);
  assert.match(buildLeague({ ...f, imported: "Team,Coach\nHawks,Sam" }).error, /date column/);
});

test("the admin form takes a pasted schedule and the league page shows it", async () => {
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const admin = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(admin, /Already have a schedule\?/);
    const r = await fetch(base + "/admin/save?key=adm", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ imported: SHEET, minutes: "60", act: "publish" }) });
    assert.equal(r.status, 303);
    assert.equal(state.published, true);
    const page = await (await fetch(base + "/league?t=tok")).text();
    assert.match(page, /Ravens/);
    assert.match(page, /Field 2/);
    const after = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(after, /Imported: 5 games, 4 teams/);
  } finally { srv.close(); }
});
