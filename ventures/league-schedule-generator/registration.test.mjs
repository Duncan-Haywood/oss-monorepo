import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, emptyState, buildLeague } from "./server.mjs";
import { cleanTeamName, parseRegistration, addRegistration, approveRegistration, declineRegistration, togglePaid, registrationsCsv, allowSignup, closedReason, regSettings, signupEmail, placesTaken } from "./registration.mjs";
import { parseRosters, parseContacts } from "./availability.mjs";
import { parseResults } from "./calc.mjs";

const form = (o) => new URLSearchParams(o);
const good = { team: "Pickle Rick", captain: "Ana", email: "ana@example.org", players: "Ben, Cara\nDev" };

test("team names that the schedule, results and roster lines can read back", () => {
  assert.equal(cleanTeamName("  Pickle   Rick ").name, "Pickle Rick");
  for (const bad of ["", "Hawks: B", "A, B", "A;B", "<b>x</b>", "12) Owls", "- Owls", "Owls +3", "123", "x".repeat(41), 'The "Best"']) assert.ok(cleanTeamName(bad).error, bad);
  assert.equal(cleanTeamName("Les Écureuils").name, "Les Écureuils");
  assert.equal(cleanTeamName("Hawks U12").name, "Hawks U12");
});

test("a sign-up form: required fields, duplicates, players, honeypot", () => {
  const r = parseRegistration(form(good), ["Net Ninjas"]);
  assert.deepEqual(r.req, { team: "Pickle Rick", captain: "Ana", email: "ana@example.org", phone: "", players: ["Ben", "Cara", "Dev"], note: "" });
  assert.match(parseRegistration(form({ ...good, team: "net ninjas" }), ["Net Ninjas"]).error, /already signed up/);
  assert.match(parseRegistration(form({ ...good, email: "nope" })).error, /email/);
  assert.match(parseRegistration(form({ ...good, captain: "" })).error, /Captain/);
  assert.match(parseRegistration(form({ ...good, phone: "call me" })).error, /phone/);
  assert.equal(parseRegistration(form({ ...good, phone: "+1 (303) 555-0100" })).req.phone, "+1 (303) 555-0100");
  assert.deepEqual(parseRegistration(form({ ...good, players: "Ben, ben, BEN" })).req.players, ["Ben"]);
  assert.match(parseRegistration(form({ ...good, players: Array.from({ length: 41 }, (_, i) => "P" + i).join(",") })).error, /Up to 40/);
  assert.match(parseRegistration(form({ ...good, note: "x".repeat(501) })).error, /500/);
  assert.deepEqual(parseRegistration(form({ ...good, website: "http://spam" })), { spam: true });
});

test("open, closing date and cap: past the cap a sign-up goes on the waitlist", () => {
  const state = emptyState(); // six sample teams
  assert.equal(closedReason(state.fields, "2026-09-01"), "Sign-ups are not open.");
  Object.assign(state.fields, { regOpen: true, regCloses: "2026-09-30", regMaxTeams: 8 });
  assert.equal(closedReason(state.fields, "2026-09-30"), "");
  assert.match(closedReason(state.fields, "2026-10-01"), /closed on 2026-09-30/);
  assert.equal(placesTaken(state.fields, []), 6);
  const a = addRegistration(state, parseRegistration(form(good)).req, 1).reg;
  const b = addRegistration(state, parseRegistration(form({ ...good, team: "Volley Llamas" })).req, 2).reg;
  const c = addRegistration(state, parseRegistration(form({ ...good, team: "Spike Lee" })).req, 3).reg;
  assert.deepEqual([a.status, b.status, c.status], ["waiting", "waiting", "waitlist"]);
  assert.deepEqual([a.id, b.id, c.id], [1, 2, 3]);
  // declining a waiting team frees a place for the next sign-up, not for the waitlisted one automatically
  declineRegistration(state, 2);
  assert.equal(addRegistration(state, parseRegistration(form({ ...good, team: "Net Gains" })).req, 4).reg.status, "waiting");
});

test("approve puts the team in Teams, Rosters and Contacts, and the league still builds and reads results", () => {
  const state = emptyState();
  state.fields.regFee = "$450";
  const { reg } = addRegistration(state, parseRegistration(form(good)).req, 1);
  const r = approveRegistration(state, reg.id);
  assert.ok(!r.error);
  const out = buildLeague(state.fields);
  assert.equal(out.error, undefined);
  assert.equal(out.schedule.teams.length, 7);
  assert.ok(out.schedule.teams.includes("Pickle Rick"));
  assert.deepEqual(parseRosters(state.fields.rosters, out.schedule.teams).rosters["Pickle Rick"], ["Ana", "Ben", "Cara", "Dev"]);
  assert.deepEqual(parseContacts(state.fields.contacts, out.schedule.teams).contacts["Pickle Rick"], ["ana@example.org"]);
  assert.equal(parseResults("Pickle Rick 3 - 2 Net Ninjas", out.schedule.teams).results.length, 1);
  assert.equal(state.registrations.length, 0);
  assert.match(approveRegistration(state, reg.id).error, /no longer waiting/);
  // paid can still be ticked after approval, and the CSV shows it
  assert.equal(togglePaid(state, reg.id).reg.paid, true);
  const csv = registrationsCsv(state);
  assert.match(csv, /^status,team,captain,email/);
  assert.match(csv, /approved,Pickle Rick,Ana,ana@example.org,,Ben; Cara; Dev,yes,1970-01-01T00:00:00.001Z,/);
});

test("CSV cells that a spreadsheet would run as a formula are quoted off", () => {
  const state = emptyState();
  addRegistration(state, { team: "Owls", captain: "=HYPERLINK(1)", email: "a@b.co", phone: "", players: [], note: "a, \"b\"" }, 1);
  const line = registrationsCsv(state).split("\r\n")[1];
  assert.match(line, /,'=HYPERLINK\(1\),/);
  assert.match(line, /"a, ""b"""$/);
});

test("per-address limit: five an hour", () => {
  const hits = new Map();
  for (let i = 0; i < 5; i++) assert.equal(allowSignup(hits, "1.2.3.4", 1000 + i), true);
  assert.equal(allowSignup(hits, "1.2.3.4", 2000), false);
  assert.equal(allowSignup(hits, "5.6.7.8", 2000), true);
  assert.equal(allowSignup(hits, "1.2.3.4", 1000 + 60 * 60 * 1000 + 10), true);
});

test("settings: only a plain https payment link is kept, cap bounded", () => {
  assert.equal(regSettings({ regPayUrl: "javascript:alert(1)" }).payUrl, "");
  assert.equal(regSettings({ regPayUrl: "http://pay.example" }).payUrl, "");
  assert.equal(regSettings({ regPayUrl: "https://buy.stripe.com/test_abc" }).payUrl, "https://buy.stripe.com/test_abc");
  assert.equal(regSettings({ regMaxTeams: "500" }).maxTeams, 64);
  assert.equal(regSettings({ regMaxTeams: "-3" }).maxTeams, 0);
});

test("confirmation email: captain plus organiser, fee link only when not waitlisted", () => {
  const state = emptyState();
  Object.assign(state.fields, { regFee: "$450", regPayUrl: "https://pay.example.org/x" });
  const m = signupEmail(state, { team: "Owls", captain: "Ana", email: "ana@example.org", phone: "", players: ["Ben"], note: "", status: "waiting" }, { organiser: "org@example.org" });
  assert.deepEqual(m.to, ["ana@example.org", "org@example.org"]);
  assert.match(m.text, /Pay here and put "Owls" in the note: https:\/\/pay\.example\.org\/x/);
  const w = signupEmail(state, { team: "Owls", captain: "Ana", email: "ana@example.org", phone: "", players: [], note: "", status: "waitlist" });
  assert.doesNotMatch(w.text, /Pay here/);
  assert.match(w.subject, /^Waitlist/);
});

// --- through the HTTP server ---
const env = { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok", SMTP_HOST: "smtp.example.org", SMTP_FROM: "league@example.org", REMINDER_TO: "org@example.org", PUBLIC_URL: "https://league.example.org" };
async function boot() {
  const state = emptyState(), sent = [];
  const srv = http.createServer(handler(state, () => {}, env, () => Date.UTC(2026, 8, 1), async (cfg, msg) => { sent.push(msg); return { ok: true }; }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  return { state, sent, base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() };
}
const post = (url, body) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

test("server: /register is closed until the organiser opens it, then signs a team up and emails the captain", async () => {
  const s = await boot();
  assert.equal((await fetch(s.base + "/register")).status, 404);
  assert.equal((await post(s.base + "/register", good)).status, 404);
  Object.assign(s.state.fields, { regOpen: true, regFee: "$450", regPayUrl: "https://pay\.example\.org/x", regMaxTeams: 7 });
  const page = await (await fetch(s.base + "/register")).text();
  assert.match(page, /1 of 7 places left/);
  assert.match(page, /\$450/);
  const r = await post(s.base + "/register", good);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Pickle Rick is signed up/);
  assert.match(html, /href="https:\/\/pay\.example\.org\/x"/);
  await new Promise((d) => setTimeout(d, 20));
  assert.equal(s.sent.length, 1);
  assert.deepEqual(s.sent[0].to, ["ana@example.org", "org@example.org"]);
  assert.match(s.sent[0].text, /Sign-up page: https:\/\/league\.example\.org\/register/);
  // the next one is past the cap: waitlist, no pay link
  const w = await (await post(s.base + "/register", { ...good, team: "Volley Llamas" })).text();
  assert.match(w, /on the waitlist \(place 1\)/);
  assert.doesNotMatch(w, /pay\.example\.org/);
  // a bad form keeps what was typed
  const bad = await post(s.base + "/register", { ...good, team: "Owls", email: "x" });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /value="Owls"/);
  s.close();
});

test("server: the admin queue approves, ticks paid and exports; the waitlist is shown apart", async () => {
  const s = await boot();
  Object.assign(s.state.fields, { regOpen: true, regFee: "$450", regMaxTeams: 7 });
  await post(s.base + "/register", good);
  await post(s.base + "/register", { ...good, team: "Volley Llamas", captain: "<script>x</script>" });
  const admin = await (await fetch(s.base + "/admin?key=adm")).text();
  assert.match(admin, /Sign-ups waiting for you \(1\)/);
  assert.match(admin, /Waitlist \(1\)/);
  assert.doesNotMatch(admin, /<script>x/);
  assert.equal((await post(s.base + "/admin/signup?key=wrong", { id: "1", act: "approve" })).status, 401);
  const r = await post(s.base + "/admin/signup?key=adm", { id: "1", act: "approve" });
  assert.equal(r.status, 303);
  assert.match(decodeURIComponent(r.headers.get("location")), /Pickle Rick added to Teams/);
  assert.match(s.state.fields.teams, /\nPickle Rick$/);
  await post(s.base + "/admin/signup?key=adm", { id: "1", act: "paid" });
  const csv = await (await fetch(s.base + "/admin/signups.csv?key=adm")).text();
  assert.match(csv, /approved,Pickle Rick,.*,yes,/);
  assert.match(csv, /waitlist,Volley Llamas/);
  const d = await post(s.base + "/admin/signup?key=adm", { id: "2", act: "decline" });
  assert.match(decodeURIComponent(d.headers.get("location")), /Volley Llamas declined/);
  assert.equal(s.state.registrations.length, 0);
  s.close();
});

test("server: admin saves the sign-up settings", async () => {
  const s = await boot();
  const fields = Object.fromEntries(Object.entries(s.state.fields).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v === true ? "1" : v === false ? "" : String(v)]));
  await post(s.base + "/admin/save?key=adm", { ...fields, regOpen: "1", regFee: "$300", regPayUrl: "https://pay.example.org/y", regMaxTeams: "10", regCloses: "2026-09-20", act: "save" });
  assert.deepEqual(regSettings(s.state.fields), { open: true, fee: "$300", payUrl: "https://pay.example.org/y", maxTeams: 10, closes: "2026-09-20" });
  assert.match(await (await fetch(s.base + "/register")).text(), /4 of 10 places left/);
  s.close();
});
