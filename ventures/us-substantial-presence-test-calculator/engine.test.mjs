import test from "node:test";
import assert from "node:assert/strict";
import { outlook, latestDeparture, STEADY_DAYS, analyze, parseStays, summarize, maxSafeDays, meets, weighted, toDay, SAMPLE, SAMPLE_OPTIONS } from "./engine.mjs";

const run = (stays, o = {}) => analyze({ stays, asOf: "2025-12-31", year: 2025, ...o });

test("Pub. 519 example: 120 + 120/3 + 120/6 = 180 is under 183", () => {
  assert.equal(weighted(120, 120, 120), 180);
  assert.equal(meets(120, 120, 120), false);
  assert.equal(meets(122, 120, 120), false); // 122 + 40 + 20 = 182
  assert.equal(meets(123, 120, 120), true);  // 183
});

test("the weighted sum is exact (sixths), so 182.99 never rounds up to 183", () => {
  // 6c + 2p1 + p2 = 1097 is one sixth short of 183
  assert.equal(meets(100, 241, 15), false); // 600+482+15 = 1097
  assert.equal(meets(100, 241, 16), true);  // 1098
});

test("31 days this year is a separate, required condition", () => {
  assert.equal(meets(30, 365, 365), false);
  assert.equal(meets(31, 365, 365), true);
  assert.equal(maxSafeDays(365, 365), 30);
});

test("maxSafeDays is the largest count that does not meet the test", () => {
  for (const [p1, p2] of [[0, 0], [120, 120], [200, 50], [365, 0], [31, 366]]) {
    const m = maxSafeDays(p1, p2);
    assert.equal(meets(m, p1, p2), false, `${m} @ ${p1},${p2}`);
    assert.equal(meets(m + 1, p1, p2), true, `${m + 1} @ ${p1},${p2}`);
  }
});

test("any part of a day counts: inclusive ranges, overlaps counted once", () => {
  const r = run("2025-03-01 to 2025-03-10\n2025-03-08 to 2025-03-12");
  assert.equal(r.cur.days, 12);
});

test("exempt days are removed even where they overlap a normal stay", () => {
  const r = run("2025-01-01 to 2025-01-31\n2025-01-10 to 2025-01-14 exempt");
  assert.equal(r.cur.days, 26);
  assert.equal(r.cur.exempt, 5);
});

test("an F-1 student's exempt years leave nothing to count, so the test is not met", () => {
  const r = run("2021-08-15 to 2025-05-10 exempt");
  assert.equal(r.cur.days, 0);
  assert.equal(r.resident, false);
  assert.ok(r.warnings.some((w) => /Form 8843/.test(w)));
});

test("year totals stand in for years with no dated stays; dated stays win and warn", () => {
  const a = run("2025-04-01 to 2025-05-30\n2024: 150 days\n2023: 90 days");
  assert.equal(a.p1.days, 150);
  assert.equal(a.p2.days, 90);
  assert.equal(a.p1.source, "total");
  const b = run("2025-04-01 to 2025-05-30\n2024-01-01 to 2024-01-10\n2024: 150 days");
  assert.equal(b.p1.days, 10);
  assert.ok(b.warnings.some((w) => /dated stays are used/.test(w)));
});

test("crossing date is the day the running count first meets the test", () => {
  // p1 = 365 -> 2*365 = 730 sixths; p2 = 0; need 6c >= 368 -> c >= 62
  const r = run("2024: 365 days\n2025-01-01 to 2025-12-31");
  assert.equal(r.crossing, toDay("2025-03-03")); // 62nd day
  assert.equal(r.resident, true);
});

test("planned days are added to the test year", () => {
  const r = analyze({ stays: SAMPLE, ...SAMPLE_OPTIONS });
  assert.equal(r.cur.days, 91);
  assert.equal(r.resident, false);
  assert.equal(r.roomLeft, 31);
  assert.equal(r.withPlanned, 131);
  assert.equal(r.plannedMeets, true);
  assert.match(summarize(r).text, /31 more days/);
});

test("closer-connection and residency-start notes appear only when they apply", () => {
  const r = run("2024: 365 days\n2025-01-01 to 2025-03-31");
  assert.equal(r.resident, true);
  assert.ok(r.warnings.some((w) => /Form 8840/.test(w)));
  assert.ok(r.warnings.some((w) => /residency generally starts/.test(w)));
  const under = run("2025-03-01 to 2025-03-20");
  assert.equal(under.warnings.length, 0);
});

test("bad lines are reported, not guessed", () => {
  const { errors, stays } = parseStays("2025-02-30 to 2025-03-01\nnonsense\n2025-05-01 to 2025-04-01\n2025: 400 days", "2025-12-31");
  assert.equal(stays.length, 0);
  assert.equal(errors.length, 4);
  assert.throws(() => run(""), /Enter at least one/);
  assert.throws(() => analyze({ stays: "2025-01-01 to 2025-01-05", asOf: "bad" }), /as-of/);
});

test("'present' ends at the as-of date", () => {
  const r = analyze({ stays: "2025-06-01 to present", asOf: "2025-06-10", year: 2025 });
  assert.equal(r.cur.days, 10);
});

test("brute force: independent per-day recount agrees on a random-ish year", () => {
  const stays = "2023-02-10 to 2023-09-02\n2024-04-01 to 2024-10-15\n2025-01-20 to 2025-04-30";
  const r = run(stays);
  let c = 0;
  for (let d = toDay("2025-01-20"); d <= toDay("2025-04-30"); d++) c++;
  assert.equal(r.cur.days, c);
  assert.equal(r.p1.days, toDay("2024-10-15") - toDay("2024-04-01") + 1);
  assert.equal(r.p2.days, toDay("2023-09-02") - toDay("2023-02-10") + 1);
});

test("steady state: 121 a year stays under forever, 122 does not", () => {
  assert.equal(STEADY_DAYS, 121);
  assert.equal(meets(121, 121, 121), false);
  assert.equal(meets(122, 122, 122), true);
});

test("outlook chains each year's maximum into the next", () => {
  const o = outlook(91, 120);
  assert.equal(o[0].max, maxSafeDays(91, 120));
  assert.equal(o[1].max, maxSafeDays(o[0].max, 91));
  assert.equal(o[2].max, maxSafeDays(o[1].max, o[0].max));
  assert.equal(outlook(121, 121)[2].max, 121);
  for (const r of outlook(91, 120)) assert.ok(r.max >= 30 && r.max <= 182);
});

test("latest departure is start plus room left minus one, and stops at year end", () => {
  assert.deepEqual(latestDeparture("2025-03-01", 10, 2025), { last: Date.UTC(2025, 2, 10) / 86400000 });
  assert.deepEqual(latestDeparture("2025-12-20", 40, 2025), { yearEnd: true });
  assert.deepEqual(latestDeparture("2025-03-01", 0, 2025), { none: true });
  assert.ok(latestDeparture("2026-03-01", 10, 2025).error);
  assert.ok(latestDeparture("nope", 10, 2025).error);
});

test("analyze reports the latest departure and it keeps the total under the test", () => {
  const r = analyze({ stays: SAMPLE, ...SAMPLE_OPTIONS, tripStart: "2025-07-01" });
  assert.ok(r.trip.last);
  const days = r.cur.days + (r.trip.last - Date.UTC(2025, 6, 1) / 86400000 + 1);
  assert.equal(meets(days, r.p1.days, r.p2.days), false);
  assert.equal(meets(days + 1, r.p1.days, r.p2.days), true);
});
