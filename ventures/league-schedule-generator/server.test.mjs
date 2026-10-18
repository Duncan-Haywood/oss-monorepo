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
