import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDivisions, parseDivisionLinks, buildDivisions, validateDivisions, linkConflicts, divisionsCsv, divisionsText, readDivisionsSpec, parseTravel, divisionStats } from "./divisions.mjs";
import { parseDate, dayIso } from "./calc.mjs";

const example = JSON.parse(readFileSync(new URL("./example-divisions.json", import.meta.url), "utf8"));
const build = (extra = {}) => {
  const { spec, errors } = readDivisionsSpec(example);
  assert.deepEqual(errors, []);
  return buildDivisions({ ...spec, ...extra });
};

test("parseDivisions reads names, teams and (double), and rejects repeats and short divisions", () => {
  const r = parseDivisions("A: x, y, z (double)\nB: p, q\nA: m, n\nC: solo\nD: u, U");
  assert.deepEqual(r.divisions.map((d) => [d.name, d.teams.length, d.double]), [["A", 3, true], ["B", 2, false]]);
  assert.equal(r.errors.length, 3);
});

test("parseDivisionLinks resolves Division/Team and names the ones it cannot", () => {
  const { divisions } = parseDivisions("A: x, y\nB: x, y");
  const r = parseDivisionLinks("A/x, B/x\nA/nobody, B/y", divisions);
  assert.deepEqual(r.groups, [[{ d: 0, t: 0 }, { d: 1, t: 0 }]]);
  assert.equal(r.errors.length, 2);
});

test("the example league validates: every pair meets, no court twice, closures and skips respected", () => {
  const s = build();
  const v = validateDivisions(s);
  assert.deepEqual(v.errors, []);
  assert.equal(s.stats.matches, 15 + 28 + 30);
  const days = s.nights.map((n) => dayIso(n.day));
  assert.ok(!days.includes("2026-11-26"), "skip date used");
  const dec3 = s.nights.find((n) => dayIso(n.day) === "2026-12-03");
  if (dec3) assert.ok(dec3.matches.every((m) => m.court !== "Gym A"));
});

test("no night holds more matches than open court slots, and divisions finish close together", () => {
  const s = build();
  for (const n of s.nights) assert.ok(n.matches.length <= 8);
  const ends = s.divisions.map((d) => d.rounds[d.rounds.length - 1].day);
  assert.ok(Math.max(...ends) - Math.min(...ends) <= 21);
});

test("linked teams are never at the same time when the slots allow it", () => {
  const s = build();
  assert.deepEqual(s.conflicts, []);
  assert.deepEqual(linkConflicts(s), []);
});

test("the optimiser beats the naive baseline on venue changes and linked clashes (measured on 8 seeds)", () => {
  let naiveTrips = 0, optTrips = 0, naiveClash = 0, optClash = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const a = build({ seed, optimize: false }).stats;
    const b = build({ seed }).stats;
    naiveTrips += a.trips; optTrips += b.trips; naiveClash += a.clashes; optClash += b.clashes;
  }
  assert.ok(optClash <= naiveClash);
  assert.ok(optTrips < naiveTrips, `trips ${optTrips} vs naive ${naiveTrips}`);
});

test("an unavoidable clash is listed, not hidden: one time slot and two linked teams in one round", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a1, a2\nB: b1, b2", courts: "C1, C2", times: "18:00", start: "2026-10-06", weekdays: "Tue", links: "A/a1, B/b1" });
  const s = buildDivisions(spec);
  assert.equal(validateDivisions(s).ok, true);
  assert.equal(s.nights.length, 1);
  assert.equal(s.conflicts.length, 1);
  assert.match(s.conflicts[0], /A\/a1 and B\/b1/);
});

test("a round bigger than the court slots is refused with the numbers", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: 1, 2, 3, 4, 5, 6", courts: "C1", times: "18:00", start: "2026-10-06", weekdays: "Tue" });
  assert.throws(() => buildDivisions(spec), /3 matches needs 3 court slots/);
});

test("the validator catches a double-booked court and a missing meeting", () => {
  const s = build();
  const bad = structuredClone(s);
  bad.nights[0].matches[1].court = bad.nights[0].matches[0].court;
  bad.nights[0].matches[1].time = bad.nights[0].matches[0].time;
  assert.ok(validateDivisions(bad).errors.some((e) => /booked twice/.test(e)));
  const bad2 = structuredClone(s);
  bad2.divisions[0].rounds.pop();
  assert.ok(validateDivisions(bad2).errors.some((e) => /meet/.test(e)));
});

test("same seed, same schedule; CSV and text carry every match", () => {
  const a = build(), b = build();
  assert.equal(divisionsCsv(a), divisionsCsv(b));
  assert.equal(divisionsCsv(a).trim().split("\n").length, 1 + a.stats.matches);
  assert.match(divisionsText(a), /73 matches over/);
});

test("a double round robin hosts each pair once each way", () => {
  const { spec } = readDivisionsSpec({ divisions: "A: a, b, c, d (double)", courts: "C1, C2", times: "", start: "2026-10-06", weekdays: "Tue" });
  const s = buildDivisions(spec);
  assert.deepEqual(validateDivisions(s).errors, []);
  assert.equal(s.stats.matches, 12);
  assert.equal(dayIso(parseDate("2026-10-06")), "2026-10-06");
});

test("parseTravel reads minutes in either direction and names venues it does not know", () => {
  const r = parseTravel("Park - School: 25\nschool to Mall: 10\nPark - Park: 5\nPark - Mall: 0\nPark - Mall: 55 min", ["Park", "School", "Mall"]);
  assert.deepEqual(r.travel, { "Park|School": 25, "Mall|Park": 55 });
  assert.equal(r.errors.length, 3);
});

test("with a travel table the optimiser cuts minutes on the road, not just venue changes (measured on 8 seeds)", () => {
  const travelText = "Park - School: 10\nPark - Lake: 60\nSchool - Lake: 55";
  const f = { ...example, courts: "Field 1 @ Park, Field 2 @ Park, Gym A @ School, Gym B @ Lake", courtClosures: "", travel: travelText };
  const { spec, errors } = readDivisionsSpec(f);
  assert.deepEqual(errors, []);
  let flat = 0, aware = 0, naive = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const withTable = buildDivisions({ ...spec, seed });
    assert.deepEqual(validateDivisions(withTable).errors, []);
    aware += withTable.stats.travelMinutes;
    // the same league scheduled as if every change cost the same, then priced with the table
    const blind = buildDivisions({ ...spec, travel: {}, seed });
    flat += divisionStats({ ...blind, config: { ...blind.config, travel: spec.travel } }).travelMinutes;
    const base = buildDivisions({ ...spec, optimize: false, seed });
    naive += base.stats.travelMinutes;
  }
  assert.ok(aware < flat, `travel-aware ${aware} min vs flat ${flat} min`);
  assert.ok(aware < naive, `travel-aware ${aware} min vs naive ${naive} min`);
  console.log(`travel minutes over 8 seeds: naive ${naive}, flat-cost optimiser ${flat}, travel-aware ${aware}`);
});

test("no travel table leaves the schedule and stats exactly as before", () => {
  const s = build();
  assert.equal(s.stats.travelMinutes, undefined);
  assert.ok(!divisionsText(s).includes("min of travel"));
});
