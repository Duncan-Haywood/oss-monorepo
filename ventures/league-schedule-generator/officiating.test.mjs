import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readSpec, buildSchedule, validateOfficials, parseOfficials, applyRainouts } from "./calc.mjs";
import { officialKey, officialByKey, settleOfficials, pinDealt, officialAction, adminAssign, fillOpen, clearUpcoming, withOfficials, eligibleFor } from "./officiating.mjs";
import { handler, emptyState } from "./server.mjs";

const TEAMS = ["Hawks", "Owls", "Kites", "Wrens", "Rooks", "Larks"];
function league() {
  const { spec, errors } = readSpec({ teams: TEAMS.join("\n"), start: "2026-10-06", weekdays: ["Tue"], courts: "C1\nC2", times: "18:00\n19:00" });
  assert.deepEqual(errors, []);
  return buildSchedule(spec);
}
const OFFICIALS = "Sam (Hawks)\nAna: Tue max 4\nBo\nCy (Owls)";

test("keys are per name, constant across list order, and unknown keys are refused", () => {
  const { officials } = parseOfficials(OFFICIALS, TEAMS);
  const k = officialKey("secret", "Ana");
  assert.equal(k.length, 22);
  assert.equal(officialByKey("secret", officials, k), 1);
  assert.equal(officialByKey("secret", [...officials].reverse(), k), 2);
  assert.equal(officialByKey("other", officials, k), -1);
  assert.equal(officialByKey("secret", officials, ""), -1);
});

test("every game is dealt under the hard rules, and pinned picks survive adding an official", () => {
  const s = league();
  const { officials } = parseOfficials(OFFICIALS, TEAMS);
  const st = settleOfficials(s, officials, {});
  assert.ok(st.games.length > 0);
  assert.ok(st.games.every((g) => g.official), "four officials cover two courts");
  assert.deepEqual(validateOfficials(withOfficials(s, st), officials), []);
  assert.equal(st.loads[1], 4, "Ana's cap holds");
  const picks = {};
  pinDealt(picks, st);
  const more = parseOfficials(OFFICIALS + "\nDee", TEAMS).officials;
  const st2 = settleOfficials(s, more, picks);
  assert.deepEqual(st2.games.map((g) => g.official), st.games.map((g) => g.official), "nothing reshuffles");
  assert.equal(st2.loads[4], 0);
});

test("a pick a change broke is dropped from the game and named", () => {
  const s = league();
  const { officials } = parseOfficials(OFFICIALS, TEAMS);
  const st = settleOfficials(s, officials, {});
  const picks = {};
  pinDealt(picks, st);
  const g = st.games.find((x) => x.official === "Bo");
  // Bo now plays for one of the teams in that game.
  const changed = parseOfficials(OFFICIALS.replace("Bo", `Bo (${g.homeName})`), TEAMS).officials;
  const st2 = settleOfficials(s, changed, picks);
  const c = st2.conflicts.find((x) => x.game.fixture === g.fixture);
  assert.ok(c);
  assert.match(c.why, /team in the game/);
  assert.equal(st2.games.find((x) => x.fixture === g.fixture).official, "");
});

test("a rained-out game keeps its official when the new night is one they work", () => {
  const s = league();
  const { officials } = parseOfficials(OFFICIALS, TEAMS);
  const st = settleOfficials(s, officials, {});
  const picks = {};
  pinDealt(picks, st);
  const first = s.rounds[0].matches[0];
  const iso = new Date(s.rounds[0].day * 86400000).toISOString().slice(0, 10);
  const moved = applyRainouts(s, `${iso} ${first.homeName}`).schedule;
  const st2 = settleOfficials(moved, officials, picks);
  const was = st.games.find((g) => g.fixture === first.fixture), now = st2.games.find((g) => g.fixture === first.fixture);
  assert.notEqual(now.day, was.day);
  assert.equal(now.official, was.official);
  assert.deepEqual(validateOfficials(withOfficials(moved, st2), officials), []);
});

test("give back, take, organiser assign and fill all keep the rules", () => {
  const s = league();
  const { officials } = parseOfficials(OFFICIALS, TEAMS);
  const today = s.rounds[0].day;
  let picks = {};
  let st = settleOfficials(s, officials, picks);
  pinDealt(picks, st);
  const g = st.games.find((x) => x.official === "Bo" && x.day === today);
  assert.match(officialAction(picks, st, officials, 0, { act: "drop", fixture: g.fixture }, today).error, /not down/);
  const d = officialAction(picks, st, officials, 2, { act: "drop", fixture: g.fixture }, today);
  assert.ok(d.ok && d.late, "same-day give-back is short notice");
  st = settleOfficials(s, officials, picks);
  assert.equal(st.games.find((x) => x.fixture === g.fixture).official, "");
  // Someone busy at that time, or from a team in the game, cannot take it.
  for (const i of [0, 1, 3]) {
    if (eligibleFor(st, officials, g).includes(i)) continue;
    assert.match(officialAction(picks, st, officials, i, { act: "take", fixture: g.fixture }, today).error, /cannot take/);
  }
  const ok = eligibleFor(st, officials, g);
  assert.ok(ok.includes(2), "Bo is free again for the game he gave back");
  assert.ok(officialAction(picks, st, officials, 2, { act: "take", fixture: g.fixture }, today).ok);
  st = settleOfficials(s, officials, picks);
  assert.match(officialAction(picks, st, officials, ok.find((i) => i !== 2) ?? 0, { act: "take", fixture: g.fixture }, today).error, /first|already|cannot/);
  // Played games are closed.
  const past = st.games[0];
  assert.match(officialAction(picks, st, officials, 2, { act: "drop", fixture: past.fixture }, past.day + 1).error, /already been played/);
  // The organiser cannot break a rule either.
  const hawks = st.games.find((x) => x.homeName === "Hawks" || x.awayName === "Hawks");
  assert.match(adminAssign(picks, st, officials, hawks.fixture, "Sam").error, /team in the game/);
  assert.ok(adminAssign(picks, st, officials, hawks.fixture, "").ok);
  st = settleOfficials(s, officials, picks);
  assert.equal(fillOpen(picks, st, officials, today), 1);
  st = settleOfficials(s, officials, picks);
  assert.ok(st.games.every((x) => x.official));
  assert.deepEqual(validateOfficials(withOfficials(s, st), officials), []);
  assert.ok(clearUpcoming(picks, st, today) > 0);
  assert.deepEqual(picks, {});
});

test("server: an official's link shows their games, gives one back, another official takes it, the feed follows", async () => {
  const state = emptyState();
  let mails = [];
  const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", REMINDER_TO: "boss@example.org" };
  const clock = () => Date.UTC(2026, 9, 5, 12);
  const srv = http.createServer(handler(state, () => {}, env, clock, async (cfg, m) => { mails.push(m); }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (u, b) => fetch(base + u, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(b) });
  try {
    const r = await post("/admin/save?key=adm", { teams: TEAMS.join("\n"), start: "2026-10-06", weekdays: "Tue", courts: "C1\nC2", times: "18:00\n19:00", officials: OFFICIALS, act: "publish" });
    assert.equal(r.status, 303);
    assert.ok(Object.keys(state.refPicks).length > 0, "publishing pins the dealt games");
    const admin = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(admin, /Every upcoming game has an official/);
    assert.match(admin, new RegExp(`o=${officialKey("adm", "Bo")}`));
    assert.equal((await fetch(base + "/league?t=tok&o=wrongwrongwrongwrong12")).status, 401);
    const bo = officialKey("adm", "Bo"), ana = officialKey("adm", "Ana");
    const page = await (await fetch(`${base}/league?t=tok&o=${bo}`)).text();
    assert.match(page, /Bo: your games/);
    assert.match(page, /Can&#39;t make it|Can't make it/);
    const ics = await (await fetch(`${base}/league/ics?t=tok&o=${bo}`)).text();
    assert.match(ics, /X-WR-CALNAME:Bo officiating/);
    const fixture = Object.entries(state.refPicks).find(([, p]) => p.name === "Bo")[0];
    const n = (ics.match(/BEGIN:VEVENT/g) || []).length;
    const d = await post(`/league/official?t=tok&o=${bo}`, { act: "drop", fixture });
    assert.equal(d.status, 200);
    assert.equal(state.refPicks[fixture].name, "");
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /Short notice: Bo gave back/);
    assert.equal(((await (await fetch(`${base}/league/ics?t=tok&o=${bo}`)).text()).match(/BEGIN:VEVENT/g) || []).length, n - 1);
    assert.match(await (await fetch(base + "/admin?key=adm")).text(), /Games with no official \(1\)/);
    // Sam or Ana may take it depending on the teams; try each and expect at most one to succeed.
    const takers = [ana, officialKey("adm", "Sam"), officialKey("adm", "Cy")];
    let took = 0;
    for (const k of takers) if ((await post(`/league/official?t=tok&o=${k}`, { act: "take", fixture })).status === 200) took++;
    assert.ok(took <= 1);
    if (!took) assert.equal((await post(`/league/official?t=tok&o=${bo}`, { act: "take", fixture })).status, 200);
    assert.notEqual(state.refPicks[fixture].name, "");
    const lp = await (await fetch(base + "/league?t=tok")).text();
    assert.match(lp, /<h2>Officials<\/h2>/);
    assert.doesNotMatch(lp, /your games/);
    // Organiser bulk actions.
    assert.equal((await post("/admin/officials?key=adm", { act: "redeal" })).status, 303);
    assert.equal((await post("/admin/officials?key=adm", { act: "fill" })).status, 303);
    assert.equal((await post(`/admin/official?key=adm`, { fixture, name: "" })).status, 303);
    assert.equal(state.refPicks[fixture].name, "");
  } finally { srv.close(); }
});
