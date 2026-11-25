import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readSpec, buildSchedule, sampleFields, applyRainouts } from "./calc.mjs";
import { upcomingGames, cleanName, parseAvailability, recordAvailability, teamAnswers, shortTeams, availabilityHtml, shortTeamsHtml, nudgeText, MAX_NAMES, notAnswered, rosterPickerHtml, parseRosters, availabilityCsv, parseContacts, remindersDue } from "./availability.mjs";
import { handler, emptyState } from "./server.mjs";

const sample = () => buildSchedule(readSpec(sampleFields()).spec);
const form = (o) => new URLSearchParams(o);

test("upcomingGames takes the next two match days from today, today included", () => {
  const s = sample();
  const days = [...new Set(s.rounds.map((r) => r.day))].sort((a, b) => a - b);
  const g = upcomingGames(s, days[1]);
  assert.deepEqual([...new Set(g.map((x) => x.day))], [days[1], days[2]]);
  assert.equal(g.length, s.rounds.filter((r) => r.day === days[1] || r.day === days[2]).reduce((n, r) => n + r.matches.length, 0));
  assert.ok(g.every((x) => x.fixture && x.homeName && x.awayName));
  assert.equal(upcomingGames(s, days[days.length - 1] + 1).length, 0);
  assert.equal(new Set(upcomingGames(s, days[0], 1).map((x) => x.day)).size, 1);
});

test("cleanName tidies spaces and refuses empty, control characters and long names", () => {
  assert.equal(cleanName("  Sam   O'Neil ").name, "Sam O'Neil");
  assert.ok(cleanName("   ").error);
  assert.ok(cleanName("a\u0007b").error);
  assert.ok(cleanName("x".repeat(41)).error);
  assert.equal(cleanName("é".repeat(40)).name.length, 40);
});

test("parseAvailability only takes a listed game and one of its two teams", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day), g = games[0];
  const ok = parseAvailability(form({ pick: `${g.fixture}|${g.away}`, name: "Ana", status: "maybe" }), games, s.teams);
  assert.deepEqual(ok.req, { fixture: g.fixture, team: g.awayName, name: "Ana", status: "maybe" });
  const other = [0, 1, 2, 3, 4, 5].find((i) => i !== g.home && i !== g.away);
  assert.ok(parseAvailability(form({ pick: `${g.fixture}|${other}`, name: "Ana", status: "in" }), games, s.teams).error);
  assert.ok(parseAvailability(form({ pick: `nope|${g.home}`, name: "Ana", status: "in" }), games, s.teams).error);
  assert.ok(parseAvailability(form({ pick: `${g.fixture}|${g.home}`, name: "Ana", status: "yes" }), games, s.teams).error);
  assert.ok(parseAvailability(form({ pick: `${g.fixture}|${g.home}`, name: "", status: "in" }), games, s.teams).error);
});

test("the same name answering again replaces its answer; past games are pruned; a team list is capped", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day), g = games[0];
  const store = { "gone-0": { X: [{ name: "Old", status: "in", at: 1 }] } };
  assert.deepEqual(recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "Ana", status: "maybe" }, games, 5), { ok: true, replaced: false });
  assert.equal(store["gone-0"], undefined);
  assert.deepEqual(recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "ANA", status: "in" }, games, 6), { ok: true, replaced: true });
  assert.deepEqual(teamAnswers(store, g.fixture, g.homeName), { in: ["ANA"], maybe: [], out: [] });
  for (let i = 1; i < MAX_NAMES; i++) assert.ok(recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "P" + i, status: "out" }, games).ok);
  assert.ok(recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "One more", status: "in" }, games).error);
  assert.ok(recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "p1", status: "in" }, games).ok, "a known name can still change its answer at the cap");
});

test("shortTeams flags every team under the minimum, biggest gap first, and nothing when the minimum is 0", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day, 1), g = games[0];
  const store = {};
  for (const n of ["A", "B", "C", "D"]) recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: n, status: "in" }, games);
  recordAvailability(store, { fixture: g.fixture, team: g.awayName, name: "E", status: "in" }, games);
  recordAvailability(store, { fixture: g.fixture, team: g.awayName, name: "F", status: "maybe" }, games);
  assert.deepEqual(shortTeams(store, games, 0), []);
  const rows = shortTeams(store, games, 4);
  assert.equal(rows.length, games.length * 2 - 1, "every team but the home side of the first game is short");
  assert.ok(!rows.some((r) => r.team === g.homeName && r.fixture === g.fixture));
  const away = rows.find((r) => r.team === g.awayName && r.fixture === g.fixture);
  assert.deepEqual([away.in, away.maybe, away.short], [1, 1, 3]);
  assert.ok(rows[0].short >= rows[rows.length - 1].short);
  assert.match(nudgeText(away, 4), /1 of 4 players are in .* 1 said maybe/);
});

test("answers follow a rained-out game to its new date (keyed by fixture, not date)", () => {
  let s = sample();
  const first = s.rounds[0], m = first.matches[0];
  const games = upcomingGames(s, first.day, 1);
  const store = {};
  recordAvailability(store, { fixture: m.fixture, team: s.teams[m.home], name: "Ana", status: "in" }, games);
  s = applyRainouts(s, `${new Date(first.day * 86400000).toISOString().slice(0, 10)} ${s.teams[m.home]}`).schedule;
  const moved = upcomingGames(s, first.day, 99).find((x) => x.fixture === m.fixture);
  assert.ok(moved && moved.day > first.day, "the game moved later");
  assert.deepEqual(teamAnswers(store, m.fixture, s.teams[m.home]).in, ["Ana"]);
});

test("the HTML escapes names and marks short teams", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day, 1), g = games[0];
  const store = {};
  recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "<b>x</b>", status: "in" }, games);
  const html = availabilityHtml(store, games, { token: "t&k", minPlayers: 3 });
  assert.ok(!html.includes("<b>x</b>") && html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.match(html, /1 in of 3, 0 maybe, 0 out <strong class="err">short 2<\/strong>/);
  assert.match(html, /action="\/league\/available\?t=t&amp;k"/);
  assert.match(availabilityHtml({}, []), /No games coming up/);
  assert.equal(shortTeamsHtml(store, games, 0), "");
  assert.match(shortTeamsHtml(store, games, 1), /Teams short of players/);
});

test("server: a player answers on the league page and the organiser sees who is short", async () => {
  const state = emptyState();
  state.fields.minPlayers = 2;
  state.published = true;
  const s = sample();
  const day0 = s.rounds[0].day;
  const clock = () => day0 * 86400000 + 3600000;
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const page = await (await fetch(base + "/league?t=tok")).text();
    assert.match(page, /Who's playing/);
    const g = upcomingGames(s, day0)[0];
    const send = (o, t = "tok") => fetch(base + "/league/available?t=" + t, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });
    assert.equal((await send({ pick: `${g.fixture}|${g.home}`, name: "Ana", status: "in" }, "bad")).status, 401);
    const r1 = await send({ pick: `${g.fixture}|${g.home}`, name: "Ana", status: "in" });
    assert.equal(r1.status, 200);
    assert.match(await r1.text(), /Saved: Ana is in/);
    const r2 = await send({ pick: `${g.fixture}|${g.home}`, name: "ana", status: "out" });
    assert.match(await r2.text(), /Changed: ana is out/);
    assert.equal((await send({ pick: `${g.fixture}|${g.home}`, name: "Ana", status: "nope" })).status, 400);
    assert.equal(saves, 2);
    assert.match(await (await fetch(base + "/league?t=tok")).text(), /0 in of 2, 0 maybe, 1 out <strong class="err">short 2<\/strong> · Out: ana/);
    const admin = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(admin, /Teams short of players/);
    assert.match(admin, new RegExp(`${g.homeName}</strong>[^<]*: 0 in, short 2`));
    assert.match(admin, /name="minPlayers"/);
  } finally { srv.close(); }
});

test("server: unpublished leagues take no answers, and the minimum is saved from the admin form", async () => {
  const state = emptyState();
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(base + "/league/available?t=tok", { method: "POST", body: "" })).status, 404);
    const fields = Object.fromEntries(Object.entries(state.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v === false ? "" : String(v)]));
    await fetch(base + "/admin/save?key=adm", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, minPlayers: "7", act: "save" }) });
    assert.equal(state.fields.minPlayers, 7);
    await fetch(base + "/admin/save?key=adm", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, minPlayers: "-3", act: "save" }) });
    assert.equal(state.fields.minPlayers, 0);
  } finally { srv.close(); }
});

test("no minimum set: the player page shows plain counts, never 'of N', 'enough' or 'short'", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day, 1), g = games[0];
  const store = {};
  recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "Ann", status: "in" }, games);
  for (const opts of [undefined, {}, { minPlayers: 0 }, { minPlayers: "" }, { minPlayers: "abc" }, { minPlayers: null }]) {
    const html = availabilityHtml(store, games, opts);
    assert.ok(html.includes(`${g.homeName}: 1 in, 0 maybe, 0 out · In: Ann`), JSON.stringify(opts));
    assert.ok(!/class="ok">enough|short \d| of \d|needs \d+ players/.test(html), `${JSON.stringify(opts)}: ${html}`);
  }
  // with a minimum the same team is marked enough or short
  assert.match(availabilityHtml(store, games, { minPlayers: 1 }), /1 in of 1, 0 maybe, 0 out <span class="ok">enough<\/span>/);
});

test("team names that are Object.prototype keys record, render and count like any other", () => {
  for (const evil of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const games = [{ fixture: "f1", day: 20000, time: "19:00", court: "", home: 0, away: 1, homeName: evil, awayName: "Owls" }];
    const store = {};
    // the opponent answers first: the page must still render for the oddly named team
    assert.deepEqual(recordAvailability(store, { fixture: "f1", team: "Owls", name: "Bo", status: "in" }, games), { ok: true, replaced: false });
    assert.deepEqual(teamAnswers(store, "f1", evil), { in: [], maybe: [], out: [] }, evil);
    assert.match(availabilityHtml(store, games, { minPlayers: 2 }), new RegExp(`${evil}: 0 in of 2`), evil);
    assert.deepEqual(shortTeams(store, games, 2).map((r) => [r.team, r.in]), [[evil, 0], ["Owls", 1]], evil); // biggest gap first
    assert.deepEqual(recordAvailability(store, { fixture: "f1", team: evil, name: "Cy", status: "maybe" }, games), { ok: true, replaced: false }, evil);
    assert.deepEqual(recordAvailability(store, { fixture: "f1", team: evil, name: "cy", status: "in" }, games), { ok: true, replaced: true }, evil);
    assert.deepEqual(teamAnswers(store, "f1", evil), { in: ["cy"], maybe: [], out: [] }, evil);
    assert.equal(Object.getPrototypeOf(store.f1), Object.prototype, "store stays a plain object");
    // the state file round-trips the answers
    assert.deepEqual(teamAnswers(JSON.parse(JSON.stringify(store)), "f1", evil), { in: ["cy"], maybe: [], out: [] }, evil);
    assert.equal(({}).length, undefined, "Object.prototype untouched");
    // rosters, contacts, the CSV export and reminders key by the same typed names
    const noRoster = availabilityHtml(store, games, { minPlayers: 2, rosters: {} });
    assert.match(noRoster, new RegExp(`${evil}: 1 in of 2`), evil);
    assert.deepEqual(notAnswered(store, "f1", evil, {}), [], evil);
    assert.equal(rosterPickerHtml(games, {}), "", evil);
    const pr = parseRosters(`${evil}: Cy, Dee`, [evil, "Owls"]);
    assert.deepEqual(pr.errors, [], evil);
    assert.deepEqual(notAnswered(store, "f1", evil, pr.rosters), ["Dee"], evil);
    assert.deepEqual(notAnswered(JSON.parse(JSON.stringify(store)), "f1", evil, JSON.parse(JSON.stringify(pr.rosters))), ["Dee"], evil);
    assert.match(availabilityCsv(store, games, {}), new RegExp(`,${evil},Owls,cy,in,`), evil);
    const pc = parseContacts(`${evil}: cap@example.org, cap@example.org`, [evil, "Owls"]);
    assert.deepEqual([pc.errors, pc.contacts[evil]], [[], ["cap@example.org"]], evil);
    const due = remindersDue(store, games, { minPlayers: 3, today: 20000, contacts: {}, organiser: "org@example.org" });
    assert.deepEqual(due.map((d) => d.to), [["org@example.org"], ["org@example.org"]], evil);
    assert.equal(remindersDue(store, games, { minPlayers: 3, today: 20000, contacts: {} }).length, 0, evil);
  }
});
