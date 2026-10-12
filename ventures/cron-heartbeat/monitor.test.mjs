import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseCron, nextRun, nextRuns, evaluate, suggestGraceSeconds, longestGapSeconds } from "./cron.mjs";
import { createMonitor, validateConfig } from "./monitor.mjs";
import { handler } from "./server.mjs";

const T = (s) => new Date(s);

test("cron: steps, ranges, names and macros", () => {
  assert.deepEqual(nextRuns("*/15 9-17 * * mon-fri", T("2026-10-08T17:50:00Z"), 2).map((d) => d.toISOString()),
    ["2026-10-09T09:00:00.000Z", "2026-10-09T09:15:00.000Z"]);
  assert.equal(nextRun("@daily", T("2026-10-08T10:00:00Z")).toISOString(), "2026-10-09T00:00:00.000Z");
  assert.equal(nextRun("0 0 29 2 *", T("2026-10-08T00:00:00Z")).toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(nextRun("0 12 * * 7", T("2026-10-08T00:00:00Z")).getUTCDay(), 0);
});

test("cron: day-of-month and day-of-week are OR when both are restricted", () => {
  const n = nextRuns("0 0 13 * fri", T("2026-10-01T00:00:00Z"), 3).map((d) => d.toISOString().slice(0, 10));
  assert.deepEqual(n, ["2026-10-02", "2026-10-09", "2026-10-13"]);
});

test("cron: rejects bad expressions with a reason", () => {
  assert.throws(() => parseCron("* * * *"), /expected 5 fields/);
  assert.throws(() => parseCron("61 * * * *"), /outside 0-59/);
  assert.throws(() => parseCron("*/0 * * * *"), /bad step/);
  assert.throws(() => parseCron("@reboot"), /unsupported/);
  assert.throws(() => parseCron("a * * * *"), /not a number/);
});

test("grace and longest gap follow the schedule", () => {
  const now = T("2026-10-08T10:00:00Z");
  assert.equal(suggestGraceSeconds("*/5 * * * *", now), 60);
  assert.equal(suggestGraceSeconds("0 3 * * *", now), 3600);
  assert.equal(longestGapSeconds("0 9 * * mon-fri", now), 3 * 86400);
});

test("evaluate: up, late, down, failed, running, paused", () => {
  const base = { schedule: "0 * * * *", graceSeconds: 300, createdAt: Date.parse("2026-10-08T00:00:00Z"), lastPing: Date.parse("2026-10-08T10:00:30Z") };
  const at = (s) => evaluate(base, Date.parse(s)).state;
  assert.equal(at("2026-10-08T10:30:00Z"), "up");
  assert.equal(at("2026-10-08T11:02:00Z"), "late");
  assert.equal(at("2026-10-08T11:06:00Z"), "down");
  assert.equal(evaluate({ ...base, lastFail: Date.parse("2026-10-08T10:20:00Z") }, Date.parse("2026-10-08T10:30:00Z")).state, "failed");
  assert.equal(evaluate({ ...base, lastStart: Date.parse("2026-10-08T11:00:10Z") }, Date.parse("2026-10-08T11:03:00Z")).state, "running");
  assert.equal(evaluate({ ...base, paused: true }, Date.parse("2026-10-09T00:00:00Z")).state, "paused");
  assert.equal(evaluate({ graceSeconds: 1, createdAt: 1 }, 5).state, "new");
});

test("a success ping after a failure clears the failed state", () => {
  const c = { periodSeconds: 3600, graceSeconds: 60, createdAt: 0, lastFail: 1000, lastPing: 2000 };
  assert.equal(evaluate(c, 3000).state, "up");
});

test("config validation", () => {
  assert.throws(() => validateConfig({ "Bad Name": { periodSeconds: 60 } }), /bad check name/);
  assert.throws(() => validateConfig({ a: {} }), /schedule/);
  assert.throws(() => validateConfig({ a: { schedule: "nope" } }), /expected 5 fields/);
  assert.equal(validateConfig({ a: { periodSeconds: 60 } }).a.graceSeconds, 300);
});

test("monitor alerts once on down, once on recovery, and not for a quiet new check", async () => {
  const alerts = [];
  const m = createMonitor({ config: { job: { periodSeconds: 3600, graceSeconds: 60 } }, notify: async (a) => alerts.push(a) });
  const t0 = 1_000_000_000_000;
  await m.tick(t0);
  assert.equal(alerts.length, 0);
  assert.ok(m.ping("job", "success", t0 + 10));
  await m.tick(t0 + 3_000_000);
  assert.equal(alerts.length, 0);
  await m.tick(t0 + 3_700_000);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /job is DOWN/);
  await m.tick(t0 + 3_800_000);
  assert.equal(alerts.length, 1, "no repeat alert while still down");
  m.ping("job", "success", t0 + 4_000_000);
  await m.tick(t0 + 4_010_000);
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].state, "recovered");
  assert.equal(m.ping("ghost", "success", t0), false);
});

test("a /fail ping alerts immediately and a failed notify is retried next tick", async () => {
  let fail = true; const alerts = [];
  const m = createMonitor({ config: { job: { periodSeconds: 3600 } }, notify: async (a) => { if (fail) throw new Error("webhook 500"); alerts.push(a); } });
  m.ping("job", "fail", 5000);
  await m.tick(6000);
  assert.equal(alerts.length, 0);
  fail = false;
  await m.tick(7000);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].state, "failed");
});

test("http: ping, start, fail, status, key and 404s", async () => {
  const m = createMonitor({ config: { job: { periodSeconds: 3600 } } });
  let saves = 0;
  const srv = http.createServer(handler(m, () => saves++, () => 5000));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p, o) => { const r = await fetch(base + p, o); return [r.status, await r.text()]; };
  assert.deepEqual(await get("/ping/job"), [200, "OK\n"]);
  assert.deepEqual(await get("/ping/job/start", { method: "POST" }), [200, "OK\n"]);
  assert.equal((await get("/ping/ghost"))[0], 404);
  assert.equal((await get("/ping/job/explode"))[0], 404);
  const [, body] = await get("/status");
  assert.equal(JSON.parse(body)[0].pings, 1);
  assert.equal(saves, 2);
  srv.close();
});
