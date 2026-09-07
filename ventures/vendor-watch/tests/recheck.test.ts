import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RECHECK_INTERVAL_DAYS, recheckStatus, sortByRecheckPriority } from "../src/lib/recheck";

const NOW = "2026-09-05T12:00:00.000Z";

test("a snapshot from today is not due", () => {
  const status = recheckStatus("2026-09-05T09:00:00.000Z", DEFAULT_RECHECK_INTERVAL_DAYS, NOW);
  assert.equal(status.daysSinceChecked, 0);
  assert.equal(status.isDue, false);
});

test("a snapshot exactly at the interval is due", () => {
  const thirtyDaysAgo = "2026-08-06T12:00:00.000Z";
  const status = recheckStatus(thirtyDaysAgo, 30, NOW);
  assert.equal(status.daysSinceChecked, 30);
  assert.equal(status.isDue, true);
});

test("a snapshot one day short of the interval is not due", () => {
  const twentyNineDaysAgo = "2026-08-07T12:00:00.000Z";
  const status = recheckStatus(twentyNineDaysAgo, 30, NOW);
  assert.equal(status.daysSinceChecked, 29);
  assert.equal(status.isDue, false);
});

test("an unparseable timestamp reads as just-checked rather than throwing or claiming overdue", () => {
  const status = recheckStatus("not-a-date", 30, NOW);
  assert.equal(status.daysSinceChecked, 0);
  assert.equal(status.isDue, false);
});

test("a future fetchedAt (clock skew) never reports negative days", () => {
  const tomorrow = "2026-09-06T12:00:00.000Z";
  const status = recheckStatus(tomorrow, 30, NOW);
  assert.equal(status.daysSinceChecked, 0);
  assert.equal(status.isDue, false);
});

test("sortByRecheckPriority puts overdue entries before fresh ones", () => {
  const entries = [
    { url: "https://fresh.example.com/terms", fetchedAt: "2026-09-04T12:00:00.000Z" },
    { url: "https://overdue.example.com/terms", fetchedAt: "2026-07-01T12:00:00.000Z" },
  ];
  const sorted = sortByRecheckPriority(entries, 30, NOW);
  assert.deepEqual(
    sorted.map((entry) => entry.url),
    ["https://overdue.example.com/terms", "https://fresh.example.com/terms"],
  );
});

test("sortByRecheckPriority orders multiple overdue entries by staleness, most overdue first", () => {
  const entries = [
    { url: "https://a.example.com", fetchedAt: "2026-08-01T12:00:00.000Z" }, // 35 days
    { url: "https://b.example.com", fetchedAt: "2026-06-01T12:00:00.000Z" }, // 96 days
    { url: "https://c.example.com", fetchedAt: "2026-08-20T12:00:00.000Z" }, // 16 days, not due
  ];
  const sorted = sortByRecheckPriority(entries, 30, NOW);
  assert.deepEqual(
    sorted.map((entry) => entry.url),
    ["https://b.example.com", "https://a.example.com", "https://c.example.com"],
  );
});

test("sortByRecheckPriority breaks ties on same staleness by URL, and does not mutate the input", () => {
  const entries = [
    { url: "https://z.example.com", fetchedAt: "2026-06-01T12:00:00.000Z" },
    { url: "https://a.example.com", fetchedAt: "2026-06-01T12:00:00.000Z" },
  ];
  const original = [...entries];
  const sorted = sortByRecheckPriority(entries, 30, NOW);
  assert.deepEqual(
    sorted.map((entry) => entry.url),
    ["https://a.example.com", "https://z.example.com"],
  );
  assert.deepEqual(entries, original);
});
