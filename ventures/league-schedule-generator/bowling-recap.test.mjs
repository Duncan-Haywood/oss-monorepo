import { test } from "node:test";
import assert from "node:assert/strict";
import { bowlingSchedule, VACANCY } from "./bowling.mjs";
import { bowlingRecap, handicapFor, parseScores, readRules, recapText, standingsCsv, bowlersCsv, RECAP_DEFAULTS } from "./bowling-recap.mjs";
import { toDay } from "./calc.mjs";

const START = toDay(2026, 9, 8);
const season = (teams, weeks, positionWeeks = []) => bowlingSchedule({ teams, weeks, start: START, positionWeeks });

test("handicap: percentage of basis minus average, fractions dropped, floor 0, cap", () => {
  const r = readRules({}).rules;
  assert.equal(handicapFor(160, r), 54); // 0.9 x 60
  assert.equal(handicapFor(165, r), 49); // 49.5 -> 49
  assert.equal(handicapFor(230, r), 0);
  assert.equal(handicapFor(null, r), 0);
  assert.equal(handicapFor(100, { ...r, maxHandicap: 80 }), 80);
  assert.equal(handicapFor(100, { ...r, handicapPct: 0 }), 0); // scratch league
  assert.equal(handicapFor(150, { ...r, handicapPct: 80, basis: 210 }), 48);
  assert.deepEqual(readRules({ basis: 50 }).errors, ["Handicap basis must be a whole number from 100 to 300."]);
});

test("two nights worked by hand: retroactive first-night average, absent penalty, blind, points", () => {
  const s = season(["Hawks", "Owls"], 2);
  const scores = `Week 1
Hawks: Ana 150 160 170, Ben 200 210 220
Owls: Cy 180 180 180, Dee absent
Week 2
Hawks: Ana 160 160 160, Ben absent
Owls: Cy 150 150 150, Dee 100 100 100`;
  const r = bowlingRecap(s, { scores, rules: { teamSize: 2 } });
  assert.deepEqual(r.errors, []);
  const [n1, n2] = r.nights;
  const side = (m, t) => (m.a.team === t ? m.a : m.b);
  // Night 1: Ana retro 160 (hdcp 54), Ben 210 (9); Cy 180 (36), Dee absent with no average = blind 150.
  assert.deepEqual(side(n1.matches[0], "Hawks").games, [413, 433, 453]);
  assert.deepEqual(side(n1.matches[0], "Owls").games, [366, 366, 366]);
  // Night 2: Ana 160 (54), Ben absent 210-10=200 +9; Cy 150 on a 180 average (36), Dee retro 100 (108).
  assert.deepEqual(side(n2.matches[0], "Hawks").games, [423, 423, 423]);
  assert.deepEqual(side(n2.matches[0], "Owls").games, [394, 394, 394]);
  assert.deepEqual(r.standings.map((x) => [x.team, x.won, x.lost]), [["Hawks", 16, 0], ["Owls", 0, 16]]);
  const b = Object.fromEntries(r.bowlers.map((x) => [x.name, x]));
  assert.equal(b.Ana.average, 160); assert.equal(b.Ana.games, 6);
  assert.equal(b.Ben.average, 210); assert.equal(b.Ben.games, 3); assert.equal(b.Ben.absences, 1); // absent games never count
  assert.equal(b.Cy.average, 165); assert.equal(b.Cy.handicap, 49);
  assert.equal(b.Dee.average, 100); assert.equal(b.Dee.handicap, 108); assert.equal(b.Dee.absences, 1);
  assert.equal(b.Ana.highSeriesHdcp, 480 + 3 * 54);
});

test("ties split the points, and entering averages set the first night's handicap", () => {
  const s = season(["Hawks", "Owls"], 1);
  const scores = "Week 1\nHawks: Ana 150 150 150\nOwls: Cy 150 150 160";
  const r = bowlingRecap(s, { scores, entering: "Ana 170, Cy 170", rules: { teamSize: 1 } });
  assert.deepEqual(r.errors, []);
  const m = r.nights[0].matches[0];
  // Both on 170 entering averages (hdcp 45): games 1 and 2 tie, Owls win game 3 and the series.
  assert.deepEqual(m.a.games.concat(m.b.games).sort(), [195, 195, 195, 195, 195, 205].sort());
  const owls = r.standings.find((x) => x.team === "Owls");
  assert.equal(owls.won, 1 + 1 + 2 + 2);
  assert.equal(r.standings.find((x) => x.team === "Hawks").won, 2);
});

test("position round pairs from the standings before that night", () => {
  const teams = ["A", "B", "C", "D"];
  const s = season(teams, 2, [2]);
  const wk1 = s.weeks[0].matches.map((m) => [s.teams[m.a], s.teams[m.b]]);
  // Night 1: give each team a different scratch so the order is known: A > B > C > D in pins.
  const pins = { A: 250, B: 200, C: 150, D: 100 };
  const line = (t) => `${t}: ${t}1 ${pins[t]} ${pins[t]} ${pins[t]}`;
  const scratch = { rules: { teamSize: 1, handicapPct: 0 } };
  const r1 = bowlingRecap(s, { ...scratch, scores: "Week 1\n" + teams.map(line).join("\n") });
  assert.deepEqual(r1.errors, []);
  const order = r1.standings.map((x) => x.team);
  // Night 2 typed for 1st v 2nd and 3rd v 4th.
  const r2 = bowlingRecap(s, { ...scratch, scores: "Week 1\n" + teams.map(line).join("\n") + "\nWeek 2\n" + teams.map(line).join("\n") });
  assert.deepEqual(r2.errors, []);
  const pairs = r2.nights[1].matches.map((m) => [m.a.team, m.b.team]);
  assert.deepEqual(pairs, [[order[0], order[1]], [order[2], order[3]]]);
  assert.ok(wk1.length === 2);
});

test("against the Vacancy a team bowls to its own par", () => {
  const s = season(["Hawks", "Owls", "Rams"], 3);
  const wk = s.weeks[0];
  const vm = wk.matches.find((m) => s.teams[m.a] === VACANCY || s.teams[m.b] === VACANCY);
  const team = s.teams[vm.a] === VACANCY ? s.teams[vm.b] : s.teams[vm.a];
  const others = ["Hawks", "Owls", "Rams"].filter((t) => t !== team);
  const scores = `Week 1\n${team}: Ana 160 150 170\n${others[0]}: Bo 150 150 150\n${others[1]}: Cy 150 150 150`;
  const r = bowlingRecap(s, { scores, entering: "Ana 160", rules: { teamSize: 1 } });
  assert.deepEqual(r.errors, []);
  const m = r.nights[0].matches.find((x) => x.vacancy);
  assert.equal(m.a.par, 160 + 54);
  // Games 214, 204, 224 against par 214: tie, loss, win; series 642 = par 642: tie.
  assert.deepEqual(m.perGame, [[1, 1], [0, 2], [2, 0]]);
  assert.deepEqual(m.points, [3 + 1, 3 + 1]);
});

test("typing slips are named, not guessed", () => {
  const s = season(["Hawks", "Owls"], 2);
  const bad = (scores, rules = {}) => bowlingRecap(s, { scores, rules }).errors.join(" | ");
  assert.match(bad("Hawks: Ana 150 150 150"), /start with a "Week 1" line/);
  assert.match(bad("Week 1\nHaws: Ana 150 150 150"), /does not start with a team name/);
  assert.match(bad("Week 1\nHawks: Ana 150 150\nOwls: Cy 1 2 3"), /Ana has 2 games/);
  assert.match(bad("Week 1\nHawks: Ana 150 150 350\nOwls: Cy 1 2 3"), /over 300/);
  assert.match(bad("Week 1\nHawks: Ana 150 150 150"), /Hawks has scores but its opponent Owls does not/);
  assert.match(bad("Week 1\nHawks: Ana 1 1 1\nOwls: Ana 1 1 1"), /Ana is on both/);
  assert.match(bad("Week 9\nHawks: Ana 1 1 1\nOwls: Cy 1 1 1"), /season has 2 weeks/);
  assert.match(bad("Week 1\nHawks: A 1 1 1, B 1 1 1\nOwls: Cy 1 1 1", { teamSize: 1 }), /2 bowlers, but a team bowls 1/);
});

test("names with spaces, a team name inside another, and the outputs", () => {
  const s = season(["Pin Pals", "Pin Pals B"], 1);
  const { weeks, errors } = parseScores("Week 1\nPin Pals B: Mary Ann Lee 180 170 160\nPin Pals: Jo 120 130 140, Ty absent", s.teams, RECAP_DEFAULTS);
  assert.deepEqual(errors, []);
  assert.equal(weeks.get(1).get("Pin Pals B")[0].name, "Mary Ann Lee");
  const r = bowlingRecap(s, { scores: "Week 1\nPin Pals B: =cmd 180 170 160\nPin Pals: Jo 120 130 140" });
  assert.deepEqual(r.errors, []);
  assert.match(recapText(r), /Week 1, .*\n  Lanes 1-2: /);
  assert.match(bowlersCsv(r), /'=cmd/); // formula guard
  assert.match(standingsCsv(r), /^Place,Team/);
  assert.equal(r.standings[0].nights, 1);
});
