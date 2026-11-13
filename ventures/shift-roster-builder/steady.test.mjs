// Call-out exposure and the steady pick among tied rosters (2026-11-13, eval/steady-for-callouts.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildRoster, calloutExposure, steadyRoster, rosterCsv, sampleStaff, sampleShifts, TEMPLATES } from "./calc.mjs";
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

test("the outright and hand-over-chain short cuts give the same exposure case by case as rebuilding every case (retail template, seed 1)", () => {
  const t = TEMPLATES.retail;
  const staff = parseStaff(t.staff()).staff, slots = parseShifts(t.shifts()).slots;
  const r = buildRoster(staff, slots, O);
  const full = calloutExposure(staff, slots, r, O, { outright: false });
  const fast = calloutExposure(staff, slots, r, O);
  assert.equal(fast.exposure, full.exposure);
  assert.deepEqual(fast.cases.map((c) => c.added), full.cases.map((c) => c.added));
  assert.ok(fast.rebuilt < full.rebuilt, `${fast.rebuilt} rebuilds < ${full.rebuilt}`);
  assert.ok(fast.cases.some((c) => c.moves === 1) && fast.cases.some((c) => c.moves > 1), "both short cuts fire");
  assert.ok(fast.cases.filter((c) => c.outright).every((c) => c.added === 0));
});

test("stopAt stops at a lower bound, and the pruned steady pick matches the full one (sample café, seeds 1-3)", () => {
  const staff = parseStaff(sampleStaff()).staff, slots = parseShifts(sampleShifts()).slots;
  const r = buildRoster(staff, slots, { ...O, seed: 3 });
  const stop = calloutExposure(staff, slots, r, O, { stopAt: 1 });
  assert.equal(stop.stopped, true);
  assert.ok(stop.exposure >= 1 && stop.cases.length < stop.personDays);
  const a = steadyRoster(staff, slots, O, { seeds: [1, 2, 3] });
  const b = steadyRoster(staff, slots, O, { seeds: [1, 2, 3], prune: false, outright: false });
  assert.equal(a.steady.chosenSeed, b.steady.chosenSeed);
  assert.equal(a.steady.exposure, b.steady.exposure);
  assert.equal(rosterCsv(a), rosterCsv(b));
  assert.ok(a.steady.rebuilt < b.steady.rebuilt, `${a.steady.rebuilt} < ${b.steady.rebuilt}`);
  for (const t of a.steady.tied) {
    const u = b.steady.tied.find((x) => x.seed === t.seed);
    if (t.atLeast) assert.ok(t.exposure <= u.exposure && t.exposure >= a.steady.exposure); else assert.equal(t.exposure, u.exposure);
  }
});

test("the worker runs the call-out check when options.steady is set, posting progress, and the page offers it", async () => {
  const { handle } = await import("./roster-worker.mjs");
  const { readFileSync } = await import("node:fs");
  const staff = parseStaff("name, wage, max hours, min hours, availability\nAna, 20, 60, 0, any\nBo, 20, 60, 0, any").staff;
  const slots = parseShifts("Mon-Sun, 9:00, 13:00, 1").slots;
  const seen = [];
  const out = handle({ id: 4, staff, slots, options: { ...O, steady: true } }, (m) => seen.push(m));
  assert.equal(out.roster.steady.exposure, 0);
  assert.ok(seen.length && seen.every((m) => m.id === 4 && m.progress && m.progress.stage));
  assert.equal(handle({ id: 5, staff, slots, options: O }).roster.steady, undefined);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="steady"/);
  assert.match(html, /steadyText\(r\.steady\)/);
  assert.match(html, /!postedCsv \? \{ steady: true \}/);
});
