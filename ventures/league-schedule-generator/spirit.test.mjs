import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { captainKey } from "./confirm.mjs";
import { SPIRIT_MODES, spiritSettings, parseSpirit, recordSpirit, pruneSpirit, spiritRatings, spiritTable, unratedGames, spiritCsv, captainSpiritHtml, leagueSpiritHtml, adminSpiritHtml } from "./spirit.mjs";

const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]));
const cats = (a) => Object.fromEntries(a.map((v, i) => [`s${i}`, v]));
// Hawks (0) host Owls (1) on day 10; Wrens (2) host Hawks on day 17; Owls host Wrens on day 17.
const sched = {
  teams: ["Hawks", "Owls", "Wrens"],
  rounds: [
    { day: 10, matches: [{ fixture: "0-1-0", home: 0, away: 1, time: "18:00" }] },
    { day: 17, matches: [{ fixture: "2-0-0", home: 2, away: 0, time: "18:00" }, { fixture: "1-2-0", home: 1, away: 2, time: "19:00" }] },
  ],
};
const games = [
  { fixture: "0-1-0", day: 10, time: "18:00", home: 0, away: 1, homeName: "Hawks", awayName: "Owls" },
  { fixture: "2-0-0", day: 17, time: "18:00", home: 2, away: 0, homeName: "Wrens", awayName: "Hawks" },
];

test("settings: off by default, an unknown mode is off, show needs a mode", () => {
  assert.deepEqual(spiritSettings({}), { mode: null, show: false });
  assert.deepEqual(spiritSettings({ spiritMode: "stars", spiritShow: true }), { mode: null, show: false });
  assert.deepEqual(spiritSettings({ spiritMode: "categories", spiritShow: true }), { mode: "categories", show: true });
  assert.deepEqual(spiritSettings({ spiritMode: "single" }), { mode: "single", show: false });
});

test("parse: own games only, every category in range, the comment capped and flattened", () => {
  assert.match(parseSpirit(form({ fixture: "0-1-0", ...cats([2, 2, 2, 2, 2]) }), games, 0, null).error, /off/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", ...cats([2, 2, 2, 2, 2]) }), games, 2, "categories").error, /your team's games/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", ...cats([2, 2, 5, 2, 2]) }), games, 0, "categories").error, /Fair-mindedness/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", ...cats([2, 2, 2, 2]) }), games, 0, "categories").error, /Communication/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", s0: "1.5", s1: 2, s2: 2, s3: 2, s4: 2 }), games, 0, "categories").error, /whole number/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", s0: 0 }), games, 0, "single").error, /1 to 5/);
  assert.match(parseSpirit(form({ fixture: "0-1-0", s0: 3, comment: "x".repeat(301) }), games, 0, "single").error, /300/);
  const r = parseSpirit(form({ fixture: "0-1-0", ...cats([3, 2, 2, 1, 2]), comment: " late\nand\tloud " }), games, 1, "categories").req;
  assert.deepEqual(r, { fixture: "0-1-0", side: "away", rated: 0, scores: [3, 2, 2, 1, 2], comment: "late and loud" });
});

test("table: averages received, categories, what each team gives, low ratings; a change replaces", () => {
  const sp = {};
  recordSpirit(sp, { fixture: "0-1-0", side: "home", scores: [2, 2, 2, 2, 2] }, "categories", 1); // Hawks rate Owls 10
  assert.equal(recordSpirit(sp, { fixture: "0-1-0", side: "away", scores: [1, 0, 1, 1, 1], comment: "shoving" }, "categories", 2).replaced, false); // Owls rate Hawks 4
  recordSpirit(sp, { fixture: "2-0-0", side: "home", scores: [3, 3, 2, 3, 3] }, "categories", 3); // Wrens rate Hawks 14
  assert.equal(recordSpirit(sp, { fixture: "2-0-0", side: "away", scores: [2, 2, 2, 2, 3] }, "categories", 4).replaced, false); // Hawks rate Wrens 11
  assert.equal(recordSpirit(sp, { fixture: "2-0-0", side: "away", scores: [3, 3, 3, 3, 3] }, "categories", 5).replaced, true); // ... changed to 15
  const t = spiritTable(sp, sched, "categories");
  assert.deepEqual(t.map((r) => [r.name, r.received, r.avg, r.low, r.given, r.avgGiven]), [
    ["Wrens", 1, 15, 0, 1, 14],
    ["Owls", 1, 10, 0, 1, 4],
    ["Hawks", 2, 9, 1, 2, 12.5],
  ]);
  assert.deepEqual(t[2].cats, [2, 1.5, 1.5, 2, 2]);
  // a rating in the other scale is not mixed in
  recordSpirit(sp, { fixture: "1-2-0", side: "home", scores: [5] }, "single", 6);
  assert.equal(spiritRatings(sp, sched, "categories").length, 4);
  assert.deepEqual(spiritTable(sp, sched, "single").map((r) => [r.name, r.received]), [["Wrens", 1], ["Hawks", 0], ["Owls", 0]]);
  // a game no longer in the schedule is pruned
  sp["9-9-9"] = { home: { mode: "single", scores: [1], at: 0 } };
  pruneSpirit(sp, sched);
  assert.equal(sp["9-9-9"], undefined);
  assert.ok(sp["0-1-0"]);
});

test("unrated games: per team, only in the report window and only in the current scale", () => {
  const sp = { "2-0-0": { home: { mode: "categories", scores: [2, 2, 2, 2, 2] }, away: { mode: "single", scores: [3] } } };
  const u = unratedGames(sp, sched, 18, "categories").map((x) => `${x.game.fixture}:${sched.teams[x.team]}`).sort();
  assert.deepEqual(u, ["0-1-0:Hawks", "0-1-0:Owls", "1-2-0:Owls", "1-2-0:Wrens", "2-0-0:Hawks"]);
  assert.deepEqual(unratedGames(sp, sched, 40, "categories").map((x) => x.game.fixture), []); // past 21 days
});

test("html and CSV: escaped, comments only for the organiser, formula cells guarded", () => {
  const sp = {};
  recordSpirit(sp, { fixture: "0-1-0", side: "away", scores: [1, 0, 1, 1, 1], comment: "=HYPERLINK(\"x\") <b>rude</b>" }, "categories", Date.UTC(2026, 0, 1));
  const admin = adminSpiritHtml(sp, sched, "categories", 18, "k&y");
  assert.match(admin, /Low ratings to read/);
  assert.match(admin, /&lt;b&gt;rude&lt;\/b&gt;/);
  assert.match(admin, /Not rated yet/);
  assert.match(admin, /spirit\.csv\?key=k&amp;y/);
  const pub = leagueSpiritHtml(spiritTable(sp, sched, "categories"), "categories");
  assert.match(pub, /Hawks<\/td><td>1<\/td><td>4<\/td>/);
  assert.doesNotMatch(pub, /rude/);
  assert.equal(leagueSpiritHtml(spiritTable({}, sched, "categories"), "categories"), "");
  const csv = spiritCsv(sp, sched, "categories").split("\r\n");
  assert.equal(csv[0], "date,time,rated_by,team_rated,rules_knowledge_and_use,fouls_and_body_contact,fair_mindedness,positive_attitude_and_self_control,communication,total,of,low,comment,rated_utc");
  assert.match(csv[1], /^1970-01-11,18:00,Owls,Hawks,1,0,1,1,1,4,20,yes,"'=HYPERLINK\(""x""\) <b>rude<\/b>",2026-01-01T00:00:00.000Z$/);
  const cap = captainSpiritHtml(sp, games, 1, "categories", { token: "t", cap: "c" });
  assert.match(cap, /You rated them 4 of 20/);
  assert.equal((cap.match(/<select/g) || []).length, 5);
  assert.equal(captainSpiritHtml(sp, games, 0, null, { token: "t", cap: "c" }), "");
  assert.equal(Object.keys(SPIRIT_MODES).length, 2);
});

async function boot(fields = {}) {
  const state = emptyState();
  state.published = true;
  Object.assign(state.fields, fields);
  const s = buildLeague(state.fields).schedule;
  const first = s.rounds.find((r) => r.matches.some((m) => m.fixture));
  const g = first.matches.find((m) => m.fixture);
  const clock = () => (first.day + 1) * 86400000 + 3600000;
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, g, teams: s.teams, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: off by default; the organiser turns it on, captains rate, admin and CSV show it, the table shows on request", async () => {
  const s = await boot();
  const home = s.teams[s.g.home], away = s.teams[s.g.away];
  const ch = captainKey("adm", home), ca = captainKey("adm", away);
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok&c=${ch}`)).text(), /Rate your opponents/);
  assert.equal((await post(`${s.base}/league/spirit?t=tok&c=${ch}`, { fixture: s.g.fixture, s0: 3 })).status, 400);
  // turn it on through the admin form, keeping every other field
  const admin0 = await (await fetch(`${s.base}/admin?key=adm`)).text();
  assert.match(admin0, /Sportsmanship ratings \(optional\)/);
  const keep = Object.fromEntries(["teams", "start", "courts", "times"].map((k) => [k, s.state.fields[k]]));
  let r = await post(`${s.base}/admin/save?key=adm`, { ...keep, weekdays: s.state.fields.weekdays.join(","), spiritMode: "categories", act: "save" });
  assert.equal(r.status, 303);
  assert.equal(s.state.fields.spiritMode, "categories");
  assert.equal(s.state.fields.spiritShow, false);
  const capPage = await (await fetch(`${s.base}/league?t=tok&c=${ch}`)).text();
  assert.match(capPage, /Rate your opponents/);
  assert.match(capPage, new RegExp(`name="fixture" value="${s.g.fixture}"`));
  // the plain league link has no rating form
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok`)).text(), /Rate your opponents/);
  r = await post(`${s.base}/league/spirit?t=tok&c=${ch}`, { fixture: s.g.fixture, ...cats([2, 1, 1, 0, 1]), comment: "arguing every call" });
  assert.equal(r.status, 200);
  assert.match(await r.text(), new RegExp(`Rating sent: ${away}, 5 of 20`));
  r = await post(`${s.base}/league/spirit?t=tok&c=${ca}`, { fixture: s.g.fixture, ...cats([3, 2, 2, 3, 2]) });
  assert.match(await r.text(), new RegExp(`Rating sent: ${home}, 12 of 20`));
  r = await post(`${s.base}/league/spirit?t=tok&c=${ca}`, { fixture: s.g.fixture, ...cats([3, 3, 3, 3, 3]) });
  assert.match(await r.text(), /Rating changed/);
  // a team not in the game, a bad scale value, and the plain link are refused
  const other = s.teams.find((_, i) => i !== s.g.home && i !== s.g.away);
  assert.equal((await post(`${s.base}/league/spirit?t=tok&c=${captainKey("adm", other)}`, { fixture: s.g.fixture, ...cats([2, 2, 2, 2, 2]) })).status, 400);
  assert.equal((await post(`${s.base}/league/spirit?t=tok&c=${ch}`, { fixture: s.g.fixture, ...cats([2, 2, 2, 2, 9]) })).status, 400);
  assert.equal((await post(`${s.base}/league/spirit?t=tok`, { fixture: s.g.fixture, ...cats([2, 2, 2, 2, 2]) })).status, 401);
  const admin = await (await fetch(`${s.base}/admin?key=adm`)).text();
  assert.match(admin, /<h2>Sportsmanship ratings<\/h2>/);
  assert.match(admin, /arguing every call/);
  assert.match(admin, new RegExp(`<td>${home}</td><td>1</td><td>15</td>`));
  const csv = await fetch(`${s.base}/admin/spirit.csv?key=adm`);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal((await csv.text()).trim().split("\r\n").length, 3);
  assert.equal((await fetch(`${s.base}/admin/spirit.csv?key=nope`)).status, 401);
  // not public until the organiser ticks Show; then averages, no comments
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok`)).text(), /<h2>Sportsmanship<\/h2>/);
  await post(`${s.base}/admin/save?key=adm`, { ...keep, weekdays: s.state.fields.weekdays.join(","), spiritMode: "categories", spiritShow: "1", act: "save" });
  const pub = await (await fetch(`${s.base}/league?t=tok`)).text();
  assert.match(pub, /<h2>Sportsmanship<\/h2>/);
  assert.doesNotMatch(pub, /arguing every call/);
  // switching the scale starts the averages again; the ratings stay in the state
  await post(`${s.base}/admin/save?key=adm`, { ...keep, weekdays: s.state.fields.weekdays.join(","), spiritMode: "single", spiritShow: "1", act: "save" });
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok`)).text(), /<h2>Sportsmanship<\/h2>/);
  assert.ok(s.state.spirit[s.g.fixture].home);
  s.close();
});
