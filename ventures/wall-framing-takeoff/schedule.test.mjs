import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, sampleSchedule, scheduleText } from "./schedule.mjs";
import { main } from "./cli.mjs";
import { samplePlan } from "./engine.mjs";

test("hand-checked critical path and finish", () => {
  const s = schedule({ start: "2026-03-02", activities: [
    { id: "a", days: 3 }, { id: "b", days: 4, after: ["a"] }, { id: "c", days: 2, after: ["a"] }, { id: "d", days: 1, after: ["b", "c"] } ] });
  assert.equal(s.workingDays, 8);
  assert.deepEqual(s.criticalPath, ["a", "b", "d"]);
  assert.equal(s.rows.find((r) => r.id === "c").slack, 2);
  assert.equal(s.finishDate, "2026-03-11"); // Mon Mar 2 + 8 working days, last day Wed Mar 11
});

test("weekends are skipped", () => {
  const s = schedule({ start: "2026-03-06", activities: [{ id: "a", days: 3 }] }); // Friday
  assert.equal(s.rows[0].finishDate, "2026-03-10");
});

test("lag adds waiting without work", () => {
  const s = schedule({ activities: [{ id: "a", days: 2 }, { id: "b", days: 1, after: ["a"], lag: 5 }] });
  assert.equal(s.workingDays, 8);
});

test("a slip on a critical activity moves the finish by its days; off the path it is absorbed by slack", () => {
  const acts = [{ id: "a", days: 3 }, { id: "b", days: 4, after: ["a"] }, { id: "c", days: 2, after: ["a"] }, { id: "d", days: 1, after: ["b", "c"] }];
  const s = schedule({ activities: acts, slips: [{ id: "b", days: 3 }, { id: "c", days: 2 }, { id: "c", days: 3 }] });
  assert.deepEqual(s.slips.map((x) => x.finishShift), [3, 0, 1]);
});

test("one crew serialises parallel work; two do not", () => {
  const acts = [{ id: "a", days: 2, crew: "x" }, { id: "b", days: 3, crew: "x" }];
  assert.equal(schedule({ crews: { x: 1 }, activities: acts }).leveledDays, 5);
  assert.equal(schedule({ crews: { x: 2 }, activities: acts }).leveledDays, 3);
  assert.equal(schedule({ crews: { x: 1 }, activities: acts }).workingDays, 3);
});

test("cycles, unknown predecessors and duplicates are refused", () => {
  assert.match(schedule({ activities: [{ id: "a", days: 1, after: ["b"] }, { id: "b", days: 1, after: ["a"] }] }).errors[0], /Circular/);
  assert.match(schedule({ activities: [{ id: "a", days: 1, after: ["z"] }] }).errors[0], /not an activity/);
  assert.match(schedule({ activities: [{ id: "a", days: 1 }, { id: "a", days: 1 }] }).errors[0], /Duplicate/);
  assert.equal(schedule({}).ok, false);
});

test("sample schedule and CLI", () => {
  const s = schedule(sampleSchedule());
  assert.ok(s.ok && s.criticalPath.includes("slab") && s.slips[0].finishShift === 3);
  assert.ok(scheduleText(s).length > 10);
  const out = main(["p.json", "--schedule"], () => JSON.stringify({ ...samplePlan(), schedule: sampleSchedule() }));
  assert.equal(out.code, 0);
  assert.match(out.out, /SCHEDULE[\s\S]*Critical path/);
});

test("holidays and weather days you list are skipped, and a holiday start rolls forward", () => {
  const acts = [{ id: "a", days: 3 }];
  // Mon Mar 2 + 3 days = Mar 2, 3, 4 normally; a Tue holiday pushes the last day to Thu Mar 5.
  assert.equal(schedule({ start: "2026-03-02", activities: acts }).rows[0].finishDate, "2026-03-04");
  assert.equal(schedule({ start: "2026-03-02", holidays: ["2026-03-03"], activities: acts }).rows[0].finishDate, "2026-03-05");
  assert.equal(schedule({ start: "2026-03-02", weatherDays: ["2026-03-03", "2026-03-04"], activities: acts }).rows[0].finishDate, "2026-03-06");
  assert.equal(schedule({ start: "2026-03-02", holidays: ["2026-03-02"], activities: acts }).rows[0].startDate, "2026-03-03");
  assert.equal(schedule({ start: "2026-03-02", holidays: ["2026-03-07"], activities: acts }).rows[0].finishDate, "2026-03-04"); // a weekend holiday changes nothing
  assert.equal(schedule({ holidays: ["xmas"], activities: acts }).ok, false);
});
