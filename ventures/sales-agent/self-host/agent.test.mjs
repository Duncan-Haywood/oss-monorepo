import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync as rf } from "node:fs";
import { Imap, parseMessage } from "./imap.mjs";
import { fakeImap } from "./fake-imap.mjs";
import { createAgent } from "./agent.mjs";
import { fakeSmtp } from "./fake-smtp.mjs";
import { buildMessage, sendMail } from "./smtp.mjs";

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

test("send code lives only in smtp.mjs and is called only from agent.mjs send(); the IMAP side stays read-only", () => {
  assert.ok(!/smtp|sendmail|nodemailer|createTransport|APPEND |UID STORE|EXPUNGE/i.test(readFileSync(new URL("imap.mjs", import.meta.url), "utf8").replace(/^\/\/.*$/gm, "")));
  const a = readFileSync(new URL("agent.mjs", import.meta.url), "utf8").replace(/^\/\/.*$/gm, "");
  assert.equal((a.match(/sendMail\(/g) || []).length, 1, "one call site");
  assert.ok(!/nodemailer|createTransport/i.test(a));
});

test("send: off without SMTP_HOST; approved only; once; suppressed and capped blocked; headers and audit", async () => {
  const smtp = fakeSmtp(); const port = await smtp.listen();
  const base = { ADMIN_TOKEN: "z".repeat(16), IMAP_USER: "me@example.com" };
  const mk = (extra = {}) => createAgent({ ...base, DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), ...extra }, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  const blk = (n, who) => ({ id: `<m${n}@x>`, block: `From: ${who}\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?` });
  const off = mk(); await off.ingest([blk(1, "Pat <pat@x.example>")]);
  off.decide(off.state.items[0].id, "approved", "Yes it does. Thanks, Sam");
  assert.match((await off.send(off.state.items[0].id)).error, /sending is off/);

  const a = mk({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_USER: "me@example.com", SMTP_PASS: "pw", SEND_MAX_PER_DAY: "2" });
  await a.ingest([blk(1, "Pat <pat@x.example>"), blk(2, "Kim <kim@x.example>"), blk(3, "Joe <joe@x.example>")]);
  const [p, k, j] = a.state.items;
  assert.match((await a.send(p.id)).error, /approve the draft first/);
  a.decide(p.id, "approved", "Yes it does. Thanks, Sam");
  const sent = await a.send(p.id);
  assert.ok(sent.sentAt);
  assert.equal(smtp.delivered.length, 1);
  const raw = smtp.delivered[0];
  assert.match(raw, /^List-Unsubscribe: <mailto:me@example\.com\?subject=unsubscribe>$/m);
  assert.match(raw, /^In-Reply-To: <m1@x>$/m);
  assert.match(raw, /^To: pat@x\.example$/m);
  assert.match(Buffer.from(raw.split("\r\n\r\n")[1], "base64").toString(), /Yes it does/);
  assert.ok(smtp.log.includes("RCPT TO:<pat@x.example>"));
  assert.match((await a.send(p.id)).error, /already sent/);
  assert.equal(smtp.delivered.length, 1, "never twice");
  a.state.suppression.push({ email: "kim@x.example" }); a.decide(k.id, "approved", "Yes. Sam");
  assert.match((await a.send(k.id)).error, /suppression/);
  a.decide(j.id, "approved", "Yes. Sam"); assert.ok((await a.send(j.id)).sentAt);
  a.state.items.push({ ...structuredClone(j), id: "<m4@x>", from: "Ann <ann@x.example>", sentAt: undefined, decision: "approved" });
  assert.match((await a.send("<m4@x>")).error, /daily cap/);
  await smtp.close();
});

test("send: a server refusal is reported, the password never appears, and the draft can be retried", async () => {
  const smtp = fakeSmtp({ rejectRcpt: "bad@" }); const port = await smtp.listen();
  const dir = mkdtempSync(join(tmpdir(), "sa-"));
  const a = createAgent({ ADMIN_TOKEN: "w".repeat(16), DATA_DIR: dir, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_USER: "me@example.com", SMTP_PASS: "pw", SEND_FROM: "Sam <me@example.com>" });
  await a.ingest([{ id: "<b1@x>", block: "From: Bo <bad@x.example>\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?" }]);
  const it = a.state.items[0]; a.decide(it.id, "approved", "Yes. Sam");
  const r = await a.send(it.id);
  assert.match(r.error, /RCPT TO: 550/);
  assert.equal(it.sentAt, undefined, "retryable");
  const wrong = createAgent({ ADMIN_TOKEN: "w".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_USER: "me@example.com", SMTP_PASS: "hunter2-wrong" });
  await wrong.ingest([{ id: "<b2@x>", block: "From: Al <al@x.example>\nSubject: Q\n\nDoes it integrate with QuickBooks, and how much does it cost?" }]);
  wrong.decide(wrong.state.items[0].id, "approved", "Yes. Sam");
  const e = (await wrong.send(wrong.state.items[0].id)).error;
  assert.match(e, /AUTH: 535/); assert.ok(!e.includes("hunter2-wrong"));
  assert.ok(!readFileSync(join(dir, "audit.jsonl"), "utf8").includes("hunter2"));
  await smtp.close();
});

test("buildMessage: header injection stripped, non-ASCII subject encoded, dots stuffed on the wire", async () => {
  const m = buildMessage({ from: "Sam <sam@co.example>", to: "x@y.example", subject: "Re: hi\r\nBcc: evil@z.example", body: ".leading dot\nline" });
  assert.ok(!/^Bcc:/m.test(m.raw));
  assert.match(buildMessage({ from: "a@b.co", to: "c@d.co", subject: "Café", body: "x" }).raw, /Subject: =\?UTF-8\?B\?/);
  const smtp = fakeSmtp({ user: "u", pass: "p" }); const port = await smtp.listen();
  await sendMail({ host: "127.0.0.1", port, user: "u", pass: "p" }, m);
  assert.match(Buffer.from(smtp.delivered[0].split("\r\n\r\n")[1], "base64").toString(), /^\.leading dot/);
  await smtp.close();
  assert.throws(() => buildMessage({ from: "nope", to: "c@d.co", subject: "s", body: "b" }), /email/);
});
