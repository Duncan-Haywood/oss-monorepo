import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, completedYears, redundancyWeeks, noticeWeeks, toDay, SAMPLE, summaryText } from "./calc.mjs";

test("NES weeks table including the 10+ step down", () => {
  const w = [0, 4, 6, 7, 8, 10, 11, 13, 14, 16, 12, 12];
  w.forEach((x, y) => assert.equal(redundancyWeeks(y), x, `year ${y}`));
});
test("completed years counts anniversaries", () => {
  assert.equal(completedYears(toDay("2017-03-06"), toDay("2026-03-05")), 8);
  assert.equal(completedYears(toDay("2017-03-06"), toDay("2026-03-06")), 9);
});
test("notice weeks and the age 45 extra week", () => {
  assert.equal(noticeWeeks(0, 30), 1);
  assert.equal(noticeWeeks(1, 50), 2);
  assert.equal(noticeWeeks(2, 45), 3);
  assert.equal(noticeWeeks(5, 44), 4);
  assert.equal(noticeWeeks(5, 45), 5);
});
test("sample: 9 years, 16 weeks, notice 5 weeks, 12 leave days", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors.length, 0);
  assert.equal(r.years, 9);
  assert.equal(r.redundancy, 16 * 1850);
  assert.equal(r.noticePay, 5 * 1850);
  assert.equal(r.leavePay, 12 * 370);
  assert.equal(r.total, 16 * 1850 + 5 * 1850 + 12 * 370);
  assert.match(summaryText(r), /Redundancy pay: 16 week/);
});
test("small business, casual and under one year pay no redundancy", () => {
  assert.equal(compute({ ...SAMPLE, employees: "14" }).redundancy, 0);
  assert.equal(compute({ ...SAMPLE, employees: "15" }).redundancy > 0, true);
  assert.equal(compute({ ...SAMPLE, employmentType: "casual" }).redundancy, 0);
  assert.equal(compute({ ...SAMPLE, startDate: "2026-02-01" }).redundancy, 0);
});
test("worked notice reduces payout; validation errors", () => {
  assert.equal(compute({ ...SAMPLE, noticeWorkedWeeks: "5" }).noticePay, 0);
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(compute({ ...SAMPLE, endDate: "2016-01-01" }).errors[0].includes("before"));
});
