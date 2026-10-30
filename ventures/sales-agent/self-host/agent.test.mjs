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
import { SAMPLE_CRM } from "../research.mjs";
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

test("research drafts enter the approval queue as outbound items; suppressed skipped; once; sent without Re:", async () => {
  const smtp = fakeSmtp(); const port = await smtp.listen();
  const dir = mkdtempSync(join(tmpdir(), "sa-"));
  const a = createAgent({ ADMIN_TOKEN: "v".repeat(16), DATA_DIR: dir, IMAP_USER: "me@example.com", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_USER: "me@example.com", SMTP_PASS: "pw" });
  const r = a.queueResearch({ crm: SAMPLE_CRM });
  assert.ok(r.added > 0, JSON.stringify(r));
  const again = a.queueResearch({ crm: SAMPLE_CRM });
  assert.equal(again.added, 0, "idempotent");
  const it = a.state.items[0];
  assert.ok(it.outbound && it.decision === "pending" && it.triage.category === "first_touch");
  assert.match((await a.send(it.id)).error, /approve the draft first/);
  assert.equal(smtp.delivered.length, 0, "queued is not sent");
  const body = it.draft.body.replace(/\[[^\]]+\]/g, "Sam");
  assert.equal(a.decide(it.id, "approved", body).decision, "approved");
  assert.ok((await a.send(it.id)).sentAt);
  assert.ok(!/^Subject: Re:/m.test(smtp.delivered[0]));
  assert.ok(!/^In-Reply-To:/m.test(smtp.delivered[0]));
  const sup = createAgent({ ADMIN_TOKEN: "v".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")) });
  sup.state.suppression.push({ email: it.from });
  sup.queueResearch({ crm: SAMPLE_CRM });
  assert.ok(!sup.state.items.some((x) => x.from === it.from), "suppressed address never queued");
  assert.ok(readFileSync(join(dir, "audit.jsonl"), "utf8").includes("research_queued"));
  await smtp.close();
});

test("headers beat words: a DSN names the failed prospect, a temporary one does not bounce, Auto-Submitted is an auto-reply", async () => {
  const { runInbox } = await import("../engine.mjs");
  const { toReplyBlock } = await import("./imap.mjs");
  const dsn = (status, action) => `From: MAILER-DAEMON@mx.example\r\nSubject: Notification\r\nDate: Mon, 26 Oct 2026 09:00:00 +0000\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="R"\r\n\r\n--R\r\nContent-Type: text/plain\r\n\r\nSee attached.\r\n--R\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; mx.example\r\n\r\nFinal-Recipient: rfc822; Jo@Acme.test\r\nAction: ${action}\r\nStatus: ${status}\r\n\r\n--R--\r\n`;
  const prospects = "email,first_name,company,status\njo@acme.test,Jo,Acme,contacted\nmo@acme.test,Mo,Acme,contacted\n";
  const hard = parseMessage(dsn("5.1.1", "failed"));
  assert.deepEqual([hard.dsn.recipient, hard.dsn.permanent], ["jo@acme.test", true]);
  let r = runInbox({ replies: toReplyBlock(hard), prospects, today: "2026-10-26" });
  assert.equal(r.items[0].triage.category, "bounce");
  assert.equal(r.prospects.find((p) => p.email === "jo@acme.test").status, "bounced");
  assert.ok(!r.prospects.some((p) => /mailer-daemon/.test(p.email)));
  const soft = parseMessage(dsn("4.2.2", "delayed"));
  r = runInbox({ replies: toReplyBlock(soft), prospects, today: "2026-10-26" });
  assert.equal(r.items[0].triage.category, "out_of_office");
  assert.notEqual(r.prospects.find((p) => p.email === "jo@acme.test").status, "bounced");
  const auto = parseMessage(mail("mo@acme.test", "Re: hello", "Thanks for your note. I am back on 2 November.", "Auto-Submitted: auto-replied\r\n"));
  r = runInbox({ replies: toReplyBlock(auto), prospects, today: "2026-10-26" });
  assert.equal(r.items[0].triage.category, "out_of_office");
  assert.equal(r.items[0].triage.date, "2026-11-02");
  const prec = parseMessage(mail("mo@acme.test", "Re: hello", "I am out of the office until 2 November.", "Precedence: auto_reply\r\n"));
  r = runInbox({ replies: toReplyBlock(prec), prospects, today: "2026-10-26" });
  assert.equal(r.items[0].triage.category, "out_of_office");
  const notified = parseMessage(mail("mo@acme.test", "Re: hello", "I am out of the office until 2 November.", "Auto-Submitted: auto-notified\r\n"));
  assert.match(toReplyBlock(notified), /X-Signal: auto-reply/);
  const bulk = parseMessage(mail("mo@acme.test", "Re: hello", "Sounds good, send me times.", "Precedence: bulk\r\n"));
  assert.ok(!/X-Signal/.test(toReplyBlock(bulk)));
});

test("a bounce naming several failed recipients stops every one of them (real DSNs from the mail gem's fixtures)", async () => {
  const { readFileSync } = await import("node:fs");
  const { runInbox } = await import("../engine.mjs");
  const { toReplyBlock } = await import("./imap.mjs");
  const m = parseMessage(readFileSync(new URL("../eval/bounce-corpus-mail/multi_address_bounce1.eml", import.meta.url), "latin1"));
  assert.equal(m.dsn.failed.length, 5);
  const prospects = "email,first_name\n" + m.dsn.failed.map((e) => `${e},A`).join("\n") + "\nkeep@acme.test,K\n";
  const r = runInbox({ replies: toReplyBlock(m), prospects, today: "2026-10-26" });
  assert.deepEqual(r.prospects.filter((p) => p.status === "bounced").map((p) => p.email).sort(), [...m.dsn.failed].sort());
  assert.equal(r.prospects.find((p) => p.email === "keep@acme.test").status || "", "");
});

test("M8a CRM write-back: note on an existing contact, opt-out on unsubscribe, nothing created, token never logged, CRM down does not stop triage", async () => {
  const { createServer } = await import("node:http");
  const calls = [];
  const known = { "dana@bright.example": 7, "lee@corp.example": 9 };
  const srv = createServer(async (req, res) => {
    let b = ""; for await (const c of req) b += c;
    calls.push({ m: req.method, u: req.url, h: req.headers, b: b ? JSON.parse(b) : null });
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/v1/persons/search")) { const e = new URL(req.url, "http://x").searchParams.get("term"); return res.end(JSON.stringify({ data: { items: known[e] ? [{ item: { id: known[e] } }] : [] } })); }
    if (req.url.startsWith("/crm/v3/objects/contacts/search")) { const e = JSON.parse(b).filterGroups[0].filters[0].value; return res.end(JSON.stringify({ results: known[e] ? [{ id: String(known[e]) }] : [] })); }
    res.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const env = { ADMIN_TOKEN: "x".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), PIPEDRIVE_API_TOKEN: "pd-secret-token", PIPEDRIVE_BASE: base, HUBSPOT_TOKEN: "hs-secret-token", HUBSPOT_BASE: base };
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  await a.ingest([
    { id: "<1@x>", block: "From: Dana <dana@bright.example>\nSubject: Re: routes\n\nUnsubscribe me please, stop emailing." },
    { id: "<2@x>", block: "From: Zed <zed@nobody.example>\nSubject: Re: routes\n\nUnsubscribe me please, stop emailing." },
  ]);
  const writes = calls.filter((c) => c.m !== "GET" && !/search/.test(c.u));
  assert.ok(writes.every((c) => /\/(notes|persons\/7|contacts\/7)$/.test(c.u) || c.u.endsWith("/notes")), "only notes and opt-outs, only on the known contact");
  assert.equal(calls.filter((c) => c.u === "/v1/notes").length, 1);
  assert.match(calls.find((c) => c.u === "/v1/notes").b.content, /Added to the suppression list/);
  assert.equal(calls.find((c) => c.u === "/v1/persons/7").b.marketing_status, "unsubscribed");
  assert.equal(calls.find((c) => c.u === "/crm/v3/objects/contacts/7").b.properties.hs_email_optout, "true");
  assert.equal(calls.find((c) => c.u === "/crm/v3/objects/notes").b.associations[0].to.id, "7");
  assert.equal(calls.find((c) => c.u === "/v1/notes").h["x-api-token"], "pd-secret-token");
  const audit = readFileSync(join(env.DATA_DIR, "audit.jsonl"), "utf8");
  assert.match(audit, /"found":false/);
  assert.ok(!/secret-token/.test(audit));
  await new Promise((r) => srv.close(r));
  // CRM unreachable: triage still lands, error is audited without the token
  const dirB = mkdtempSync(join(tmpdir(), "sa-"));
  const b = createAgent({ ...env, DATA_DIR: dirB, PIPEDRIVE_BASE: base, HUBSPOT_TOKEN: "" }, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  assert.equal(await b.ingest([{ id: "<3@x>", block: "From: Dana <dana@bright.example>\nSubject: Re: routes\n\nUnsubscribe me please." }]), 1);
  assert.equal(b.state.suppression.length, 1);
  const a2 = readFileSync(join(dirB, "audit.jsonl"), "utf8");
  assert.match(a2, /"crm_writeback".*"ok":false/);
  assert.ok(!/secret-token/.test(a2));
});

test("M8b stage move: only on a person's call, only an interested reply, only a single open deal, once", async () => {
  const { createServer } = await import("node:http");
  const calls = [];
  const deals = { 7: [{ id: 70 }], 9: [{ id: 90 }, { id: 91 }] };
  const known = { "dana@bright.example": 7, "lee@corp.example": 9 };
  const srv = createServer(async (req, res) => {
    let b = ""; for await (const c of req) b += c;
    calls.push({ m: req.method, u: req.url, b: b ? JSON.parse(b) : null });
    res.setHeader("content-type", "application/json");
    if (req.url.startsWith("/v1/persons/search")) { const e = new URL(req.url, "http://x").searchParams.get("term"); return res.end(JSON.stringify({ data: { items: known[e] ? [{ item: { id: known[e] } }] : [] } })); }
    const m = req.url.match(/^\/v1\/persons\/(\d+)\/deals/); if (m) return res.end(JSON.stringify({ data: deals[m[1]] }));
    if (req.url.startsWith("/crm/v3/objects/contacts/search")) { const e = JSON.parse(b).filterGroups[0].filters[0].value; return res.end(JSON.stringify({ results: known[e] ? [{ id: String(known[e]) }] : [] })); }
    const h = req.url.match(/^\/crm\/v4\/objects\/contacts\/(\d+)\/associations\/deals/); if (h) return res.end(JSON.stringify({ results: (deals[h[1]] || []).map((d) => ({ toObjectId: d.id })) }));
    res.end("{}");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const env = { ADMIN_TOKEN: "x".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), PIPEDRIVE_API_TOKEN: "pd-secret-token", PIPEDRIVE_BASE: base, PIPEDRIVE_MEETING_STAGE_ID: "5", HUBSPOT_TOKEN: "hs-secret-token", HUBSPOT_BASE: base, HUBSPOT_MEETING_STAGE: "meetingscheduled" };
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  await a.ingest([
    { id: "<1@x>", block: "From: Dana <dana@bright.example>\nSubject: Re: routes\n\nSounds interesting, can we book a call next week?" },
    { id: "<2@x>", block: "From: Lee <lee@corp.example>\nSubject: Re: routes\n\nYes, let's set up a call." },
    { id: "<3@x>", block: "From: Zed <zed@nobody.example>\nSubject: Re: routes\n\nUnsubscribe me please, stop emailing." },
  ]);
  const moves = () => calls.filter((c) => c.m !== "GET" && /\/deals\/\d+$/.test(c.u));
  assert.equal(moves().length, 0, "ingest alone never moves a stage");
  assert.equal(a.state.items[0].triage.category, "interested");
  const r = await a.moveDeal("<1@x>");
  assert.deepEqual(moves().map((c) => [c.m, c.u, JSON.stringify(c.b)]).sort(), [["PATCH", "/crm/v3/objects/deals/70", '{"properties":{"dealstage":"meetingscheduled"}}'], ["PUT", "/v1/deals/70", '{"stage_id":5}']]);
  assert.ok(r.results.every((x) => x.moved));
  assert.equal((await a.moveDeal("<1@x>")).error, "already moved");
  const two = await a.moveDeal("<2@x>");
  assert.match(two.results[0].reason, /several open deals/);
  assert.equal(moves().length, 2, "two open deals: nothing moved");
  assert.match((await a.moveDeal("<3@x>")).error, /only an interested/);
  assert.equal(await a.moveDeal("<nope>"), null);
  const audit = readFileSync(join(env.DATA_DIR, "audit.jsonl"), "utf8");
  assert.match(audit, /"crm_stage"/); assert.ok(!/secret-token/.test(audit));
  const off = createAgent({ ...env, DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), PIPEDRIVE_MEETING_STAGE_ID: "", HUBSPOT_MEETING_STAGE: "" }, { now: () => 0 });
  await off.ingest([{ id: "<4@x>", block: "From: Dana <dana@bright.example>\nSubject: Re: routes\n\nSounds good, let's book a call." }]);
  assert.match((await off.moveDeal("<4@x>")).error, /stage moves are off/);
  await new Promise((r) => srv.close(r));
});
