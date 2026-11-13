// Call-out exposure and the steady pick among tied rosters (2026-11-13, eval/steady-for-callouts.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, calloutExposure, steadyRoster, rosterCsv, sampleStaff, sampleShifts } from "./calc.mjs";
import { run } from "./cli.mjs";

const O = { minRestHours: 10 };

test("one person, one shift a day: every call-out from Tuesday on leaves that shift open", () => {
  const staff = parseStaff("name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any").staff;
  const slots = parseShifts("Mon-Sat, 9:00, 13:00, 1").slots;
  const r = buildRoster(staff, slots, O);
  const x = calloutExposure(staff, slots, r, O);
  assert.equal(x.personDays, 5);
  assert.equal(x.exposure, 20);
  assert.ok(x.cases.every((c) => c.person === "Ana" && c.added === 4));
});

test("a free second person covers every call-out: exposure 0", () => {
  const staff = parseStaff("name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 60, 0, any").staff;
  const slots = parseShifts("Mon-Sun, 9:00, 13:00, 1").slots;
  const r = buildRoster(staff, slots, O);
  assert.equal(calloutExposure(staff, slots, r, O).exposure, 0);
});

test("steadyRoster keeps the best score and payroll and picks the least-exposed tie (sample cafe, seeds 3 and 1)", () => {
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const r3 = buildRoster(staff, slots, { ...O, seed: 3 });
  const s = steadyRoster(staff, slots, { ...O, seed: 3 }, { seeds: [1] });
  assert.ok(Math.abs(s.score - r3.score) < 1e-6);
  assert.equal(s.cost, r3.cost);
  assert.equal(s.unfilledHours, r3.unfilledHours);
  assert.equal(s.steady.tied.length, 2);
  assert.equal(s.steady.chosenSeed, 1);
  assert.ok(s.steady.exposure < s.steady.firstSeedExposure, `${s.steady.exposure} < ${s.steady.firstSeedExposure}`);
  assert.equal(rosterCsv(s), rosterCsv(buildRoster(staff, slots, { ...O, seed: 1 })));
});

test("one best roster: steadyRoster hands back the first seed's roster", () => {
  const staff = parseStaff("name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any").staff;
  const slots = parseShifts("Mon-Sun, 9:00, 13:00, 1").slots;
  const s = steadyRoster(staff, slots, O, { seeds: [2, 3] });
  assert.equal(s.steady.tied.length, 1);
  assert.equal(s.steady.chosenSeed, 1);
  assert.equal(rosterCsv(s), rosterCsv(buildRoster(staff, slots, O)));
});

test("cli --steady prints the call-out check and --json carries it", () => {
  const staff = "name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 60, 0, any";
  const shifts = "Mon-Sun, 9:00, 13:00, 1";
  const t = run(staff, shifts, { steady: true, options: O });
  assert.match(t.out, /Call-out check: /);
  assert.match(t.out, /No single call-out Tue-Sun leaves an hour open/);
  const j = JSON.parse(run(staff, shifts, { steady: true, options: O, mode: "json" }).out);
  assert.equal(j.steady.exposure, 0);
});
