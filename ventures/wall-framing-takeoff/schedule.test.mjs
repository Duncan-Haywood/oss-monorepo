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

test("rate-driven durations: days = ceil(quantity / typed rate), hand-checked", async () => {
  const { resolveRates, quantities } = await import("./schedule.mjs");
  const r = { summary: { wallFeet: 211.5, pieces: 345 }, sheathing: { summary: { sheets: 38 } }, drywall: { sheets: { count: 61 } } };
  assert.equal(quantities(r).wallSheathingSheets, 38);
  const s = schedule(resolveRates({ activities: [
    { id: "frame", per: "wallFeet", rate: 40 },                      // 211.5/40 = 5.29 -> 6
    { id: "sheath", per: "wallSheathingSheets", rate: 19, after: ["frame"] }, // exactly 2
    { id: "board", per: "drywallSheets", rate: 30, minDays: 4, after: ["sheath"] }, // 3 -> floor 4
    { id: "fixed", days: 2, after: ["board"] },
  ] }, r));
  assert.ok(s.ok);
  assert.deepEqual(s.rows.map((x) => x.days), [6, 2, 4, 2]);
  assert.equal(s.workingDays, 14);
  assert.match(scheduleText(s).join("\n"), /211\.5 wallFeet \/ 40 per crew-day/);
});

test("rate-driven durations refuse a missing quantity or rate instead of guessing", async () => {
  const { resolveRates } = await import("./schedule.mjs");
  const s = schedule(resolveRates({ activities: [{ id: "a", per: "roofSheets", rate: 10 }, { id: "b", per: "wallFeet" }] }, { summary: { wallFeet: 100 } }));
  assert.equal(s.ok, false);
  assert.ok(s.errors.some((e) => e.includes('no quantity "roofSheets"')));
  assert.ok(s.errors.some((e) => e.includes("positive")));
});

test("CLI --schedule resolves rates from the plan's own takeoff", () => {
  const plan = { ...samplePlan(), schedule: { start: "2026-03-02", activities: [{ id: "frame", name: "Wall framing", per: "wallFeet", rate: 50 }] } };
  const fs = require_fs();
  const f = `${process.env.TMPDIR || "/tmp"}/sched-rate-${process.pid}.json`;
  fs.writeFileSync(f, JSON.stringify(plan));
  const out = main([f, "--schedule"]);
  fs.unlinkSync(f);
  assert.equal(out.code, 0);
  assert.match(out.out, /5d .*211\.5 wallFeet \/ 50/);
});
import { createRequire } from "node:module";
function require_fs() { return createRequire(import.meta.url)("node:fs"); }

test("crewOff pauses one crew's work on its days off and leaves other crews alone", () => {
  // Mon Mar 2 start. Framing is away Wed Mar 4: a 3-day job runs Mon, Tue, Thu.
  const s = schedule({ start: "2026-03-02", crews: { framing: 1, roof: 1 }, crewOff: { framing: ["2026-03-04"] },
    activities: [{ id: "f", days: 3, crew: "framing" }, { id: "r", days: 3, crew: "roof" }] });
  assert.equal(s.rows.find((r) => r.id === "f").finishDate, "2026-03-05");
  assert.equal(s.rows.find((r) => r.id === "r").finishDate, "2026-03-04");
  assert.equal(s.leveledDays, 4);
});

test("crewOff on the first day delays the start; bad dates are refused", () => {
  const s = schedule({ start: "2026-03-02", crews: { c: 1 }, crewOff: { c: ["2026-03-02", "2026-03-03"] }, activities: [{ id: "a", days: 1, crew: "c" }] });
  assert.equal(s.rows[0].startDate, "2026-03-04");
  assert.equal(schedule({ crews: { c: 1 }, crewOff: { c: ["nope"] }, activities: [{ id: "a", days: 1, crew: "c" }] }).ok, false);
});

test("weatherLoss pads only exposed activities by ceil(days * loss) and rejects bad values", () => {
  const s = schedule({ start: "2026-03-02", weatherLoss: 0.2, activities: [{ id: "roof", days: 6, exposed: true }, { id: "in", days: 5, after: ["roof"] }] });
  const roof = s.rows.find((r) => r.id === "roof");
  assert.equal(roof.days, 8); // 6 + ceil(1.2)
  assert.match(roof.derived, /\+2d weather allowance/);
  assert.equal(s.rows.find((r) => r.id === "in").days, 5);
  assert.equal(s.workingDays, 13);
  assert.equal(schedule({ weatherLoss: 1.5, activities: [{ id: "a", days: 1 }] }).ok, false);
});

test("weatherRate stretches exposed activities by the start month's loss rate", () => {
  // Hand: 10d exposed at 20% lost -> ceil(10/0.8)=13, starting in March.
  const s = schedule({ start: "2026-03-02", weatherRate: { "2026-03": 0.2 }, activities: [{ id: "a", days: 10, exposed: true }, { id: "b", days: 2, after: ["a"] }] });
  assert.equal(s.rows.find((r) => r.id === "a").days, 13);
  assert.equal(s.workingDays, 15);
});

test("weatherRate uses the start month; unlisted months fall back to weatherLoss; bad rates are refused", () => {
  // a (unexposed) 25d from Mon 2026-03-02 ends in April, so b starts in April (rate 0.5 -> 4d).
  const s = schedule({ start: "2026-03-02", weatherRate: { "2026-03": 0.5, "2026-04": 0.5 }, activities: [{ id: "a", days: 25 }, { id: "b", days: 2, after: ["a"], exposed: true }] });
  assert.equal(s.rows.find((r) => r.id === "a").days, 25);
  assert.equal(s.rows.find((r) => r.id === "b").days, 4);
  const f = schedule({ start: "2026-03-02", weatherLoss: 0.5, weatherRate: { "2026-09": 0.1 }, activities: [{ id: "a", days: 2, exposed: true }] });
  assert.equal(f.rows[0].days, 4); // March unlisted: flat 50% -> ceil(2/0.5)
  assert.equal(schedule({ weatherRate: { "2026-03": 1 }, activities: [{ id: "a", days: 1, exposed: true }] }).ok, false);
});

test("notBefore holds an activity to a delivery date (hand-checked)", () => {
  // Mon 2026-03-02 start. a: 2d (Mar 2-3). b after a, 1d, windows arrive Mon Mar 9 => b on Mar 9, finish Mar 9.
  const s = schedule({ start: "2026-03-02", activities: [{ id: "a", days: 2 }, { id: "b", days: 1, after: ["a"], notBefore: "2026-03-09" }] });
  assert.equal(s.rows.find((r) => r.id === "b").startDate, "2026-03-09");
  assert.equal(s.workingDays, 6); // Mar 2,3 then idle 4,5,6, then Mar 9 = index 5, ends at 6
  assert.equal(s.finishDate, "2026-03-09");
});

test("notBefore on a weekend rolls to Monday; an earlier date changes nothing; a bad date is refused", () => {
  const mk = (nb) => schedule({ start: "2026-03-02", activities: [{ id: "a", days: 1, notBefore: nb }] });
  assert.equal(mk("2026-03-07").rows[0].startDate, "2026-03-09");
  assert.equal(mk("2026-02-01").rows[0].startDate, "2026-03-02");
  assert.equal(mk("nope").ok, false);
});

test("notBefore also holds under crew levelling", () => {
  const s = schedule({ start: "2026-03-02", crews: { x: 1 }, activities: [{ id: "a", days: 1, crew: "x", notBefore: "2026-03-05" }, { id: "b", days: 1, crew: "x" }] });
  assert.equal(s.rows.find((r) => r.id === "a").startDate, "2026-03-05");
  assert.equal(s.rows.find((r) => r.id === "b").startDate, "2026-03-02");
});
