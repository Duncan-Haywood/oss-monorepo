import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { captainKey } from "./confirm.mjs";
import { movableGames, findFixture, tryMove, parseMoveRequest, recordMove, pruneMoves, openMoves, moveLine, moveAskedEmail, adminMovesHtml, captainMovesHtml } from "./reschedule.mjs";
import { dayIso, validateSchedule } from "./calc.mjs";

const form = (o) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)]));

function league() {
  const state = emptyState();
  state.published = true;
  const s = buildLeague(state.fields).schedule;
  // a game in the middle of the season, so there is a week either side
  const r = s.rounds[2], g = r.matches.find((m) => m.fixture);
  return { state, s, g: findFixture(s, g.fixture), next: s.rounds[3].day };
}

test("tryMove: a free day lands, the line is the organiser's own syntax, and nothing else moves", () => {
  const { state, s, g } = league();
  const to = g.day + 2; // a Thursday: no league night, both teams free
  const fit = tryMove(state.fields, buildLeague, g.fixture, to);
  assert.equal(fit.error, undefined);
  assert.equal(fit.game.day, to);
  assert.equal(fit.fields.rainouts, moveLine(g, to));
  assert.equal(fit.fields.rainouts, `${dayIso(g.day)} ${g.homeName}, ${g.awayName} -> ${dayIso(to)}`);
  const after = buildLeague(fit.fields).schedule;
  assert.equal(validateSchedule(after).ok, true);
  for (const x of movableGames(s, -Infinity)) if (x.fixture !== g.fixture) assert.equal(findFixture(after, x.fixture).day, x.day);
  // the input fields are untouched until the caller saves
  assert.equal(state.fields.rainouts ?? "", "");
});

test("tryMove: refuses a night either team already plays, an earlier date, and a blacked-out team", () => {
  const { state, g, next } = league();
  assert.match(tryMove(state.fields, buildLeague, g.fixture, next).error, /cannot play on/);
  assert.match(tryMove(state.fields, buildLeague, g.fixture, g.day - 1).error, /only be moved later/);
  assert.match(tryMove(state.fields, buildLeague, "nope", g.day + 2).error, /no longer in the schedule/);
  const team = g.homeName, f = { ...state.fields, blackouts: `${state.fields.blackouts}\n${team}: ${dayIso(g.day + 2)}` };
  assert.match(tryMove(f, buildLeague, g.fixture, g.day + 2).error, /cannot play on/);
});

test("tryMove: with two games per team a night, a move that would drag the other game is refused", () => {
  const { state } = league();
  const f = { ...state.fields, gamesPerNight: 2, courts: "Court 1\nCourt 2\nCourt 3", times: "18:00, 19:00" };
  const built = buildLeague(f);
  assert.equal(built.error, undefined);
  const r = built.schedule.rounds.find((x) => x.matches.length === 6);
  const g = findFixture(built.schedule, r.matches[0].fixture);
  const fit = tryMove(f, buildLeague, g.fixture, g.day + 2);
  assert.match(fit.error, /another game that night/);
});

test("parse and record: only your games, later dates, one open request, the other captain answers", () => {
  const games = [{ fixture: "0-1-0", day: 100, home: 0, away: 1, homeName: "Hawks", awayName: "Owls", time: "", court: "C1" }];
  assert.match(parseMoveRequest(form({ fixture: "0-1-0", to: dayIso(105) }), games, 2, 90).error, /your team's/);
  assert.match(parseMoveRequest(form({ fixture: "0-1-0", to: "soon" }), games, 0, 90).error, /new date/);
  assert.match(parseMoveRequest(form({ fixture: "0-1-0", to: dayIso(99) }), games, 0, 90).error, /later/);
  assert.match(parseMoveRequest(form({ fixture: "0-1-0", to: dayIso(400) }), games, 0, 90).error, /within/);
  assert.match(parseMoveRequest(form({ fixture: "0-1-0", act: "hack" }), games, 0, 90).error, /Unknown/);
  const ask = parseMoveRequest(form({ fixture: "0-1-0", to: dayIso(107), note: "  pitch\nbooked  " + "x".repeat(300) }), games, 0, 90).req;
  assert.equal(ask.side, "home");
  assert.equal(ask.to, 107);
  assert.equal(ask.note.length, 200);
  assert.ok(!ask.note.includes("\n"));
  const store = {};
  assert.match(recordMove(store, { act: "agree", fixture: "0-1-0", side: "away" }).error, /no open/);
  assert.equal(recordMove(store, ask, 1).status, "asked");
  // the asker cannot agree to their own request; the other side cannot overwrite it with their own
  assert.match(recordMove(store, { act: "agree", fixture: "0-1-0", side: "home" }).error, /other captain answers/);
  assert.match(recordMove(store, { ...ask, side: "away" }).error, /already asked/);
  assert.match(recordMove(store, { act: "withdraw", fixture: "0-1-0", side: "away" }).error, /Only the captain who asked/);
  assert.equal(recordMove(store, { ...ask, to: 108 }, 2).status, "asked"); // the asker may change the date
  assert.equal(store["0-1-0"].to, 108);
  assert.equal(recordMove(store, { act: "agree", fixture: "0-1-0", side: "away" }, 3).status, "agreed");
  assert.match(recordMove(store, { act: "decline", fixture: "0-1-0", side: "away" }).error, /already agreed/);
  const sched = { teams: ["Hawks", "Owls"], rounds: [{ day: 100, matches: [{ fixture: "0-1-0", home: 0, away: 1 }] }] };
  assert.equal(openMoves(store, sched)[0].status, "agreed");
  assert.match(adminMovesHtml(openMoves(store, sched), "k"), /Approve the move/);
  // a declined request is closed, and a new ask reopens it
  const s2 = {};
  recordMove(s2, ask, 1);
  assert.equal(recordMove(s2, { act: "decline", fixture: "0-1-0", side: "away" }, 2).status, "declined");
  assert.deepEqual(openMoves(s2, sched), []);
  assert.equal(recordMove(s2, { ...ask, side: "away" }, 3).status, "asked");
});

test("prune: a game that passed, left the schedule or was moved by another edit drops its request", () => {
  const sched = { teams: ["A", "B"], rounds: [{ day: 50, matches: [{ fixture: "a", home: 0, away: 1 }] }, { day: 60, matches: [{ fixture: "b", home: 1, away: 0 }] }] };
  const store = { a: { from: 50, status: "asked" }, b: { from: 55, status: "asked" }, c: { from: 70, status: "asked" }, };
  assert.equal(pruneMoves(store, sched, 40), 2);
  assert.deepEqual(Object.keys(store), ["a"]);
  assert.equal(pruneMoves(store, sched, 51), 1);
});

test("pages and email escape what captains type", () => {
  const g = { fixture: "f", day: 100, home: 0, away: 1, homeName: "Hawks", awayName: "Owls", time: "18:00", court: "C1" };
  const store = { f: { side: "home", from: 100, to: 107, note: "<script>x</script>", status: "asked" } };
  const away = captainMovesHtml(store, [g], 1, { token: "t", cap: "k" });
  assert.match(away, /Hawks ask to move it to/);
  assert.match(away, /value="agree"/);
  assert.ok(!away.includes("<script>"));
  const home = captainMovesHtml(store, [g], 0, { token: "t", cap: "k" });
  assert.match(home, /waiting for Owls's captain/);
  assert.match(home, /value="withdraw"/);
  const mail = moveAskedEmail(g, store.f, ["o@example.org"], "https://x/league?t=t&c=k");
  assert.equal(mail.team, "Owls");
  assert.match(mail.text, /https:\/\/x\/league\?t=t&c=k/);
});

const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

async function boot(env = {}) {
  const { state, g } = league();
  state.fields.contacts = `${g.homeName}: h@example.org\n${g.awayName}: a@example.org`;
  const clock = () => (g.day - 3) * 86400000 + 3600000; // three days before the game
  const sent = [];
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", ...env }, clock, async (cfg, msg) => { sent.push(msg); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, g, sent, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}

test("server: ask, the other captain agrees, the organiser approves, both teams are emailed", async () => {
  const s = await boot({ SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", PUBLIC_URL: "https://league.example.org" });
  const ch = captainKey("adm", s.g.homeName), ca = captainKey("adm", s.g.awayName);
  const to = dayIso(s.g.day + 2);
  assert.match(await (await fetch(`${s.base}/league?t=tok&c=${ch}`)).text(), /Ask to move this game/);
  let r = await post(`${s.base}/league/move?t=tok&c=${ch}`, { fixture: s.g.fixture, act: "ask", to, note: "gym booked" });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Asked:/);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(s.sent.length, 1);
  assert.deepEqual(s.sent[0].to, ["a@example.org"]);
  assert.ok(s.sent[0].text.includes(`c=${ca}#moves`));
  // the away captain sees it and agrees
  assert.match(await (await fetch(`${s.base}/league?t=tok&c=${ca}`)).text(), /ask to move it to/);
  r = await post(`${s.base}/league/move?t=tok&c=${ca}`, { fixture: s.g.fixture, act: "agree" });
  assert.match(await r.text(), /Agreed/);
  assert.match(await (await fetch(`${s.base}/admin?key=adm`)).text(), /Approve the move/);
  r = await post(`${s.base}/admin/move?key=adm`, { fixture: s.g.fixture, act: "approve" });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Moved .* Emailing 2 teams/);
  assert.equal(s.state.fields.rainouts, `${dayIso(s.g.day)} ${s.g.homeName}, ${s.g.awayName} -> ${to}`);
  assert.equal(findFixture(buildLeague(s.state.fields).schedule, s.g.fixture).day, s.g.day + 2);
  assert.deepEqual(s.state.moves, {});
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(s.sent.length, 3);
  assert.ok(s.sent.slice(1).every((m) => /was .* now /.test(m.text)));
  s.close();
});

test("server: a date that does not fit is refused at once; other teams and the plain link cannot act", async () => {
  const s = await boot();
  const { g } = s;
  const sched = buildLeague(s.state.fields).schedule;
  const next = sched.rounds.find((r) => r.day > g.day).day;
  const ch = captainKey("adm", g.homeName);
  let r = await post(`${s.base}/league/move?t=tok&c=${ch}`, { fixture: g.fixture, act: "ask", to: dayIso(next) });
  assert.equal(r.status, 409);
  assert.match(await r.text(), /cannot play on/);
  assert.deepEqual(s.state.moves, {});
  const third = sched.teams.find((n) => n !== g.homeName && n !== g.awayName);
  r = await post(`${s.base}/league/move?t=tok&c=${captainKey("adm", third)}`, { fixture: g.fixture, act: "ask", to: dayIso(g.day + 2) });
  assert.equal(r.status, 400);
  assert.equal((await post(`${s.base}/league/move?t=tok`, { fixture: g.fixture, act: "ask", to: dayIso(g.day + 2) })).status, 401);
  // an asked-but-not-agreed move cannot be approved; refuse closes it
  await post(`${s.base}/league/move?t=tok&c=${ch}`, { fixture: g.fixture, act: "ask", to: dayIso(g.day + 2) });
  r = await post(`${s.base}/admin/move?key=adm`, { fixture: g.fixture, act: "approve" });
  assert.match(decodeURIComponent(r.headers.get("location")), /Only a move both captains agreed/);
  assert.equal(s.state.fields.rainouts ?? "", "");
  await post(`${s.base}/admin/move?key=adm`, { fixture: g.fixture, act: "refuse" });
  assert.equal(s.state.moves[g.fixture].status, "refused");
  assert.match(await (await fetch(`${s.base}/league?t=tok&c=${ch}`)).text(), /organiser refused/);
  s.close();
});

test("server: approval re-checks the date; a slot taken since the ask closes the request", async () => {
  const s = await boot();
  const { g } = s;
  const ch = captainKey("adm", g.homeName), ca = captainKey("adm", g.awayName);
  await post(`${s.base}/league/move?t=tok&c=${ch}`, { fixture: g.fixture, act: "ask", to: dayIso(g.day + 2) });
  await post(`${s.base}/league/move?t=tok&c=${ca}`, { fixture: g.fixture, act: "agree" });
  // meanwhile the organiser blacks the home team out on that date
  s.state.fields.blackouts += `\n${g.homeName}: ${dayIso(g.day + 2)}`;
  const r = await post(`${s.base}/admin/move?key=adm`, { fixture: g.fixture, act: "approve" });
  assert.match(decodeURIComponent(r.headers.get("location")), /Not moved/);
  assert.equal(s.state.fields.rainouts ?? "", "");
  assert.equal(s.state.moves[g.fixture].status, "refused");
  s.close();
});
