import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { faTagQuestions, readSheet, joinFormHtml, faSettings, faClosedReason, parseFreeAgent, addFreeAgent, friendGroups, suggestPlacements, placeFreeAgent, removeFreeAgent, placedEmails, freeAgentsCsv, allowJoin, adminFreeAgentsHtml } from "./freeagents.mjs";
import { parseRosters } from "./availability.mjs";

const form = (o) => new URLSearchParams(o);
const good = { name: "Jo P", email: "jo@example.org", level: "2" };
const add = (state, o, at) => addFreeAgent(state, parseFreeAgent(form({ ...good, ...o })).req, at).agent;

test("the join form: required fields, level, friend, note and honeypot", () => {
  assert.deepEqual(parseFreeAgent(form(good)).req, { name: "Jo P", email: "jo@example.org", phone: "", level: 2, with: "", note: "", tags: [] });
  assert.match(parseFreeAgent(form({ ...good, name: "" })).error, /name/);
  assert.match(parseFreeAgent(form({ ...good, name: "Jo, Ann" })).error, /roster line/);
  assert.match(parseFreeAgent(form({ ...good, email: "x" })).error, /email/);
  assert.match(parseFreeAgent(form({ ...good, level: "" })).error, /how much/);
  assert.match(parseFreeAgent(form({ ...good, level: "7" })).error, /how much/);
  assert.match(parseFreeAgent(form({ ...good, phone: "call me" })).error, /phone/);
  assert.equal(parseFreeAgent(form({ ...good, with: "  Sam  " })).req.with, "Sam");
  assert.match(parseFreeAgent(form({ ...good, note: "x".repeat(301) })).error, /300/);
  assert.deepEqual(parseFreeAgent(form({ ...good, website: "x" })), { spam: true });
  assert.match(parseFreeAgent(form({ ...good, name: "jo p", email: "JO@example.org" }), [{ name: "Jo P", email: "jo@example.org" }]).error, /already/);
});

test("settings and closing", () => {
  assert.deepEqual(faSettings({}), { open: false, fee: "", target: 0, closes: "", tagQuestions: [] });
  assert.equal(faSettings({ faTarget: "999" }).target, 40);
  assert.match(faClosedReason({}, "2026-09-01"), /not taking/);
  assert.equal(faClosedReason({ faOpen: true, faCloses: "2026-09-30" }, "2026-09-30"), "");
  assert.match(faClosedReason({ faOpen: true, faCloses: "2026-09-30" }, "2026-10-01"), /closed on 2026-09-30/);
  const hits = new Map();
  for (let i = 0; i < 5; i++) assert.ok(allowJoin(hits, "a", 1000));
  assert.ok(!allowJoin(hits, "a", 1000));
  assert.ok(allowJoin(hits, "a", 1000 + 3600001));
});

test("friend groups: full name, a unique first name, never a guess", () => {
  const agents = [
    { id: 1, name: "Ana B", with: "Cy" },
    { id: 2, name: "Cy D", with: "" },
    { id: 3, name: "Sam E", with: "" },
    { id: 4, name: "Sam F", with: "" },
    { id: 5, name: "Dee G", with: "Sam" }, // two Sams: alone
    { id: 6, name: "Eli H", with: "sam f" }, // full name: grouped
  ];
  const g = friendGroups(agents).map((x) => x.map((a) => a.id));
  assert.deepEqual(g, [[1, 2], [3], [4, 6], [5]]);
  // groups capped at the max
  const ring = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `P${i + 1}`, with: `P${i + 2}` }));
  assert.ok(friendGroups(ring, 4).every((x) => x.length <= 4));
});

test("suggestions fill the smallest rosters first, spread experience and keep friends together", () => {
  const state = emptyState(); // six sample teams
  const teams = buildLeague(state.fields).schedule.teams;
  state.fields.rosters = teams.map((t, i) => `${t}: ${Array.from({ length: 6 + (i % 2) }, (_, j) => `${t[0]}${j}`).join(", ")}`).join("\n");
  // teams 0, 2, 4 have 6 players; 1, 3, 5 have 7
  const ids = [
    add(state, { name: "Pro A", level: "3" }, 1).id,
    add(state, { name: "Pro B", level: "3" }, 2).id,
    add(state, { name: "Pro C", level: "3" }, 3).id,
    add(state, { name: "New A", level: "1", with: "New B" }, 4).id,
    add(state, { name: "New B", level: "1" }, 5).id,
  ];
  const { picks, unplaced } = suggestPlacements(state, teams);
  assert.equal(unplaced.length, 0);
  // the three experienced players go one each to the three 6-player teams
  assert.deepEqual(new Set(ids.slice(0, 3).map((id) => picks.get(id))), new Set([teams[0], teams[2], teams[4]]));
  // the pair lands together on a 7-player team (now the smallest, with no experienced free agent)
  assert.equal(picks.get(ids[3]), picks.get(ids[4]));
  assert.ok([teams[1], teams[3], teams[5]].includes(picks.get(ids[3])));
  // a roster size cap: nobody goes past it, and a pair that does not fit is named
  state.fields.faTarget = 7;
  const capped = suggestPlacements(state, teams);
  assert.equal([...capped.picks.values()].length, 3);
  assert.deepEqual(capped.unplaced.map((u) => u.why), ["no team has room for 2 together", "no team has room for 2 together"]);
});

test("placing writes the roster line the league page reads; refuses clashes and full rosters", () => {
  const state = emptyState();
  const teams = buildLeague(state.fields).schedule.teams;
  state.fields.rosters = `${teams[0]}: Ana, Ben\n${teams[1]}:`;
  const a = add(state, { name: "Cara" }, 1), b = add(state, { name: "ana", email: "a2@example.org" }, 2), c = add(state, { name: "Dev" }, 3);
  assert.ok(!placeFreeAgent(state, a.id, teams[0].toUpperCase(), teams, 9).error);
  assert.ok(!placeFreeAgent(state, c.id, teams[1], teams, 9).error);
  assert.match(placeFreeAgent(state, b.id, teams[0], teams).error, /already has a ana/i);
  assert.match(placeFreeAgent(state, b.id, "Nobody", teams).error, /Pick a team/);
  assert.match(placeFreeAgent(state, 999, teams[2], teams).error, /no longer waiting/);
  assert.ok(!placeFreeAgent(state, b.id, teams[2], teams).error); // a team with no roster line gets one
  const r = parseRosters(state.fields.rosters, teams);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rosters[teams[0]], ["Ana", "Ben", "Cara"]);
  assert.deepEqual(r.rosters[teams[1]], ["Dev"]);
  assert.deepEqual(r.rosters[teams[2]], ["ana"]);
  assert.equal(state.freeAgents.length, 0);
  assert.deepEqual(state.placedAgents.map((p) => p.team), [teams[0], teams[1], teams[2]]);
  // full roster
  state.fields.rosters = `${teams[3]}: ${Array.from({ length: 40 }, (_, i) => "P" + i).join(", ")}`;
  const d = add(state, { name: "Eve" }, 4);
  assert.match(placeFreeAgent(state, d.id, teams[3], teams).error, /40 players/);
  assert.equal(removeFreeAgent(state, d.id).agent.name, "Eve");
  assert.match(removeFreeAgent(state, d.id).error, /no longer/);
});

test("emails: the player gets their team and contact, the team gets the player; CSV guards formulas", () => {
  const state = emptyState();
  const teams = buildLeague(state.fields).schedule.teams;
  state.fields.contacts = `${teams[0]}: cap@example.org`;
  state.fields.faFee = "$60";
  const a = add(state, { name: "Jo P", phone: "+1 555 0100", note: "=cmd() keeper", with: "Sam" }, Date.UTC(2026, 8, 1));
  const placed = placeFreeAgent(state, a.id, teams[0], teams, Date.UTC(2026, 8, 2)).agent;
  const [p, t] = placedEmails(state, placed, teams, { organiser: "org@example.org", leagueUrl: "https://l.example/league?t=tok" });
  assert.deepEqual(p.to, ["jo@example.org", "org@example.org"]);
  assert.match(p.text, new RegExp(`You are on ${teams[0]}`));
  assert.match(p.text, /cap@example.org/);
  assert.match(p.text, /\$60/);
  assert.match(p.text, /https:\/\/l.example\/league\?t=tok/);
  assert.deepEqual(t.to, ["cap@example.org", "org@example.org"]);
  assert.match(t.text, /Phone: \+1 555 0100/);
  assert.match(t.text, /Played a season or two/);
  // no contact for the team: only the player's email
  const b = add(state, { name: "Kim" }, 3);
  const pb = placeFreeAgent(state, b.id, teams[1], teams, 4).agent;
  const only = placedEmails(state, pb, teams);
  assert.equal(only.length, 1);
  assert.match(only[0].text, /organiser will put you in touch/);
  const csv = freeAgentsCsv(state);
  assert.match(csv, /^status,name,email/);
  assert.match(csv, /'=cmd\(\) keeper/);
  assert.match(csv, new RegExp(`placed,Jo P,jo@example.org,'\\+1 555 0100,Played a season or two,Sam,${teams[0]},2026-09-01`));
  // the admin list escapes what players typed
  add(state, { name: "<b>x</b>" }, 5);
  assert.doesNotMatch(adminFreeAgentsHtml(state, "k", teams), /<b>x<\/b>/);
});

// --- through the HTTP server ---
const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", REMINDER_TO: "org@example.org", PUBLIC_URL: "https://league.example.org" };
async function boot(e = env) {
  const state = emptyState(), sent = [];
  const srv = http.createServer(handler(state, () => {}, e, () => Date.UTC(2026, 8, 1), async (cfg, msg) => { sent.push(msg); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, sent, base: `http://127.0.0.1:${srv.address().port}`, close: () => { srv.closeAllConnections(); srv.close(); } };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: /join is closed until opened; players join; the organiser places them and both sides are emailed", async () => {
  const s = await boot();
  assert.equal((await fetch(s.base + "/join")).status, 404);
  assert.equal((await post(s.base + "/join", good)).status, 404);
  // open it from the admin form, with the other fields kept
  const f = s.state.fields;
  const fields = { teams: f.teams, start: f.start, weekdays: f.weekdays.join(","), courts: f.courts, times: f.times, playoff: String(f.playoff ?? 0) };
  await post(s.base + "/admin/save?key=adm", { ...fields, faOpen: "1", faFee: "$60", faTarget: "12", faTags: "Woman=F", act: "publish" });
  assert.deepEqual(faSettings(s.state.fields), { open: true, fee: "$60", target: 12, closes: "", tagQuestions: [{ label: "Woman", tag: "F" }] });
  const teams = buildLeague(s.state.fields).schedule.teams;
  s.state.fields.contacts = `${teams[0]}: cap@example.org`;
  s.state.fields.rosters = teams.slice(1).map((t) => `${t}: A, B, C`).join("\n"); // teams[0] has the smallest roster
  assert.match(await (await fetch(s.base + "/join")).text(), /\$60/);
  // /register links to /join once free agents are taken
  s.state.fields.regOpen = true;
  assert.match(await (await fetch(s.base + "/register")).text(), /href="\/join"/);
  assert.match(await (await fetch(s.base + "/join")).text(), /value="F" style="width:auto"> Woman/);
  const ok = await post(s.base + "/join", { ...good, with: "Max", tag: "F" });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Jo P, you are on the free-agent list/);
  await post(s.base + "/join", { name: "Max Q", email: "max@example.org", level: "3" });
  const bad = await post(s.base + "/join", { ...good, name: "", note: "keep me" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /keep me/);
  assert.equal(s.state.freeAgents.length, 2);
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Free agents waiting \(2\)/);
  assert.match(admin, new RegExp(`<option selected value="${teams[0]}">`));
  assert.match(admin, /Place all 2 as suggested/);
  assert.match(admin, /Jo P<\/strong> · Played a season or two · Woman/);
  assert.match(admin, /then team strength made as even as it can be/);
  const r = await post(s.base + "/admin/free-agent?key=adm", { act: "place-all" });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Placed Jo P on (.+), Max Q on \1\. Emailing 2 players/);
  const ros = parseRosters(s.state.fields.rosters, teams).rosters;
  assert.deepEqual(ros[teams[0]], ["Jo P", "Max Q"]); // friends kept together on the smallest roster
  await new Promise((d) => setTimeout(d, 20));
  assert.equal(s.sent.length, 4);
  assert.ok(s.sent.some((m) => m.to.includes("jo@example.org") && /league\.example\.org\/league\?t=tok/.test(m.text)));
  assert.ok(s.sent.some((m) => m.to.includes("cap@example.org") && /Max Q joins/.test(m.text)));
  // the new players show on the league page roster picker and in the CSV
  const csv = await (await fetch(s.base + "/admin/free-agents.csv?key=adm")).text();
  assert.match(csv, /placed,Max Q,max@example.org/);
  // one at a time, and remove
  await post(s.base + "/join", { name: "Lu", email: "lu@example.org", level: "1" });
  const id = s.state.freeAgents[0].id;
  assert.match(decodeURIComponent((await post(s.base + "/admin/free-agent?key=adm", { act: "place", id: String(id), team: teams[3] })).headers.get("location")), new RegExp(`Placed Lu on ${teams[3]}`));
  await post(s.base + "/join", { name: "Mo", email: "mo@example.org", level: "1" });
  assert.match(decodeURIComponent((await post(s.base + "/admin/free-agent?key=adm", { act: "remove", id: String(s.state.freeAgents[0].id) })).headers.get("location")), /Mo taken off/);
  assert.equal((await post(s.base + "/admin/free-agent?key=bad", { act: "place-all" })).status, 401);
  s.close();
});

test("server: with SMTP off placing still works and says nobody was emailed", async () => {
  const s = await boot({ ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" });
  s.state.fields.faOpen = true;
  await post(s.base + "/join", good);
  const loc = decodeURIComponent((await post(s.base + "/admin/free-agent?key=adm", { act: "place-all" })).headers.get("location"));
  assert.match(loc, /Placed Jo P on .* Not emailed/);
  assert.equal(s.sent.length, 0);
  s.close();
});

test("tag questions: label=tag pairs, plain labels, only asked tags kept from the form", () => {
  assert.deepEqual(faTagQuestions("Woman=F, Goalie=G"), [{ label: "Woman", tag: "F" }, { label: "Goalie", tag: "G" }]);
  assert.deepEqual(faTagQuestions("Left handed, Goalie, goalie"), [{ label: "Left handed", tag: "LEFT-HANDED" }, { label: "Goalie", tag: "GOALIE" }]);
  assert.ok(faTagQuestions('<b>"x"</b>').every((q) => !/[<>"]/.test(q.label + q.tag)));
  assert.equal(faTagQuestions("a,b,c,d,e,f").length, 4);
  const fields = { faTags: "Woman=F, Goalie=G" };
  const f = new URLSearchParams({ ...good }); f.append("tag", "G"); f.append("tag", "X"); f.append("tag", "F");
  assert.deepEqual(parseFreeAgent(f, [], fields).req.tags, ["F", "G"]);
  const html = joinFormHtml({ fields: { faOpen: true, ...fields } }, "2026-11-19", { tags: ["G"] });
  assert.match(html, /name="tag" value="F" style="width:auto"> Woman/);
  assert.match(html, /value="G" style="width:auto" checked> Goalie/);
  assert.doesNotMatch(joinFormHtml({ fields: { faOpen: true } }, "2026-11-19"), /name="tag"/);
});

test("the balanced fit spreads tagged free agents the least-filled rule would stack, and keeps the cap", () => {
  const teams = ["Hawks", "Owls", "Crows", "Wrens"];
  const fields = { rosters: "Hawks: A1, A2, A3, A4\nOwls: B1, B2, B3, B4\nCrows: C1, C2, C3, C4, C5\nWrens: D1, D2, D3, D4, D5", faTags: "Woman=F" };
  // Three women (two experienced) and a new man; rosters carry no tags, so each team takes at most one woman.
  const state = { fields, placedAgents: [], freeAgents: [] };
  const mk = (id, name, level, tags, w = "") => state.freeAgents.push({ id, name, email: `${id}@example.org`, level, tags, with: w, at: id, note: "", phone: "" });
  mk(1, "Ana", 3, ["F"]); mk(2, "Bea", 3, ["F"]); mk(3, "Cat", 1, ["F"]); mk(4, "Dan", 1, []);
  const s = suggestPlacements(state, teams);
  assert.equal(s.fit.by, "balanced");
  assert.equal(s.picks.size, 4);
  // the two short rosters (Hawks, Owls) are filled first; women are spread one per team at most
  const per = (t) => [...s.picks.values()].filter((x) => x === t).length;
  assert.ok(per("Hawks") >= 1 && per("Owls") >= 1);
  const fPer = teams.map((t) => [1, 2, 3].filter((id) => s.picks.get(id) === t).length);
  assert.ok(Math.max(...fPer) <= 1, `women ${fPer}`);
  assert.equal(s.fit.tagsSplitBy, 0);
  // strength: the two level-3 players do not land on the same team
  assert.notEqual(s.picks.get(1), s.picks.get(2));
  // a cap of 5: nobody goes past it, and a friend pair stays together
  state.fields = { ...fields, faTarget: 5 };
  state.freeAgents[3].with = "Cat";
  const c = suggestPlacements(state, teams);
  const sizes = { Hawks: 4, Owls: 4, Crows: 5, Wrens: 5 };
  for (const t of c.picks.values()) sizes[t]++;
  assert.ok(Object.values(sizes).every((n) => n <= 5), JSON.stringify(sizes));
  assert.equal(c.picks.get(3), c.picks.get(4));
  assert.equal(c.unplaced.length, 4 - c.picks.size);
});

test("a ratings sheet: named players count at their rating and tags; levels map onto its range", () => {
  const sh = readSheet("Team,Player,Rating,Tag\nHawks,A1,10,F\nHawks,A2,2,\nOwls,B1,4,\nOwls,B2,6,F G");
  assert.equal(sh.lo, 2); assert.equal(sh.hi, 10); assert.equal(sh.mid, 5);
  assert.deepEqual(sh.byName.get("b2").tags, ["F", "G"]);
  const teams = ["Hawks", "Owls"];
  const state = { placedAgents: [], freeAgents: [
    { id: 1, name: "New", email: "n@example.org", level: 3, tags: [], with: "", at: 1 },
    { id: 2, name: "Old", email: "o@example.org", level: 1, tags: [], with: "", at: 2 },
  ], fields: { rosters: "Hawks: A1, A2\nOwls: B1, B2", faSheet: "Team,Player,Rating,Tag\nHawks,A1,10,F\nHawks,A2,2,\nOwls,B1,4,\nOwls,B2,6,F G" } };
  // Hawks total 12, Owls 10: the level-3 player (rated 10 on the sheet's range) goes to Owls, level 1 (2) to Hawks
  const s = suggestPlacements(state, teams);
  assert.equal(s.picks.get(1), "Owls");
  assert.equal(s.picks.get(2), "Hawks");
  assert.equal(s.fit.spread, 6);
  const html = adminFreeAgentsHtml(state, "k", teams);
  assert.match(html, /Ratings come from the sheet you pasted/);
  assert.match(html, /strongest minus weakest team total 6/);
});
