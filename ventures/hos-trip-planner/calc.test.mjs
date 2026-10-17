import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, parseLegs, sampleInput, fmtClock, fmtDuration, toCsv } from "./calc.mjs";

const base = { cycle: "70/8", cycleUsed: 0, driveUsed: 0, windowUsed: 0, driveSinceBreak: 0, startHour: 6, appointmentHour: "" };

test("a short trip needs no rest", () => {
  const r = plan({ ...base, legs: "200, 50, 0, Drop" });
  assert.equal(r.count.breaks + r.count.offDuty, 0);
  assert.ok(Math.abs(r.elapsed - 4) < 1e-6);
});

test("a break is forced after 8 hours of driving", () => {
  const r = plan({ ...base, legs: "480, 60, 0, Far" }); // 8h exactly, then nothing needed
  assert.equal(r.count.breaks, 0);
  const r2 = plan({ ...base, legs: "540, 60, 0, Far" }); // 9h drive
  assert.equal(r2.count.breaks, 1);
  assert.ok(Math.abs(r2.elapsed - 9.5) < 1e-6);
});

test("11-hour drive limit forces a 10-hour reset", () => {
  const r = plan({ ...base, legs: "770, 55, 0, Coast" }); // 14h driving
  assert.equal(r.count.offDuty, 1);
  assert.ok(Math.abs(r.driveHours - 14) < 1e-6);
  // 8h + .5 break + 3h = 11 drive, 11.5 window, then 10 off, then 3 more
  assert.ok(Math.abs(r.elapsed - (14 + 0.5 + 10)) < 1e-6);
});

test("the 14-hour window ends the shift even with drive time left", () => {
  const r = plan({ ...base, windowUsed: 10, legs: "330, 55, 0, X" }); // 6h to drive, 4h window left
  assert.equal(r.count.offDuty, 1);
});

test("dwell of 30+ minutes counts as the break", () => {
  const r = plan({ ...base, legs: "440, 55, 1, A\n220, 55, 0, B" }); // 8h, dwell, 4h
  assert.equal(r.count.breaks, 0);
});

test("cycle exhaustion triggers a 34-hour restart, or an error when disabled", () => {
  const r = plan({ ...base, cycleUsed: 68, legs: "220, 55, 0, X" });
  assert.equal(r.count.restarts, 1);
  const e = plan({ ...base, cycleUsed: 68, autoRestart: false, legs: "220, 55, 0, X" });
  assert.match(e.error, /cycle/);
});

test("appointment lateness is reported", () => {
  const r = plan({ ...base, appointmentHour: 10, legs: "770, 55, 0, Coast" });
  assert.ok(r.lateBy > 0);
  assert.match(r.advice.join(" "), /past the appointment/);
});

test("bad input is rejected, not guessed at", () => {
  assert.ok(parseLegs("abc").error);
  assert.ok(parseLegs("").error);
  assert.ok(plan({ ...base, cycleUsed: 71, legs: "10, 50, 0, X" }).error);
  assert.ok(plan({ ...base, cycle: "80/8", legs: "10, 50, 0, X" }).error);
});

test("sample plans, formats, and exports", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  assert.equal(r.stops.length, 2);
  assert.equal(fmtClock(25.5), "01:30");
  assert.equal(fmtDuration(1.25), "1h 15m");
  assert.match(toCsv(r), /^event,start,end/);
});
