import test from "node:test";
import assert from "node:assert/strict";
import { planTimeline, defaultStages, dayNumber, isoDate, timelineSvg, timelineCsv } from "./timeline.mjs";

test("dates round-trip and bad dates are NaN", () => {
  assert.equal(isoDate(dayNumber("2027-03-01")), "2027-03-01");
  assert.ok(Number.isNaN(dayNumber("2027-02-30")));
  assert.ok(Number.isNaN(dayNumber("soon")));
});

const simple = [
  { name: "a", days: 10, clock: "you" },
  { name: "b", days: 20, clock: "factory" },
  { name: "c", days: 10, clock: "calendar" },
];

test("forward by hand: no closures, 10% delay pads factory and calendar only", () => {
  const r = planTimeline({ stages: simple, startDate: "2027-01-01", delayPct: 10, closures: [] });
  // 10 + (20+2) + (10+1) = 43 days
  assert.equal(r.earliest.totalDays, 43);
  assert.equal(r.earliest.onSale, "2027-02-13");
  assert.equal(r.earliest.rows[0].padDays, 0);
  assert.equal(r.earliest.rows[1].padDays, 2);
});

test("a closure stops only the factory clock", () => {
  // factory stage starts 2027-01-11 and needs 20 days; closure 01-20..01-29 is 10 days
  const r = planTimeline({ stages: simple, startDate: "2027-01-01", delayPct: 0, closures: [{ from: "2027-01-20", to: "2027-01-29" }] });
  assert.equal(r.earliest.rows[1].closureDays, 10);
  assert.equal(r.earliest.totalDays, 10 + 30 + 10);
  // calendar stage inside a closure is not paused
  const r2 = planTimeline({ stages: [{ name: "x", days: 10, clock: "calendar" }], startDate: "2027-01-01", delayPct: 0, closures: [{ from: "2027-01-03", to: "2027-01-08" }] });
  assert.equal(r2.earliest.totalDays, 10);
});

test("latest start is the last start that still makes the date", () => {
  const closures = [{ from: "2027-01-20", to: "2027-01-29" }];
  const r = planTimeline({ stages: simple, onSaleDate: "2027-03-01", delayPct: 10, closures });
  const again = planTimeline({ stages: simple, startDate: r.latest.start, delayPct: 10, closures });
  assert.ok(again.earliest.onSale <= "2027-03-01");
  const next = planTimeline({ stages: simple, startDate: isoDate(dayNumber(r.latest.start) + 1), delayPct: 10, closures });
  assert.ok(next.earliest.onSale > "2027-03-01");
});

test("start and target together give a verdict", () => {
  const late = planTimeline({ stages: simple, startDate: "2027-02-01", onSaleDate: "2027-03-01", delayPct: 0, closures: [] });
  assert.equal(late.verdict, "late");
  assert.equal(late.lateDays, 12); // 40 days from 02-01 is 03-13
  const ok = planTimeline({ stages: simple, startDate: "2027-01-01", onSaleDate: "2027-03-01", delayPct: 0, closures: [] });
  assert.equal(ok.verdict, "on-track");
});

test("default chain: more sample rounds and slower freight take longer", () => {
  const base = planTimeline({ startDate: "2027-03-01", closures: [] }).earliest.totalDays;
  const more = planTimeline({ startDate: "2027-03-01", closures: [], sampleRounds: 3 }).earliest.totalDays;
  const air = planTimeline({ startDate: "2027-03-01", closures: [], freight: "air" }).earliest.totalDays;
  assert.ok(more > base && air < base);
  assert.equal(defaultStages({ sampleRounds: 9 }).filter(s => /courier to you/.test(s.name)).length, 5);
});

test("errors", () => {
  assert.ok(planTimeline({}).error);
  assert.ok(planTimeline({ startDate: "2027-13-01" }).error);
  assert.ok(planTimeline({ startDate: "2027-01-01", delayPct: 500 }).error);
  assert.ok(planTimeline({ startDate: "2027-01-01", stages: [{ name: "z", days: 5, clock: "robot" }] }).error);
});

test("svg and csv", () => {
  const r = planTimeline({ stages: simple, startDate: "2027-01-01", closures: [] });
  assert.equal((timelineSvg(r.earliest.rows).match(/<rect/g) || []).length, 3);
  assert.equal(timelineCsv(r.earliest.rows).split("\n").length, 4);
});
