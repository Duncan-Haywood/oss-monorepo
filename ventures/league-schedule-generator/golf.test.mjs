import { test } from "node:test";
import assert from "node:assert/strict";
import { toDay } from "./calc.mjs";
import {
  golfSchedule, teeReport, validateGolf, golfCsv, golfText, slotLabels, BYE,
  parseCourse, nineHoles, strokesOn, golfHandicap, readGolfRules, playPairing,
  golfRecap, golfRecapText, golfStandingsCsv, golfPlayersCsv, teeBoundOutOfReach,
  skinsGame, teeRows,
} from "./golf.mjs";

const START = toDay(2027, 4, 28);
const T = (n) => Array.from({ length: n }, (_, i) => `Team ${i + 1}`);
// Front nine: pars 4 4 3 5 4 4 3 5 4 (36), stroke index 7 3 15 1 11 5 17 9 13 (odd numbers).
const COURSE = `Par: 4 4 3 5 4 4 3 5 4  4 4 3 5 4 4 3 5 4
Index: 7 3 15 1 11 5 17 9 13  8 4 16 2 12 6 18 10 14`;

test("schedule: round robin, front and back nine alternating, every team in one group a week", () => {
  const s = golfSchedule({ teams: T(8), weeks: 14, start: START });
  assert.deepEqual(validateGolf(s), []);
  assert.deepEqual(s.weeks.slice(0, 4).map((w) => w.nine), ["front", "back", "front", "back"]);
  assert.equal(s.weeks[1].day - s.weeks[0].day, 7);
  const r = teeReport(s);
  assert.equal(r.atBound, 8); // 14 weeks on 4 tee times: 4,4,3,3 for every team
  for (const row of r.rows) assert.equal(row.front, 7);
  const fixed = golfSchedule({ teams: T(6), weeks: 4, start: START, nines: "back" });
  assert.ok(fixed.weeks.every((w) => w.nine === "back"));
});

test("odd league: the bye team keeps a tee time and plays the course", () => {
  const s = golfSchedule({ teams: T(5), weeks: 5, start: START });
  assert.deepEqual(validateGolf(s), []);
  assert.equal(s.nSlots, 3);
  for (const wk of s.weeks) assert.equal(wk.groups.filter((g) => g.b === null).length, 1);
  assert.match(golfText(s), new RegExp(BYE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("tee times, shotgun holes, skipped dates and the CSV", () => {
  assert.deepEqual(slotLabels(3, { firstTee: "4:30 pm", interval: 8 }), ["16:30", "16:38", "16:46"]);
  assert.deepEqual(slotLabels(3, { startType: "shotgun", nine: "back" }), ["Hole 10", "Hole 11", "Hole 12"]);
  assert.equal(slotLabels(11, { startType: "shotgun" })[9], "Hole 1B");
  const s = golfSchedule({ teams: T(4), weeks: 3, start: START, skipDays: [START + 7] });
  assert.deepEqual(s.skipped, [START + 7]);
  assert.equal(s.weeks[1].day, START + 14);
  const csv = golfCsv(s).split("\n");
  assert.equal(csv[0], "Week,Date,Nine,Tee time,Team,Opponent");
  assert.match(csv[1], /^1,2027-04-28,Front 9,16:3\d,Team \d,Team \d$/);
  assert.deepEqual(golfSchedule({ teams: ["A", "Bye week"], weeks: 2, start: START }).errors.length, 1);
});

test("stored solver deals and proved limits", () => {
  // 12 teams over 18 weeks: the search alone left 2 teams off; the stored deal has all 12 at share.
  const s = golfSchedule({ teams: T(12), weeks: 18, start: START });
  assert.equal(s.fromTable, true);
  assert.equal(teeReport(s).atBound, 12);
  assert.deepEqual(validateGolf(s), []);
  assert.equal(teeBoundOutOfReach(4, 10), true);
  assert.equal(golfSchedule({ teams: T(4), weeks: 10, start: START }).boundProvedOutOfReach, true);
  assert.equal(teeBoundOutOfReach(8, 14), false);
});

test("course, stroke ranks on a nine, and strokes for a handicap difference", () => {
  const { course, errors } = parseCourse(COURSE);
  assert.deepEqual(errors, []);
  const front = nineHoles(course, "front");
  assert.equal(front.parTotal, 36);
  assert.deepEqual(front.rank, [3, 1, 7, 0, 5, 2, 8, 4, 6]);
  assert.deepEqual(strokesOn(front.rank, 3), [0, 1, 0, 1, 0, 1, 0, 0, 0]);
  assert.deepEqual(strokesOn(front.rank, 11), [1, 2, 1, 2, 1, 1, 1, 1, 1]);
  assert.deepEqual(nineHoles(course, "back").rank, [3, 1, 7, 0, 5, 2, 8, 4, 6]);
  assert.match(parseCourse("Par: 4 4 4\nIndex: 1 2").errors[0], /18 whole numbers/);
  assert.match(parseCourse(COURSE.replace("Index: 7 3", "Index: 7 7")).errors[0], /each number 1 to 18 once/);
});

test("league handicap: percent of the best of the last rounds over par, rounded, capped", () => {
  const r = readGolfRules({}).rules;
  assert.equal(golfHandicap([5], r), 5); // 4.5 rounds to 5
  assert.equal(golfHandicap([9], r), 8); // 8.1
  assert.equal(golfHandicap([30, 30], r), 18); // capped
  assert.equal(golfHandicap([-3], r), 0);
  const best3of5 = readGolfRules({ last: 5, best: 3 }).rules;
  assert.equal(golfHandicap([20, 2, 4, 6, 12, 10], best3of5), 4); // last 5: 2 4 6 12 10 -> best 2 4 6 avg 4 -> 3.6 -> 4
  assert.equal(golfHandicap([], r), null);
  assert.deepEqual(readGolfRules({ best: 6, last: 5 }).errors, ["Best rounds used cannot be more than the rounds counted."]);
});

test("a night worked by hand: hole points, match net, team net", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 1, start: START });
  const r = golfRecap(s, {
    course: COURSE,
    rosters: "Hawks: Ana, Ben\nOwls: Cy, Dee",
    entering: "Ana 5, Ben 12, Cy 2, Dee 14",
    cards: `Week 1
Ana: 5 4 4 5 5 5 3 6 4
Ben: 6 5 4 6 5 5 4 7 5
Cy: 4 5 3 5 4 4 4 5 5
Dee: 6 6 4 6 6 5 4 6 6`,
  });
  assert.deepEqual(r.errors, []);
  const m = r.nights[0].matches[0];
  const hawksFirst = m.a === "Hawks";
  const [ph, po] = hawksFirst ? m.points : [m.points[1], m.points[0]];
  // Ana (5) v Cy (2): Ana gets 3 strokes; 4 holes each, one halved, Ana's net 36 beats 37: 5.5 - 4.5.
  // Ben (12) v Dee (14): Dee gets 2; 2 holes each, 5 halved, both net 35: 5 - 5. Team net 71 v 72: 2 to Hawks.
  assert.equal(ph, 12.5);
  assert.equal(po, 9.5);
  const pair = m.pairings.find((p) => p.a.name === "Ana" || p.b.name === "Ana");
  assert.deepEqual(pair.pts.slice().sort(), [4.5, 5.5]);
  assert.deepEqual(r.standings.map((x) => [x.place, x.team, x.points]), [[1, "Hawks", 12.5], [2, "Owls", 9.5]]);
  const pl = Object.fromEntries(r.players.map((p) => [p.name, p]));
  assert.equal(pl.Ana.handicap, 5); // 41 - 36 = 5, 90% = 4.5 -> 5
  assert.equal(pl.Dee.handicap, 12); // 49 - 36 = 13 -> 11.7 -> 12
  assert.equal(pl.Ana.lowNet, 36);
  const text = golfRecapText(r);
  assert.match(text, /Hawks 12\.5 - 9\.5 Owls|Owls 9\.5 - 12\.5 Hawks/);
  assert.match(golfStandingsCsv(r), /^Place,Team,Points/);
  assert.match(golfPlayersCsv(r), /Ana,Hawks,1,0,41,5,41,36/);
});

test("net double bogey cap, first-night handicap, absent player and the bye", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls", "Wrens"], weeks: 3, start: START });
  const rosters = "Hawks: Ana, Ben\nOwls: Cy, Dee\nWrens: Eve, Fin";
  const front = (w) => s.weeks[w - 1];
  // Week 1: find who has the bye and who plays.
  const g1 = front(1).groups;
  const byeTeam = s.teams[g1.find((g) => g.b === null).a];
  const all = { Ana: "5 5 4 5 5 5 4 6 5", Ben: "5 5 4 5 5 5 4 6 5", Cy: "5 5 4 5 5 5 4 6 5", Dee: "5 5 4 5 5 5 4 6 5", Eve: "5 5 4 5 5 5 4 6 5", Fin: "5 5 4 5 5 5 4 6 5" };
  const cards = "Week 1\n" + Object.entries(all).map(([n, c]) => `${n}: ${c}`).join("\n");
  const r = golfRecap(s, { course: COURSE, rosters, cards });
  assert.deepEqual(r.errors, []);
  // Nobody has a handicap: the night's own 44 (8 over) sets 90% of 8 = 7.2 -> 7 for everyone.
  assert.ok(r.players.every((p) => p.handicap === 7));
  const bye = r.nights[0].matches.find((m) => m.b === null);
  assert.equal(bye.a, byeTeam);
  // Against par with 7 strokes (none on holes 3 and 7): net 4 4 4 4 4 4 4 5 4 v par 4 4 3 5 4 4 3 5 4:
  // the player wins hole 4, par wins 3 and 7, six halved: 4 - 5; net 37 v 36 gives par the match point.
  assert.deepEqual(bye.pairings[0].pts, [4, 6]);
  // Week 2: Ana absent; a 9 on a par 3 is capped at net double bogey for the handicap.
  const playing2 = front(2).groups.filter((g) => g.b !== null).flatMap((g) => [g.a, g.b]).map((t) => s.teams[t]);
  const cards2 = cards + "\nWeek 2\nAna absent\nBen: 5 5 4 5 5 5 4 6 5\nCy: 5 5 4 5 5 5 4 6 5\nDee: 5 5 9 5 5 5 4 6 5\nEve: 5 5 4 5 5 5 4 6 5\nFin: 5 5 4 5 5 5 4 6 5";
  const r2 = golfRecap(s, { course: COURSE, rosters, cards: cards2 });
  assert.deepEqual(r2.errors, []);
  const dee = r2.players.find((p) => p.name === "Dee");
  // Back nine, hole 12 (par 3, stroke rank 7): Dee's 7 strokes miss it, so the cap is 3 + 2 = 5:
  // 49 gross adjusts to 45, diff 9; week 1's first-night card counts uncapped (8): avg 8.5 -> 7.65 -> 8.
  assert.equal(dee.handicap, 8);
  const ana = r2.players.find((p) => p.name === "Ana");
  assert.equal(ana.absences, 1);
  assert.equal(ana.rounds, 1);
  if (playing2.includes("Hawks")) {
    const m = r2.nights[1].matches.find((x) => x.a === "Hawks" || x.b === "Hawks");
    const anaPair = m.pairings.find((p) => p.a.name === "Ana" || p.b.name === "Ana");
    const opp = anaPair.a.name === "Ana" ? 1 : 0;
    assert.equal(anaPair.pts[opp], 10); // 9 holes + the match-net point
  }
});

test("typing slips are named", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 2, start: START });
  const base = { course: COURSE, rosters: "Hawks: Ana, Ben\nOwls: Cy, Dee" };
  assert.match(golfRecap(s, { ...base, cards: "Ana: 4 4 4 4 4 4 4 4 4" }).errors[0], /start with a "Week 1"/);
  assert.match(golfRecap(s, { ...base, cards: "Week 1\nZed: 4 4 4 4 4 4 4 4 4" }).errors[0], /not on any roster/);
  assert.match(golfRecap(s, { ...base, cards: "Week 1\nAna: 4 4 4" }).errors[0], /nine hole scores/);
  assert.match(golfRecap(s, { ...base, cards: "Week 1\nAna: 4 4 4 4 4 4 4 4 4" }).errors[0], /no card for Ben/);
  assert.match(golfRecap(s, { ...base, rosters: "Hawks: Ana\nOwls: Cy, Dee" }).errors[0], /Hawks has 1 player/);
  assert.match(golfRecap(s, { ...base, cards: "Week 9\nAna: 4 4 4 4 4 4 4 4 4" }).errors[0], /not in the schedule/);
});

// Forward tees: hole 9 a par 5 (front par 37) and hole 1 the hardest on the front.
const TEES = `${COURSE}
Par (forward): 4 4 3 5 4 4 3 5 5  4 4 3 5 4 4 3 5 4
Index (forward): 1 3 15 7 11 5 17 9 13  8 4 16 2 12 6 18 10 14`;

test("tee rows: a named tee keeps the main row it does not give, and bad rows are named", () => {
  const { course, errors } = parseCourse(TEES);
  assert.deepEqual(errors, []);
  assert.equal(nineHoles(course, "front", "forward").parTotal, 37);
  assert.equal(nineHoles(course, "front").parTotal, 36);
  assert.deepEqual(teeRows(course, "Forward").index.slice(9), teeRows(course, "").index.slice(9));
  const half = parseCourse(`${COURSE}\nIndex (senior): 7 3 15 1 11 5 17 9 13  8 4 16 2 12 6 18 10 14`).course;
  assert.deepEqual(teeRows(half, "senior").par, half.par); // index only: the main par
  assert.match(parseCourse(`${COURSE}\nIndex (red): 1 1 15 7 11 5 17 9 13  8 4 16 2 12 6 18 10 14`).errors[0], /stroke index \(red\)/);
  assert.match(parseCourse(`${COURSE}\nPar (red): 4 4`).errors[0], /Par \(red\) needs 18/);
});

test("mixed tees worked by hand: the higher par gets the difference, strokes on the receiver's own index", () => {
  const { course } = parseCourse(TEES);
  const fwd = nineHoles(course, "front", "forward"), main = nineHoles(course, "front");
  const ana = { absent: false, handicap: 5, holes: [5, 4, 4, 5, 5, 5, 3, 6, 5] }; // 42 on par 37
  const cy = { absent: false, handicap: 2, holes: [4, 5, 3, 5, 4, 4, 4, 5, 5] }; // 39 on par 36
  const r = playPairing(ana, cy, fwd, readGolfRules().rules, main);
  // 5 + 1 (par 37 v 36) = 6 v 2: Ana gets 4, on her forward index 1, 3, 5, 7 = holes 1, 2, 6, 4.
  assert.deepEqual(r.parAdjust, [1, 0]);
  assert.deepEqual(r.strokes[0], [1, 1, 0, 1, 0, 1, 0, 0, 0]);
  // Net 4 3 4 4 5 4 3 6 5 v 4 5 3 5 4 4 4 5 5: Ana wins 2, 4, 7; Cy 3, 5, 8; three halved: 4.5 each.
  // Match net 42 - 6 = 36 v 39 - 2 = 37: Ana's point. 5.5 - 4.5.
  assert.deepEqual(r.holes, [3, 3]);
  assert.deepEqual(r.pts, [5.5, 4.5]);
  assert.deepEqual(r.nets, [36, 37]);
});

test("mixed tees through the recap: handicap over own par, unknown tees named", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 1, start: START });
  const base = { course: TEES, entering: "Ana 5, Ben 12, Cy 2, Dee 14", cards: `Week 1
Ana: 5 4 4 5 5 5 3 6 5
Ben: 6 5 4 6 5 5 4 7 5
Cy: 4 5 3 5 4 4 4 5 5
Dee: 6 6 4 6 6 5 4 6 6` };
  const r = golfRecap(s, { ...base, rosters: "Hawks: Ana (forward), Ben\nOwls: Cy, Dee" });
  assert.deepEqual(r.errors, []);
  const pl = Object.fromEntries(r.players.map((p) => [p.name, p]));
  assert.equal(pl.Ana.tee, "forward");
  assert.equal(pl.Ana.handicap, 5); // 42 - 37 = 5 -> 4.5 -> 5 (on the main tees 42 - 36 would give 5.4 -> 5 too; see the pairing)
  const m = r.nights[0].matches[0];
  const anaPair = m.pairings.find((p) => p.a.name === "Ana" || p.b.name === "Ana");
  assert.deepEqual((anaPair.a.name === "Ana" ? anaPair.pts : [...anaPair.pts].reverse()), [5.5, 4.5]);
  // Team net on the main par: Ana 42 - 5 - 37 + 36 = 36, Ben 47 - 12 = 35: 71.
  assert.equal(m.a === "Hawks" ? m.teamNet[0] : m.teamNet[1], 71);
  assert.match(golfPlayersCsv(r), /Ana,Hawks,1,0,42,5,42,37,forward,0,0\.00/);
  const bad = golfRecap(s, { ...base, rosters: "Hawks: Ana (red), Ben\nOwls: Cy, Dee" });
  assert.match(bad.errors[0], /Ana plays from "red" tees.*names: forward/);
});

test("skins worked by hand: ties win nothing, carry-over rides on, the pot is shared", () => {
  const E = [
    { key: "a", name: "A", team: "X", toPar: [0, 0, 1, -1, 0, 0, 0, 0, 0] },
    { key: "b", name: "B", team: "X", toPar: [0, 1, 0, 0, 0, 0, 0, 0, -1] },
    { key: "c", name: "C", team: "Y", toPar: [1, 0, 0, 0, 0, 0, 0, 1, 0] },
  ];
  const plain = skinsGame(E, { entry: 5 });
  assert.deepEqual(plain.won.map((w) => [w.hole, w.name, w.units, w.value]), [[3, "A", 1, 7.5], [8, "B", 1, 7.5]]);
  const carried = skinsGame(E, { entry: 5, carry: true });
  // Holes 1-3 tie (A takes 4 on hole 4); 5-8 tie (B takes 5 on hole 9): 9 skins share 15.
  assert.deepEqual(carried.won.map((w) => [w.name, w.units, w.value]), [["A", 4, 6.67], ["B", 5, 8.33]]);
  assert.equal(carried.carriedOff, 0);
  const allTied = skinsGame(E.map((e) => ({ ...e, toPar: new Array(9).fill(0) })), { entry: 5, carry: true });
  assert.equal(allTied.won.length, 0);
  assert.equal(allTied.carriedOff, 9);
  assert.equal(allTied.refunded, true);
});

test("gross and net skins on the worked night", () => {
  const s = golfSchedule({ teams: ["Hawks", "Owls"], weeks: 1, start: START });
  const r = golfRecap(s, {
    course: COURSE, rosters: "Hawks: Ana, Ben\nOwls: Cy, Dee", entering: "Ana 5, Ben 12, Cy 2, Dee 14",
    rules: { skins: "both", skinsEntry: 1 },
    cards: `Week 1
Ana: 5 4 4 5 5 5 3 6 4
Ben: 6 5 4 6 5 5 4 7 5
Cy: 4 5 3 5 4 4 4 5 5
Dee: 6 6 4 6 6 5 4 6 6`,
  });
  assert.deepEqual(r.errors, []);
  const { gross, net } = r.nights[0].skins;
  // Gross: Cy takes 1, 3, 5, 6, 8; Ana 2, 7, 9; hole 4 ties at 5. Pot 4 over 8 skins.
  assert.deepEqual(gross.won.map((w) => [w.holeNumber, w.name]), [[1, "Cy"], [2, "Ana"], [3, "Cy"], [5, "Cy"], [6, "Cy"], [7, "Ana"], [8, "Cy"], [9, "Ana"]]);
  assert.equal(gross.payout.get("cy").money, 2.5);
  // Net with full handicaps: every hole ties but the 8th, Dee's net 4 (6 less 2 strokes).
  assert.deepEqual(net.won.map((w) => [w.holeNumber, w.name, w.value]), [[8, "Dee", 4]]);
  const pl = Object.fromEntries(r.players.map((p) => [p.name, p]));
  assert.equal(pl.Dee.skins, 1);
  assert.equal(pl.Cy.skinsMoney, 2.5);
  assert.match(golfRecapText(r), /Net skins \(4 in, pot 4\.00\):\n {4}Hole 8: Dee 4\.00/);
  const only = golfRecap(s, { course: COURSE, rosters: "Hawks: Ana, Ben\nOwls: Cy, Dee", skinsPlayers: "Ana, Zed", rules: { skins: "gross" }, cards: "" });
  assert.match(only.errors[0], /Skins player "Zed"/);
  assert.match(golfRecap(s, { course: COURSE, rosters: "Hawks: Ana, Ben\nOwls: Cy, Dee", rules: { skins: "lots" } }).errors[0], /Skins must be one of/);
});
