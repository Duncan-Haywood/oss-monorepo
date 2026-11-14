import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

test("prints the English, findings and numbered dates", () => {
  const { code, out } = run(["FREQ=MONTHLY;COUNT=4", "--start", "2026-01-31T09:00"]);
  assert.equal(code, 0);
  assert.match(out, /^Every month on the 31st at 09:00/);
  assert.match(out, /WARNING DTSTART is on the 31st/);
  assert.match(out, /fix: FREQ=MONTHLY;COUNT=4;BYMONTHDAY=-1/);
  assert.match(out, /   2  2026-03-31 09:00  Tue/);
});

test("reads stdin, exits 1 on errors, and --strict on warnings", () => {
  const text = "DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2";
  assert.equal(run(["-"], { stdin: () => text }).code, 0);
  assert.equal(run(["-", "--strict"], { stdin: () => text }).code, 1);
  assert.equal(run(["FREQ=WEEKLY;BYMONTHDAY=3", "--start", "2026-01-05"]).code, 1);
});

test("--json, --dateutil, --from and zones", () => {
  const j = JSON.parse(run(["FREQ=DAILY;COUNT=3", "--start", "2026-03-07T02:30", "--tz", "America/New_York", "--json"]).out);
  assert.equal(j.occurrences[1].zone, "gap");
  assert.equal(j.occurrences[1].actualLocal, "2026-03-08 03:30");
  const du = JSON.parse(run(["DTSTART:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2", "--dateutil", "--json"]).out);
  assert.deepEqual(du.occurrences.map((o) => o.date), ["2026-01-06 09:00", "2026-01-13 09:00"]);
  const from = run(["FREQ=MONTHLY;COUNT=12", "--start", "2026-01-01T09:00", "--from", "2026-11-01"]).out;
  assert.match(from, /  11  2026-11-01 09:00/);
});

test("usage errors exit 2", () => {
  assert.equal(run([]).code, 2);
  assert.equal(run(["FREQ=DAILY", "--bogus"]).code, 2);
  assert.equal(run(["--help"]).code, 0);
});
