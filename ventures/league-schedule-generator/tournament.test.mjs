import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE, capFits, tournamentFromText, validateTournament, parseDays, parseFields, parseDivisions, parseTeamLimits, divisionGames, tournamentCsv, tournamentText, tournamentGrid, dayRef } from "./tournament.mjs";
import { mulberry32 } from "./calc.mjs";

test("sample weekend: every game placed, every rule re-checked clean", () => {
  const t = tournamentFromText(SAMPLE);
  assert.equal(t.errors, undefined);
  assert.equal(t.unplaced.length, 0);
  // U10: 2 pools of 4 (12) + 2 SF + final; U12: 2 pools of 3 (6) + 2 SF + final + 3rd; U14: 10 + final.
  assert.equal(t.games.length, 15 + 10 + 11);
  assert.deepEqual(validateTournament(t), []);
  // U14 knockouts on Sunday; U14 Galaxy not before Sat 11:00.
  for (const g of t.games.filter((g) => g.division === "U14 Boys" && g.knockout)) assert.equal(g.dayIndex, 1);
  for (const g of t.games.filter((g) => g.teams.includes("U14 Boys/Granite Bay Galaxy") && g.dayIndex === 0)) assert.ok(g.start >= "11:00");
  // 7v7 never on the 9v9/11v11-only fields.
  for (const g of t.games.filter((g) => g.division === "U10 Girls")) assert.ok(["Field 3", "Field 4"].includes(g.field));
  assert.ok(t.teams.every((r) => r.perDay.every((n) => n <= 3)));
});

test("parsers name the bad line", () => {
  assert.match(parseDays("Sat 2027-05-15").errors[0], /hours/);
  assert.match(parseDays("2027-02-30 08:00-12:00").errors[0], /not a date/);
  assert.equal(parseDays("Saturday 2027-05-15 8am-6pm").days[0].open, 480);
  const { days } = parseDays("Sat 2027-05-15 08:00-18:00\nSun 2027-05-16 08:00-15:00");
  assert.equal(dayRef("sun", days), 1);
  assert.equal(dayRef("day 1", days), 0);
  assert.equal(dayRef("Mon", days), -1);
  assert.match(parseFields("Field 1; closed Mon", days).errors[0], /closed Sun/);
  const f = parseFields("Field 4: 7v7; closed Sun 12:00-15:00", days).fields[0];
  assert.deepEqual(f.closed, [{ start: 1440 + 720, end: 1440 + 900 }]);
  assert.match(parseDivisions("U8: 40 min, banana\nA\nB", days).errors[0], /banana/);
  assert.match(parseDivisions("U8: top 5\nA\nB\nC", days).errors[0], /top 5/);
  const v = parseDivisions("U8: 40 min, pools of 3, top 4, max 2 a day, rest 30\nA\nB\nC\nD\nE\nF", days).divisions[0];
  assert.deepEqual([v.minutes, v.pools, v.advance, v.maxPerDay, v.rest], [40, 2, 4, 2, 30]);
  const lim = parseTeamLimits("A: not before Sun 10:00\nB: not Sat\nZ: not Sat", days, [v]);
  assert.deepEqual(lim.windows["U8/A"], [{ start: 0, end: 1440 + 600 }]);
  assert.deepEqual(lim.windows["U8/B"], [{ start: 0, end: 1440 }]);
  assert.match(lim.errors[0], /no team is called Z/);
});

test("brackets: two pools cross over, three pools take the best runner-up", () => {
  const { days } = parseDays("Sat 2027-05-15 08:00-18:00");
  const two = parseDivisions("D: pools of 3, top 4\nA\nB\nC\nD\nE\nF", days).divisions[0];
  const sf = divisionGames(two, 0).games.filter((g) => g.knockout && g.stage.startsWith("SF"));
  for (const g of sf) assert.notEqual(g.home.slice(-1), g.away.slice(-1), `${g.home} v ${g.away}`);
  const three = parseDivisions("D: 3 pools, top 4\nA\nB\nC\nD\nE\nF\nG\nH\nI", days).divisions[0];
  const seeds = divisionGames(three, 0).seeds;
  assert.equal(seeds.length, 4);
  assert.equal(seeds[3], "Best 2nd-placed");
});

test("a cap of one game a day spreads a pool over the days", () => {
  const t = tournamentFromText({ days: "Sat 2027-05-15 08:00-18:00\nSun 2027-05-16 08:00-18:00", fields: "Pitch", divisions: "U9: 40 min, one pool, max 1 a day\nA\nB\nC" });
  // Three teams, two games each, one a day: three games need three days, so one is left out.
  assert.deepEqual(validateTournament(t), []);
  assert.equal(t.games.length + t.unplaced.length, 3);
  assert.equal(t.unplaced.length, 1);
  assert.match(t.unplaced[0].why, /cap/);
});

test("too little field time: a warning, games left out with a reason, the rest still valid", () => {
  const t = tournamentFromText({ days: "Sat 2027-05-15 08:00-11:00", fields: "Field 1", divisions: "U12: 60 min, one pool\nA\nB\nC\nD\nE\nF" });
  assert.match(t.warnings[0], /field-hours/);
  assert.ok(t.unplaced.length > 0);
  assert.ok(t.unplaced.every((u) => u.why));
  assert.deepEqual(validateTournament(t), []);
});

test("validator catches a moved game", () => {
  const t = tournamentFromText(SAMPLE);
  const g = t.games.find((x) => x.field === "Field 1");
  const other = t.games.find((x) => x.field === "Field 2" && x.dayIndex === g.dayIndex && x !== g);
  g.field = "Field 2"; g.startAbs = other.startAbs; g.endAbs = other.startAbs + (g.endAbs - g.startAbs);
  assert.ok(validateTournament(t).some((p) => /turnover|rest/.test(p)));
});

test("exports: CSV columns, text, grid", () => {
  const t = tournamentFromText(SAMPLE);
  const csv = tournamentCsv(t).trim().split("\n");
  assert.equal(csv[0], "Date,Day,Start,End,Field,Division,Stage,Home,Away");
  assert.equal(csv.length, t.games.length + 1);
  assert.equal(tournamentCsv(t, "U12 Boys/Valley United").trim().split("\n").length, 1 + 2);
  assert.match(tournamentText(t), /Sun 16 May 2027/);
  const grid = tournamentGrid(t);
  assert.equal(grid.length, 2);
  assert.equal(grid[0].rows.flatMap((r) => r.cells).filter(Boolean).length, t.games.filter((g) => g.dayIndex === 0).length);
});

test("random weekends: the validator finds nothing wrong", () => {
  const rand = mulberry32(42);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  let built = 0;
  for (let i = 0; i < 40; i++) {
    const nDays = 1 + Math.floor(rand() * 2);
    const days = ["Sat 2027-05-15", "Sun 2027-05-16"].slice(0, nDays).map((d) => `${d} 08:00-${pick(["14:00", "17:00", "20:00"])}`).join("\n");
    const tags = ["7v7", "9v9", "11v11"];
    const nf = 2 + Math.floor(rand() * 4);
    const fields = Array.from({ length: nf }, (_, k) => `F${k + 1}: ${tags.filter(() => rand() < 0.6).join(", ") || pick(tags)}${rand() < 0.2 ? "; closed Sat 12:00-13:00" : ""}`).join("\n");
    const nd = 1 + Math.floor(rand() * 3);
    const divs = [];
    for (let d = 0; d < nd; d++) {
      const n = 3 + Math.floor(rand() * 8);
      const top = pick([0, 2, 4, Math.min(8, n)]);
      divs.push([`D${d}: ${pick([40, 50, 60, 70])} min, ${pick(tags)}, pools of ${pick([3, 4, 5])}${top >= 2 && top < n ? `, top ${top}` : ""}${rand() < 0.3 ? ", 3rd place" : ""}, rest ${pick([0, 30, 60])}, max ${pick([2, 3, 4])} a day`, ...Array.from({ length: n }, (_, k) => `T${k}`)].join("\n"));
    }
    const coaches = nd > 1 ? "D0/T0, D1/T0" : "";
    const limits = rand() < 0.5 ? "D0/T1: not before Sat 10:00" : "";
    const t = tournamentFromText({ days, fields, divisions: divs.join("\n\n"), coaches, limits, tries: 20, seed: i + 1 });
    if (t.errors) continue;
    built++;
    assert.deepEqual(validateTournament(t), [], `case ${i}`);
  }
  assert.ok(built >= 25, `built ${built}`);
});

test("capFits: the daily-cap bound, including the parity case", () => {
  // 5 teams, top 4 (SF + final), 3 a day over 2 days: 6 games fits 2 x 3 per team, but day 1 would
  // need every team on 3 pool games (15 places, odd), so no spread works.
  assert.equal(capFits([5], 2, 3, 2), false);
  assert.equal(capFits([4], 2, 3, 2), true);
  assert.equal(capFits([3], 0, 1, 1), false);
  assert.equal(capFits([3], 0, 1, 3), true);
  // Knockouts held to day 2 only.
  assert.equal(capFits([4, 4], 3, 3, 2, 1), true);
  assert.equal(capFits([5], 3, 3, 2, 1), false);
  const t = tournamentFromText({ days: "Sat 2027-05-15 08:00-18:00\nSun 2027-05-16 08:00-18:00", fields: "A\nB\nC", divisions: "U11: 50 min, one pool, top 4, max 3 a day\nA\nB\nC\nD\nE" });
  assert.ok(t.warnings.some((w) => /cannot hold every pool game/.test(w)));
});
