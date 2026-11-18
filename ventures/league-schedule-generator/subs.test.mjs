import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readSpec, buildSchedule, sampleFields } from "./calc.mjs";
import { upcomingGames, recordAvailability, teamAnswers, shortTeams, availabilityCsv, remindersDue, nudgeText } from "./availability.mjs";
import { parseSubOffer, recordSub, freeSubs, placeSub, subsHtml, placeButtonsHtml, freeSubsLine, pruneSubs, MAX_SUBS } from "./subs.mjs";
import { handler, emptyState } from "./server.mjs";

const sample = () => buildSchedule(readSpec(sampleFields()).spec);
const form = (o) => new URLSearchParams(o);
const setup = () => { const s = sample(), games = upcomingGames(s, s.rounds[0].day); return { s, games, day: games[0].day, g: games[0] }; };

test("parseSubOffer takes only a coming match night, a clean name and offer or withdraw", () => {
  const { games, day } = setup();
  assert.deepEqual(parseSubOffer(form({ day: String(day), name: "  Dee ", act: "offer" }), games).req, { day, name: "Dee", act: "offer" });
  assert.equal(parseSubOffer(form({ day: String(day), name: "Dee" }), games).req.act, "offer");
  assert.ok(parseSubOffer(form({ day: String(day + 1000), name: "Dee" }), games).error);
  assert.ok(parseSubOffer(form({ day: "x", name: "Dee" }), games).error);
  assert.ok(parseSubOffer(form({ day: String(day), name: "" }), games).error);
  assert.ok(parseSubOffer(form({ day: String(day), name: "Dee", act: "delete" }), games).error);
});

test("recordSub: one entry per name a night, withdraw removes it, the list is capped and old nights pruned", () => {
  const { games, day } = setup();
  const pool = {}, av = {};
  assert.equal(recordSub(pool, av, { day, name: "Dee", act: "offer" }, games, 1).already, false);
  assert.equal(recordSub(pool, av, { day, name: "dee", act: "offer" }, games, 2).already, true);
  assert.deepEqual(freeSubs(pool, av, games, day), ["Dee"]);
  assert.ok(recordSub(pool, av, { day, name: "Eli", act: "withdraw" }, games).error);
  assert.ok(recordSub(pool, av, { day, name: "DEE", act: "withdraw" }, games).ok);
  assert.deepEqual(pool, {});
  for (let i = 0; i < MAX_SUBS; i++) recordSub(pool, av, { day, name: `P${i}`, act: "offer" }, games);
  assert.ok(recordSub(pool, av, { day, name: "One more", act: "offer" }, games).error);
  pool["12"] = [{ name: "Ghost", at: 0 }];
  pruneSubs(pool, games);
  assert.equal(Object.hasOwn(pool, "12"), false);
});

test("placeSub writes an In (sub) answer, the team is no longer short and the sub is not offered twice", () => {
  const { games, day, g } = setup();
  const pool = {}, av = {};
  recordSub(pool, av, { day, name: "Dee", act: "offer" }, games);
  recordSub(pool, av, { day, name: "Eli", act: "offer" }, games);
  assert.equal(shortTeams(av, games, 1).filter((r) => r.fixture === g.fixture).length, 2);
  const p = placeSub(pool, av, { fixture: g.fixture, teamIndex: g.home, name: "dee" }, games, 5);
  assert.equal(p.ok, true);
  assert.equal(p.team, g.homeName);
  assert.deepEqual(teamAnswers(av, g.fixture, g.homeName).in, ["Dee (sub)"]);
  assert.deepEqual(shortTeams(av, games, 1).filter((r) => r.fixture === g.fixture).map((r) => r.team), [g.awayName]);
  assert.deepEqual(freeSubs(pool, av, games, day), ["Eli"]);
  assert.match(placeSub(pool, av, { fixture: g.fixture, teamIndex: g.away, name: "Dee" }, games).error, /already placed/);
  assert.ok(placeSub(pool, av, { fixture: g.fixture, teamIndex: 99, name: "Eli" }, games).error);
  assert.ok(placeSub(pool, av, { fixture: "nope", teamIndex: g.home, name: "Eli" }, games).error);
  assert.ok(placeSub(pool, av, { fixture: g.fixture, teamIndex: g.home, name: "Zed" }, games).error);
  assert.match(availabilityCsv(av, games), /,Dee,in \(sub\),/);
  // Withdrawing a placed sub takes the answer off the team, so the team shows short again.
  const w = recordSub(pool, av, { day, name: "Dee", act: "withdraw" }, games);
  assert.equal(w.placed.team, g.homeName);
  assert.deepEqual(teamAnswers(av, g.fixture, g.homeName).in, []);
});

test("a player already In for their own team that night is not a free sub", () => {
  const { games, day, g } = setup();
  const pool = {}, av = {};
  recordSub(pool, av, { day, name: "Ana", act: "offer" }, games);
  recordAvailability(av, { fixture: g.fixture, team: g.homeName, name: "ana", status: "in" }, games);
  assert.deepEqual(freeSubs(pool, av, games, day), []);
  assert.match(placeSub(pool, av, { fixture: g.fixture, teamIndex: g.away, name: "Ana" }, games).error, /already playing/);
});

test("subs reach the nudge text, the reminder email and the admin buttons; names are escaped", () => {
  const { games, day, g } = setup();
  const pool = {}, av = {};
  recordSub(pool, av, { day, name: "<b>Dee</b>", act: "offer" }, games);
  const row = shortTeams(av, games, 2)[0];
  const line = freeSubsLine(pool, av, games, row.day);
  assert.equal(line, "Subs free that night: <b>Dee</b>.");
  assert.match(nudgeText(row, 2, [], line), /Subs free that night: <b>Dee<\/b>\. Answer/);
  const due = remindersDue(av, games, { minPlayers: 2, today: day, organiser: "org@example.org", subsLine: (r) => freeSubsLine(pool, av, games, r.day) });
  assert.ok(due.length > 0 && due.every((m) => m.text.includes("Subs free that night: <b>Dee</b>.")));
  const btn = placeButtonsHtml(pool, av, games, row, "k&y");
  assert.match(btn, /Place &lt;b&gt;Dee&lt;\/b&gt;/);
  assert.match(btn, /action="\/admin\/sub\?key=k&amp;y"/);
  assert.equal(placeButtonsHtml({}, av, games, row, "k"), "");
  const html = subsHtml(pool, games, { token: "t" });
  assert.match(html, /&lt;b&gt;Dee&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Dee/);
  assert.equal(subsHtml(pool, [], {}), "");
  assert.ok(g);
});

test("server: a player offers to sub, the organiser places them, the league page shows them In", async () => {
  const state = emptyState();
  state.fields.minPlayers = 1;
  state.published = true;
  const { g } = setup();
  const clock = () => g.day * 86400000 + 3600000;
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (path, o) => fetch(base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });
  try {
    assert.match(await (await fetch(base + "/league?t=tok")).text(), /<h2>Subs<\/h2>/);
    assert.equal((await post("/league/sub?t=bad", { day: String(g.day), name: "Dee" })).status, 401);
    const r1 = await post("/league/sub?t=tok", { day: String(g.day), name: "Dee", act: "offer" });
    assert.equal(r1.status, 200);
    assert.match(await r1.text(), /Dee is on the sub list/);
    assert.equal((await post("/league/sub?t=tok", { day: "1", name: "Dee" })).status, 400);
    const admin = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(admin, /Subs free that night/);
    assert.match(admin, /Place Dee/);
    assert.equal((await post("/admin/sub?key=wrong", { fixture: g.fixture, team: String(g.home), name: "Dee" })).status, 401);
    const placed = await post("/admin/sub?key=adm", { fixture: g.fixture, team: String(g.home), name: "Dee" });
    assert.equal(placed.status, 303);
    assert.match(decodeURIComponent(placed.headers.get("location")), /Dee placed with/);
    assert.equal(saves, 2);
    const league = await (await fetch(base + "/league?t=tok")).text();
    assert.match(league, /In: Dee \(sub\)/);
    assert.match(league, new RegExp(`Dee \\(playing for ${g.homeName}\\)`));
    const again = await post("/admin/sub?key=adm", { fixture: g.fixture, team: String(g.away), name: "Dee" });
    assert.match(decodeURIComponent(again.headers.get("location")), /already placed/);
    assert.equal(saves, 2);
  } finally { srv.close(); }
});
