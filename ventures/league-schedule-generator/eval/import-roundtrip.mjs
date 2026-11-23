// Round trip for importschedule.mjs: build seasons, write them out in every format the tool exports
// (schedule CSV, Google/Outlook calendar CSV, TeamSnap CSV, SportsEngine CSV, .ics), read each back
// with parseScheduleImport, and count games whose date, time, court, home and away all come back.
// node eval/import-roundtrip.mjs > eval/import-roundtrip.txt
import { readSpec, buildSchedule, sampleFields, scheduleCsv, scheduleCalendarCsv, teamSnapCsv, sportsEngineCsv, scheduleIcs } from "../calc.mjs";
import { parseScheduleImport } from "../importschedule.mjs";

const seasons = [];
for (const n of [4, 6, 7, 10, 12, 16]) for (const double of [false, true]) {
  const f = { ...sampleFields(), teams: Array.from({ length: n }, (_, i) => `Team ${String.fromCharCode(65 + i)}${i % 3 ? " FC" : ""}`).join("\n"), double, courts: "Court 1\nCourt 2\nCourt 3", times: "18:00, 19:15, 20:30", blackouts: "" };
  const { spec, errors } = readSpec(f);
  if (errors.length) throw new Error(errors[0]);
  seasons.push({ name: `${n} teams${double ? " double" : ""}`, s: buildSchedule(spec) });
}
const ids = (s) => s.teams.map((t, i) => `${t} = ${1000 + i}`).join("\n");
const formats = {
  "schedule CSV": (s) => scheduleCsv(s),
  "calendar CSV": (s) => scheduleCalendarCsv(s),
  "TeamSnap CSV": (s) => teamSnapCsv(s, { division: "Adult" }).csv,
  "SportsEngine CSV": (s) => sportsEngineCsv(s, { ids: ids(s) }).csv,
  ".ics": (s) => scheduleIcs(s, null, "20261101T000000Z"),
};
const want = (s) => s.rounds.flatMap((r) => r.matches.map((m) => `${r.day}|${m.time}|${m.court}|${m.homeName}|${m.awayName}`)).sort();
console.log("format              games  back exact  teams named  errors listed");
for (const [fmt, write] of Object.entries(formats)) {
  let total = 0, exact = 0, named = 0, teams = 0, refused = 0;
  const notes = new Set();
  for (const { s } of seasons) {
    const p = parseScheduleImport(write(s));
    const got = p.games.map((g) => `${g.day}|${g.time}|${g.court}|${p.teams[g.home]}|${p.teams[g.away]}`).sort();
    const w = want(s);
    total += w.length; teams += s.teams.length; refused += p.errors.length;
    const pool = new Map(); for (const k of got) pool.set(k, (pool.get(k) || 0) + 1);
    for (const k of w) if (pool.get(k)) { exact++; pool.set(k, pool.get(k) - 1); }
    named += s.teams.filter((t) => p.teams.includes(t)).length;
    for (const e of p.errors.slice(0, 1)) notes.add(e);
  }
  console.log(`${fmt.padEnd(18)} ${String(total).padStart(6)} ${String(exact).padStart(11)} ${`${named}/${teams}`.padStart(12)} ${String(refused).padStart(13)}${notes.size ? "  " + [...notes][0] : ""}`);
}
console.log("\nSportsEngine's upload template carries HQ team IDs (Team1_ID, Team2_ID) and no team names, so a file in that shape cannot say who plays; the reader says so in one line instead of failing every row.");
console.log(`${seasons.length} seasons: ${seasons.map((x) => x.name).join(", ")}.`);
