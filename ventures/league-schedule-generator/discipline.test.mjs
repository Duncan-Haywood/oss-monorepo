import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { captainKey } from "./confirm.mjs";
import { parseDate } from "./calc.mjs";
import { disciplineSettings, parseDiscipline, disciplineState, bannedFrom, scorers, leagueDisciplineHtml, captainDisciplineHtml, adminDisciplineHtml, disciplineCsv } from "./discipline.mjs";

// Hawks (0), Owls (1), Wrens (2). Hawks play on days 10, 17, 24, 31.
const sched = {
  teams: ["Hawks", "Owls", "Wrens"],
  rounds: [
    { day: 10, matches: [{ fixture: "a", home: 0, away: 1, time: "18:00" }] },
    { day: 17, matches: [{ fixture: "b", home: 2, away: 0, time: "18:00" }] },
    { day: 24, matches: [{ fixture: "c", home: 0, away: 2, time: "18:00" }, { fixture: "d", home: 1, away: 2, time: "19:00" }] },
    { day: 31, matches: [{ fixture: "e", home: 1, away: 0, time: "18:00" }] },
  ],
};
const d = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const rules = disciplineSettings({});

test("settings: defaults and bounds", () => {
  assert.deepEqual(rules, { yellowsPerBan: 5, yellowBanGames: 1, escalate: false, redBanGames: 1, secondYellowBanGames: 1, show: false });
  const r = disciplineSettings({ yellowsPerBan: "0", yellowBanGames: "99", redBanGames: "3", yellowEscalate: true, disciplineShow: true });
  assert.equal(r.yellowsPerBan, 0);
  assert.equal(r.yellowBanGames, 1); // out of range falls back to the default
  assert.equal(r.redBanGames, 3);
  assert.equal(r.escalate, true);
  assert.equal(r.show, true);
});

test("parse: kinds, counts, case-blind team names, and clear errors", () => {
  const text = [
    `${d(10)} hawks: Ana  Lopez yellow`,
    `${d(10)} Owls: Ben second yellow`,
    `${d(10)} Owls: Cara Diaz red 3`,
    `${d(10)} Hawks: Ana Lopez goal 2`,
    `${d(10)} Hawks: Dan goal`,
    `${d(17)} Wrens: Eve ban 2`,
    "# a comment",
    `${d(10)} Ravens: Zed yellow`,
    `not-a-date Hawks: Zed yellow`,
    `${d(10)} Hawks: Zed purple`,
    `${d(10)} Hawks: Zed yellow 2`,
    `${d(10)} Hawks: Zed ban`,
    "rubbish",
  ].join("\n");
  const { events, errors } = parseDiscipline(text, sched.teams);
  assert.deepEqual(events.map((e) => [e.team, e.player, e.kind, e.n]), [
    [0, "Ana Lopez", "yellow", null], [1, "Ben", "second", null], [1, "Cara Diaz", "red", 3],
    [0, "Ana Lopez", "goal", 2], [0, "Dan", "goal", null], [2, "Eve", "ban", 2],
  ]);
  assert.equal(errors.length, 6);
  assert.match(errors[0], /no team called "Ravens"/);
  assert.match(errors[1], /not a date/);
  assert.match(errors[2], /"purple" is not one of/);
  assert.match(errors[3], /a yellow takes no number/);
  assert.match(errors[5], /write it as/);
});

test("a red is served in the team's next games, and only once they are played", () => {
  const { events } = parseDiscipline(`${d(10)} Hawks: Ana red 2`, sched.teams);
  // Before the next game: both still to miss.
  let s = disciplineState(events, sched, rules, 12);
  assert.equal(s.suspended.length, 1);
  assert.deepEqual(s.suspended[0].missing.map((g) => g.fixture), ["b", "c"]);
  assert.equal(s.suspended[0].left, 2);
  assert.deepEqual(bannedFrom(s, 0, "b"), ["Ana"]);
  assert.deepEqual(bannedFrom(s, 0, "e"), []);
  // On the day of game b it is not yet served (today's game counts as not played).
  s = disciplineState(events, sched, rules, 17);
  assert.equal(s.suspended[0].left, 2);
  // After game b: one left, game c.
  s = disciplineState(events, sched, rules, 18);
  assert.equal(s.suspended[0].left, 1);
  assert.deepEqual(s.suspended[0].missing.map((g) => g.fixture), ["c"]);
  // After game c: served, nobody suspended.
  s = disciplineState(events, sched, rules, 25);
  assert.equal(s.suspended.length, 0);
  assert.equal(s.bans[0].served.length, 2);
});

test("a rained-out game moved later does not serve the ban until its new date", () => {
  // Game b (day 17) rained out and moved to day 35: the Hawks' next game played is c on day 24.
  const moved = JSON.parse(JSON.stringify(sched));
  moved.rounds[1].matches = [];
  moved.rounds.push({ day: 35, matches: [{ fixture: "b", home: 2, away: 0, time: "18:00" }] });
  const { events } = parseDiscipline(`${d(10)} Hawks: Ana red`, moved.teams);
  const s = disciplineState(events, moved, rules, 20);
  assert.deepEqual(s.suspended[0].missing.map((g) => g.fixture), ["c"]);
});

test("yellows add up, escalate when asked, and the one-short list warns", () => {
  const four = [10, 10, 17, 17].map((n) => `${d(n)} Hawks: Ana yellow`).join("\n");
  let s = disciplineState(parseDiscipline(four, sched.teams).events, sched, rules, 20);
  assert.equal(s.bans.length, 0);
  assert.deepEqual(s.nearYellow.map((p) => [p.player, p.yellows, p.next]), [["Ana", 4, 1]]);
  const five = four + `\n${d(17)} Hawks: Ana yellow`;
  s = disciplineState(parseDiscipline(five, sched.teams).events, sched, rules, 20);
  assert.equal(s.bans.length, 1);
  assert.equal(s.bans[0].reason, "5 yellow cards");
  assert.deepEqual(s.suspended[0].missing.map((g) => g.fixture), ["c"]);
  // Escalating, 2 per ban step of 2 yellows: 2 yellows -> 1 game, 4 -> 2 games.
  const esc = disciplineSettings({ yellowsPerBan: "2", yellowEscalate: true });
  s = disciplineState(parseDiscipline(four, sched.teams).events, sched, esc, 11);
  assert.deepEqual(s.bans.map((b) => b.games), [1, 2]);
  // Bans queue: the first (from day 10) takes b, the second (from day 17) takes c and e.
  assert.deepEqual(s.bans[0].missing.map((g) => g.fixture), ["b"]);
  assert.deepEqual(s.bans[1].missing.map((g) => g.fixture), ["c", "e"]);
  // Yellows off.
  s = disciplineState(parseDiscipline(five, sched.teams).events, sched, disciplineSettings({ yellowsPerBan: "0" }), 20);
  assert.equal(s.bans.length, 0);
  assert.equal(s.nearYellow.length, 0);
});

test("a second yellow is a sending off, not two yellows towards accumulation", () => {
  const text = [10, 10, 10, 10].map((n) => `${d(n)} Owls: Ben yellow`).join("\n") + `\n${d(10)} Owls: Ben second yellow`;
  const s = disciplineState(parseDiscipline(text, sched.teams).events, sched, rules, 11);
  assert.deepEqual(s.bans.map((b) => b.reason), ["sent off (two yellows)"]);
  assert.equal(s.players[0].yellows, 4);
});

test("a ban longer than the season carries over, a card on an off day warns, and same names on two teams stay apart", () => {
  const text = `${d(24)} Hawks: Ana red 5\n${d(12)} Owls: Ana yellow\n${d(10)} Owls: Ana goal 3\n${d(10)} Hawks: Ana goal`;
  const s = disciplineState(parseDiscipline(text, sched.teams).events, sched, rules, 25);
  const ban = s.suspended.find((b) => b.team === 0);
  assert.deepEqual(ban.missing.map((g) => g.fixture), ["e"]);
  assert.equal(ban.carry, 4);
  assert.match(s.warnings[0], /Owls had no game on/);
  assert.deepEqual(scorers(s).map((p) => [p.team, p.goals]), [[1, 3], [0, 1]]);
  const html = leagueDisciplineHtml(s, sched.teams);
  assert.match(html, /4 games carried past this season/);
  assert.match(html, /<td>Ana<\/td><td>Owls<\/td><td>3<\/td>/);
});

test("html escapes names; captain sees only their team; csv guards formulas", () => {
  const text = `${d(10)} Hawks: =SUM(A1)<b> red\n${d(10)} Owls: Ben red`;
  const p = parseDiscipline(text, sched.teams);
  const s = disciplineState(p.events, sched, rules, 12);
  const cap = captainDisciplineHtml(s, 0, sched.teams);
  assert.match(cap, /=SUM\(A1\)&lt;b&gt;/);
  assert.doesNotMatch(cap, /Ben/);
  assert.match(adminDisciplineHtml(s, sched.teams, p.errors), /Suspended now \(2\)/);
  assert.equal(captainDisciplineHtml(s, 2, sched.teams), "");
  const csv = disciplineCsv(s, sched.teams);
  assert.match(csv, /^'=SUM\(A1\)<b>,Hawks,red card/m);
});

async function boot(fields = {}) {
  const state = emptyState();
  state.published = true;
  Object.assign(state.fields, fields);
  const sch = buildLeague(state.fields).schedule;
  const first = sch.rounds.find((r) => r.matches.some((m) => m.fixture));
  const g = first.matches.find((m) => m.fixture);
  const clock = () => (first.day + 1) * 86400000 + 3600000;
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, base: `http://127.0.0.1:${srv.address().port}`, g, day: first.day, sched: sch, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: the organiser logs a red, the captain page and admin show it, the league page only when ticked", async () => {
  const s = await boot();
  const home = s.sched.teams[s.g.home], away = s.sched.teams[s.g.away];
  const admin0 = await (await fetch(`${s.base}/admin?key=adm`)).text();
  assert.match(admin0, /Cards, suspensions and scorers \(optional\)/);
  assert.doesNotMatch(admin0, /Suspended now/);
  const keep = Object.fromEntries(["teams", "start", "courts", "times"].map((k) => [k, s.state.fields[k]]));
  const log = `${d(s.day)} ${home}: Ana Lopez red 2\n${d(s.day)} ${away}: Ben goal 2`;
  let r = await post(`${s.base}/admin/save?key=adm`, { ...keep, weekdays: s.state.fields.weekdays.join(","), discipline: log, redBanGames: "1", act: "save" });
  assert.equal(r.status, 303);
  assert.equal(s.state.fields.discipline, log);
  const admin = await (await fetch(`${s.base}/admin?key=adm`)).text();
  assert.match(admin, /Suspended now \(1\)/);
  assert.match(admin, /Ana Lopez<\/strong> \([^)]+\): red card, 2-game ban/);
  const cap = await (await fetch(`${s.base}/league?t=tok&c=${captainKey("adm", home)}`)).text();
  assert.match(cap, /Your team's suspensions/);
  assert.match(cap, /2 of 2 games left/);
  const other = await (await fetch(`${s.base}/league?t=tok&c=${captainKey("adm", away)}`)).text();
  assert.doesNotMatch(other, /Ana Lopez/);
  assert.doesNotMatch(await (await fetch(`${s.base}/league?t=tok`)).text(), /Discipline and scorers/);
  const csv = await fetch(`${s.base}/admin/discipline.csv?key=adm`);
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Ana Lopez,/);
  assert.equal((await fetch(`${s.base}/admin/discipline.csv?key=nope`)).status, 401);
  r = await post(`${s.base}/admin/save?key=adm`, { ...keep, weekdays: s.state.fields.weekdays.join(","), discipline: log, disciplineShow: "1", act: "save" });
  const pub = await (await fetch(`${s.base}/league?t=tok`)).text();
  assert.match(pub, /Discipline and scorers/);
  assert.match(pub, /<td>Ben<\/td><td>[^<]+<\/td><td>2<\/td>/);
  s.close();
});

test("dates in the log use the same parser as the rest of the page", () => {
  assert.equal(parseDate(d(10)), 10);
});

test("the suspensions guide's worked table matches disciplineState(), FAQ matches JSON-LD, linked and in the sitemap", async () => {
  const { readFileSync } = await import("node:fs");
  const { dayLabel } = await import("./calc.mjs");
  const read = (n) => readFileSync(new URL(`./${n}`, import.meta.url), "utf8");
  const name = "how-to-track-yellow-card-suspensions-in-a-rec-league.html";
  const html = read(name);
  assert.match(html, /No warranty/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  for (const q of ld.mainEntity) assert.ok(html.includes(`<h3>${q.name}</h3>`) && html.includes(`<p>${q.acceptedAnswer.text}</p>`), q.name);
  const D = parseDate;
  const sch = { teams: ["Hawks", "Owls", "Wrens", "Kites"], rounds: [
    { day: D("2026-09-07"), matches: [{ fixture: "1", home: 0, away: 1 }, { fixture: "2", home: 2, away: 3 }] },
    { day: D("2026-09-14"), matches: [{ fixture: "3", home: 0, away: 2 }, { fixture: "4", home: 3, away: 1 }] },
    { day: D("2026-09-21"), matches: [{ fixture: "5", home: 3, away: 0 }, { fixture: "6", home: 1, away: 2 }] },
    { day: D("2026-09-28"), matches: [{ fixture: "8", home: 2, away: 1 }] }, // Owls v Hawks rained out
    { day: D("2026-10-05"), matches: [{ fixture: "9", home: 2, away: 0 }, { fixture: "10", home: 1, away: 3 }] },
    { day: D("2026-10-12"), matches: [{ fixture: "11", home: 0, away: 3 }, { fixture: "12", home: 2, away: 1 }] },
    { day: D("2026-10-19"), matches: [{ fixture: "7", home: 1, away: 0 }] }] };
  const log = html.match(/<pre>([\s\S]*?)<\/pre>/)[1];
  const p = parseDiscipline(log, sch.teams);
  assert.deepEqual(p.errors, []);
  const s = disciplineState(p.events, sch, disciplineSettings({ yellowsPerBan: "3" }), D("2026-09-29"));
  for (const b of s.bans) {
    const tr = `<tr><td>${b.player}</td><td>${sch.teams[b.team]}</td><td>${b.reason}</td><td>${b.games}</td><td>${b.served.length}</td><td>${b.missing.map((g) => `${dayLabel(g.day)} v ${sch.teams[g.opponent]}`).join("; ")}</td></tr>`;
    assert.ok(html.includes(tr), tr);
  }
  assert.equal(s.bans.length, 4);
  assert.match(read("sitemap.xml"), new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(read("index.html"), new RegExp(`href="\\./${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
});
