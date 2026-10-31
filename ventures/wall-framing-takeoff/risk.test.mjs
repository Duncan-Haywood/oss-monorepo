import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleRisk, triangular, riskText } from "./risk.mjs";

const chain = (extra = {}) => ({ start: "2026-03-02", activities: [
  { id: "a", days: 10, min: 8, max: 20 }, { id: "b", days: 5, after: ["a"] }, { id: "c", days: 3, after: ["b"], min: 3, max: 6 }], ...extra });

test("triangular hand values: endpoints, mode and the median of (0,1,2) is 1", () => {
  assert.equal(triangular(0, 1, 2, 0), 0);
  assert.equal(triangular(0, 1, 2, 0.5), 1);
  assert.ok(Math.abs(triangular(0, 0, 4, 0.75) - 2) < 1e-9); // mode at lo: x = 4 - sqrt(0.25*16) = 2
});

test("same seed reproduces; a serial chain's finish never beats min or exceeds max sums", () => {
  const r1 = scheduleRisk(chain(), { runs: 300, seed: 7 }), r2 = scheduleRisk(chain(), { runs: 300, seed: 7 });
  assert.deepEqual(r1, r2);
  assert.ok(r1.min >= 8 + 5 + 3 && r1.max <= 20 + 5 + 6);
  assert.ok(r1.p50.workingDays <= r1.p80.workingDays && r1.p80.workingDays <= r1.p90.workingDays);
  // the right-skewed triangle puts the mean above the planned 18 days
  assert.ok(r1.mean > r1.plannedDays);
  assert.ok(r1.chanceWithinPlan < 0.6);
});

test("every activity on a serial chain is critical in every run; an unranged side path is not", () => {
  const r = scheduleRisk({ activities: [{ id: "a", days: 4, min: 3, max: 5 }, { id: "b", days: 2, after: ["a"] }, { id: "side", days: 1, after: ["a"] }] }, { runs: 50 });
  const idx = Object.fromEntries(r.criticality.map((c) => [c.id, c.index]));
  assert.equal(idx.a, 1); assert.equal(idx.b, 1); assert.equal(idx.side, undefined);
});

test("deadline gives a chance of finishing on time; rejects bad ranges and missing ranges", () => {
  // planned finish 2026-03-24 (18 working days from Mar 2); deadline equal to it => chance equals chanceWithinPlan
  const r = scheduleRisk(chain({ deadline: "2026-03-25" }), { runs: 400, seed: 3 });
  assert.ok(r.deadline && r.chanceOnTime >= r.chanceWithinPlan);
  assert.equal(scheduleRisk({ activities: [{ id: "a", days: 4, min: 5, max: 6 }] }).ok, false);
  assert.equal(scheduleRisk({ activities: [{ id: "a", days: 4 }] }).ok, false);
  assert.equal(scheduleRisk(chain(), { runs: 3 }).ok, false);
  assert.ok(riskText(scheduleRisk(chain(), { runs: 50 })).join("\n").includes("P80"));
});
