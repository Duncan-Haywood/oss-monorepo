// TeamSnap and SportsEngine schedule import files (README "Import into TeamSnap or SportsEngine").
import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, parseDate, teamSnapCsv, sportsEngineCsv, parseTeamIds, TEAMSNAP_COLUMNS, SPORTSENGINE_COLUMNS } from "./calc.mjs";

const spec = (extra = {}) => ({ teams: ["Hawks", "Owls", "Bears", "Foxes", "Wolves"], double: false, start: parseDate("2026-12-01"), weekdays: [2], skipDays: [], blackouts: {}, courts: ["Court 1", "Court 2"], times: ["18:30", "19:30"], seed: 1, minutes: 60, ...extra });
const rows = (csv) => csv.trim().split("\r\n").map((l) => l.split(","));

// Header rows as published, read 2026-11-17 (eval/platform-templates-2026-11-17.md). TeamSnap's first
// column ("Delete this column before saving for import!") is an instruction, not a field.
const TEAMSNAP_TEMPLATE = "Date,Start Time,End Time,Arrival Time,Short Label,Event Type,Division,Home Team,Away Team,Location,Location Details";
const SPORTSENGINE_TEMPLATE = "Start_Date,Start_Time,End_Date,End_Time,Title,Description,Location,Location_URL,Location_Details,All_Day_Event,Event_Type,Tags,Team1_ID,Team1_Division_ID,Team1_Is_Home,Team2_ID,Team2_Division_ID,Team2_Name,Custom_Opponent,Event_ID,Game_ID,Affects_Standings,Points_Win,Points_Loss,Points_Tie,Points_OT_Win,Points_OT_Loss,Division_Override";

test("column lists are the published templates' header rows", () => {
  assert.equal(TEAMSNAP_COLUMNS.join(","), TEAMSNAP_TEMPLATE);
  assert.equal(SPORTSENGINE_COLUMNS.join(","), SPORTSENGINE_TEMPLATE);
});

test("TeamSnap: one row per game, MM/DD/YYYY, h:mm AM/PM, court as location details", () => {
  const s = buildSchedule(spec());
  const r = teamSnapCsv(s, { division: "Adult Coed", location: "Rec Center", arrival: "30" });
  assert.deepEqual(r.errors, []);
  const t = rows(r.csv);
  assert.equal(t[0].join(","), TEAMSNAP_TEMPLATE);
  const games = s.rounds.reduce((n, x) => n + x.matches.length, 0);
  assert.equal(t.length - 1, games);
  for (const row of t.slice(1)) {
    assert.equal(row.length, 11);
    assert.match(row[0], /^\d\d\/\d\d\/\d{4}$/);
    assert.match(row[1], /^\d{1,2}:\d\d (AM|PM)$/);
    assert.match(row[2], /^\d{1,2}:\d\d (AM|PM)$/);
    assert.equal(row[3], "30");
    assert.equal(row[5], "Game");
    assert.equal(row[6], "Adult Coed");
    assert.equal(row[9], "Rec Center");
    assert.match(row[10], /^Court [12]$/);
  }
  const first = s.rounds[0].matches[0];
  assert.deepEqual(t[1].slice(0, 3), ["12/01/2026", first.time === "18:30" ? "6:30 PM" : "7:30 PM", first.time === "18:30" ? "7:30 PM" : "8:30 PM"]);
  assert.deepEqual(t[1].slice(7, 9), [first.homeName, first.awayName]);
  // byes are not games: no row names a team twice or a bye
  assert.ok(t.slice(1).every((row) => row[7] !== row[8] && !row.includes("BYE")));
});

test("TeamSnap: optional arrival column dropped; court becomes the location; missing fields are errors", () => {
  const s = buildSchedule(spec());
  const r = teamSnapCsv(s, { division: "A" });
  assert.equal(rows(r.csv)[0].length, 10);
  assert.ok(!r.csv.startsWith(TEAMSNAP_TEMPLATE));
  assert.match(rows(r.csv)[1][8], /^Court [12]$/);
  assert.equal(rows(r.csv)[1][9], "");
  assert.match(teamSnapCsv(s, {}).errors.join(" "), /Division/);
  assert.match(teamSnapCsv(s, { division: "A", arrival: "half an hour" }).errors.join(" "), /whole number/);
  const bare = buildSchedule(spec({ courts: [], times: [] }));
  const e = teamSnapCsv(bare, { division: "A" }).errors.join(" ");
  assert.match(e, /start time/);
  assert.match(teamSnapCsv(bare, { division: "A" }).warnings.join(" "), /court name is its Location/);
  assert.match(teamSnapCsv(buildSchedule(spec({ teams: ["A#1", "B", "C", "D"] })), { division: "A" }).warnings.join(" "), /A#1/);
});

test("TeamSnap: a game ending past midnight is flagged (the template has no end date)", () => {
  const s = buildSchedule(spec({ times: ["23:30"], courts: ["C1", "C2", "C3"] }));
  const r = teamSnapCsv(s, { division: "A" });
  assert.equal(rows(r.csv)[1][2], "12:30 AM");
  assert.match(r.warnings.join(" "), /after midnight/);
});

test("SportsEngine: 28 columns, 24-hour times, team IDs with the home flag", () => {
  const s = buildSchedule(spec());
  const ids = "Hawks = 2270996_271208\nOwls: 12\nbears, 13\nFoxes\t14\nWolves=15";
  const r = sportsEngineCsv(s, { ids, location: "Rec Center" });
  assert.deepEqual(r.errors, []);
  const t = rows(r.csv);
  assert.equal(t[0].join(","), SPORTSENGINE_TEMPLATE);
  const id = { Hawks: "2270996_271208", Owls: "12", Bears: "13", Foxes: "14", Wolves: "15" };
  let k = 1;
  for (const round of s.rounds) {
    for (const m of round.matches) {
      const row = t[k++];
      assert.equal(row.length, 28);
      assert.match(row[0], /^\d\d\/\d\d\/\d{4}$/);
      assert.equal(row[1], m.time);
      assert.match(row[3], /^\d\d:\d\d$/);
      assert.equal(row[5], round.label);
      assert.equal(row[6], "Rec Center");
      assert.equal(row[8], m.court);
      assert.equal(row[9], "0");
      assert.equal(row[10], "Game");
      assert.equal(row[12], id[m.homeName]);
      assert.equal(row[14], "1");
      assert.equal(row[15], id[m.awayName]);
      assert.equal(row[18], "0");
    }
  }
  assert.equal(k, t.length);
});

test("SportsEngine: missing IDs and unknown teams are errors; no time is TBD; past midnight rolls the end date", () => {
  const s = buildSchedule(spec());
  const r = sportsEngineCsv(s, { ids: "Hawks = 1\nEagles = 9\nnonsense line here" });
  const e = r.errors.join(" ");
  assert.match(e, /Eagles/);
  assert.match(e, /line 3/);
  assert.match(e, /Owls, Bears, Foxes, Wolves/);
  const all = "Hawks=1\nOwls=2\nBears=3\nFoxes=4\nWolves=5";
  const tbd = rows(sportsEngineCsv(buildSchedule(spec({ times: [], courts: ["C1", "C2"] })), { ids: all }).csv);
  assert.equal(tbd[1][1], "TBD");
  assert.equal(tbd[1][3], "");
  const late = rows(sportsEngineCsv(buildSchedule(spec({ times: ["23:30"], courts: ["C1", "C2", "C3"] })), { ids: all }).csv);
  assert.equal(late[1][1], "23:30");
  assert.equal(late[1][3], "00:30");
  assert.equal(late[1][2], "12/02/2026");
});

test("parseTeamIds matches names case-insensitively and refuses IDs with spaces", () => {
  const p = parseTeamIds("hawks = 7\nOwls = 1 2", ["Hawks", "Owls"]);
  assert.deepEqual(p.ids, ["7", null]);
  assert.equal(p.errors.length, 1);
});
