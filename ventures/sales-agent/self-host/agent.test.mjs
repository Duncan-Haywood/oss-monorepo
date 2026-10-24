import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync as rf } from "node:fs";
import { Imap, parseMessage } from "./imap.mjs";
import { fakeImap } from "./fake-imap.mjs";
import { fakeSmtp } from "./fake-smtp.mjs";
import { buildMessage } from "./smtp.mjs";
import { createAgent } from "./agent.mjs";

const mail = (from, subject, body, extra = "") => `From: ${from}\r\nSubject: ${subject}\r\nDate: Mon, 26 Oct 2026 09:00:00 +0000\r\nMessage-ID: <${(from + subject).replace(/\W/g, "")}@x>\r\n${extra}\r\n${body}`;

test("MIME: plain, quoted-printable, base64 html, multipart, encoded subject", () => {
  assert.equal(parseMessage(mail("a@b.co", "Hi", "hello")).text, "hello");
  const qp = parseMessage(mail("a@b.co", "Hi", "caf=C3=A9 =\r\nok", "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n"));
  assert.equal(qp.text, "café ok");
  const html = parseMessage(mail("a@b.co", "Hi", Buffer.from("<p>Please <b>stop</b></p>").toString("base64"), "Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n"));
  assert.equal(html.text, "Please stop");
  const multi = parseMessage(mail("a@b.co", "Hi", "--B\r\nContent-Type: text/html\r\n\r\n<p>html</p>\r\n--B\r\nContent-Type: text/plain\r\n\r\nplain wins\r\n--B--\r\n", 'Content-Type: multipart/alternative; boundary="B"\r\n'));
  assert.equal(multi.text, "plain wins");
  assert.equal(parseMessage("From: x@y.co\r\nSubject: =?UTF-8?B?Q2Fmw6k=?=\r\n\r\nb").headers.subject, "Café");
});

test("IMAP client is read-only: EXAMINE and BODY.PEEK only", async () => {
  const f = fakeImap({ messages: { 1: mail("a@b.co", "x", "hi") } });
  const port = await f.listen();
  const c = new Imap({ host: "127.0.0.1", port, secure: false });
  await c.connect(); await c.login("me@example.com", "pw"); await c.examine();
  assert.deepEqual(await c.search("UID 1:*"), [1]);
  assert.match(await c.fetchRaw(1), /Subject: x/);
  await c.logout(); await f.close();
  const verbs = f.log.map((l) => l.split(" ").slice(1, 3).join(" ").toUpperCase());
  assert.ok(verbs.some((v) => v.startsWith("EXAMINE")));
  assert.ok(!f.log.some((l) => /\b(SELECT|STORE|EXPUNGE|DELETE|APPEND|COPY|MOVE)\b/i.test(l)));
  assert.ok(f.log.filter((l) => /FETCH/.test(l)).every((l) => /BODY\.PEEK/.test(l)));
});

test("end to end: poll, triage, stop on unsubscribe, approval, audit; wrong password leaks nothing", async () => {
  const f = fakeImap({ messages: {
    1: mail("Dana <dana@bright.example>", "Re: routes", "Unsubscribe me please, stop emailing."),
    2: mail("Lee <lee@corp.example>", "Re: routes", "This sounds interesting. Could you send over a few times next week for a quick call?"),
    3: mail("Me <me@example.com>", "Re: routes", "my own sent copy"),
  } });
  const port = await f.listen();
  const env = { ADMIN_TOKEN: "x".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), IMAP_HOST: "127.0.0.1", IMAP_PORT: String(port), IMAP_SECURE: "false", IMAP_USER: "me@example.com", IMAP_PASS: "pw", PORT: "0" };
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  assert.equal(await a.poll(), 2);
  assert.equal(await a.poll(), 0, "second poll sees nothing new (UID cursor)");
  const [dana, lee] = a.state.items;
  assert.equal(dana.triage.category, "unsubscribe");
  assert.equal(dana.draft, null);
  assert.equal(a.state.suppression[0].email, "dana@bright.example");
  assert.equal(lee.triage.category, "interested");
  assert.equal(lee.decision, "pending");
  assert.equal(a.decide(lee.id, "bogus"), null);
  assert.equal(a.decide(dana.id, "approved"), null, "nothing to approve on an unsubscribe");
  assert.match(a.decide(lee.id, "approved").error, /placeholder/);
  assert.equal(a.decide(lee.id, "approved", "Happy to. Tuesday or Wednesday at 2pm?\nSam").decision, "approved");
  const audit = rf(join(env.DATA_DIR, "audit.jsonl"), "utf8").trim().split("\n").map(JSON.parse).map((e) => e.event);
  assert.deepEqual(audit.filter((e) => e !== "poll"), ["suppress", "triage", "triage", "decision"]);
  await f.close();

  const bad = createAgent({ ...env, DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), IMAP_PASS: "secret-wrong" });
  const f2 = fakeImap(); const p2 = await f2.listen();
  const bad2 = createAgent({ ...env, DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), IMAP_PORT: String(p2), IMAP_PASS: "secret-wrong" });
  assert.equal(await bad2.poll(), 0);
  assert.match(bad2.state.lastError, /bad credentials/);
  assert.ok(!JSON.stringify(bad2.state).includes("secret-wrong"));
  await f2.close();
});

test("unfilled placeholders block approval; HTTP needs the token", async () => {
  const env = { ADMIN_TOKEN: "y".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")) };
  const a = createAgent(env);
  await a.ingest([{ id: "q1", block: "From: Pat <pat@x.example>\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?" }]);
  const it = a.state.items[0];
  assert.equal(it.triage.category, "question");
  assert.match(a.decide(it.id, "approved").error, /placeholder/);
  assert.equal(a.decide(it.id, "approved", "Yes it does. Thanks, Sam").decision, "approved");
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${a.server.address().port}`;
  assert.equal((await fetch(base + "/api/queue")).status, 401);
  assert.equal((await fetch(base + "/api/queue", { headers: { authorization: "Bearer nope" } })).status, 401);
  const ok = await fetch(base + `/?token=${env.ADMIN_TOKEN}`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Approval queue/);
  assert.equal((await fetch(base + "/healthz")).status, 200);
  a.server.close();
  assert.throws(() => createAgent({ ADMIN_TOKEN: "short" }), /ADMIN_TOKEN/);
});

test("sending stays off unless SEND_ENABLED; the IMAP side has no write verbs", async () => {
  for (const w of ["imap.mjs"]) assert.ok(!/smtp|sendmail|nodemailer|createTransport|APPEND |UID STORE|EXPUNGE/i.test(readFileSync(new URL(w, import.meta.url), "utf8").replace(/^\/\/.*$/gm, "")), w);
  const f = fakeSmtp(); const port = await f.listen();
  const a = createAgent({ ADMIN_TOKEN: "z".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port) });
  await a.ingest([{ id: "<q9@x>", block: "From: Pat <pat@x.example>\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?" }]);
  a.decide("<q9@x>", "approved", "Yes it does. Thanks, Sam");
  assert.match((await a.send("<q9@x>")).error, /sending is off/);
  assert.equal(f.log.length, 0, "no connection was opened");
  await f.close();
});

const sendEnv = (port, extra = {}) => ({ ADMIN_TOKEN: "s".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), SEND_ENABLED: "true", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_SECURE: "false", SMTP_ALLOW_CLEAR: "true", SMTP_USER: "me@example.com", SMTP_PASS: "pw", SMTP_FROM: "me@example.com", ...extra });
const queued = async (a, id = "<q1@x>", who = "Pat <pat@x.example>") => {
  await a.ingest([{ id, block: `From: ${who}\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?` }]);
  return a.decide(id, "approved", "Yes it does.\n.A line that starts with a dot.\nThanks, Sam");
};

test("send: approved draft goes out with List-Unsubscribe, footer, threading, dot-stuffing; audit and repeat guard", async () => {
  const f = fakeSmtp(); const port = await f.listen();
  const env = sendEnv(port);
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  await queued(a);
  assert.equal(await a.send("nope"), null);
  assert.equal((await a.send("<q1@x>")).sentAt, "2026-10-26T10:00:00.000Z");
  assert.equal(f.delivered.length, 1);
  const raw = f.delivered[0].raw, [head, b64] = raw.split("\r\n\r\n");
  assert.deepEqual([f.delivered[0].from, f.delivered[0].rcpt], ["me@example.com", ["pat@x.example"]]);
  assert.match(head, /^List-Unsubscribe: <mailto:me@example\.com\?subject=unsubscribe>$/m);
  assert.match(head, /^In-Reply-To: <q1@x>$/m);
  assert.match(head, /^Subject: Re: Q$/m);
  const body = Buffer.from(b64.replace(/\s+/g, ""), "base64").toString();
  assert.match(body, /^\.A line that starts with a dot\.$/m, "dot-stuffing round-trips");
  assert.match(body, /Reply "unsubscribe"/);
  assert.ok(!f.log.some((l) => /pw/.test(l)), "password is never logged by the fake except as (credential)");
  assert.match((await a.send("<q1@x>")).error, /already sent/);
  assert.equal(f.delivered.length, 1);
  const ev = readFileSync(join(env.DATA_DIR, "audit.jsonl"), "utf8").trim().split("\n").map(JSON.parse).map((e) => e.event);
  assert.ok(ev.includes("send"));
  await f.close();
});

test("send refuses: not approved, suppressed recipient, daily cap, rejected recipient and bad password leak nothing", async () => {
  const f = fakeSmtp({ rcptReject: ["gone@x.example"] }); const port = await f.listen();
  const env = sendEnv(port, { SEND_MAX_PER_DAY: "1" });
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  await a.ingest([{ id: "<p@x>", block: "From: Pat <pat@x.example>\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?" }]);
  assert.match((await a.send("<p@x>")).error, /approve the draft first/);
  a.decide("<p@x>", "approved", "Yes. Sam");
  a.state.suppression.push({ email: "PAT@x.example", reason: "unsubscribe" });
  assert.match((await a.send("<p@x>")).error, /suppression list/);
  a.state.suppression.length = 0;
  assert.ok((await a.send("<p@x>")).sentAt);
  await queued(a, "<g@x>", "Gone <gone@x.example>");
  assert.match((await a.send("<g@x>")).error, /daily cap/);
  a.state.sentDays = {};
  assert.match((await a.send("<g@x>")).error, /550/);
  assert.equal(f.delivered.length, 1);
  await f.close();
  const f2 = fakeSmtp(); const p2 = await f2.listen();
  const bad = createAgent(sendEnv(p2, { SMTP_PASS: "secret-wrong" }));
  await queued(bad);
  const r = await bad.send("<q1@x>");
  assert.match(r.error, /535/);
  assert.ok(!JSON.stringify(r).includes("secret-wrong") && !JSON.stringify(bad.state).includes("secret-wrong"));
  await f2.close();
});

test("clear-text credentials are refused without TLS; header injection is stripped; HTTP send needs the token", async () => {
  const f = fakeSmtp(); const port = await f.listen();
  const a = createAgent(sendEnv(port, { SMTP_ALLOW_CLEAR: "false" }));
  await queued(a);
  assert.match((await a.send("<q1@x>")).error, /clear text/);
  assert.equal(f.delivered.length, 0);
  const m = buildMessage({ from: "Sam <me@example.com>", to: "pat@x.example", subject: "Hi\r\nBcc: evil@x.example", body: "hello" });
  assert.ok(!/^Bcc:/m.test(m.raw));
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${a.server.address().port}`;
  assert.equal((await fetch(base + "/api/send", { method: "POST", body: "{}" })).status, 401);
  a.server.close(); await f.close();
});
