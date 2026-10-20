import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, recordCheck, recordPing, pushResult, createIncident, addUpdate, scheduleMaintenance, overall, uptimePct, fmtPct, dayBars, allowedDowntimeSec, humanDuration, inMaintenance } from "./monitor.mjs";

const DAY = 86_400_000, T0 = Date.UTC(2026, 0, 10, 12);
const def = { id: "web", name: "Web", failAfter: 2 };
const OK = { ok: true, ms: 80 }, BAD = { ok: false, error: "HTTP 500" };

test("one failure is not an outage; the second opens an incident back-dated to the first", () => {
  const s = newState();
  assert.deepEqual(recordCheck(s, def, BAD, T0), []);
  assert.equal(s.monitors.web.status, "unknown");
  const ev = recordCheck(s, def, BAD, T0 + 60_000);
  assert.equal(ev[0].type, "down");
  assert.equal(s.incidents[0].startedAt, T0);
  assert.equal(overall(s, [def], T0 + 60_000), "major_outage");
});

test("a sustained outage opens exactly one incident; recovery resolves it", () => {
  const s = newState();
  for (let i = 0; i < 6; i++) recordCheck(s, def, BAD, T0 + i * 60_000);
  assert.equal(s.incidents.length, 1);
  const ev = recordCheck(s, def, OK, T0 + 6 * 60_000);
  assert.equal(ev[0].type, "recovered");
  assert.equal(ev[0].downMs, 6 * 60_000);
  assert.equal(s.incidents[0].status, "resolved");
  assert.equal(overall(s, [def], T0 + 6 * 60_000), "operational");
});

test("a flap shorter than failAfter never alerts", () => {
  const s = newState();
  const evs = [BAD, OK, BAD, OK, BAD, OK].flatMap((r, i) => recordCheck(s, def, r, T0 + i * 60_000));
  assert.deepEqual(evs, []);
  assert.equal(s.incidents.length, 0);
});

test("some monitors down is a partial outage, all down is major", () => {
  const s = newState(), a = { id: "a", failAfter: 1 }, b = { id: "b", failAfter: 1 };
  recordCheck(s, a, OK, T0); recordCheck(s, b, OK, T0);
  recordCheck(s, a, BAD, T0 + 1000);
  assert.equal(overall(s, [a, b], T0 + 1000), "partial_outage");
  recordCheck(s, b, BAD, T0 + 1000);
  assert.equal(overall(s, [a, b], T0 + 1000), "major_outage");
});

test("planned maintenance suppresses incidents and does not hurt uptime", () => {
  const s = newState();
  scheduleMaintenance(s, { title: "DB upgrade", startsAt: T0, endsAt: T0 + 3_600_000 });
  recordCheck(s, def, OK, T0 - 1000);
  for (let i = 0; i < 5; i++) assert.deepEqual(recordCheck(s, def, BAD, T0 + i * 60_000), []);
  assert.equal(s.incidents.length, 0);
  assert.equal(overall(s, [def], T0 + 1000), "maintenance");
  assert.equal(uptimePct(s.monitors.web, 1, T0), 100);
  assert.ok(inMaintenance(s, "web", T0));
  assert.ok(!inMaintenance(s, "web", T0 + 3_600_000));
});

test("maintenance scoped to other monitors leaves this one live", () => {
  const s = newState();
  scheduleMaintenance(s, { title: "x", startsAt: T0, endsAt: T0 + 1000, monitors: ["other"] });
  assert.ok(!inMaintenance(s, "web", T0));
});

test("manual incidents: degraded until resolved; bad input rejected", () => {
  const s = newState();
  recordCheck(s, def, OK, T0);
  const inc = createIncident(s, { title: "Slow checkout", message: "Looking", now: T0 });
  assert.equal(overall(s, [def], T0), "degraded");
  addUpdate(s, inc.id, { status: "identified", message: "Bad index", now: T0 + 1 });
  assert.equal(s.incidents[0].updates.length, 2);
  addUpdate(s, inc.id, { status: "resolved", now: T0 + 2 });
  assert.equal(overall(s, [def], T0 + 2), "operational");
  assert.throws(() => createIncident(s, { title: " ", now: T0 }), /title/);
  assert.throws(() => createIncident(s, { title: "x", impact: "huge", now: T0 }), /impact/);
  assert.throws(() => addUpdate(s, inc.id, { status: "bogus", now: T0 }), /status/);
  assert.throws(() => addUpdate(s, "nope", { status: "resolved", now: T0 }), /no such/);
  assert.throws(() => scheduleMaintenance(s, { title: "x", startsAt: 5, endsAt: 5 }), /endsAt/);
});

test("uptime maths, bars and rounding that never rounds a bad month up to 100%", () => {
  const s = newState();
  for (let i = 0; i < 1000; i++) recordCheck(s, { id: "w", failAfter: 99999 }, i === 0 ? BAD : OK, T0 + i);
  const p = uptimePct(s.monitors.w, 1, T0);
  assert.equal(p, 99.9);
  assert.equal(fmtPct(99.999), "100%");
  assert.equal(fmtPct(99.9949), "99.99%");
  assert.equal(fmtPct(99.9999999), "100%");
  assert.equal(fmtPct(null), "n/a");
  const bars = dayBars(s.monitors.w, 3, T0);
  assert.deepEqual(bars.map((b) => b.level), ["none", "none", "ok"]);
  assert.equal(dayBars(undefined, 2, T0).length, 2);
});

test("history is pruned to 90 days", () => {
  const s = newState();
  for (let i = 0; i < 100; i++) recordCheck(s, def, OK, T0 + i * DAY);
  assert.equal(Object.keys(s.monitors.web.days).length, 90);
});

test("push monitors: silent until the first ping, then a missed window fails", () => {
  const s = newState(), p = { id: "cron", type: "push", intervalSec: 60, graceSec: 30 };
  assert.equal(pushResult(s, p, T0).ok, false);
  recordPing(s, p, T0);
  assert.equal(pushResult(s, p, T0 + 90_000).ok, true);
  assert.equal(pushResult(s, p, T0 + 91_000).ok, false);
});

test("SLA arithmetic matches the published table", () => {
  assert.equal(Math.round(allowedDowntimeSec(99.9, 30)), 2592);
  assert.equal(humanDuration(allowedDowntimeSec(99.99, 365)), "52m 34s");
  assert.equal(humanDuration(allowedDowntimeSec(99, 30)), "7h 12m");
  assert.equal(allowedDowntimeSec(0, 30), null);
  assert.equal(allowedDowntimeSec(101, 30), null);
  assert.equal(humanDuration(null), "n/a");
});
