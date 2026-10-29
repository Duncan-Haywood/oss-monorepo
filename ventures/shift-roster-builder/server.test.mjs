import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, webhookBody, notifier } from "./server.mjs";

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

test("a trade request is checked against the rules and applied only when the manager approves", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, any";
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon, 9, 17, 1, day\nTue, 9, 13, 1, am" });
  const a = s.state.published.assignments, A = a[0], B = a.find((x) => x.person !== A.person);
  const val = (x) => [x.person, x.slot.day, x.slot.startMin, x.slot.endMin].join("|");
  const team = await (await fetch(s.base + "/team?t=tm")).text();
  assert.match(team, /Want to trade shifts\?/);
  assert.equal((await post(s.base + "/team/trade?t=tm", { mine: val(A), theirs: val(A) })).status, 400);
  assert.equal((await post(s.base + "/team/trade?t=tm", { mine: val(A), theirs: "Nobody|0|1|2" })).status, 400);
  assert.equal((await post(s.base + "/team/trade?t=wrong", { mine: val(A), theirs: val(B) })).status, 401);
  assert.equal((await post(s.base + "/team/trade?t=tm", { mine: val(A), theirs: val(B), note: "<b>x</b>" })).status, 200);
  assert.equal(s.state.trades.length, 1);
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Trade requests \(1\)/);
  assert.match(admin, /Keeps both weeks inside the rules/);
  assert.doesNotMatch(admin, /<b>x/);
  const [pa, pb] = [A.person, B.person];
  const r = await post(s.base + "/admin/trade?key=adm", { i: "0", act: "approve" });
  assert.equal(r.status, 303);
  assert.equal(s.state.trades.length, 0);
  assert.equal(A.person, pb);
  assert.equal(B.person, pa);
  const hours = Object.fromEntries(s.state.published.people.map((p) => [p.name, p.hours]));
  assert.equal(hours[pa] + hours[pb], 12);
  s.close();
});

test("a declined trade changes nothing and a blocked one cannot be approved", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon 9-17\nBen, 20, 40, 0, Tue 9-17";
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon, 9, 17, 1, mon\nTue, 9, 17, 1, tue" });
  const [A, B] = s.state.published.assignments;
  const val = (x) => [x.person, x.slot.day, x.slot.startMin, x.slot.endMin].join("|");
  await post(s.base + "/team/trade?t=tm", { mine: val(A), theirs: val(B) });
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Blocked:/);
  const before = A.person;
  await post(s.base + "/admin/trade?key=adm", { i: "0", act: "approve" });
  assert.equal(A.person, before);
  assert.equal(s.state.trades.length, 1);
  await post(s.base + "/admin/trade?key=adm", { i: "0", act: "decline" });
  assert.equal(s.state.trades.length, 0);
  assert.equal(A.person, before);
  s.close();
});

test("an open-shift request shows the rule it breaks and is applied only when the manager approves", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 20, 40, 0, Mon 9-17\nBen, 20, 40, 0, Tue 9-17";
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon, 9, 17, 2, mon" });
  const open = s.state.published.assignments.find((a) => !a.person);
  assert.ok(open, "one Monday copy has nobody free");
  const val = [open.slot.day, open.slot.startMin, open.slot.endMin].join("|");
  assert.match(await (await fetch(s.base + "/team?t=tm")).text(), /Open shifts you can pick up/);
  assert.equal((await post(s.base + "/team/claim?t=wrong", { shift: val, name: "Ben" })).status, 401);
  assert.equal((await post(s.base + "/team/claim?t=tm", { shift: "0|1|2", name: "Ben" })).status, 400);
  assert.equal((await post(s.base + "/team/claim?t=tm", { shift: val, name: "Nobody" })).status, 400);
  assert.equal((await post(s.base + "/team/claim?t=tm", { shift: val, name: "Ben", note: "<b>x</b>" })).status, 200);
  assert.equal((await post(s.base + "/team/claim?t=tm", { shift: val, name: "Ben" })).status, 200);
  assert.equal(s.state.claims.length, 1, "a repeat ask is not queued twice");
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Open-shift requests \(1\)/);
  assert.match(admin, /Blocked:/);
  assert.doesNotMatch(admin, /<b>x/);
  assert.doesNotMatch(admin, /value="approve"/, "a ask that breaks a rule has no plain Approve");
  await post(s.base + "/admin/claim?key=adm", { i: "0", act: "approve" });
  assert.equal(open.person, null, "plain approve cannot override");
  await post(s.base + "/admin/claim?key=adm", { i: "0", act: "decline" });
  assert.equal(s.state.claims.length, 0);
  await post(s.base + "/team/claim?t=tm", { shift: val, name: "Ben" });
  const unfilled = s.state.published.unfilled, hours = s.state.published.people.find((p) => p.name === "Ben").hours;
  const r = await post(s.base + "/admin/claim?key=adm", { i: "0", act: "override" });
  assert.equal(r.status, 303);
  assert.equal(open.person, "Ben");
  assert.equal(s.state.published.unfilled, unfilled - 1);
  assert.equal(s.state.published.people.find((p) => p.name === "Ben").hours, hours + 8);
  assert.equal(s.state.claims.length, 0);
  assert.doesNotMatch(await (await fetch(s.base + "/team?t=tm")).text(), /Open shifts you can pick up/);
  s.close();
});

test("time-off request: staff ask, manager approves into the staff list's off: cell", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, any, off: Fri";
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day" });
  assert.match(await (await fetch(s.base + "/team?t=tm")).text(), /Need days off\?/);
  const bad = await post(s.base + "/team/timeoff?t=tm", { name: "Ana", from: "2026-13-40" });
  assert.equal(bad.status, 400);
  assert.equal((await post(s.base + "/team/timeoff?t=tm", { name: "Zed", from: "2026-11-04" })).status, 400);
  assert.equal((await post(s.base + "/team/timeoff?t=tm", { name: "Ana", from: "2026-11-06", to: "2026-11-04" })).status, 400);
  assert.equal((await post(s.base + "/team/timeoff?t=tm", { name: "Ana", from: "2026-11-04", to: "2026-11-06", note: "<b>trip</b>" })).status, 200);
  await post(s.base + "/team/timeoff?t=tm", { name: "Ana", from: "2026-11-04", to: "2026-11-06" });
  await post(s.base + "/team/timeoff?t=tm", { name: "Ben", from: "2026-11-09" });
  assert.equal(s.state.offs.length, 2);
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Time-off requests \(2\)/);
  assert.match(admin, /2026-11-04 to 2026-11-06 off/);
  assert.doesNotMatch(admin, /<b>trip/);
  assert.equal((await post(s.base + "/admin/timeoff?key=adm", { i: "0", act: "approve" })).status, 303);
  assert.match(s.state.staff, /Ana, 23\.17, 40, 0, any, off: 2026-11-04\.\.2026-11-06/);
  await post(s.base + "/admin/timeoff?key=adm", { i: "0", act: "approve" });
  assert.match(s.state.staff, /Ben, 19\.43, 40, 0, any, off: Fri; 2026-11-09/);
  assert.equal(s.state.offs.length, 0);
  await post(s.base + "/team/timeoff?t=tm", { name: "Ana", from: "2026-12-01" });
  await post(s.base + "/admin/timeoff?key=adm", { i: "0", act: "decline" });
  assert.equal(s.state.offs.length, 0);
  assert.doesNotMatch(s.state.staff, /2026-12-01/);
  s.close();
});

test("staff page installs as an app and works offline; assets need the team token", async () => {
  const s = await boot();
  const html = await (await fetch(s.base + "/team?t=tm")).text();
  assert.match(html, /rel="manifest" href="\/team\/manifest\.webmanifest\?t=tm"/);
  assert.match(html, /serviceWorker/);
  for (const p of ["manifest.webmanifest", "icon.svg", "sw.js"]) {
    assert.equal((await fetch(s.base + "/team/" + p)).status, 401, p);
    assert.equal((await fetch(s.base + "/team/" + p + "?t=adm")).status, 401, p);
  }
  const m = await fetch(s.base + "/team/manifest.webmanifest?t=tm");
  assert.match(m.headers.get("content-type"), /manifest\+json/);
  const j = await m.json();
  assert.equal(j.start_url, "/team?t=tm");
  assert.equal(j.display, "standalone");
  const sw = await fetch(s.base + "/team/sw.js?t=tm");
  assert.equal(sw.headers.get("service-worker-allowed"), "/team");
  const code = await sw.text();
  assert.match(code, /pathname!=="\/team"/); // only the schedule page is cached, never admin or POSTs
  assert.doesNotMatch(code, /admin/);
  assert.equal((await fetch(s.base + "/team/icon.svg?t=tm")).headers.get("content-type"), "image/svg+xml");
  s.close();
});

test("admin lists a text and email link per person with their shifts, and nothing is sent", async () => {
  const s = await boot();
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, any";
  assert.doesNotMatch(await (await fetch(s.base + "/admin?key=adm")).text(), /Tell the team/);
  await post(s.base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day" });
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Tell the team/);
  assert.equal((admin.match(/href="sms:\?&amp;body=Hi%20/g) || []).length, 2);
  assert.equal((admin.match(/href="mailto:\?subject=Your%20shifts%2C%20week%20of%202026-10-19&amp;body=Hi%20/g) || []).length, 2);
  assert.match(admin, /Hi%20Ana%2C%20your%20shifts%20this%20week/);
  s.close();
});

test("webhook alerts: manager ask, team publish, no secrets, bad webhook harmless", async () => {
  const calls = [];
  const fakeFetch = async (url, o) => { calls.push({ url, body: o.body, type: o.headers["content-type"] }); return { ok: true }; };
  const state = emptyState();
  const e = { ...env, NOTIFY_WEBHOOK_URL: "http://hook.test/m", TEAM_WEBHOOK_URL: "http://hook.test/t", PUBLIC_URL: "https://roster.example/" };
  const srv = http.createServer(handler(state, () => {}, e, () => Date.UTC(2026, 9, 18), fakeFetch));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const staff = "name, wage, max hours, min hours, availability\nAna, 23.17, 40, 0, any\nBen, 19.43, 40, 0, any";
  await post(base + "/admin/save?key=adm", { act: "publish", weekStart: "2026-10-19", staff, shifts: "day, start, end, people needed, label\nMon-Fri, 9, 17, 1, day" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://hook.test/t");
  const team = JSON.parse(calls[0].body).text;
  assert.match(team, /Ana|Ben/);
  assert.doesNotMatch(team, /23\.17|19\.43|adm\b/);
  const p = state.published.assignments[0];
  await post(base + "/team/callout?t=tm", { shift: `${p.person}|${p.slot.day}|${p.slot.startMin}|${p.slot.endMin}`, note: "<!channel> sick & tired" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "http://hook.test/m");
  const mgr = JSON.parse(calls[1].body).text;
  assert.match(mgr, /cannot make/);
  assert.match(mgr, /&lt;!channel&gt; sick &amp; tired/);
  assert.match(mgr, /https:\/\/roster\.example\/admin/);
  assert.doesNotMatch(mgr, /key=|adm\b/);
  srv.close();
});

test("webhook formats and a failing webhook never block the staff request", async () => {
  assert.deepEqual(JSON.parse(webhookBody("discord", "hi @everyone").body), { content: "hi @everyone", allowed_mentions: { parse: [] } });
  assert.equal(webhookBody("ntfy", "hi").type, "text/plain; charset=utf-8");
  assert.equal(await notifier({}, async () => { throw new Error("x"); }).manager("a"), false);
  assert.equal(await notifier({ NOTIFY_WEBHOOK_URL: "ftp://x" }, async () => ({ ok: true })).manager("a"), false);
  assert.equal(await notifier({ NOTIFY_WEBHOOK_URL: "http://x" }, async () => { throw new Error("down"); }).manager("a"), false);
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, { ...env, NOTIFY_WEBHOOK_URL: "http://hook.test/m" }, () => Date.UTC(2026, 9, 18), async () => { throw new Error("down"); }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const r = await post(`http://127.0.0.1:${srv.address().port}/team/reply?t=tm`, { line: "Ana | Mon-Fri 9-17 | max: 20" });
  assert.equal(r.status, 200);
  assert.equal(state.replies.length, 1);
  srv.close();
});
