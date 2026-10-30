import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";

const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" };
async function boot(e = env) {
  const state = emptyState();
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, e));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { state, base, saves: () => saves, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("refuses to serve without both secrets, and checks each link", async () => {
  const a = await boot({});
  assert.equal((await fetch(a.base + "/league?t=x")).status, 503);
  assert.equal((await fetch(a.base + "/healthz")).status, 200);
  a.close();
  const b = await boot();
  assert.equal((await fetch(b.base + "/league")).status, 401);
  assert.equal((await fetch(b.base + "/league?t=wrong")).status, 401);
  assert.equal((await fetch(b.base + "/admin?key=tok")).status, 401);
  assert.equal((await fetch(b.base + "/admin?key=adm")).status, 200);
  b.close();
});

test("nothing is visible to players until published; then fixtures, table and per-team calendar", async () => {
  const s = await boot();
  assert.match(await (await fetch(s.base + "/league?t=tok")).text(), /No schedule has been published/);
  s.state.fields.results = "Net Ninjas 3 - 1 Lob Squad";
  const r = await post(s.base + "/admin/save?key=adm", { ...Object.fromEntries(Object.entries(s.state.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v === false ? "" : String(v)])), act: "publish" });
  assert.equal(r.status, 303);
  assert.equal(s.state.published, true);
  assert.ok(s.saves() > 0);
  const html = await (await fetch(s.base + "/league?t=tok")).text();
  assert.match(html, /Standings/);
  assert.match(html, /Net Ninjas/);
  assert.match(html, /noindex/);
  const ics = await fetch(s.base + "/league/ics?t=tok&team=0");
  assert.match(ics.headers.get("content-type"), /calendar/);
  assert.match(await ics.text(), /BEGIN:VEVENT/);
  assert.equal((await fetch(s.base + "/league/ics?t=tok&team=99")).status, 404);
  assert.doesNotMatch(await (await fetch(s.base + "/league/ics?t=tok&team=0")).text(), /VALARM/);
  assert.match(await (await fetch(s.base + "/league/ics?t=tok&team=0&alarm=60")).text(), /TRIGGER:-PT60M/);
  s.close();
});

test("an invalid league is not published and the error is shown", async () => {
  const s = await boot();
  const r = await post(s.base + "/admin/save?key=adm", { teams: "Only One", start: "2026-10-06", weekdays: "Tue", courts: "C1", times: "18:00", act: "publish" });
  assert.equal(r.status, 400);
  assert.equal(s.state.published, false);
  s.close();
});

test("player text is escaped on the admin page", async () => {
  const s = await boot();
  s.state.fields.teams = '<script>alert(1)</script>';
  const t = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.doesNotMatch(t, /<script>alert/);
  s.close();
});

test("buildLeague on the sample returns a table once results are typed", () => {
  const f = emptyState().fields;
  assert.equal(buildLeague(f).table, null);
  f.results = "Net Ninjas 2 - 2 Lob Squad";
  assert.equal(buildLeague(f).table.length, 6);
});

test("repeated wrong links from one address are locked out, right links from another still work", async () => {
  const s = await boot();
  for (let i = 0; i < 10; i++) assert.equal((await fetch(s.base + "/admin?key=guess" + i)).status, 401);
  const locked = await fetch(s.base + "/admin?key=adm");
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  assert.equal((await fetch(s.base + "/healthz")).status, 200);
  const other = await fetch(s.base + "/admin?key=adm", { headers: { "x-forwarded-for": "203.0.113.9" } });
  assert.equal(other.status, 200);
  s.close();
});

test("a captain's score waits for the organiser, and only approval puts it in the table", async () => {
  const s = await boot();
  s.state.published = true;
  assert.match(await (await fetch(s.base + "/league?t=tok")).text(), /Report a score/);
  assert.equal((await post(s.base + "/league/result?t=wrong", { home: "0", away: "1", hs: "2", as: "1" })).status, 401);
  for (const bad of [{ home: "0", away: "0", hs: "1", as: "1" }, { home: "0", away: "99", hs: "1", as: "1" }, { home: "0", away: "1", hs: "-1", as: "1" }, { home: "0", away: "1", hs: "1.5", as: "1" }]) {
    assert.equal((await post(s.base + "/league/result?t=tok", bad)).status, 400);
  }
  assert.equal(s.state.pending.length, 0);
  const ok = await post(s.base + "/league/result?t=tok", { home: "0", away: "1", hs: "4", as: "2" });
  assert.equal(ok.status, 200);
  assert.equal(s.state.pending.length, 1);
  assert.equal(s.state.fields.results, "");
  const [a, b] = buildLeague(s.state.fields).schedule.teams;
  assert.match(await (await fetch(s.base + "/admin?key=adm")).text(), new RegExp(`Scores waiting.*${a} 4 - 2 ${b}`, "s"));
  assert.equal((await post(s.base + "/admin/result?key=adm", { i: "0", act: "approve" })).status, 303);
  assert.equal(s.state.pending.length, 0);
  assert.equal(s.state.fields.results, `${a} 4 - 2 ${b}`);
  assert.equal(buildLeague(s.state.fields).table.length, 6);
  await post(s.base + "/league/result?t=tok", { home: "1", away: "0", hs: "0", as: "0" });
  await post(s.base + "/admin/result?key=adm", { i: "0", act: "decline" });
  assert.equal(s.state.pending.length, 0);
  assert.equal(s.state.fields.results, `${a} 4 - 2 ${b}`);
  s.close();
});

test("unpublished leagues take no scores; the waiting list is capped", async () => {
  const s = await boot();
  assert.equal((await post(s.base + "/league/result?t=tok", { home: "0", away: "1", hs: "1", as: "0" })).status, 404);
  s.state.published = true;
  for (let i = 0; i < 100; i++) await post(s.base + "/league/result?t=tok", { home: "0", away: "1", hs: "1", as: "0" });
  assert.equal((await post(s.base + "/league/result?t=tok", { home: "0", away: "1", hs: "1", as: "0" })).status, 429);
  assert.equal(s.state.pending.length, 100);
  s.close();
});
