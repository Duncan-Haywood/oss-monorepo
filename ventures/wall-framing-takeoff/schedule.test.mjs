import { writeFileSync, unlinkSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, sampleSchedule, scheduleText, templateSchedule, scheduleCsv } from "./schedule.mjs";
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

test("starter template is a valid acyclic list with no shipped durations", () => {
  const t = templateSchedule();
  assert.ok(t.activities.every((a) => a.days === 0));
  const s = schedule({ ...t, start: "2026-03-02" });
  assert.ok(s.ok, JSON.stringify(s.errors));
  const out = main(["--schedule-template"]);
  assert.equal(out.code, 0);
  assert.equal(JSON.parse(out.out).activities.length, t.activities.length);
  const typed = schedule({ ...t, start: "2026-03-02", activities: t.activities.map((a) => ({ ...a, days: 2 })) });
  assert.equal(typed.workingDays, 2 * 18 + 4); // 18 activities on the longest chain, 4 one-day lags
});

test("carryPerDay prices the crew-levelled shift of a slip and the whole job", () => {
  const acts = [{ id: "a", days: 3 }, { id: "b", days: 4, after: ["a"] }, { id: "c", days: 2, after: ["a"] }, { id: "d", days: 1, after: ["b", "c"] }];
  const s = schedule({ activities: acts, carryPerDay: 150, slips: [{ id: "b", days: 3 }, { id: "c", days: 1 }] });
  assert.equal(s.carryTotal, 8 * 150);
  assert.deepEqual(s.slips.map((x) => x.carryCost), [450, 0]);
  assert.match(scheduleText(s).join("\n"), /costs \$450 at your \$150 per day/);
  assert.equal(schedule({ activities: acts }).carryTotal, undefined);
  assert.equal(schedule({ activities: acts, carryPerDay: -1 }).ok, false);
});

test("scheduleCsv lists activities in start order, quotes commas, and carries slips and errors", () => {
  const acts = [{ id: "a", name: "Frame, walls", days: 3 }, { id: "b", days: 2, after: ["a"] }];
  const s = schedule({ start: "2026-03-02", activities: acts, slips: [{ id: "b", days: 1 }] });
  const lines = scheduleCsv(s).trimEnd().split("\n");
  assert.equal(lines[0], "id,name,crew,days,start,finish,slack,critical,note");
  assert.equal(lines[1], 'a,"Frame, walls",,3,2026-03-02,2026-03-04,0,yes,');
  assert.equal(lines[2], "b,b,,2,2026-03-05,2026-03-06,0,yes,");
  assert.match(lines[3], /^slip:b,,,1,,2026-03-09,,,finish moves 1 day/);
  assert.match(scheduleCsv(schedule({ activities: [] })), /^error: The schedule has no activities/);
  const plan = { ...samplePlan(), schedule: { start: "2026-03-02", activities: acts } };
  const fs = await_free(plan);
  assert.equal(fs.code, 0);
  assert.match(fs.out, /^id,name,crew,days/);
});
function await_free(plan) {
  const path = `${process.env.TMPDIR || "/tmp"}/sched-csv-${process.pid}.json`;
  writeFileSync(path, JSON.stringify(plan));
  try { return main([path, "--schedule", "--csv"]); } finally { unlinkSync(path); }
}

test("scheduleText prints the carrying cost total once carryPerDay is typed, and not before", () => {
  const base = { start: "2026-03-02", activities: [{ id: "a", days: 5, after: [] }, { id: "b", days: 5, after: ["a"] }] };
  const none = scheduleText(schedule(base)).join("\n");
  assert.ok(!/Carrying cost/.test(none));
  const withCarry = scheduleText(schedule({ ...base, carryPerDay: 250 })).join("\n");
  assert.match(withCarry, /Carrying cost: \$2,500 for 10 working days at your \$250 per day\./);
});

test("deadline: days late or to spare against the leveled finish, with the late cost", () => {
  const acts = [{ id: "a", days: 3 }, { id: "b", days: 4, after: ["a"] }]; // Mon 2026-03-02, 7 working days, last day Tue 03-10
  assert.equal(schedule({ start: "2026-03-02", activities: acts, deadline: "2026-03-10" }).deadline.daysLate, 0);
  assert.equal(schedule({ start: "2026-03-02", activities: acts, deadline: "2026-03-13" }).deadline.daysLate, -3);
  const late = schedule({ start: "2026-03-02", activities: acts, deadline: "2026-03-06", carryPerDay: 100 });
  assert.equal(late.deadline.daysLate, 2);
  assert.equal(late.deadline.lateCost, 200);
  assert.equal(schedule({ start: "2026-03-02", activities: acts, deadline: "2026-03-08" }).deadline.daysLate, 2); // Sunday -> Friday
  assert.equal(schedule({ activities: acts, deadline: "soon" }).ok, false);
  assert.match(scheduleText(late).join("\n"), /Deadline 2026-03-06: 2 working day\(s\) late.*\$200/);
});

test("schedule refuses malformed shapes instead of throwing or looping forever", () => {
  const acts = [{ id: "a", days: 2, crew: "f" }, { id: "b", days: 1, crew: "f" }];
  for (const f of [0, -1, "2", Infinity]) {
    const r = schedule({ start: "2026-11-02", crews: { f }, activities: acts });
    assert.equal(r.ok, false, `crews.f = ${f}`);
    assert.match(r.errors[0], /crews\.f must be a number of 1 or more/);
  }
  assert.equal(schedule({ start: "2026-11-02", crews: { f: 2 }, activities: acts }).ok, true);
  assert.match(schedule(null).errors[0], /must be an object/);
  assert.match(schedule([]).errors[0], /must be an object/);
  assert.match(schedule({ activities: [null] }).errors[0], /Activity 1 is not an object/);
  assert.match(schedule({ activities: "x" }).errors[0], /must be a list/);
  assert.match(schedule({ activities: [{ id: "a", days: 1, after: "x" }] }).errors[0], /after must be a list/);
  assert.match(schedule({ activities: [{ id: "a", days: "3" }] }).errors[0], /days must be a number/);
  assert.match(schedule({ activities: [{ id: "a", days: 1 }], crews: [] }).errors[0], /crews. must be an object/);
});

test("cost per activity is spread over its working days and summed by month (hand-checked)", () => {
  // Fri 2026-03-27 start: a runs Fri, Mon, Tue, Wed (Apr 1); b is Thu Apr 2.
  const s = schedule({ start: "2026-03-27", activities: [{ id: "a", days: 4, cost: 4000 }, { id: "b", days: 1, after: ["a"], cost: 500 }, { id: "c", days: 1, after: ["b"] }] });
  assert.deepEqual(s.cashFlow.months, [
    { month: "2026-03", spend: 3000, cumulative: 3000 },
    { month: "2026-04", spend: 1500, cumulative: 4500 }]);
  assert.equal(s.cashFlow.total, 4500);
  assert.equal(s.cashFlow.peakMonth, "2026-03");
  assert.match(scheduleText(s).join("\n"), /Spend by month.*\$4,500/);
  assert.match(scheduleCsv(s), /spend:2026-04,.*spend 1500; to date 4500/);
});

test("no costs, no cash flow; a bad cost is refused", () => {
  assert.equal(schedule({ activities: [{ id: "a", days: 1 }] }).cashFlow, undefined);
  const bad = schedule({ activities: [{ id: "a", days: 1, cost: -5 }] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /cost must be/);
});

test("cash flow also groups spend by Monday week and names the peak week", () => {
  // a: 5 days Mon 2026-03-02, $5,000 (1,000/day); b: 5 days next week, $2,500; c: 0-day $300 after b
  const s = schedule({ start: "2026-03-02", activities: [
    { id: "a", days: 5, cost: 5000 }, { id: "b", days: 5, after: ["a"], cost: 2500 }, { id: "c", days: 0, after: ["b"], cost: 300 } ] });
  assert.deepEqual(s.cashFlow.weeks.map((w) => [w.week, w.spend, w.cumulative]), [["2026-03-02", 5000, 5000], ["2026-03-09", 2500, 7500], ["2026-03-16", 300, 7800]]);
  assert.equal(s.cashFlow.peakWeek, "2026-03-02");
  assert.match(scheduleText(s).join("\n"), /heaviest week \(from Monday\) 2026-03-02 at \$5,000/);
  assert.match(scheduleCsv(s), /week:2026-03-09,.*spend 2500; to date 7500/);
});

test("draw terms: float with a payment lag and retainage (hand-checked)", () => {
  // Two working days, $1000 each, Mon 2026-03-02 and Tue 03-03. Lag 7 days, 10% retainage, release 7 days after the last day.
  // Spend -1000 (03-02), -1000 (03-03); receipts +900 on 03-09 and 03-10; retainage 200 on 03-10. Deepest gap -2000 on 03-03.
  const s = schedule({ start: "2026-03-02", draw: { lagDays: 7, retainagePct: 10 }, activities: [{ id: "a", days: 2, cost: 2000 }] });
  assert.deepEqual(s.cashFlow.float, { lagDays: 7, retainagePct: 10, peakFloat: 2000, peakDate: "2026-03-03", retainageHeld: 200, releaseDate: "2026-03-10" });
  assert.match(scheduleText(s).join("\n"), /Cash you float with draws paid 7 day\(s\) late and 10% retainage: peak \$2,000 on 2026-03-03/);
  assert.equal(schedule({ start: "2026-03-02", draw: {}, activities: [{ id: "a", days: 2, cost: 2000 }] }).cashFlow.float.peakFloat, 0);
  assert.equal(schedule({ start: "2026-03-02", draw: { retainagePct: 150 }, activities: [{ id: "a", days: 1, cost: 5 }] }).ok, false);
});
