import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { captainKey, captainTeam, reportableGames, parseReport, recordReport, openReports, settle } from "./confirm.mjs";
import { parseResults } from "./calc.mjs";

const teams = ["Hawks", "Owls", "Wrens", "Kites"];

test("captain keys: per team, stable, secret-dependent, found in constant time", () => {
  const k = teams.map((t) => captainKey("s3cret", t));
  assert.equal(new Set(k).size, 4);
  assert.ok(k.every((x) => /^[A-Za-z0-9_-]{22}$/.test(x)));
  assert.equal(captainKey("s3cret", "Hawks"), captainKey("s3cret", " hawks "));
  assert.notEqual(captainKey("other", "Hawks"), k[0]);
  assert.equal(captainTeam("s3cret", teams, k[2]), 2);
  assert.equal(captainTeam("s3cret", [...teams].reverse(), k[2]), 1); // reordering the list keeps the key
  assert.equal(captainTeam("s3cret", teams, "x"), -1);
  assert.equal(captainTeam("s3cret", teams, null), -1);
});

const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]));

test("two matching captain reports confirm; different ones dispute; a settled game is closed", () => {
  const games = [{ fixture: "0-1-0", day: 10, home: 0, away: 1, homeName: "Hawks", awayName: "Owls", time: "" }];
  assert.match(parseReport(form({ fixture: "0-1-0", hs: 2, as: 1 }), games, 2).error, /your team's games/);
  assert.match(parseReport(form({ fixture: "0-1-0", hs: "", as: 1 }), games, 0).error, /whole numbers/);
  assert.match(parseReport(form({ fixture: "0-1-0", hs: 1.5, as: 1 }), games, 0).error, /whole numbers/);
  const h = parseReport(form({ fixture: "0-1-0", hs: 2, as: 1 }), games, 0).req;
  assert.deepEqual(h, { fixture: "0-1-0", side: "home", hs: 2, as: 1 });
  const reports = {};
  assert.equal(recordReport(reports, h, 1).status, "waiting");
  assert.equal(recordReport(reports, { ...h, side: "away", hs: 1, as: 2 }, 2).status, "disputed");
  const sched = { teams: ["Hawks", "Owls"], rounds: [{ day: 10, matches: [{ fixture: "0-1-0", home: 0, away: 1 }] }] };
  assert.equal(openReports(reports, sched)[0].disputed, true);
  // the away captain fixes a typo: now they agree
  assert.equal(recordReport(reports, { ...h, side: "away" }, 3).status, "confirmed");
  settle(reports, "0-1-0", "Hawks 2 - 1 Owls");
  assert.match(recordReport(reports, h, 4).error, /already in the table/);
  assert.deepEqual(openReports(reports, sched), []);
});

test("reportable games: played, at most three weeks back, newest first", () => {
  const sched = { teams: ["A", "B"], rounds: [5, 20, 30, 31].map((day, i) => ({ day, matches: [{ fixture: `0-1-${i}`, home: 0, away: 1 }] })) };
  assert.deepEqual(reportableGames(sched, 30).map((g) => g.day), [30, 20]);
});

async function boot() {
  const state = emptyState();
  state.published = true;
  const s = buildLeague(state.fields).schedule;
  const first = s.rounds.find((r) => r.matches.some((m) => m.fixture));
  const g = first.matches.find((m) => m.fixture);
  const clock = () => (first.day + 1) * 86400000 + 3600000; // the day after the first game night
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { state, base, g, teams: s.teams, saves: () => saves, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: both captains send the same score and it is in the table with no organiser step", async () => {
  const s = await boot();
  const home = s.teams[s.g.home], away = s.teams[s.g.away];
  const ch = captainKey("adm", home), ca = captainKey("adm", away);
  const page = await (await fetch(`${s.base}/league?t=tok&c=${ch}`)).text();
  assert.match(page, new RegExp(`Captain: ${home}`));
  assert.match(page, new RegExp(`name="fixture" value="${s.g.fixture}"`));
  // the plain league link shows no captain section
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok`)).text(), /Captain:/);
  let r = await post(`${s.base}/league/report?t=tok&c=${ch}`, { fixture: s.g.fixture, hs: "3", as: "1" });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Waiting for the other captain/);
  assert.equal(s.state.fields.results, "");
  // the organiser sees it waiting
  assert.match(await (await fetch(`${s.base}/admin?key=adm`)).text(), new RegExp(`${away}'s captain has not reported`));
  r = await post(`${s.base}/league/report?t=tok&c=${ca}`, { fixture: s.g.fixture, hs: "3", as: "1" });
  assert.match(await r.text(), /Confirmed by both captains/);
  assert.equal(s.state.fields.results, `${home} 3 - 1 ${away}`);
  assert.equal(parseResults(s.state.fields.results, s.teams).results.length, 1);
  // it cannot be added twice
  r = await post(`${s.base}/league/report?t=tok&c=${ca}`, { fixture: s.g.fixture, hs: "3", as: "1" });
  assert.equal(r.status, 409);
  assert.equal(s.state.fields.results.split("\n").length, 1);
  assert.match(await (await fetch(`${s.base}/league?t=tok`)).text(), /Standings/);
  s.close();
});

test("server: different scores wait for the organiser, who picks one", async () => {
  const s = await boot();
  const home = s.teams[s.g.home], away = s.teams[s.g.away];
  await post(`${s.base}/league/report?t=tok&c=${captainKey("adm", home)}`, { fixture: s.g.fixture, hs: "2", as: "2" });
  const r = await post(`${s.base}/league/report?t=tok&c=${captainKey("adm", away)}`, { fixture: s.g.fixture, hs: "2", as: "1" });
  assert.match(await r.text(), /organiser will decide/);
  assert.equal(s.state.fields.results, "");
  const admin = await (await fetch(`${s.base}/admin?key=adm`)).text();
  assert.match(admin, /scores differ/);
  assert.match(admin, /Captain links/);
  assert.match(admin, new RegExp(captainKey("adm", home)));
  const a = await post(`${s.base}/admin/report?key=adm`, { fixture: s.g.fixture, act: "away" });
  assert.equal(a.status, 303);
  assert.equal(s.state.fields.results, `${home} 2 - 1 ${away}`);
  assert.doesNotMatch(await (await fetch(`${s.base}/admin?key=adm`)).text(), /scores differ/);
  s.close();
});

test("server: a captain cannot report another team's game, a bad key is refused, and clear reopens", async () => {
  const s = await boot();
  const other = s.teams.findIndex((_, i) => i !== s.g.home && i !== s.g.away);
  let r = await post(`${s.base}/league/report?t=tok&c=${captainKey("adm", s.teams[other])}`, { fixture: s.g.fixture, hs: "9", as: "0" });
  assert.equal(r.status, 400);
  assert.equal((await fetch(`${s.base}/league?t=tok&c=nope`)).status, 401);
  assert.equal((await post(`${s.base}/league/report?t=tok`, { fixture: s.g.fixture, hs: "1", as: "0" })).status, 401);
  // a captain link with the wrong league token is still refused
  assert.equal((await fetch(`${s.base}/league?t=bad&c=${captainKey("adm", s.teams[0])}`)).status, 401);
  await post(`${s.base}/league/report?t=tok&c=${captainKey("adm", s.teams[s.g.home])}`, { fixture: s.g.fixture, hs: "1", as: "0" });
  await post(`${s.base}/admin/report?key=adm`, { fixture: s.g.fixture, act: "clear" });
  assert.equal(s.state.reports[s.g.fixture], undefined);
  s.close();
});

test("server: captain links are emailed to each team's contacts on the organiser's SMTP", async () => {
  const state = emptyState();
  state.fields.contacts = "Net Ninjas: nn@example.org\nLob Squad: ls@example.org";
  const sent = [];
  const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", PUBLIC_URL: "https://league.example.org" };
  const srv = http.createServer(handler(state, () => {}, env, Date.now, async (cfg, msg) => { sent.push(msg); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const r = await post(`${base}/admin/captain-links?key=adm`, {});
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Emailing captain links to 2 teams\. No contact address for Dink Dynasty/);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(sent.length, 2);
  const nn = sent.find((m) => m.team === "Net Ninjas");
  assert.deepEqual(nn.to, ["nn@example.org"]);
  assert.ok(nn.text.includes(`https://league.example.org/league?t=tok&c=${captainKey("adm", "Net Ninjas")}`));
  srv.close();
});
