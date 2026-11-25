// Practice slots (practice.mjs): parsing, hard rules, fairness, the solo bound, outputs, page wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDays, parseRange, parseFields, parseTeamList, practiceOptions, soloBest, buildPractices,
  practiceText, teamWeekText, practiceCsv, practiceIcs, fieldUse, encodeInputs, decodeInputs, clock, UNPLACED,
} from "./practice.mjs";

const EXAMPLE_FIELDS = `North 1 | Mon Tue Wed Thu | 5-8pm | 4
North 2 | Mon-Thu | 5:30pm-8:30pm | 2
School gym, Fri, 6-8pm, 1`;
const EXAMPLE_TEAMS = `U8 Hawks | coach Patel | 1 unit | by 7pm | prefer Tue Thu
U8 Owls | coach Patel | 1 unit | by 7pm
U10 Foxes | 2 units | 2 a week | not Wed | prefer 5-7pm
U12 Bears | coach Kim | 2 units | 2 a week | games Sat | prefer Mon Wed
U12 Wolves | coach Kim | 2 units | 2 a week
U14 Lions | 4 units | 2 a week | after 6pm`;

// Every hard rule, checked on a result from scratch. Capacity holds in A weeks and in B weeks on
// their own; a weekly practice (weeks null) counts in both.
const inWeek = (p, w) => !p.weeks || p.weeks === w;
function assertLegal(windows, teams, r) {
  const byName = new Map(teams.map((t) => [t.name, t]));
  const use = new Map();
  const seenDay = new Set();
  const teamWeeks = new Map();
  for (const p of r.placements) {
    const t = byName.get(p.team);
    const w = windows.find((x) => x.field === p.field && x.day === p.day && p.start >= x.start && p.end <= x.end);
    assert.ok(w, `${p.team} placed outside any window`);
    assert.equal((p.start - w.start) % r.minutes, 0, "blocks start on the window's grid");
    for (const wk of ["A", "B"]) {
      if (!inWeek(p, wk)) continue;
      const k = `${p.field}|${p.day}|${p.start}|${wk}`;
      use.set(k, (use.get(k) || 0) + t.units);
      assert.ok(use.get(k) <= w.units, `over capacity at ${k}`);
    }
    assert.ok(!t.not.includes(p.day) && !t.games.includes(p.day), `${p.team} on a blocked day`);
    assert.ok(p.start >= t.earliest && p.end <= t.latest, `${p.team} outside its hours`);
    assert.ok(!seenDay.has(`${p.team}|${p.day}`), `${p.team} twice on one day`);
    seenDay.add(`${p.team}|${p.day}`);
    // Weekly teams practise every week; every-other-week teams keep to one set of weeks.
    if (!t.weeks) assert.equal(p.weeks, null, `${p.team} is weekly`);
    else if (t.weeks === "AB") assert.ok(p.weeks === "A" || p.weeks === "B", `${p.team} alternates`);
    else assert.equal(p.weeks, t.weeks, `${p.team} keeps its fixed weeks`);
    if (teamWeeks.has(p.team)) assert.equal(p.weeks, teamWeeks.get(p.team), `${p.team} mixes A and B weeks`);
    teamWeeks.set(p.team, p.weeks);
  }
  for (const a of r.placements) for (const b of r.placements) {
    if (a === b || a.team === b.team) continue;
    const ca = byName.get(a.team).coach.toLowerCase(), cb = byName.get(b.team).coach.toLowerCase();
    const meet = !a.weeks || !b.weeks || a.weeks === b.weeks;
    if (ca && ca === cb && a.day === b.day && meet) assert.ok(a.end <= b.start || b.end <= a.start, `coach ${ca} double-booked`);
  }
  const placed = new Map();
  for (const p of r.placements) placed.set(p.team, (placed.get(p.team) || 0) + 1);
  for (const t of teams) {
    const miss = r.unplaced.find((u) => u.team === t.name)?.missing || 0;
    assert.equal((placed.get(t.name) || 0) + miss, t.times, `${t.name}: placed + unplaced = times`);
  }
}

test("days and time ranges read the ways people type them", () => {
  assert.deepEqual(parseDays("Mon Wed"), [1, 3]);
  assert.deepEqual(parseDays("Mon/Wed/Fri"), [1, 3, 5]);
  assert.deepEqual(parseDays("Mon-Thu"), [1, 2, 3, 4]);
  assert.deepEqual(parseDays("Fri-Mon"), [0, 1, 5, 6]);
  assert.deepEqual(parseDays("Tuesdays and Thursdays"), [2, 4]);
  assert.deepEqual(parseDays("weekdays"), [1, 2, 3, 4, 5]);
  assert.equal(parseDays("Mon Funday"), null);
  assert.deepEqual(parseRange("17:00-20:00"), { start: 1020, end: 1200 });
  assert.deepEqual(parseRange("5-8pm"), { start: 1020, end: 1200 });
  assert.deepEqual(parseRange("5:30pm to 7pm"), { start: 1050, end: 1140 });
  assert.deepEqual(parseRange("11-1pm"), { start: 660, end: 780 }, "11 before 1pm is morning");
  assert.deepEqual(parseRange("9am-12pm"), { start: 540, end: 720 });
  assert.equal(parseRange("8pm-5pm"), null);
  assert.equal(parseRange("soon"), null);
});

test("fields: pipes, tabs or commas; days expand to one window each; mistakes named by line", () => {
  const f = parseFields(EXAMPLE_FIELDS);
  assert.deepEqual(f.errors, []);
  assert.equal(f.windows.length, 4 + 4 + 1);
  assert.deepEqual(f.windows[8], { field: "School gym", day: 5, start: 1080, end: 1200, units: 1 });
  assert.equal(parseFields("Park\tSat\t9am-12pm\t2 halves").windows[0].units, 2);
  assert.equal(parseFields("Park | Sat | 9-12 | quarters").windows[0].units, 4);
  const bad = parseFields("Park | Sat | 9-12\nGym | Mon\nCourt | Tue | 6-8pm | lots\nPark | Sat | 11am-1pm");
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /line 2.*no time range/);
  assert.match(bad.errors[1], /line 3.*"lots"/);
  assert.match(bad.errors[2], /Park is listed twice on Sat/);
});

test("teams: every option word, defaults, and errors", () => {
  const t = parseTeamList(EXAMPLE_TEAMS);
  assert.deepEqual(t.errors, []);
  const [hawks, , foxes, bears, , lions] = t.teams;
  assert.equal(hawks.coach, "Patel");
  assert.equal(hawks.latest, 19 * 60);
  assert.deepEqual(hawks.preferDays, [2, 4]);
  assert.equal(foxes.times, 2);
  assert.deepEqual(foxes.not, [3]);
  assert.deepEqual(foxes.preferTime, { start: 1020, end: 1140 });
  assert.deepEqual(bears.games, [6]);
  assert.equal(lions.units, 4);
  assert.equal(lions.earliest, 18 * 60);
  const both = parseTeamList("Rays, prefer Tue Thu 5-7pm, 2x").teams[0];
  assert.deepEqual(both.preferDays, [2, 4]);
  assert.deepEqual(both.preferTime, { start: 1020, end: 1140 });
  assert.equal(both.times, 2);
  assert.equal(parseTeamList("A\nB", { units: 2, times: 2 }).teams[1].units, 2, "league defaults");
  const bad = parseTeamList("A\nA\nB | 9 a week\nC | after 8pm | by 7pm\nD | sometimes");
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors[0], /line 2 \(A\): listed twice/);
  assert.match(bad.errors[1], /1 to 5 practices/);
  assert.match(bad.errors[2], /earliest start is not before/);
  assert.match(bad.errors[3], /"sometimes" is not understood/);
});

test("the example league: every rule kept, every team at its solo best, so the page says proved", () => {
  const { windows } = parseFields(EXAMPLE_FIELDS), { teams } = parseTeamList(EXAMPLE_TEAMS);
  const r = buildPractices(windows, teams, { minutes: 60 });
  assertLegal(windows, teams, r);
  assert.equal(r.unplaced.length, 0);
  assert.equal(r.score, 0);
  assert.equal(r.bound, 0);
  assert.ok(r.proved);
  assert.deepEqual(buildPractices(windows, teams, { minutes: 60 }).placements, r.placements, "seeded: the same grid every time");
});

test("capacity: two quarter-field teams share a half; a full-field team takes the whole block", () => {
  const windows = [{ field: "P", day: 2, start: 1020, end: 1080, units: 2 }];
  const teams = parseTeamList("A\nB\nC").teams;
  const r = buildPractices(windows, teams);
  assertLegal(windows, teams, r);
  assert.equal(r.placements.length, 2);
  assert.equal(r.unplaced.length, 1);
  assert.match(r.unplaced[0].reason, /every slot it can use is full \(shared with/);
  const big = parseTeamList("Big | 3 units").teams;
  assert.match(buildPractices(windows, big).unplaced[0].reason, /no field window takes 3 units/);
});

test("reasons name what blocks a team: its hours, its days", () => {
  const windows = parseFields("P | Tue | 7-9pm | 4").windows;
  const r = buildPractices(windows, parseTeamList("Tiny | by 6pm").teams);
  assert.match(r.unplaced[0].reason, /no field window fits its days and hours \(by 18:00\)/);
  const r2 = buildPractices(windows, parseTeamList("Twice | 2 a week").teams);
  assert.equal(r2.placements.length, 1);
  assert.match(r2.unplaced[0].reason, /only 1 of its allowed days/);
});

test("a coach with two teams is never in two places; back to back on one field is allowed", () => {
  const windows = parseFields("A | Mon | 5-7pm | 1\nB | Mon | 5-7pm | 1").windows;
  const teams = parseTeamList("X | coach Lee\nY | coach lee").teams;
  const r = buildPractices(windows, teams);
  assertLegal(windows, teams, r);
  assert.equal(r.placements.length, 2);
  assert.notEqual(r.placements[0].start, r.placements[1].start);
  // Only one hour on two fields: the second team of the coach cannot go.
  const one = buildPractices(parseFields("A | Mon | 5-6pm | 1\nB | Mon | 5-6pm | 1").windows, teams);
  assert.equal(one.placements.length, 1);
});

test("fairness: one good slot for two teams; squared misses spread a shortfall", () => {
  // Two teams each prefer Tue and 5-6pm; Tue 5-6 holds one. Thu 5-6 and Tue 6-7 are the alternatives.
  const windows = parseFields("P | Tue Thu | 5-7pm | 1").windows;
  const teams = parseTeamList("A | prefer Tue 5-6pm\nB | prefer Tue 5-6pm").teams;
  const r = buildPractices(windows, teams);
  assertLegal(windows, teams, r);
  const misses = r.teams.map((t) => t.miss).sort();
  assert.deepEqual(misses, [0, 2], "one team gets the slot, the other misses only one thing (day or time), not both");
  assert.equal(r.score, 4);
  assert.equal(r.bound, 0);
  assert.equal(r.proved, false);
  // Squares: A gives up its perfect Tue 5-6 so B, which can only do worse elsewhere, misses once
  // instead of twice. Sums tie (0+4 against 2+2); the squares (16 against 8) do not.
  const w2 = parseFields("P | Tue Thu | 5-6pm | 1").windows;
  const t2 = parseTeamList("A | prefer Tue 5-6pm\nB | prefer Tue 6-7pm").teams;
  const r2 = buildPractices(w2, t2);
  assert.deepEqual(r2.teams.map((t) => t.miss), [2, 2]);
  assert.equal(r2.score, 8);
  assert.equal(r2.placements.find((p) => p.team === "A").day, 4);
});

test("two practices a week avoid consecutive days when they can", () => {
  const windows = parseFields("P | Mon Tue Wed | 5-6pm | 1").windows;
  const r = buildPractices(windows, parseTeamList("A | 2 a week").teams);
  assert.deepEqual(r.placements.map((p) => p.day), [1, 3]);
  assert.equal(r.score, 0);
  const forced = buildPractices(parseFields("P | Mon Tue | 5-6pm | 1").windows, parseTeamList("A | 2 a week").teams);
  assert.equal(forced.teams[0].miss, 1);
  assert.match(forced.teams[0].misses[0], /Mon and Tue are back to back/);
  assert.ok(forced.proved, "solo bound already counts the forced pair");
});

test("solo bound: best days chosen jointly with the back-to-back pairs", () => {
  const opts = [{ day: 1, miss: 0 }, { day: 2, miss: 0 }, { day: 4, miss: 2 }];
  assert.deepEqual(soloBest(opts, 2), { unplaced: 0, miss: 1, score: 1 }, "Mon+Tue (1) beats Mon+Thu (2)");
  assert.deepEqual(soloBest(opts, 3).unplaced, 0);
  assert.deepEqual(soloBest([], 2), { unplaced: 2, miss: 0, score: 2 * UNPLACED });
});

test("random leagues: every rule holds and the score is never below the solo bound", () => {
  let s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let c = 0; c < 25; c++) {
    const fl = [];
    for (let f = 0; f < 3; f++) fl.push(`F${f} | ${["Mon Wed", "Tue Thu", "Mon-Thu", "Mon Tue Fri"][Math.floor(rnd() * 4)]} | 5-8pm | ${[1, 2, 4][Math.floor(rnd() * 3)]}`);
    const tl = [];
    const n = 6 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) tl.push([`T${i}`, `${[1, 2, 4][Math.floor(rnd() * 3)]} units`, `${1 + Math.floor(rnd() * 2)} a week`, rnd() < 0.3 ? `coach C${i % 3}` : "", rnd() < 0.4 ? "prefer Tue Thu" : "", rnd() < 0.3 ? "by 7pm" : ""].filter(Boolean).join(" | "));
    const { windows } = parseFields(fl.join("\n")), { teams } = parseTeamList(tl.join("\n"));
    const r = buildPractices(windows, teams, { seed: c + 1, iterations: 20000 });
    assertLegal(windows, teams, r);
    assert.ok(r.score >= r.bound, `case ${c}`);
    assert.equal(r.proved, r.score === r.bound);
  }
});

test("every other week: read from a team's line, A or B fixed or left to the search", () => {
  const { teams, errors } = parseTeamList("U6 Ants | every other week\nU6 Bees | alternate weeks | 2 a week\nU6 Cats | A weeks\nU6 Dogs | week b\nU6 Eels | fortnightly\nU8 Owls");
  assert.deepEqual(errors, []);
  assert.deepEqual(teams.map((t) => t.weeks), ["AB", "AB", "A", "B", "AB", null]);
  assert.match(parseTeamList("X | weeks C").errors[0], /every other week, A weeks/);
});

test("every other week: two teams share one slot by turns, a third does not fit, a weekly team takes both weeks", () => {
  const one = parseFields("Small field | Tue | 5-6pm | 1").windows;
  const two = buildPractices(one, parseTeamList("U6 Ants | every other week\nU6 Bees | every other week").teams);
  assertLegal(one, parseTeamList("U6 Ants | every other week\nU6 Bees | every other week").teams, two);
  assert.equal(two.placements.length, 2);
  assert.deepEqual(two.placements.map((p) => p.weeks).sort(), ["A", "B"]);
  assert.ok(two.proved);
  const three = buildPractices(one, parseTeamList("U6 Ants | every other week\nU6 Bees | every other week\nU6 Cats | every other week").teams);
  assert.equal(three.placements.length, 2);
  assert.equal(three.unplaced.length, 1);
  assert.match(three.unplaced[0].reason, /every slot it can use is full/);
  const mixed = buildPractices(one, parseTeamList("U8 Owls\nU6 Ants | every other week").teams);
  assert.equal(mixed.placements.length, 1, "a weekly team fills the slot in both weeks");
  // Fixed weeks are kept: two B-week teams cannot share, an A and a B can.
  const fixed = buildPractices(one, parseTeamList("P | B weeks\nQ | week B").teams);
  assert.equal(fixed.placements.length, 1);
  assert.equal(fixed.placements[0].weeks, "B");
});

test("every other week: a team with two practices keeps both in the same weeks, and a coach can run A and B teams at one time", () => {
  const { windows } = parseFields("Field | Mon Wed | 5-6pm | 1");
  // Ants are fixed to A weeks on both days; Bees must then take B weeks on both days.
  const tl = "Ants | 2 a week | A weeks | coach Ruiz\nBees | 2 a week | every other week | coach Ruiz";
  const { teams } = parseTeamList(tl);
  for (let seed = 1; seed <= 5; seed++) {
    const r = buildPractices(windows, teams, { seed });
    assertLegal(windows, teams, r);
    assert.equal(r.placements.length, 4, `seed ${seed}`);
    assert.deepEqual(r.placements.filter((p) => p.team === "Bees").map((p) => p.weeks), ["B", "B"]);
  }
  // Flipping a whole team: Bees start where Ants want to be (search must move both of its practices).
  const flip = parseTeamList("Bees | 2 a week | every other week | prefer Mon Wed\nAnts | 2 a week | A weeks").teams;
  const r2 = buildPractices(windows, flip, { seed: 3 });
  assertLegal(windows, flip, r2);
  assert.equal(r2.unplaced.length, 0);
  assert.ok(r2.proved);
});

test("every other week: outputs say which weeks, the calendar repeats every two weeks from the right week", () => {
  const { windows } = parseFields("Small field | Tue | 5-6pm | 1");
  const { teams } = parseTeamList("Ants | A weeks\nBees | B weeks");
  const r = buildPractices(windows, teams);
  assert.match(practiceText(r), /Ants, A weeks/);
  assert.match(practiceText(r), /the first week of the season is an A week/);
  assert.match(teamWeekText(r, "Bees"), /Tue 17:00-18:00, Small field, B weeks/);
  assert.match(practiceCsv(r), /Tue,17:00,18:00,Small field,Ants,,1,A/);
  const [u] = fieldUse(r);
  assert.deepEqual([u.usedA, u.usedB, u.used, u.cap], [1, 1, 1, 1]);
  assert.deepEqual(u.teams.sort(), ["Ants (A weeks)", "Bees (B weeks)"]);
  // 2027-03-01 is a Monday: A-week Tuesdays are 03-02, 03-16, ...; B-week Tuesdays 03-09, 03-23, ...
  const a = practiceIcs(r, { team: "Ants", from: "2027-03-01", until: "2027-04-30", skip: ["2027-03-16", "2027-03-23"], stamp: "20270101T000000Z" });
  assert.match(a, /DTSTART:20270302T170000/);
  assert.match(a, /RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270430T235959/);
  assert.match(a, /EXDATE:20270316T170000\r\n/, "only the A-week holiday is skipped");
  const b = practiceIcs(r, { team: "Bees", from: "2027-03-01", until: "2027-04-30", skip: ["2027-03-16", "2027-03-23"], stamp: "20270101T000000Z" });
  assert.match(b, /DTSTART:20270309T170000/);
  assert.match(b, /EXDATE:20270323T170000\r\n/);
});

test("every other week, random leagues: every rule holds per week and the score is never below the solo bound", () => {
  let s = 11;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let c = 0; c < 25; c++) {
    const fl = [];
    for (let f = 0; f < 3; f++) fl.push(`F${f} | ${["Mon Wed", "Tue Thu", "Mon-Thu", "Mon Tue Fri"][Math.floor(rnd() * 4)]} | 5-8pm | ${[1, 2, 4][Math.floor(rnd() * 3)]}`);
    const tl = [];
    const n = 8 + Math.floor(rnd() * 20);
    for (let i = 0; i < n; i++) {
      const wk = rnd();
      tl.push([`T${i}`, `${[1, 2, 4][Math.floor(rnd() * 3)]} units`, `${1 + Math.floor(rnd() * 2)} a week`, wk < 0.4 ? "every other week" : wk < 0.5 ? "A weeks" : wk < 0.55 ? "B weeks" : "", rnd() < 0.3 ? `coach C${i % 3}` : "", rnd() < 0.4 ? "prefer Tue Thu" : "", rnd() < 0.3 ? "by 7pm" : ""].filter(Boolean).join(" | "));
    }
    const { windows } = parseFields(fl.join("\n")), { teams } = parseTeamList(tl.join("\n"));
    const r = buildPractices(windows, teams, { seed: c + 1, iterations: 20000 });
    assertLegal(windows, teams, r);
    assert.ok(r.score >= r.bound, `case ${c}`);
    assert.equal(r.proved, r.score === r.bound);
  }
});

test("outputs: text, team week, CSV, field use, a weekly calendar with skipped dates, link round trip", () => {
  const { windows } = parseFields(EXAMPLE_FIELDS), { teams } = parseTeamList(EXAMPLE_TEAMS);
  const r = buildPractices(windows, teams);
  const txt = practiceText(r, "Spring practices");
  assert.match(txt, /^Spring practices\n\nMon\n/);
  assert.match(teamWeekText(r, "U10 Foxes"), /^U10 Foxes\n {2}\w{3} \d\d:\d\d-\d\d:\d\d, North/);
  const csv = practiceCsv(r).split("\r\n");
  assert.equal(csv[0], "Day,Start,End,Field,Team,Coach,Units,Weeks");
  assert.equal(csv.length, r.placements.length + 2);
  const use = fieldUse(r);
  assert.equal(use.reduce((a, u) => a + u.used, 0), r.placements.reduce((a, p) => a + p.units, 0));
  assert.ok(use.every((u) => u.used <= u.cap));
  const ics = practiceIcs(r, { team: "U10 Foxes", from: "2027-03-01", until: "2027-05-31", skip: ["2027-04-06", "2027-04-08"], stamp: "20270101T000000Z" });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /RRULE:FREQ=WEEKLY;UNTIL=20270531T235959/);
  const foxes = r.placements.filter((p) => p.team === "U10 Foxes");
  // 2027-03-01 is a Monday; the first practice falls on its own weekday in that week.
  for (const p of foxes) {
    const first = 20270301 + ((p.day - 1 + 7) % 7);
    assert.match(ics, new RegExp(`DTSTART:${first}T${clock(p.start).replace(":", "")}00`));
  }
  assert.match(ics, /EXDATE:2027040[68]T/);
  assert.throws(() => practiceIcs(r, { from: "2027-05-01", until: "2027-04-01" }), /first and last dates/);
  const inputs = { fields: EXAMPLE_FIELDS, teams: EXAMPLE_TEAMS, minutes: 60, seed: 1, name: "Spring" };
  assert.deepEqual(decodeInputs(encodeInputs(inputs)).inputs, inputs);
  assert.match(decodeInputs("nope!").error, /damaged/);
  // CSV cells that look like formulas are defused.
  const evil = buildPractices(parseFields("P | Mon | 5-6pm").windows, parseTeamList("=HYPERLINK(1)").teams);
  assert.match(practiceCsv(evil), /'=HYPERLINK/);
});

test("options carry each team's misses and only its allowed blocks", () => {
  const { windows } = parseFields("P | Mon Sat | 5-7pm | 2");
  const { teams } = parseTeamList("A | games Sat | prefer 6-7pm | by 7pm");
  const { blocks, options } = practiceOptions(windows, teams, 60);
  assert.equal(blocks.length, 4);
  assert.deepEqual(options[0].map((o) => [o.day, o.start, o.miss]), [[1, 1020, 2], [1, 1080, 0]]);
});

test("the page wires the module, the disclaimer, usage events and the guide", () => {
  const html = readFileSync(new URL("./practice-schedule.html", import.meta.url), "utf8");
  for (const fn of ["parseFields", "parseTeamList", "buildPractices", "practiceText", "practiceCsv", "practiceIcs", "encodeInputs", "decodeInputs"]) assert.match(html, new RegExp(`\\b${fn}\\b`), fn);
  assert.match(html, /No warranty/);
  for (const ev of ["practice_built", "practice_example", "practice_csv", "practice_ics", "practice_shared", "practice_link_opened"]) assert.match(html, new RegExp(`record\\("${ev}"\\)`), ev);
  assert.match(html, /<link rel="canonical" href="\.\/practice-schedule\.html">/);
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  assert.match(sitemap, /practice-schedule\.html/);
  assert.match(sitemap, /how-to-make-a-practice-schedule-for-shared-fields\.html/);
  assert.match(readFileSync(new URL("./llms.txt", import.meta.url), "utf8"), /practice-schedule\.html/);
});

test("the guide's worked example is what the module builds", () => {
  const html = readFileSync(new URL("./how-to-make-a-practice-schedule-for-shared-fields.html", import.meta.url), "utf8");
  const fields = html.match(/<pre id="ex-fields">([\s\S]*?)<\/pre>/)[1];
  const teamsTxt = html.match(/<pre id="ex-teams">([\s\S]*?)<\/pre>/)[1];
  const grid = html.match(/<pre id="ex-grid">([\s\S]*?)<\/pre>/)[1];
  const dec = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const r = buildPractices(parseFields(dec(fields)).windows, parseTeamList(dec(teamsTxt)).teams);
  assert.equal(dec(grid).trim(), practiceText(r).trim());
});
