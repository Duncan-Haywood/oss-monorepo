import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, tick, parseMonitors, checkHttp } from "./server.mjs";
import { newState } from "./monitor.mjs";

const T0 = Date.UTC(2026, 0, 10, 12);
const mons = parseMonitors(JSON.stringify([
  { id: "web", name: "Web <b>", url: "https://example.com", failAfter: 1 },
  { id: "cron", type: "push", token: "tok-123456789012" },
]));

async function boot(now = () => T0) {
  const state = newState();
  let saves = 0;
  const server = http.createServer(handler({ state, save: () => saves++, monitors: mons, adminKey: "k", title: "Acme", publicUrl: "https://s.example", now }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { state, base, saves: () => saves, close: () => server.close() };
}
const admin = { authorization: "Bearer k", "content-type": "application/json" };

test("parseMonitors validates ids, urls, push tokens and duplicates", () => {
  assert.throws(() => parseMonitors("[]"), /non-empty/);
  assert.throws(() => parseMonitors('[{"id":"A b","url":"https://x"}]'), /bad monitor id/);
  assert.throws(() => parseMonitors('[{"id":"a","url":"ftp://x"}]'), /http/);
  assert.throws(() => parseMonitors('[{"id":"a","type":"push","token":"short"}]'), /token/);
  assert.throws(() => parseMonitors('[{"id":"a","url":"https://x"},{"id":"a","url":"https://y"}]'), /duplicate/);
  assert.equal(parseMonitors('[{"id":"a","url":"https://x"}]')[0].intervalSec, 60);
});

test("the public page escapes names and is read-only without a key", async () => {
  const t = await boot();
  const html = await (await fetch(`${t.base}/`)).text();
  assert.match(html, /Web &lt;b&gt;/);
  assert.doesNotMatch(html, /Web <b>/);
  assert.equal((await fetch(`${t.base}/v1/incidents`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await fetch(`${t.base}/v1/incidents`, { method: "POST", body: "{}", headers: { authorization: "Bearer wrong" } })).status, 401);
  t.close();
});

test("admin API creates incidents, updates them and the public JSON reflects it", async () => {
  const t = await boot();
  const r = await fetch(`${t.base}/v1/incidents`, { method: "POST", headers: admin, body: JSON.stringify({ title: "Slow <script>", impact: "minor", message: "Investigating" }) });
  assert.equal(r.status, 201);
  const inc = await r.json();
  assert.equal((await fetch(`${t.base}/v1/incidents/${inc.id}/updates`, { method: "POST", headers: admin, body: JSON.stringify({ status: "resolved", message: "Fixed" }) })).status, 200);
  assert.equal((await fetch(`${t.base}/v1/incidents`, { method: "POST", headers: admin, body: JSON.stringify({ title: "" }) })).status, 400);
  assert.equal((await fetch(`${t.base}/v1/incidents/nope/updates`, { method: "POST", headers: admin, body: JSON.stringify({ status: "resolved" }) })).status, 404);
  const json = await (await fetch(`${t.base}/api/status.json`)).json();
  assert.equal(json.incidents[0].status, "resolved");
  assert.equal(json.status.indicator, "unknown");
  const feed = await (await fetch(`${t.base}/feed.xml`)).text();
  assert.match(feed, /Slow &lt;script&gt;/);
  assert.ok(t.saves() >= 2);
  t.close();
});

test("maintenance endpoint takes ISO dates", async () => {
  const t = await boot();
  const r = await fetch(`${t.base}/v1/maintenance`, { method: "POST", headers: admin, body: JSON.stringify({ title: "DB", startsAt: new Date(T0).toISOString(), endsAt: new Date(T0 + 3600_000).toISOString() }) });
  assert.equal(r.status, 201);
  assert.equal((await (await fetch(`${t.base}/api/status.json`)).json()).status.indicator, "maintenance");
  assert.equal((await fetch(`${t.base}/v1/maintenance`, { method: "POST", headers: admin, body: JSON.stringify({ title: "x", startsAt: "nope", endsAt: "nope" }) })).status, 400);
  t.close();
});

test("heartbeat needs the right token, and only on push monitors", async () => {
  const t = await boot();
  assert.equal((await fetch(`${t.base}/ping/cron?token=bad`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${t.base}/ping/web?token=x`, { method: "POST" })).status, 404);
  assert.equal((await fetch(`${t.base}/ping/cron?token=tok-123456789012`, { method: "POST" })).status, 200);
  assert.equal(t.state.monitors.cron.lastPingAt, T0);
  t.close();
});

test("badge reports the overall state", async () => {
  const t = await boot();
  const svg = await (await fetch(`${t.base}/badge.svg`)).text();
  assert.match(svg, /^<svg/);
  assert.match(svg, /waiting for the first checks/);
  t.close();
});

test("tick: alerts once on down and once on recovery, and respects the interval", async () => {
  const state = newState(), alerts = [];
  let status = 500, calls = 0;
  const fetchStub = async () => { calls++; return { status, text: async () => "hello" }; };
  const defs = [mons[0]];
  const deps = { fetch: fetchStub, alert: async (t) => alerts.push(t) };
  assert.equal(await tick(state, defs, T0, deps), true);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /DOWN.*HTTP 500/);
  assert.equal(await tick(state, defs, T0 + 10_000, deps), false);
  assert.equal(calls, 1);
  status = 200;
  await tick(state, defs, T0 + 61_000, deps);
  assert.equal(alerts.length, 2);
  assert.match(alerts[1], /recovered after 1m 1s/);
});

test("tick: a push monitor stays quiet before its first ping, then alerts on a missed one", async () => {
  const state = newState(), alerts = [], deps = { alert: async (t) => alerts.push(t) };
  const push = { ...mons[1], failAfter: 1, intervalSec: 60, graceSec: 0 };
  assert.equal(await tick(state, [push], T0, deps), false);
  state.monitors.cron = { ...state.monitors.cron, id: "cron", lastPingAt: T0, status: "unknown", streakFail: 0, streakOk: 0, days: {}, recent: [], lastCheckAt: null };
  await tick(state, [push], T0 + 30_000, deps);
  assert.equal(alerts.length, 0);
  await tick(state, [push], T0 + 200_000, deps);
  assert.equal(alerts.length, 1);
});

test("checkHttp: expected statuses, keyword match, timeouts and network errors", async () => {
  const base = { url: "https://x", timeoutMs: 50 };
  const f = (status, body = "") => async () => ({ status, text: async () => body });
  assert.equal((await checkHttp(base, f(204))).ok, true);
  assert.equal((await checkHttp(base, f(404))).error, "HTTP 404");
  assert.equal((await checkHttp({ ...base, expectStatus: [401] }, f(401))).ok, true);
  assert.equal((await checkHttp({ ...base, expectStatus: [200] }, f(301))).ok, false);
  assert.equal((await checkHttp({ ...base, contains: "Sign in" }, f(200, "<h1>Sign in</h1>"))).ok, true);
  assert.match((await checkHttp({ ...base, contains: "Sign in" }, f(200, "Error 500"))).error, /did not contain/);
  // AbortSignal.timeout is unref'd, so a real socket (here: a timer) must keep the loop alive.
  const slow = (url, { signal }) => new Promise((_, rej) => { const keep = setTimeout(() => {}, 1000); signal.addEventListener("abort", () => { clearTimeout(keep); rej(signal.reason); }); });
  assert.match((await checkHttp(base, slow)).error, /timed out after 50ms/);
  assert.match((await checkHttp(base, async () => { throw new Error("ECONNREFUSED"); })).error, /ECONNREFUSED/);
});

// ---- email subscriptions ----
async function bootMail() {
  const state = newState();
  const sent = [];
  const server = http.createServer(handler({ state, save: () => {}, monitors: mons, adminKey: "k", title: "Acme", publicUrl: "https://s.example", now: () => T0, sendEmail: async (m) => { sent.push(m); } }));
  await new Promise((r) => server.listen(0, r));
  return { state, sent, base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const form = (o) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });

test("without a mail sender the subscription routes do not exist and the page has no form", async () => {
  const t = await boot();
  assert.equal((await fetch(`${t.base}/subscribe`, form({ email: "a@b.co" }))).status, 404);
  assert.doesNotMatch(await (await fetch(`${t.base}/`)).text(), /action="\/subscribe"/);
  t.close();
});

test("subscribe, confirm, get an incident email, unsubscribe", async () => {
  const t = await bootMail();
  assert.match(await (await fetch(`${t.base}/`)).text(), /action="\/subscribe"/);
  const r = await fetch(`${t.base}/subscribe`, form({ email: "Ann@Example.com" }));
  assert.equal(r.status, 202);
  assert.equal(t.sent.length, 1);
  const token = new URL(t.sent[0].text.match(/https:\/\/s\.example\/confirm\?t=\S+/)[0]).searchParams.get("t");
  // Nothing goes out before confirmation.
  await fetch(`${t.base}/v1/incidents`, { method: "POST", headers: admin, body: JSON.stringify({ title: "Early", message: "x" }) });
  assert.equal(t.sent.length, 1);
  assert.equal((await fetch(`${t.base}/confirm?t=bad`)).status, 404);
  assert.equal((await fetch(`${t.base}/confirm?t=${token}`)).status, 200);
  const inc = await (await fetch(`${t.base}/v1/incidents`, { method: "POST", headers: admin, body: JSON.stringify({ title: "API slow", message: "Looking" }) })).json();
  assert.equal(t.sent.at(-1).to, "ann@example.com");
  assert.match(t.sent.at(-1).subject, /Incident: API slow/);
  await fetch(`${t.base}/v1/incidents/${inc.id}/updates`, { method: "POST", headers: admin, body: JSON.stringify({ status: "resolved", message: "Fixed" }) });
  assert.match(t.sent.at(-1).subject, /Resolved: API slow/);
  assert.equal((await (await fetch(`${t.base}/v1/subscribers`, { headers: admin })).json()).active, 1);
  // GET only shows a button (link scanners must not unsubscribe anyone); POST does it.
  assert.equal((await fetch(`${t.base}/unsubscribe?t=${token}`)).status, 200);
  assert.equal(t.state.subscribers.length, 1);
  assert.equal((await fetch(`${t.base}/unsubscribe?t=${token}`, { method: "POST" })).status, 200);
  assert.equal(t.state.subscribers.length, 0);
  const n = t.sent.length;
  await fetch(`${t.base}/v1/maintenance`, { method: "POST", headers: admin, body: JSON.stringify({ title: "DB", startsAt: "2026-02-01T00:00:00Z", endsAt: "2026-02-01T01:00:00Z" }) });
  assert.equal(t.sent.length, n);
  t.close();
});

test("the form answers identically for new and known addresses and rejects bad input and bots", async () => {
  const t = await bootMail();
  const a = await fetch(`${t.base}/subscribe`, form({ email: "a@b.co" }));
  const b = await fetch(`${t.base}/subscribe`, form({ email: "a@b.co" }));
  assert.equal(a.status, b.status);
  assert.equal(t.sent.length, 1);
  assert.equal((await fetch(`${t.base}/subscribe`, form({ email: "nope" }))).status, 400);
  const bot = await fetch(`${t.base}/subscribe`, form({ email: "x@y.co", website: "http://spam" }));
  assert.equal(bot.status, 202);
  assert.equal(t.sent.length, 1);
  t.close();
});

test("a down check emails confirmed subscribers via tick", async () => {
  const state = newState();
  state.subscribers = [{ email: "a@b.co", status: "active", token: "t", createdAt: T0, confirmedAt: T0 }];
  const sent = [];
  const meta = { title: "Acme", publicUrl: "https://s.example" };
  const { notifyAll } = await import("./subscribers.mjs");
  const notify = (ev) => notifyAll(state, ev, meta, async (m) => sent.push(m));
  await tick(state, [mons[0]], T0, { fetch: async () => ({ status: 500 }), notify });
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Incident: Web <b> is not responding/);
  await tick(state, [mons[0]], T0 + 120_000, { fetch: async () => ({ status: 200, text: async () => "" }), notify });
  assert.match(sent[1].subject, /Resolved/);
});
