import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activationCohort, activationCohorts } from "./index.ts";

const STEPS = [
  { key: "a", label: "A", optional: false },
  { key: "b", label: "B", optional: false },
  { key: "t", label: "Team", optional: true },
  { key: "c", label: "C", optional: false },
];
const at = (d: string) => new Date(`${d}T00:00:00Z`);

describe("activation funnel", () => {
  it("counts reached per step and the first undone required step as the stall", () => {
    const c = activationCohort("all", "All", STEPS, [
      { createdAt: at("2026-11-01"), done: {} },
      { createdAt: at("2026-11-01"), done: { a: true } },
      { createdAt: at("2026-11-01"), done: { a: true, b: true, t: true, c: true } },
      // Out of order: C done without B still stalls on B.
      { createdAt: at("2026-11-01"), done: { a: true, c: true, t: true } },
    ]);
    assert.equal(c.orgs, 4);
    assert.equal(c.complete, 1);
    assert.deepEqual(
      c.steps.map((s) => [s.key, s.reached, s.stalledHere]),
      [
        ["a", 3, 1],
        ["b", 1, 2],
        ["t", 2, null],
        ["c", 2, 0],
      ],
    );
    // Every company is complete or stalled on exactly one required step.
    const stalled = c.steps.reduce((n, s) => n + (s.stalledHere ?? 0), 0);
    assert.equal(stalled + c.complete, c.orgs);
  });

  it("an optional step never holds a company back", () => {
    const c = activationCohort("all", "All", STEPS, [
      { createdAt: at("2026-11-01"), done: { a: true, b: true, c: true } },
    ]);
    assert.equal(c.complete, 1);
    assert.equal(c.steps[2]?.reached, 0);
  });

  it("the window cohort keeps companies created at or after the start", () => {
    const [all, win] = activationCohorts(
      STEPS,
      [
        { createdAt: at("2026-10-01"), done: { a: true } },
        { createdAt: at("2026-11-20"), done: {} },
      ],
      at("2026-11-20"),
      7,
    );
    assert.equal(all?.orgs, 2);
    assert.equal(win?.key, "window");
    assert.equal(win?.label, "Signed up in the last 7 days");
    assert.equal(win?.orgs, 1);
    assert.equal(win?.steps[0]?.stalledHere, 1);
  });

  it("no companies: zero counts, not missing steps", () => {
    const c = activationCohort("window", "W", STEPS, []);
    assert.equal(c.orgs, 0);
    assert.equal(c.steps.length, 4);
    assert.ok(c.steps.every((s) => s.reached === 0));
  });
});
