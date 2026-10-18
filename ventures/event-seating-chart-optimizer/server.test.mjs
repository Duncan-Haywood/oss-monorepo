import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildPlan } from "./server.mjs";

const env = { ADMIN_KEY: "adm", GUEST_TOKEN: "tok" };
async function boot(e = env) {
  const state = emptyState();
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, e));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, saves: () => saves, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("refuses to serve without both secrets, and checks each link", async () => {
  const a = await boot({});
  assert.equal((await fetch(a.base + "/find?t=x")).status, 503);
  assert.equal((await fetch(a.base + "/healthz")).status, 200);
  a.close();
  const b = await boot();
  assert.equal((await fetch(b.base + "/find")).status, 401);
  assert.equal((await fetch(b.base + "/find?t=wrong")).status, 401);
  assert.equal((await fetch(b.base + "/admin?key=tok")).status, 401);
  assert.equal((await fetch(b.base + "/admin?key=adm")).status, 200);
  b.close();
});

test("guests see nothing until published; then a name finds a table and tablemates, never meals", async () => {
  const s = await boot();
  assert.match(await (await fetch(s.base + "/find?t=tok")).text(), /not been published/);
  const r = await post(s.base + "/admin/save?key=adm", { ...s.state.fields, guests: "Ana Lopez | | | vegan\nBen Ortiz\nCy Dunn", rules: "Ana Lopez + Ben Ortiz", seats: "2", act: "publish" });
  assert.equal(r.status, 303);
  assert.ok(s.state.plan);
  assert.ok(s.saves() > 0);
  const html = await (await fetch(s.base + "/find?t=tok&q=lopez")).text();
  assert.match(html, /Ana Lopez/);
  assert.match(html, /Table \d/);
  assert.match(html, /Ben Ortiz/);
  assert.doesNotMatch(html, /vegan/);
  assert.match(html, /noindex/);
  assert.match(await (await fetch(s.base + "/find?t=tok&q=zzz")).text(), /No guest matches/);
  s.close();
});

test("an invalid plan is not published and the error is shown", async () => {
  const s = await boot();
  const r = await post(s.base + "/admin/save?key=adm", { ...s.state.fields, guests: "Ana\nAna", act: "publish" });
  assert.equal(r.status, 400);
  assert.equal(s.state.plan, null);
  s.close();
});

test("guest text is escaped on both pages", async () => {
  const s = await boot();
  s.state.fields.guests = '<script>alert(1)</script>';
  assert.doesNotMatch(await (await fetch(s.base + "/admin?key=adm")).text(), /<script>alert/);
  s.state.plan = { tables: [{ number: 1, guests: ["<img src=x onerror=alert(1)>"] }] };
  const t = await (await fetch(s.base + "/find?t=tok&q=img")).text();
  assert.doesNotMatch(t, /<img src=x/);
  s.close();
});

test("buildPlan seats the sample and reports table sizes", () => {
  const out = buildPlan(emptyState().fields);
  assert.ok(!out.error, out.error);
  assert.ok(out.tables.length >= 2);
});

test("guests pick a meal after finding their table; admin sees the tally and a CSV", async () => {
  const s = await boot();
  await post(s.base + "/admin/save?key=adm", { ...s.state.fields, guests: "Ana Lopez\nBen Ortiz\nCy Dunn", rules: "", seats: "4", meals: "Chicken, Fish", act: "publish" });
  assert.match(await (await fetch(s.base + "/find?t=tok&q=lopez")).text(), /<select name="meal">/);
  const ok = await post(s.base + "/find/meal?t=tok", { name: "Ana Lopez", meal: "Fish", q: "lopez" });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Saved Ana Lopez: Fish/);
  assert.equal(s.state.choices["Ana Lopez"], "Fish");
  assert.equal((await post(s.base + "/find/meal?t=tok", { name: "Ana Lopez", meal: "Steak" })).status, 400);
  assert.equal((await post(s.base + "/find/meal?t=tok", { name: "Nobody", meal: "Fish" })).status, 400);
  assert.equal((await post(s.base + "/find/meal?t=wrong", { name: "Ana Lopez", meal: "Fish" })).status, 401);
  assert.match(await (await fetch(s.base + "/admin?key=adm")).text(), /1 of 3 guests have chosen\. Fish: 1/);
  const csv = await (await fetch(s.base + "/admin/meals.csv?key=adm")).text();
  assert.match(csv, /Ana Lopez,\d,Fish/);
  assert.match(csv, /Ben Ortiz,\d,\n/);
  assert.equal((await fetch(s.base + "/admin/meals.csv?key=tok")).status, 401);
  // republishing without a guest drops their pick
  await post(s.base + "/admin/save?key=adm", { ...s.state.fields, guests: "Ben Ortiz\nCy Dunn", act: "publish" });
  assert.deepEqual(s.state.choices, {});
  s.close();
});

test("meal picks are off when no choices are configured", async () => {
  const s = await boot();
  await post(s.base + "/admin/save?key=adm", { ...s.state.fields, guests: "Ana Lopez\nBen Ortiz", rules: "", seats: "4", act: "publish" });
  assert.ok(s.state.plan);
  assert.doesNotMatch(await (await fetch(s.base + "/find?t=tok&q=lopez")).text(), /<select/);
  assert.equal((await post(s.base + "/find/meal?t=tok", { name: "Ana Lopez", meal: "Fish" })).status, 400);
  s.close();
});
