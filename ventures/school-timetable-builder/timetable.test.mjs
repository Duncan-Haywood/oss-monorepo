import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSchool, feasibility, solve, validate, expandUnits, grid, toCsv, softBreakdown } from "./timetable.mjs";
import { syntheticSchool } from "./eval/generate.mjs";

const sample = readFileSync(new URL("./samples/small-secondary.txt", import.meta.url), "utf8");

test("parses days, periods, breaks, rooms, rules and joint lessons", () => {
  const { problem, errors, warnings } = parseSchool(sample);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(problem.periods, 6);
  assert.deepEqual(problem.breaksAfter, [2, 4]);
  assert.equal(problem.classes.length, 4);
  assert.equal(problem.rooms.find((r) => r.name === "Gym").type, "gym");
  const okafor = problem.teachers.find((t) => t.name === "Okafor");
  assert.deepEqual(okafor.off, [[0, 0], [0, 1]]);
  assert.equal(okafor.maxPerDay, 5);
  assert.equal(problem.teachers.find((t) => t.name === "Lindqvist").off.length, 6);
  const pe = problem.lessons.find((l) => l.subject === "PE" && l.classes.length === 2);
  assert.equal(pe.doubles, 1);
  assert.equal(pe.roomType, "gym");
  const sci = problem.lessons.find((l) => l.subject === "Science");
  assert.equal(sci.doubles, 2);
});

test("errors name the line and say how to fix it", () => {
  const { problem, errors } = parseSchool("periods: 6\n7A: Maths / Smith\n7A: Art / Lee / 2 / studio\nteacher Lee: off Funday 3\n");
  assert.equal(problem, null);
  assert.ok(errors.some((e) => /line 2: write "Class: Subject \/ Teacher/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /line 3: "studio" is not/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /line 4: "Funday" is not one of the days/.test(e)), errors.join("\n"));
  assert.ok(parseSchool("").errors.some((e) => /no lessons/.test(e)));
  assert.ok(parseSchool("7A: Maths / X / 3 / 2 doubles").errors.some((e) => /2 doubles need 4 periods/.test(e)));
});

test("units: doubles first, then singles, each double counts one lesson", () => {
  const { problem } = parseSchool("7A: Science / P / 5 / 2 doubles\n");
  const { units } = expandUnits(problem);
  assert.deepEqual(units.map((u) => u.len), [2, 2, 1]);
});

test("feasibility catches overloaded teachers, classes and rooms before solving", () => {
  const over = parseSchool("periods: 2\ndays: Mon, Tue\nrooms: Lab (lab)\n7A: Maths / Smith / 3\n7B: Maths / Smith / 2\n7B: Sci / Jo / 3 / lab\n7A: Sci / Jo2 / 2 / lab\n").problem;
  const issues = feasibility(over).filter((i) => !i.soft);
  assert.ok(issues.some((i) => i.kind === "teacher" && i.name === "Smith" && i.need === 5 && i.have === 4));
  assert.ok(issues.some((i) => i.kind === "class" && i.name === "7B" && i.need === 5));
  assert.ok(issues.some((i) => i.kind === "room" && i.name === "lab" && i.need === 5 && i.have === 4));
  const pinned = parseSchool("rooms: Gym (gym), Hall\n7A: PE / G / 2 / gym\n7B: PE / G / 1 / room Gym\n7C: Assembly / H / 1 / Hall\n").problem;
  assert.equal(pinned.lessons[0].roomType, "gym");
  assert.equal(pinned.lessons[1].room, 0);
  assert.equal(pinned.lessons[2].room, 1);
  const capped = parseSchool("days: Mon, Tue\nperiods: 4\nteacher T: max 2 per day\n7A: Maths / T / 5\n").problem;
  assert.ok(feasibility(capped).some((i) => i.kind === "teacher" && i.have === 4));
  const noDoubles = parseSchool("periods: 2\nbreaks after: 1\n7A: Art / A / 2 / double\n").problem;
  assert.ok(feasibility(noDoubles).some((i) => i.kind === "grid"));
});

test("feasibility notes unavoidable same-day repeats as soft", () => {
  const { problem } = parseSchool(sample);
  const notes = feasibility(problem);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].soft, true);
  assert.match(notes[0].text, /7A English has 5 lessons but only 4 days/);
});

test("solves the sample school with no hard problems, and the validator agrees", () => {
  const { problem } = parseSchool(sample);
  const r = solve(problem, { seed: 1 });
  assert.equal(r.hard, 0);
  const v = validate(problem, r.units, r.placements);
  assert.deepEqual(v.problems, []);
  assert.equal(v.stats.classGaps, 0);
  assert.equal(v.stats.soft, r.soft, "solver's soft score equals the validator's recount");
  assert.equal(v.stats.teacherGaps, 0, "the marketing page's worked example says no teacher gaps");
  assert.equal(problem.teachers.length, 13);
  // the only repeat is the one feasibility proved unavoidable
  assert.equal(v.stats.repeats, 1);
});

test("doubles never cross a break or the end of the day; rooms match their type", () => {
  const { problem } = parseSchool(sample);
  const r = solve(problem, { seed: 3, iterations: 100000 });
  for (const pl of r.placements) {
    const U = r.units[pl.unit];
    const p = pl.start % problem.periods;
    if (U.len === 2) assert.ok(p !== 1 && p !== 3 && p !== 5, `double at period ${p + 1}`);
    if (U.roomType) assert.equal(problem.rooms[pl.room].type, U.roomType);
    if (!U.needsRoom) assert.equal(pl.room, -1);
  }
});

test("joint lessons put every class and the one teacher in the same slot", () => {
  const { problem } = parseSchool(sample);
  const r = solve(problem, { seed: 2, iterations: 100000 });
  const a = grid(problem, r.units, r.placements, "class", 0);
  const b = grid(problem, r.units, r.placements, "class", 1);
  let shared = 0;
  for (let p = 0; p < problem.periods; p++) for (let d = 0; d < 5; d++) {
    const pa = a[p][d].find((x) => x.subject === "PE");
    if (pa) {
      shared++;
      assert.ok(b[p][d].some((x) => x.unit === pa.unit));
    }
  }
  assert.equal(shared, 2);
});

test("teacher periods off are respected", () => {
  const { problem } = parseSchool(sample);
  const r = solve(problem, { seed: 4, iterations: 100000 });
  const lind = problem.teachers.findIndex((t) => t.name === "Lindqvist");
  const g = grid(problem, r.units, r.placements, "teacher", lind);
  for (let p = 0; p < 6; p++) assert.equal(g[p][4].length, 0, "Lindqvist is off Friday");
});

test("the validator catches clashes, off periods, wrong rooms, broken doubles and unplaced units", () => {
  const { problem } = parseSchool("days: Mon\nperiods: 3\nbreaks after: 1\nrooms: Lab (lab), Hall\nteacher T: off Mon 3\n7A: Sci / T / 2 / double / lab\n7B: Maths / T / 1\n7B: Art / A / 1\n7B: Drama / D / 1\n");
  const { units } = expandUnits(problem);
  const placements = [
    { unit: 0, start: 0, room: 1 }, // double spans the break, wrong room
    { unit: 1, start: 0, room: -1 }, // T teaches two classes at once
    { unit: 2, start: 2, room: -1 },
    { unit: 3, start: -1, room: -1 },
  ];
  const kinds = validate(problem, units, placements).problems.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["break", "room", "teacher", "unplaced"]);
  const off = validate(problem, units, [{ unit: 0, start: 1, room: 0 }, { unit: 1, start: 0, room: -1 }, { unit: 2, start: 0, room: -1 }, { unit: 3, start: 1, room: -1 }]);
  assert.ok(off.problems.some((p) => p.kind === "off"), JSON.stringify(off.problems));
  assert.ok(off.problems.some((p) => p.kind === "class"));
});

test("same seed gives the same timetable", () => {
  const { problem } = parseSchool(sample);
  const a = solve(problem, { seed: 9, iterations: 30000 });
  const b = solve(problem, { seed: 9, iterations: 30000 });
  assert.deepEqual(a.placements, b.placements);
});

test("continuing from a previous result never makes it worse", () => {
  const { problem } = parseSchool(syntheticSchool({ classes: 8, seed: 5 }));
  const a = solve(problem, { seed: 1, iterations: 20000 });
  const b = solve(problem, { seed: 2, iterations: 20000, initial: a.placements, temperature: 2 });
  assert.ok(b.cost <= a.cost, `${b.cost} <= ${a.cost}`);
});

test("fully booked synthetic schools of 8 and 16 classes solve with no hard problems", () => {
  for (const classes of [8, 16]) {
    const { problem, errors } = parseSchool(syntheticSchool({ classes, seed: classes }));
    assert.deepEqual(errors, []);
    assert.deepEqual(feasibility(problem).filter((i) => !i.soft), []);
    const r = solve(problem, { seed: 1 });
    const v = validate(problem, r.units, r.placements);
    assert.deepEqual(v.problems, [], `${classes} classes`);
    assert.equal(v.stats.classGaps, 0);
  }
});

test("an overloaded teacher leaves clashes the validator reports, never a silent pass", () => {
  const { problem } = parseSchool("days: Mon\nperiods: 2\n7A: Maths / T / 2\n7B: Maths / T / 1\n");
  const r = solve(problem, { seed: 1, iterations: 5000 });
  assert.ok(r.hard > 0);
  assert.equal(validate(problem, r.units, r.placements).ok, false);
});

test("CSV export: one row per class-period, quoted when needed", () => {
  const { problem } = parseSchool('7A+7B: PE, outdoor / "Coach" Lee / 1\n');
  const r = solve(problem, { seed: 1, iterations: 1000 });
  const csv = toCsv(problem, r.units, r.placements).trim().split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[1], /^7A,Mon,1,"PE, outdoor","""Coach"" Lee",$/);
  const evil = parseSchool("7A: =HYPERLINK(1) / @T / 1\n").problem;
  const e = solve(evil, { seed: 1, iterations: 100 });
  assert.match(toCsv(evil, e.units, e.placements), /^7A,Mon,1,'=HYPERLINK\(1\),'@T,$/m);
});

test("softBreakdown counts gaps and late starts", () => {
  const { problem } = parseSchool("days: Mon\nperiods: 4\n7A: Maths / T / 1\n7A: Art / A / 1\n");
  const { units } = expandUnits(problem);
  const s = softBreakdown(problem, units, [{ unit: 0, start: 1, room: -1 }, { unit: 1, start: 3, room: -1 }]);
  assert.equal(s.classGaps, 1);
  assert.equal(s.lateStarts, 1);
});
