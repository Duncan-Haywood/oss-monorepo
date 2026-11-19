import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { scheduleChanges, changeEmails, changeSummary, changeLine, MAX_CHANGES_LISTED } from "./changes.mjs";
import { handler, emptyState, buildLeague } from "./server.mjs";

const sched = (rounds) => ({ teams: ["Hawks", "Owls", "Wrens", "Kites"], rounds });
const m = (fixture, home, away, time = "18:00", court = "Court 1") => ({ fixture, home, away, time, court });

test("scheduleChanges: moved, cancelled and added fixtures from today on; past games ignored", () => {
  const before = sched([
    { day: 10, matches: [m("0-1-1", 0, 1), m("2-3-1", 2, 3)] },
    { day: 20, matches: [m("0-2-1", 0, 2), m("1-3-1", 1, 3)] },
    { day: 30, matches: [m("0-3-1", 0, 3)] },
  ]);
  const after = sched([
    { day: 10, matches: [m("0-1-1", 0, 1, "19:00"), m("2-3-1", 2, 3)] }, // past: not reported
    { day: 20, matches: [m("1-3-1", 1, 3, "18:00", "Court 2")] },
    { day: 27, matches: [m("0-2-1", 0, 2)] },
    { day: 34, matches: [m("1-2-1", 1, 2)] },
  ]);
  const c = scheduleChanges(before, after, 15);
  assert.deepEqual(c.map((x) => [x.kind, (x.before || x.after).fixture]), [["moved", "0-2-1"], ["moved", "1-3-1"], ["cancelled", "0-3-1"], ["added", "1-2-1"]]);
  assert.deepEqual(scheduleChanges(before, before, 0), []);
  assert.deepEqual(scheduleChanges(null, after, 0).map((x) => x.kind), ["added", "added", "added", "added", "added"]);
});

test("changeEmails: one email per team with contacts, its own games only, organiser copied", () => {
  const before = sched([{ day: 20, matches: [m("0-2-1", 0, 2), m("1-3-1", 1, 3)] }]);
  const after = sched([{ day: 27, matches: [m("0-2-1", 0, 2, "19:00")] }, { day: 20, matches: [m("1-3-1", 1, 3)] }]);
  const changes = scheduleChanges(before, after, 0);
  assert.equal(changes.length, 1);
  const emails = changeEmails(changes, { contacts: { Hawks: ["h@example.org"], Owls: ["o@example.org"] }, organiser: "org@example.org", leagueUrl: "https://l.example/league?t=x" });
  assert.equal(emails.length, 1, "Wrens has no contact; Owls and Kites are unchanged");
  const [e] = emails;
  assert.equal(e.team, "Hawks");
  assert.deepEqual(e.to, ["h@example.org", "org@example.org"]);
  assert.match(e.subject, /^Hawks: game moved \(/);
  assert.match(e.text, /vs Wrens \(home\): was .* 18:00, Court 1, now .* 19:00, Court 1/);
  assert.match(e.text, /https:\/\/l\.example\/league\?t=x/);
  assert.doesNotMatch(e.text, /Owls|Kites/);
  assert.equal(changeLine(changes[0], "Wrens").startsWith("- at Hawks (away)"), true);
  assert.match(changeSummary(changes), /^1 upcoming game changed for 2 teams \(Hawks, Wrens\)$/);
  // __proto__ as a team name never reads an inherited value
  assert.deepEqual(changeEmails(changes, { contacts: Object.create({ Hawks: ["x@example.org"] }) }), []);
});

test("changeEmails: a long list is cut with a pointer to the page", () => {
  const n = MAX_CHANGES_LISTED + 5;
  const before = sched(Array.from({ length: n }, (_, i) => ({ day: 100 + i, matches: [m(`0-1-${i}`, 0, 1)] })));
  const after = sched([]);
  const [e] = changeEmails(scheduleChanges(before, after, 0), { contacts: { Hawks: ["h@example.org"] } });
  assert.match(e.subject, new RegExp(`${n} games changed`));
  assert.equal((e.text.match(/is cancelled/g) || []).length, MAX_CHANGES_LISTED);
  assert.match(e.text, /and 5 more: see the league page/);
});

const ENV = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", REMINDER_TO: "org@example.org", PUBLIC_URL: "https://league.example.org" };
async function boot(env) {
  const state = emptyState(), sent = [];
  const clock = () => Date.parse("2026-10-01T12:00:00Z");
  const srv = http.createServer(handler(state, () => {}, env, clock, async (cfg, msg) => { sent.push(msg); }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, sent, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
const formOf = (fields, extra = {}) => ({ ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v === false ? "" : String(v)])), ...extra });

test("server: saving a rainout with Email teams ticked emails each affected team once", async () => {
  const s = await boot(ENV);
  s.state.fields.contacts = "Net Ninjas: nn@example.org\nDink Dynasty: dd@example.org\nKitchen Kings: kk@example.org\nLob Squad: ls@example.org\nSpin Doctors: sd@example.org";
  assert.equal((await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { act: "publish" }))).status, 303);
  assert.equal(s.sent.length, 0, "first publish sends nothing");
  const before = buildLeague(s.state.fields).schedule;
  const firstDay = new Date(before.rounds[0].day * 86400000).toISOString().slice(0, 10);
  // Untick: summary only, no email
  let r = await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { rainouts: firstDay, act: "save" }));
  assert.match(decodeURIComponent(r.headers.get("location")), /upcoming games? changed for \d+ teams.*Teams were not emailed/);
  assert.equal(s.sent.length, 0);
  // Put it back, then save the rainout with the box ticked
  await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { rainouts: "", act: "save" }));
  r = await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { rainouts: firstDay, act: "save", notify: "1" }));
  const note = decodeURIComponent(r.headers.get("location"));
  await new Promise((res) => setTimeout(res, 20));
  const playing = new Set(before.rounds[0].matches.map((x) => before.teams[x.home]).concat(before.rounds[0].matches.map((x) => before.teams[x.away])));
  const emailed = new Set(s.sent.map((e) => e.team));
  for (const t of emailed) assert.ok(playing.has(t), `${t} played on the rained-out night`);
  assert.equal(s.sent.length, [...playing].filter((t) => t !== "Third Shot Drops").length);
  assert.match(note, /Emailing \d+ teams/);
  if (playing.has("Third Shot Drops")) assert.match(note, /No contact address for Third Shot Drops/);
  for (const e of s.sent) {
    assert.ok(e.to.includes("org@example.org"));
    assert.match(e.text, /https:\/\/league\.example\.org\/league\?t=tok/);
    assert.match(e.text, /was .*, now /);
  }
  // Saving again with nothing changed sends nothing more
  const n = s.sent.length;
  await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { act: "save", notify: "1" }));
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(s.sent.length, n);
  s.close();
});

test("server: no SMTP means a note, not an email; the box is offered once published", async () => {
  const s = await boot({ ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" });
  assert.match(await (await fetch(s.base + "/admin?key=adm")).text(), /name="notify" value="1" style="width:auto" disabled/);
  await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { act: "publish" }));
  assert.doesNotMatch(await (await fetch(s.base + "/admin?key=adm")).text(), /name="notify"[^>]*disabled/);
  const r = await post(s.base + "/admin/save?key=adm", formOf(s.state.fields, { teams: s.state.fields.teams + "\nRally Cats", act: "save", notify: "1" }));
  assert.match(decodeURIComponent(r.headers.get("location")), /changed for .*SMTP\) is off/);
  assert.equal(s.sent.length, 0);
  s.close();
});

