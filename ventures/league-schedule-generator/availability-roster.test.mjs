import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { readSpec, buildSchedule, sampleFields } from "./calc.mjs";
import { upcomingGames, recordAvailability, parseRosters, notAnswered, availabilityHtml, shortTeamsHtml, availabilityCsv, parseContacts, remindersDue, MAX_ROSTER } from "./availability.mjs";
import { smtpConfig, sendMail, buildMessage } from "./mailer.mjs";
import { handler, emptyState, runReminders } from "./server.mjs";

const sample = () => buildSchedule(readSpec(sampleFields()).spec);

test("parseRosters matches team names case-insensitively, keeps a name once, reports unknown teams and bad lines", () => {
  const s = sample(), [a, b] = s.teams;
  const r = parseRosters(`${a.toUpperCase()}: Ana, Ben, ana ,, Cara\n${b}: Dev\nNobody FC: Zed\njust words\n${b}: a\u0007b`, s.teams);
  assert.deepEqual(r.rosters, { [a]: ["Ana", "Ben", "Cara"], [b]: ["Dev"] });
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join("\n"), /Nobody FC/);
  const many = parseRosters(`${a}: ` + Array.from({ length: MAX_ROSTER + 3 }, (_, i) => "P" + i).join(","), s.teams);
  assert.equal(many.rosters[a].length, MAX_ROSTER);
  assert.equal(many.errors.length, 1);
});

test("roster names with no answer are listed on the page, in the nudge and in the CSV", () => {
  const s = sample(), games = upcomingGames(s, s.rounds[0].day, 1), g = games[0];
  const rosters = parseRosters(`${g.homeName}: Ana, Ben, Cara`, s.teams).rosters;
  const store = {};
  recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "ben", status: "in" }, games, Date.UTC(2026, 0, 2));
  recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "=SUM(A1)", status: "maybe" }, games, Date.UTC(2026, 0, 3));
  assert.deepEqual(notAnswered(store, g.fixture, g.homeName, rosters), ["Ana", "Cara"]);
  const html = availabilityHtml(store, games, { token: "t", minPlayers: 3, rosters });
  assert.match(html, /No answer yet: Ana, Cara/);
  assert.match(html, /<datalist id="roster-0"><option value="Ana"><option value="Ben"><option value="Cara"><\/datalist>/);
  assert.ok(html.includes(`"${g.fixture}|${g.home}":"roster-0"`), "the picker maps the home pick to the roster");
  assert.ok(!html.includes(`"${g.fixture}|${g.away}":`), "a team with no roster gets no list");
  assert.match(shortTeamsHtml(store, games, 3, rosters), /Not heard from: Ana, Cara\./);
  const csv = availabilityCsv(store, games, rosters).split("\r\n");
  assert.equal(csv[0], "date,time,court,team,opponent,player,answer,answered_at");
  const mine = csv.filter((l) => l.includes(`,${g.homeName},`));
  assert.equal(mine.length, 4);
  assert.ok(mine.some((l) => l.endsWith(",ben,in,2026-01-02T00:00:00.000Z")));
  assert.ok(mine.some((l) => l.includes(",'=SUM(A1),maybe,")), "formula-like names are defused");
  assert.ok(mine.some((l) => l.endsWith(",Ana,no answer,")) && mine.some((l) => l.endsWith(",Cara,no answer,")));
  assert.equal(availabilityHtml(store, games, { rosters: {} }).includes("<datalist"), false);
});

test("parseContacts keeps plain addresses only, so nothing typed can add a mail header", () => {
  const s = sample(), [a, b] = s.teams;
  const r = parseContacts(`${a}: cap@example.org, second@example.org cap@example.org\n${b}: not-an-address, x@y.org\r\nBcc: z@example.org\n${b}: "Evil" <e@x.org>`, s.teams);
  assert.deepEqual(r.contacts, { [a]: ["cap@example.org", "second@example.org"], [b]: ["x@y.org"] });
  assert.ok(r.errors.length >= 3);
});

test("remindersDue: short teams within two days, once each, to the team contacts and the organiser", () => {
  const s = sample(), today = s.rounds[0].day;
  const games = upcomingGames(s, today, 99), g = games[0];
  const contacts = { [g.homeName]: ["cap@example.org"] };
  const store = {};
  for (const n of ["A", "B"]) recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: n, status: "in" }, games);
  recordAvailability(store, { fixture: g.fixture, team: g.homeName, name: "C", status: "maybe" }, games);
  assert.deepEqual(remindersDue(store, games, { minPlayers: 0, today, contacts }), []);
  const due = remindersDue(store, games, { minPlayers: 3, today, contacts, rosters: { [g.homeName]: ["A", "B", "C", "Dee"] }, leagueUrl: "https://l.example.org/league?t=x" });
  const mine = due.find((r) => r.key === `${g.fixture}|${g.homeName}`);
  assert.deepEqual(mine.to, ["cap@example.org"]);
  assert.match(mine.subject, /short 1 for/);
  assert.match(mine.text, /2 of 3 players in/);
  assert.match(mine.text, /1 said maybe/);
  assert.match(mine.text, /Not heard from yet: Dee\./);
  assert.match(mine.text, /https:\/\/l\.example\.org\/league\?t=x/);
  assert.ok(due.every((r) => r.to.length), "teams with no contact and no organiser get nothing");
  assert.ok(due.every((r) => games.find((x) => r.key.startsWith(x.fixture + "|")).day <= today + 2));
  const withOrg = remindersDue(store, games, { minPlayers: 3, today, contacts, organiser: "org@example.org" });
  assert.ok(withOrg.length > due.length, "the organiser copy reaches teams with no contact");
  assert.ok(withOrg.every((r) => r.to.includes("org@example.org")));
  const later = games.filter((x) => x.day > today + 2);
  assert.ok(later.length && withOrg.every((r) => !later.some((x) => r.key.startsWith(x.fixture + "|"))), "games more than two days out wait");
  const sent = { [mine.key]: 1 };
  assert.ok(!remindersDue(store, games, { minPlayers: 3, today, contacts, sent }).some((r) => r.key === mine.key));
});

test("smtpConfig is off without SMTP_HOST and refuses half-set config", () => {
  assert.equal(smtpConfig({}), null);
  assert.ok(smtpConfig({ SMTP_HOST: "mail.example.org" }).error);
  assert.ok(smtpConfig({ SMTP_HOST: "bad host", SMTP_FROM: "a@b.org" }).error);
  assert.deepEqual(smtpConfig({ SMTP_HOST: "mail.example.org", SMTP_PORT: "465", SMTP_USER: "u@b.org", SMTP_PASS: "p" }), { host: "mail.example.org", port: 465, secure: true, user: "u@b.org", pass: "p", from: "u@b.org" });
  assert.equal(smtpConfig({ SMTP_HOST: "m.example.org", SMTP_FROM: "a@b.org" }).secure, false);
});

test("buildMessage: CRLF headers, encoded non-ASCII subject, base64 body, no header injection", () => {
  const m = buildMessage({ from: "l@example.org", to: ["a@example.org"], subject: "Zoë's team\r\nBcc: x@y.org", text: "Line 1\nLine 2", date: new Date(Date.UTC(2026, 10, 18)), id: "abc" });
  const [head, body] = m.split("\r\n\r\n");
  assert.ok(!/\r\nBcc:/i.test(head));
  assert.match(head, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/m);
  assert.match(head, /^Message-ID: <abc@example\.org>$/m);
  assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), "Line 1\r\nLine 2");
});

/** A fake SMTP server: records commands, refuses one recipient, offers no STARTTLS. */
function fakeSmtp({ refuse = "nobody@example.org", authOk = true } = {}) {
  const log = [];
  const srv = net.createServer((c) => {
    let buf = "", inData = false, data = "";
    c.write("220 fake ESMTP\r\n");
    c.on("data", (d) => {
      buf += d.toString("latin1");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === ".") { inData = false; log.push({ data }); c.write("250 queued\r\n"); } else data += line + "\r\n"; continue; }
        log.push(line);
        if (/^EHLO/.test(line)) c.write("250-fake\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
        else if (/^AUTH PLAIN/.test(line)) c.write(authOk ? "235 ok\r\n" : "535 no\r\n");
        else if (/^MAIL FROM/.test(line)) c.write("250 ok\r\n");
        else if (/^RCPT TO/.test(line)) c.write(line.includes(refuse) ? "550 no such user\r\n" : "250 ok\r\n");
        else if (line === "DATA") { inData = true; c.write("354 go\r\n"); }
        else if (line === "QUIT") { c.write("221 bye\r\n"); c.end(); }
        else c.write("500 what\r\n");
      }
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r({ srv, log, port: srv.address().port })));
}

test("sendMail speaks SMTP: auth, a refused recipient skipped, the message delivered", async () => {
  const { srv, log, port } = await fakeSmtp();
  try {
    const cfg = { host: "127.0.0.1", port, secure: false, user: "u", pass: "p", from: "league@example.org" };
    const r = await sendMail(cfg, { to: ["cap@example.org", "nobody@example.org", "bad address"], subject: "Hawks short", text: "hello\n.\nend" });
    assert.deepEqual(r.accepted, ["cap@example.org"]);
    assert.ok(log.includes("EHLO example.org"));
    assert.ok(log.includes(`AUTH PLAIN ${Buffer.from("\0u\0p").toString("base64")}`));
    assert.ok(log.includes("MAIL FROM:<league@example.org>"));
    const data = log.find((x) => x.data).data;
    assert.match(data, /^To: cap@example\.org$/m);
    assert.ok(log.includes("QUIT"));
  } finally { srv.close(); }
});

test("sendMail refuses a password on an unencrypted remote connection, and reports a failed login", async () => {
  const { srv, port } = await fakeSmtp({ authOk: false });
  try {
    await assert.rejects(sendMail({ host: "127.0.0.1", port, secure: false, user: "u", pass: "p", from: "l@example.org" }, { to: ["a@example.org"], subject: "s", text: "t" }), /SMTP 535/);
    const viaName = (cfg) => net.connect({ host: "127.0.0.1", port });
    await assert.rejects(sendMail({ host: "mail.example.org", port, secure: false, user: "u", pass: "p", from: "l@example.org" }, { to: ["a@example.org"], subject: "s", text: "t" }, { connect: viaName }), /refusing to send the password/);
    await assert.rejects(sendMail({ host: "127.0.0.1", port, secure: false, user: "", pass: "", from: "l@example.org" }, { to: ["nobody@example.org"], subject: "s", text: "t" }), /refused every recipient/);
  } finally { srv.close(); }
});

function shortLeague() {
  const state = emptyState();
  state.published = true;
  state.fields.minPlayers = 4;
  const s = sample();
  state.fields.rosters = `${s.teams[0]}: Ana, Ben\n${s.teams[1]}: Cara`;
  state.fields.contacts = s.teams.map((t, i) => `${t}: cap${i}@example.org`).join("\n");
  return { state, s };
}

test("runReminders sends each due reminder once, remembers it, and is off without SMTP", async () => {
  const { state, s } = shortLeague();
  const day0 = s.rounds[0].day, clock = () => day0 * 86400000 + 3600000;
  const sent = [];
  const mail = async (cfg, m) => { if (m.to.includes("cap1@example.org")) throw new Error("boom"); sent.push(m); return { ok: true }; };
  const env = { SMTP_HOST: "mail.example.org", SMTP_FROM: "l@example.org", REMINDER_TO: "org@example.org", PUBLIC_URL: "https://l.example.org", LEAGUE_TOKEN: "tok" };
  let saves = 0;
  assert.deepEqual(await runReminders(state, () => saves++, {}, clock, mail), { sent: 0, failed: 0, skipped: true });
  const r1 = await runReminders(state, () => saves++, env, clock, mail);
  assert.ok(r1.sent > 0 && r1.failed === 1);
  assert.equal(saves, 1);
  assert.ok(sent.every((m) => m.to.includes("org@example.org") && m.text.includes("https://l.example.org/league?t=tok")));
  assert.ok(sent.some((m) => /Not heard from yet: Ana, Ben\./.test(m.text)));
  const r2 = await runReminders(state, () => saves++, env, clock, mail);
  assert.equal(r2.sent, 0, "already-sent reminders are not sent again");
  assert.equal(r2.failed, 1, "the failed one is retried");
  state.remindersSent["gone-1|X"] = 1;
  await runReminders(state, () => {}, env, clock, mail);
  assert.equal(state.remindersSent["gone-1|X"], undefined, "keys for past games are dropped");
});

test("server: the admin page takes rosters and contacts, says reminders are off, and serves the answers CSV", async () => {
  const { state, s } = shortLeague();
  const day0 = s.rounds[0].day, clock = () => day0 * 86400000 + 3600000;
  const srv = http.createServer(handler(state, () => {}, { ADMIN_KEY: "adm", LEAGUE_TOKEN: "tok" }, clock));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const g = upcomingGames(s, day0).find((x) => x.home === 0 || x.away === 0);
    const r = await fetch(base + "/league/available?t=tok", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ pick: `${g.fixture}|0`, name: "Ana", status: "in" }) });
    assert.equal(r.status, 200);
    const league = await (await fetch(base + "/league?t=tok")).text();
    assert.match(league, /No answer yet: Ben/);
    assert.ok(!league.includes("cap0@example.org"), "contacts never reach the player page");
    const admin = await (await fetch(base + "/admin?key=adm")).text();
    assert.match(admin, /name="rosters"/);
    assert.match(admin, /name="contacts"/);
    assert.match(admin, /Reminder emails are off/);
    assert.match(admin, /availability\.csv\?key=adm/);
    assert.equal((await fetch(base + "/admin/availability.csv?key=nope")).status, 401);
    const csvRes = await fetch(base + "/admin/availability.csv?key=adm");
    assert.equal(csvRes.headers.get("content-type"), "text/csv; charset=utf-8");
    const csv = await csvRes.text();
    assert.ok(csv.includes(`,${s.teams[0]},`) && csv.includes(",Ana,in,") && csv.includes(",Ben,no answer,"));
  } finally { srv.close(); }
});
