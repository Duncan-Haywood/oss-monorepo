import test from "node:test";
import assert from "node:assert/strict";
import { nextRun, nextRuns, evaluate, parseCron, checkTimezone } from "./cron.mjs";
import { validateConfig } from "./monitor.mjs";
import { analyzeCrontab } from "./crontab.mjs";

const iso = (d) => d && d.toISOString();

test("a zoned schedule follows the wall clock across DST", () => {
  assert.equal(iso(nextRun("0 9 * * *", new Date("2026-06-01T00:00:00Z"), "Europe/London")), "2026-06-01T08:00:00.000Z");
  assert.equal(iso(nextRun("0 9 * * *", new Date("2026-12-01T00:00:00Z"), "Europe/London")), "2026-12-01T09:00:00.000Z");
  const week = nextRuns("0 9 * * *", new Date("2026-03-25T12:00:00Z"), 4, "Europe/London").map(iso);
  assert.deepEqual(week, ["2026-03-26T09:00:00.000Z", "2026-03-27T09:00:00.000Z", "2026-03-28T09:00:00.000Z", "2026-03-29T08:00:00.000Z"]);
});

test("UTC and a missing zone behave as before", () => {
  const a = nextRun("0 9 * * *", new Date("2026-06-01T10:00:00Z"));
  assert.equal(iso(a), "2026-06-02T09:00:00.000Z");
  assert.equal(iso(nextRun("0 9 * * *", new Date("2026-06-01T10:00:00Z"), "UTC")), iso(a));
  assert.equal(parseCron("0 9 * * *", "utc").tz, null);
});

test("spring forward: a wall time that does not exist is skipped that day", () => {
  const n = nextRun("30 2 * * *", new Date("2026-03-07T12:00:00Z"), "America/New_York");
  assert.equal(iso(n), "2026-03-09T06:30:00.000Z"); // Mar 8 has no 02:30; Mar 9 is EDT (UTC-4)
});

test("fall back: a repeated wall time counts once, so a job that ran once is not late", () => {
  const first = nextRun("30 1 * * *", new Date("2026-11-01T04:00:00Z"), "America/New_York");
  assert.equal(iso(first), "2026-11-01T05:30:00.000Z"); // 01:30 EDT
  const second = nextRun("30 1 * * *", first, "America/New_York");
  assert.equal(iso(second), "2026-11-02T06:30:00.000Z"); // next day's 01:30 EST, not the repeat at 06:30Z on Nov 1
});

test("day-of-week and month fields are read in the zone", () => {
  // 23:30 Sunday in Los Angeles is already Monday in UTC.
  const n = nextRun("30 23 * * 0", new Date("2026-06-01T00:00:00Z"), "America/Los_Angeles");
  assert.equal(iso(n), "2026-06-01T06:30:00.000Z");
  const m = nextRun("0 0 1 1 *", new Date("2026-06-01T00:00:00Z"), "Pacific/Auckland");
  assert.equal(iso(m), "2026-12-31T11:00:00.000Z"); // 1 Jan 00:00 NZDT (UTC+13)
});

test("half-hour zones work", () => {
  assert.equal(iso(nextRun("0 6 * * *", new Date("2026-06-01T00:00:00Z"), "Asia/Kolkata")), "2026-06-01T00:30:00.000Z");
});

test("evaluate uses the check's zone", () => {
  const check = { schedule: "0 9 * * *", tz: "Europe/London", graceSeconds: 60, createdAt: Date.parse("2026-06-01T00:00:00Z"), lastPing: Date.parse("2026-06-01T08:00:30Z") };
  const next = Date.parse("2026-06-02T08:00:00Z");
  assert.equal(evaluate(check, next - 1000).state, "up");
  assert.equal(evaluate(check, next + 61000).state, "down");
  assert.equal(evaluate(check, next + 61000).dueAt, next);
});

test("unknown zones are rejected with a readable message", () => {
  assert.throws(() => checkTimezone("Mars/Olympus"), /unknown timezone/);
  assert.throws(() => validateConfig({ j: { schedule: "0 * * * *", tz: "Nope/Zone" } }), /unknown timezone/);
  assert.throws(() => validateConfig({ j: { periodSeconds: 60, tz: "Europe/London" } }), /only applies/);
  assert.equal(validateConfig({ j: { schedule: "0 * * * *", tz: "Europe/London" } }).j.tz, "Europe/London");
  assert.equal(validateConfig({ j: { schedule: "0 * * * *" } }).j.tz, null);
});

test("CRON_TZ in a pasted crontab applies to the lines below it and reaches checks.json", () => {
  const text = "0 3 * * * /bin/utc-job\nCRON_TZ=America/New_York\n0 9 * * * /bin/morning-report\nCRON_TZ=\n0 4 * * * /bin/after-reset\n";
  const r = analyzeCrontab(text, new Date("2026-06-01T00:00:00Z"));
  const bySlug = Object.fromEntries(r.entries.map((e) => [e.slug, e]));
  assert.equal(bySlug["utc-job"].tz, null);
  assert.equal(bySlug["morning-report"].tz, "America/New_York");
  assert.equal(iso(bySlug["morning-report"].nextRuns[0]), "2026-06-01T13:00:00.000Z");
  assert.equal(bySlug["after-reset"].tz, null);
  assert.equal(r.config["morning-report"].tz, "America/New_York");
  assert.equal("tz" in r.config["utc-job"], false);
});

test("a bad CRON_TZ is reported, not silently treated as UTC", () => {
  const r = analyzeCrontab("CRON_TZ=Nope/Zone\n0 3 * * * /bin/x\n", new Date("2026-06-01T00:00:00Z"));
  assert.ok(r.entries.some((e) => /unknown timezone/.test(e.error || "")));
});
