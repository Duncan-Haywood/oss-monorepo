import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

test("no args prints help and exits 1", () => {
  const { exitCode, output } = run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("--help exits 0", () => {
  const { exitCode } = run(["--help"]);
  assert.equal(exitCode, 0);
});

test("unknown subcommand exits 2", () => {
  const { exitCode, output } = run(["bogus"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});

test("next without --tz exits 2", () => {
  const { exitCode, output } = run(["next", "0 9 * * *"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Missing required --tz/);
});

test("next with a bad cron expression exits 2 with the parse error", () => {
  const { exitCode, output } = run(["next", "bad expr here nope surely", "--tz", "UTC"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("next with an unrecognized timezone exits 2", () => {
  const { exitCode, output } = run(["next", "0 9 * * *", "--tz", "Not/AZone"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("next: a clean UTC daily cron exits 0 and lists occurrences", () => {
  const { exitCode, output } = run(["next", "0 9 * * *", "--tz", "UTC", "--count", "3", "--from", "2027-01-01T00:00:00Z"]);
  assert.equal(exitCode, 0);
  assert.match(output, /09:00\)/);
  assert.match(output, /nothing.*|no known|--/i);
});

test("next --json: a clean run has no flagged entries and machine-readable occurrences", () => {
  const { exitCode, output } = run(["next", "0 9 * * *", "--tz", "UTC", "--count", "3", "--from", "2027-01-01T00:00:00Z", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.occurrences.length, 3);
  assert.equal(parsed.flagged.length, 0);
});

test("next: a schedule crossing the spring-forward gap exits 1 and names the skip", () => {
  const { exitCode, output } = run(["next", "30 2 * * *", "--tz", "America/New_York", "--count", "3", "--from", "2027-03-12T00:00:00Z"]);
  assert.equal(exitCode, 1);
  assert.match(output, /Skipped occurrences/);
  assert.match(output, /2027-03-14/);
});

test("next --json: the same schedule reports a skipped entry with zero instants", () => {
  const { exitCode, output } = run(["next", "30 2 * * *", "--tz", "America/New_York", "--count", "3", "--from", "2027-03-12T00:00:00Z", "--json"]);
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(output);
  const skip = parsed.flagged.find((f) => f.kind === "skipped");
  assert.ok(skip);
  assert.equal(skip.instants.length, 0);
});

test("next: an invalid --from date exits 2", () => {
  const { exitCode, output } = run(["next", "0 9 * * *", "--tz", "UTC", "--from", "not-a-date"]);
  assert.equal(exitCode, 2);
  assert.match(output, /unparseable --from/);
});

test("drift without a positional time exits 2", () => {
  const { exitCode, output } = run(["drift", "--tz", "UTC"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Usage: node cli.mjs drift/);
});

test("drift with a malformed time exits 2", () => {
  const { exitCode, output } = run(["drift", "9am", "--tz", "UTC"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Expected HH:MM/);
});

test("drift: a DST-observing zone exits 1 and names both UTC times", () => {
  const { exitCode, output } = run(["drift", "09:00", "--tz", "America/New_York", "--year", "2027"]);
  assert.equal(exitCode, 1);
  assert.match(output, /Drift: 60 minutes/);
  assert.match(output, /UTC 14:00/);
  assert.match(output, /UTC 13:00/);
});

test("drift --json: a non-DST zone exits 0 with a single segment", () => {
  const { exitCode, output } = run(["drift", "09:00", "--tz", "Asia/Tokyo", "--year", "2027", "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.observesDst, false);
  assert.equal(parsed.segments.length, 1);
});

test("drift defaults --year to the current UTC year when omitted", () => {
  const { exitCode, output } = run(["drift", "09:00", "--tz", "UTC"]);
  assert.equal(exitCode, 0);
  assert.match(output, new RegExp(`year ${new Date().getUTCFullYear()}`));
});
