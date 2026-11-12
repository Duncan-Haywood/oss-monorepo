// planWeeks reuses an earlier week's roster when a week's parsed staff are the same (README "The planner stops rebuilding
// the same week"). These check the reused plan is the plan a rebuild of every week gives, and that anything which changes
// the week (a dated day off, the tough-shift tally when the spread setting is on) still gets a rebuild.
import test from "node:test";
import assert from "node:assert/strict";
import { planWeeks, TEMPLATES, sampleStaff, sampleShifts } from "./calc.mjs";

const same = (a, b) => {
  assert.equal(a.weeks.length, b.weeks.length);
  a.weeks.forEach((w, i) => {
    assert.equal(w.csv, b.weeks[i].csv, `week ${i + 1} CSV`);
    assert.equal(w.roster.cost, b.weeks[i].roster.cost);
    assert.equal(w.roster.unfilledHours, b.weeks[i].roster.unfilledHours);
    assert.equal(w.roster.score, b.weeks[i].roster.score);
  });
  assert.equal(a.totalCost, b.totalCost);
  assert.equal(a.totalOpenHours, b.totalOpenHours);
};

for (const [name, t] of Object.entries(TEMPLATES)) {
  test(`${name}: a reused 6-week plan equals rebuilding every week`, () => {
    const o = { weeks: 6, weekStart: "2026-11-16", exact: false };
    const fast = planWeeks(t.staff(), t.shifts(), o);
    const slow = planWeeks(t.staff(), t.shifts(), { ...o, reuse: false });
    same(fast, slow);
    assert.ok(slow.weeks.every((w) => w.sameAs === undefined));
    // Week 1 has no carried-over rest gaps and week 2 does; from week 3 the carried-over cells settle.
    assert.deepEqual(fast.weeks.map((w) => w.sameAs ?? null), [null, null, 2, 2, 2, 2]);
  });
}

test("the default exact check: the sample's reused 4-week plan matches a rebuild and is proven", () => {
  const o = { weeks: 4, weekStart: "2026-11-16" };
  const fast = planWeeks(sampleStaff(), sampleShifts(), o);
  const slow = planWeeks(sampleStaff(), sampleShifts(), { ...o, reuse: false });
  same(fast, slow);
  assert.deepEqual(fast.weeks.map((w) => w.sameAs ?? null), [null, null, 2, 2]);
  for (const w of fast.weeks) assert.ok(["optimal", "improved"].includes(w.roster.optimality?.status));
});

test("a dated day off in week 3 makes week 3 a rebuild", () => {
  const staff = sampleStaff().replace(/^(Ana[^\n]*)$/m, "$1, off: 2026-12-01");
  assert.notEqual(staff, sampleStaff());
  const o = { weeks: 4, weekStart: "2026-11-16", exact: false };
  const fast = planWeeks(staff, sampleShifts(), o);
  same(fast, planWeeks(staff, sampleShifts(), { ...o, reuse: false }));
  assert.equal(fast.weeks[2].sameAs, undefined);
  assert.notEqual(fast.weeks[2].csv, fast.weeks[1].csv, "Ana's day off changes week 3");
});

test("with the spread setting on, the changing tough-shift tally is part of the week, so those weeks are rebuilt", () => {
  const o = { weeks: 4, weekStart: "2026-11-16", exact: false, toughBalance: 60 };
  const fast = planWeeks(sampleStaff(), sampleShifts(), o);
  same(fast, planWeeks(sampleStaff(), sampleShifts(), { ...o, reuse: false }));
  assert.ok(fast.weeks.every((w) => w.sameAs === undefined));
});
