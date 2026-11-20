// Two-course golf leagues: a weekly course rotation, per-course cards (including 9-hole nines of a
// 27-hole facility), and rating/slope handicaps. Every number below is worked by hand in the comments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay } from "./calc.mjs";
import {
  golfSchedule, teeReport, validateGolf, golfCsv, golfText, parseRotation, parseCourse, parseCourses,
  nineHoles, playingHandicap, ratedDiff, golfRecap, golfRecapText, golfPlayersCsv, readGolfRules, whereName,
} from "./golf.mjs";
import { golfPlayoffs, golfPlayoffsText } from "./golf-playoffs.mjs";

const START = toDay(2027, 4, 28);
const T = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
const PAR18 = "4 4 3 5 4 4 3 5 4  4 4 3 5 4 4 3 5 4";
const IDX18 = "7 3 15 1 11 5 17 9 13  8 4 16 2 12 6 18 10 14";

test("rotation: entries read as course + nine, a 9-hole course alone, front/back alone left to the nines setting", () => {
  assert.deepEqual(parseRotation("Oak front, Pine Back 9\nRed").rotation, [
    { course: "Oak", nine: "front" }, { course: "Pine", nine: "back" }, { course: "Red", nine: "nine" },
  ]);
  assert.deepEqual(parseRotation("front, back"), { rotation: [], errors: [] });
  assert.equal(parseRotation("Oak front, back").errors.length, 1);
  assert.equal(parseRotation(Array.from({ length: 13 }, (_, i) => `C${i}`).join(",")).errors.length, 1);
});

test("schedule on two courses: the whole league rotates, every team plays each course its share", () => {
  const s = golfSchedule({ teams: T(6), weeks: 8, start: START, rotation: "Oak front, Pine front, Oak back, Pine back" });
  assert.deepEqual(validateGolf(s), []);
  assert.deepEqual(s.weeks.slice(0, 5).map(whereName), ["Oak, Front 9", "Pine, Front 9", "Oak, Back 9", "Pine, Back 9", "Oak, Front 9"]);
  // 8 weeks over a 4-entry rotation: every team plays 4 nights at each course.
  for (const r of teeReport(s).rows) assert.deepEqual(r.courses, { Oak: 4, Pine: 4 });
  const csv = golfCsv(s).split("\n");
  assert.equal(csv[0], "Week,Date,Course,Nine,Tee time,Team,Opponent");
  assert.match(csv[1], /^1,2027-04-28,Oak,Front 9,/);
  assert.match(golfText(s), /Week 2, .*: Pine, Front 9/);
  // Without a rotation nothing changes: no Course column, no course on the weeks.
  const one = golfSchedule({ teams: T(4), weeks: 2, start: START });
  assert.equal(golfCsv(one).split("\n")[0], "Week,Date,Nine,Tee time,Team,Opponent");
  assert.equal("course" in one.weeks[0], false);
});

test("course cards: 9-hole nines with odd/even indexes, ratings per nine or per 18, all-or-none", () => {
  const red = parseCourse("Par: 4 4 3 5 4 4 3 5 4\nIndex: 2 4 6 8 10 12 14 16 18");
  assert.deepEqual(red.errors, []);
  assert.equal(red.course.holes, 9);
  // A 9-hole course has one nine whatever the week says; hole 1 (index 2) is its hardest.
  assert.deepEqual(nineHoles(red.course, "back").holes, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nineHoles(red.course, "back").rank[0], 0);
  assert.equal(parseCourse("Par: 4 4 3 5 4 4 3 5 4\nIndex: 2 4 6 8 10 12 14 16 16").errors.length, 1);
  // One 18-hole rating is halved per nine; one slope serves both nines.
  const oak = parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nRating: 71.0\nSlope: 128`).course;
  assert.deepEqual(oak.tees.get("").rating, [35.5, 35.5]);
  assert.deepEqual([nineHoles(oak, "back").rating, nineHoles(oak, "back").slope], [35.5, 128]);
  const perNine = parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nRating: 35.2 36.1\nSlope: 124 131`).course;
  assert.deepEqual([nineHoles(perNine, "back").rating, nineHoles(perNine, "back").slope], [36.1, 131]);
  // A forward tee with no rating of its own, when the main tees are rated, is an error.
  assert.match(parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nRating: 71\nSlope: 128\nPar (forward): ${PAR18}`).errors.join(" "), /forward tees/);
  assert.match(parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nSlope: 200`).errors.join(" "), /55 to 155/);
  // Several cards: headed by "Course:"; rated on one but not the other is refused.
  const two = parseCourses(`Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\n\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}`);
  assert.deepEqual([...two.courses.values()].map((c) => c.name), ["Oak", "Pine"]);
  assert.match(parseCourses(`Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\nRating: 71\nSlope: 128\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}`).errors.join(" "), /every course, or for none/);
  assert.match(parseCourses(`Par: ${PAR18}\nIndex: ${IDX18}\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}`).errors.join(" "), /start each card/);
});

test("playing handicap and rated differential, worked by hand", () => {
  const rules = readGolfRules({}).rules; // 90%
  const oak = nineHoles(parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nRating: 35.0 35.0\nSlope: 113 113`).course, "front");
  const pine = nineHoles(parseCourse(`Par: ${PAR18}\nIndex: ${IDX18}\nRating: 37.5 37.5\nSlope: 135 135`).course, "front");
  // Oak: 10 x 113/113 + (35 - 36) = 9; 90% = 8.1 -> 8.  Pine: 10 x 135/113 = 11.95, + 1.5 = 13.45; 90% = 12.1 -> 12.
  assert.equal(playingHandicap(10, oak, rules), 8);
  assert.equal(playingHandicap(10, pine, rules), 12);
  assert.equal(playingHandicap(0, oak, rules), 0); // -0.9 is held at 0
  // (45 - 37.5) x 113 / 135 = 6.278 -> 6.3
  assert.equal(ratedDiff(45, pine), 6.3);
});

// 27-hole facility, three 9-hole cards. White: par 36, hole 1 the hardest (index 2), hole 2 next (4).
const NINES27 = `Course: Red
Par: 4 4 3 5 4 4 3 5 4
Index: 1 3 5 7 9 11 13 15 17
Course: White
Par: 3 4 5 4 3 4 5 4 4
Index: 2 4 6 8 10 12 14 16 18
Course: Blue
Par: 5 4 4 3 4 4 3 5 4
Index: 17 15 13 11 9 7 5 3 1`;

test("27 holes: week 2 is scored on White's own card", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 3, start: START, rotation: "Red, White, Blue" });
  // Ana (handicap 0) v Ben (2): Ben gets a stroke on White's holes 1 and 2. Ana pars every hole;
  // Ben bogeys 1, 2, 3: net par on 1 and 2, a bogey on 3 -> Ana wins hole 3, halves 8: 5 - 4.
  // Match net: Ana 36, Ben 39 - 2 = 37 -> Ana 1. Team net (one player a team): Ana 2. Ana 8, Ben 4.
  const r = golfRecap(s, {
    course: NINES27, rosters: "Hawks: Ana\nOwls: Ben", entering: "Ana 0, Ben 2", rules: { teamSize: 1 },
    cards: "Week 2\nAna: 3 4 5 4 3 4 5 4 4\nBen: 4 5 6 4 3 4 5 4 4",
  });
  assert.deepEqual(r.errors, []);
  const n = r.nights[0];
  assert.equal(n.where, "White");
  assert.equal(n.parTotal, 36);
  const m = n.matches[0];
  assert.deepEqual(m.pairings[0].strokes[m.a === "Hawks" ? 1 : 0].slice(0, 3), [1, 1, 0]);
  assert.deepEqual(m.a === "Hawks" ? m.points : [...m.points].reverse(), [8, 4]);
  assert.match(golfRecapText(r), /Week 2, .* \(White, par 36\)/);
});

test("rated two-course league: the same index gives more strokes at the harder course", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 2, start: START, rotation: "Oak front, Pine front" });
  const course = `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\nRating: 35.0 35.0\nSlope: 113 113\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}\nRating: 37.5 37.5\nSlope: 135 135`;
  const par = "4 4 3 5 4 4 3 5 4";
  const r = golfRecap(s, { course, rosters: "Hawks: Ana\nOwls: Ben", entering: "Ana 10, Ben 10", rules: { teamSize: 1 }, cards: `Week 1\nAna: ${par}\nBen: ${par}\nWeek 2\nAna: ${par}\nBen: ${par}` });
  assert.deepEqual(r.errors, []);
  assert.equal(r.rated, true);
  const ana = (night) => night.matches[0].pairings[0][night.matches[0].a === "Hawks" ? "a" : "b"];
  // Week 1 at Oak from the entering index 10: 8 strokes (worked above).
  assert.equal(ana(r.nights[0]).handicap, 8);
  // Her Oak round, 36 = par: (36 - 35) x 113/113 = 1.0, her index for week 2. At Pine:
  // 1.0 x 135/113 + 1.5 = 2.69; 90% = 2.4 -> 2.
  assert.equal(ana(r.nights[1]).handicap, 2);
  // After Pine's 36: (36 - 37.5) x 113/135 = -1.3; best 5 of last 5 averages (1.0 - 1.3)/2 = -0.15 -> held at 0.
  assert.equal(r.players.find((p) => p.name === "Ana").handicap, 0);
  assert.match(golfPlayersCsv(r).split("\n")[0], /League index next week/);
  assert.match(golfRecapText(r), /Pine, Front 9, par 36, rating 37\.5, slope 135/);
});

test("two-course mistakes are named, not scored wrong", () => {
  const two = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 2, start: START, rotation: "Oak front, Pine front" });
  const base = { rosters: "Hawks: Ana\nOwls: Ben", rules: { teamSize: 1 }, cards: "" };
  assert.match(golfRecap(two, { ...base, course: `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}` }).errors.join(" "), /plays Pine, which has no card/);
  const bare = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 2, start: START, rotation: "Oak, Pine front" });
  assert.match(golfRecap(bare, { ...base, course: `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}` }).errors.join(" "), /write "Oak front" or "Oak back"/);
  const one = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 2, start: START });
  assert.match(golfRecap(one, { ...base, course: `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}` }).errors.join(" "), /set the course rotation/);
  // A player's forward tees typed on Oak's card but not Pine's.
  const tees = golfRecap(two, { ...base, rosters: "Hawks: Ana (forward)\nOwls: Ben", course: `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}\nPar (forward): ${PAR18}\nCourse: Pine\nPar: ${PAR18}\nIndex: ${IDX18}` });
  assert.match(tees.errors.join(" "), /Ana plays from "forward" tees, which the Pine card does not name/);
  // One named card for a one-course league is fine.
  assert.deepEqual(golfRecap(one, { ...base, course: `Course: Oak\nPar: ${PAR18}\nIndex: ${IDX18}` }).errors, []);
});

test("play-offs carry on the rotation after the last regular week", () => {
  const s = golfSchedule({ teams: T(4), weeks: 4, start: START, rotation: "Red, White, Blue" });
  const recap = { standings: T(4).map((team, i) => ({ team, place: i + 1, points: 10 - i, holesWon: 0 })) };
  const p = golfPlayoffs(recap, s, { flights: 1 });
  assert.deepEqual(p.errors, []);
  // Weeks 1-4 played Red, White, Blue, Red: the play-offs start on White, then Blue.
  assert.deepEqual(p.nights.map((n) => n.course), ["White", "Blue"]);
  assert.match(golfPlayoffsText(p), /Night 1, .* \(White\)/);
});
