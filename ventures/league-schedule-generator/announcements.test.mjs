import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { captainKey } from "./confirm.mjs";
import { parseNotice, addNotice, removeNotice, liveNotices, noticeBody, noticesHtml, noticeEmails, MAX_NOTICES, MAX_NOTICE } from "./announcements.mjs";

const teams = ["Hawks", "Owls", "Wrens"];
const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]));
const day = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86400000);
const today = day("2026-11-18");

test("parseNotice: text required and capped, dates checked, one team or everyone", () => {
  assert.match(parseNotice(form({ text: "  " }), teams, today).error, /Write the notice/);
  assert.match(parseNotice(form({ text: "x".repeat(MAX_NOTICE + 1) }), teams, today).error, /under 1000/);
  assert.match(parseNotice(form({ text: "hi", until: "18/11/2026" }), teams, today).error, /YYYY-MM-DD/);
  assert.match(parseNotice(form({ text: "hi", until: "2027-02-30" }), teams, today).error, /YYYY-MM-DD/);
  assert.match(parseNotice(form({ text: "hi", until: "2026-13-01" }), teams, today).error, /YYYY-MM-DD/);
  assert.match(parseNotice(form({ text: "hi", until: "2026-11-17" }), teams, today).error, /in the past/);
  assert.match(parseNotice(form({ text: "hi", until: "2028-01-01" }), teams, today).error, /more than a year/);
  assert.match(parseNotice(form({ text: "hi", team: "7" }), teams, today).error, /Pick a team/);
  assert.equal(parseNotice(form({ text: "hi" }), teams, today).notice.until, today + 14);
  const n = parseNotice(form({ text: "Fees due\r\nFriday", until: "2026-11-18", team: "1" }), teams, today, 5).notice;
  assert.deepEqual(n, { text: "Fees due\nFriday", until: today, team: "Owls", at: 5 });
});

test("notices: newest first, capped, removed by id, live by date and audience", () => {
  const state = {};
  for (let i = 0; i < MAX_NOTICES + 3; i++) addNotice(state, { text: `n${i}`, until: today + (i % 2), team: null, at: i });
  assert.equal(state.notices.length, MAX_NOTICES);
  assert.equal(state.notices[0].text, `n${MAX_NOTICES + 2}`);
  assert.ok(removeNotice(state, state.notices[0].id));
  assert.equal(removeNotice(state, 9999), false);
  const s2 = {};
  addNotice(s2, { text: "all", until: today, team: null, at: 1 });
  addNotice(s2, { text: "owls", until: today, team: "Owls", at: 2 });
  addNotice(s2, { text: "old", until: today - 1, team: null, at: 0 });
  assert.deepEqual(liveNotices(s2.notices, today).map((n) => n.text), ["all"]);
  assert.deepEqual(liveNotices(s2.notices, today, "Owls").map((n) => n.text), ["owls", "all"]);
  assert.deepEqual(liveNotices(s2.notices, today, "Hawks").map((n) => n.text), ["all"]);
  assert.deepEqual(liveNotices(s2.notices, today + 1), []);
  assert.equal(noticesHtml(s2.notices, today + 1), "");
});

test("noticeBody: escaped, line breaks kept, only https links clickable", () => {
  assert.equal(noticeBody('<b>x</b> "y"\nz'), "&lt;b&gt;x&lt;/b&gt; &quot;y&quot;<br>z");
  assert.equal(noticeBody("Pay at https://pay.example.org/l?a=1&b=2."), 'Pay at <a href="https://pay.example.org/l?a=1&amp;b=2" rel="noopener nofollow">https://pay.example.org/l?a=1&amp;b=2</a>.');
  assert.doesNotMatch(noticeBody("javascript:alert(1) http://x.org"), /<a /);
  assert.doesNotMatch(noticeBody('https://x.org/"onmouseover=alert(1)'), /"onmouseover/);
});

test("noticeEmails: one per team with contacts, a team notice to that team only", () => {
  const contacts = { Hawks: ["h@example.org"], Owls: ["o@example.org", "o2@example.org"] };
  const all = noticeEmails({ text: "Courts 3-4 closed Tuesday\nUse 1-2.", team: null }, contacts, teams, { leagueTitle: "Tuesday league", leagueUrl: "https://l.example.org/league?t=tok" });
  assert.deepEqual(all.emails.map((e) => e.team), ["Hawks", "Owls"]);
  assert.deepEqual(all.missing, ["Wrens"]);
  assert.equal(all.emails[0].subject, "Tuesday league: Courts 3-4 closed Tuesday…");
  assert.ok(all.emails[1].text.includes("Use 1-2.") && all.emails[1].text.includes("https://l.example.org/league?t=tok"));
  assert.deepEqual(all.emails[1].to, ["o@example.org", "o2@example.org"]);
  const one = noticeEmails({ text: "Your fee is due", team: "Owls" }, contacts, teams);
  assert.deepEqual(one.emails.map((e) => e.team), ["Owls"]);
  assert.equal(one.emails[0].subject, "League: Your fee is due");
});

const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: post a notice, players see it, a team notice only on that captain's page, emailed, removed", async () => {
  const state = emptyState();
  state.published = true;
  state.fields.contacts = "Net Ninjas: nn@example.org\nLob Squad: ls@example.org";
  const names = buildLeague(state.fields).schedule.teams;
  const sent = [];
  const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", PUBLIC_URL: "https://league.example.org" };
  const srv = http.createServer(handler(state, () => {}, env, Date.now, async (cfg, msg) => { sent.push(msg); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  assert.match(await (await fetch(`${base}/admin?key=adm`)).text(), /<h2>Notices<\/h2>/);
  // the public sign-up path and the player link cannot post
  assert.equal((await post(`${base}/admin/notice?key=bad`, { text: "x" })).status, 401);
  let r = await post(`${base}/admin/notice?key=adm`, { text: "Courts 3-4 closed <Tuesday>", email: "1" });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Notice posted on the league page\. Emailing 2 teams\. No contact address for/);
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(sent.map((m) => m.team).sort(), ["Lob Squad", "Net Ninjas"]);
  assert.ok(sent[0].text.includes("https://league.example.org/league?t=tok"));
  assert.ok(!sent[0].text.includes("&c="), "no captain key in a shared email");
  const player = await (await fetch(`${base}/league?t=tok`)).text();
  assert.match(player, /From the organiser/);
  assert.match(player, /Courts 3-4 closed &lt;Tuesday&gt;/);
  // a notice for one team: on its captain page only, not emailed when the box is not ticked
  r = await post(`${base}/admin/notice?key=adm`, { text: "Your fee is still due", team: String(names.indexOf("Lob Squad")) });
  assert.match(decodeURIComponent(r.headers.get("location")), /for Lob Squad \(on their captain page\)\.$/);
  assert.equal(sent.length, 2);
  assert.doesNotMatch(await (await fetch(`${base}/league?t=tok`)).text(), /fee is still due/);
  assert.match(await (await fetch(`${base}/league?t=tok&c=${captainKey("adm", "Lob Squad")}`)).text(), /fee is still due/);
  assert.doesNotMatch(await (await fetch(`${base}/league?t=tok&c=${captainKey("adm", "Net Ninjas")}`)).text(), /fee is still due/);
  // bad input comes back as a note, nothing stored
  r = await post(`${base}/admin/notice?key=adm`, { text: "x", until: "2001-01-01" });
  assert.match(decodeURIComponent(r.headers.get("location")), /in the past/);
  assert.equal(state.notices.length, 2);
  // remove
  r = await post(`${base}/admin/notice?key=adm`, { act: "remove", id: String(state.notices[1].id) });
  assert.match(decodeURIComponent(r.headers.get("location")), /Notice removed/);
  assert.doesNotMatch(await (await fetch(`${base}/league?t=tok`)).text(), /From the organiser/);
  srv.close();
});

test("server: with SMTP off the notice is posted and the admin is told it was not emailed", async () => {
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const r = await post(`${base}/admin/notice?key=adm`, { text: "Hello", email: "1" });
  assert.match(decodeURIComponent(r.headers.get("location")), /players see it once the league is published\. Not emailed: reminder email \(SMTP\) is off\./);
  assert.match(await (await fetch(`${base}/admin?key=adm`)).text(), /needs SMTP/);
  srv.close();
});
