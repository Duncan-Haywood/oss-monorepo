import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState } from "./server.mjs";

const env = { ADMIN_KEY: "adm", TEAM_TOKEN: "tm" };
async function boot(e = env) {
  const state = emptyState();
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, e, () => Date.UTC(2026, 9, 18)));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { state, base, saves: () => saves, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", body: new URLSearchParams(body), redirect: "manual" });

test("refuses to run without both secrets", async () => {
  const s = await boot({});
  assert.equal((await fetch(s.base + "/healthz")).status, 200);
  assert.equal((await fetch(s.base + "/admin?key=x")).status, 503);
  s.close();
});

test("admin and team links are separate secrets", async () => {
  const s = await boot();
  assert.equal((await fetch(s.base + "/admin")).status, 401);
  assert.equal((await fetch(s.base + "/admin?key=tm")).status, 401);
  assert.equal((await fetch(s.base + "/team?t=adm")).status, 401);
  assert.equal((await fetch(s.base + "/admin?key=adm")).status, 200);
  assert.equal((await fetch(s.base + "/team?t=tm")).status, 200);
  s.close();
});

test("publish shows shifts to staff but never wages or payroll", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, any";
  const r = await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day" });
  assert.equal(r.status, 303);
  const html = await (await fetch(s.base + "/team?t=tm")).text();
  assert.match(html, /Ana/);
  assert.match(html, /week of 2026-10-19/);
  assert.doesNotMatch(html, /23\.17|19\.43|payroll/i);
  const ics = await fetch(s.base + "/team/ics?t=tm&person=Ana");
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  assert.match(await ics.text(), /BEGIN:VEVENT/);
  assert.equal((await fetch(s.base + "/team/ics?t=tm&person=Nobody")).status, 404);
  s.close();
});

test("publish reports a bad roster instead of storing it", async () => {
  const s = await boot();
  const r = await post(s.base + "/admin/save?key=adm", { act: "publish", staff: "", shifts: "" });
  assert.equal(r.status, 400);
  assert.equal(s.state.published, null);
  s.close();
});

test("availability replies are validated, escaped, then merged by the manager", async () => {
  const s = await boot();
  await post(s.base + "/admin/save?key=adm", { act: "save", staff: "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, any", shifts: "" });
  const bad = await post(s.base + "/team/reply?t=tm", { line: "<script>x</script>" });
  assert.equal(bad.status, 400);
  assert.doesNotMatch(await bad.text(), /<script>x/);
  assert.equal((await post(s.base + "/team/reply?t=tm", { line: "Ana | Mon-Fri 9-17 | max: 20" })).status, 200);
  assert.equal(s.state.replies.length, 1);
  assert.equal((await post(s.base + "/team/reply?t=wrong", { line: "Ana | any" })).status, 401);
  await post(s.base + "/admin/merge?key=adm", {});
  assert.equal(s.state.replies.length, 0);
  assert.match(s.state.staff, /Ana, 20, 20, 0, Mon-Fri 9-17/);
  s.close();
});

test("oversized bodies are rejected", async () => {
  const s = await boot();
  const r = await post(s.base + "/team/reply?t=tm", { line: "x".repeat(70000) });
  assert.equal(r.status, 413);
  s.close();
});

test("a call-out reaches the manager with who could cover, and staff never see wages", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, Mon 9-17\nBen, 19.43, 40, 0, any\nCy, 17.10, 40, 0, Tue-Fri 9-17";
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon, 9, 17, 1, day" });
  const team = await (await fetch(s.base + "/team?t=tm")).text();
  assert.match(team, /Cannot make a shift\?/);
  const shift = s.state.published.assignments.find((a) => a.person);
  const val = [shift.person, shift.slot.day, shift.slot.startMin, shift.slot.endMin].join("|");
  assert.equal((await post(s.base + "/team/callout?t=tm", { shift: "Nobody|0|1|2" })).status, 400);
  assert.equal((await post(s.base + "/team/callout?t=wrong", { shift: val })).status, 401);
  const ok = await post(s.base + "/team/callout?t=tm", { shift: val, note: "<b>sick</b>\nbad" });
  assert.equal(ok.status, 200);
  assert.equal(s.state.callouts.length, 1);
  assert.doesNotMatch(s.state.callouts[0].note, /\n/);
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Call-outs \(1\)/);
  assert.match(admin, /&lt;b&gt;sick/);
  assert.doesNotMatch(admin, /<b>sick/);
  assert.match(admin, /Could cover/);
  const other = shift.person === "Ana" ? "Ben" : "Ana";
  assert.match(admin, new RegExp(`${other} \\(`));
  await post(s.base + "/admin/clear-callouts?key=adm", {});
  assert.equal(s.state.callouts.length, 0);
  s.close();
});
