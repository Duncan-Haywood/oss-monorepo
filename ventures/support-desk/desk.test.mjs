import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, createMailbox, normalizeInbound, stripQuoted, ingest, addReply, addNote, updateTicket, autoClose, addMacro, suggest, renderMacro, triage, slaState, summary, list, toCsv, purgeOlderThan } from "./desk.mjs";

const H = 3_600_000;
const mk = () => { const s = newState(); const mb = createMailbox(s, { name: "Support", replyTo: "help@acme.test", slaHours: 8 }, 0); return { s, mb }; };
const mail = (o) => normalizeInbound({ from: "Ann <ann@x.com>", subject: "Hi", text: "hello", messageId: `<${Math.random()}@x>`, ...o });

test("normalizeInbound reads Postmark, Mailgun and plain shapes", () => {
  const pm = normalizeInbound({ FromFull: { Email: "A@X.com", Name: "Ann" }, Subject: "S", TextBody: "body", MessageID: "pm1", Headers: [{ Name: "In-Reply-To", Value: "<r1>" }] });
  assert.deepEqual([pm.fromEmail, pm.fromName, pm.messageId, pm.inReplyTo], ["a@x.com", "Ann", "pm1", "<r1>"]);
  const mg = normalizeInbound({ sender: "b@y.org", subject: "T", "stripped-text": "mg body", "Message-Id": "<mg1>" });
  assert.deepEqual([mg.fromEmail, mg.text, mg.messageId], ["b@y.org", "mg body", "<mg1>"]);
  assert.equal(normalizeInbound({ data: { from: "c@z.io", subject: "R", text: "resend" } }).fromEmail, "c@z.io");
});

test("automated mail is flagged so two robots cannot loop", () => {
  assert.ok(normalizeInbound({ from: "mailer-daemon@x.com", subject: "x", text: "y" }).automated);
  assert.ok(normalizeInbound({ from: "a@x.com", subject: "Out of office", text: "y" }).automated);
  assert.ok(normalizeInbound({ from: "a@x.com", subject: "s", text: "y", headers: { "auto-submitted": "auto-replied" } }).automated);
  assert.ok(!normalizeInbound({ from: "a@x.com", subject: "s", text: "y" }).automated);
});

test("stripQuoted drops the quoted thread", () => {
  assert.equal(stripQuoted("Thanks, fixed.\n\nOn Mon, Jan 5, 2026 at 9:00 AM Acme <h@a.com> wrote:\n> old"), "Thanks, fixed.");
  assert.equal(stripQuoted("Yes\n> quoted\n"), "Yes");
  assert.equal(stripQuoted("Hi\n-----Original Message-----\nFrom: x"), "Hi");
});

test("a reply carrying the ticket reference joins the ticket; a stranger quoting it does not", () => {
  const { s, mb } = mk();
  const t = ingest(s, mb.id, mail({ subject: "Login broken" }), 0).ticket;
  const again = ingest(s, mb.id, mail({ subject: `Re: Login broken [#${t.n}]`, text: "still broken" }), 1000);
  assert.equal(again.created, false); assert.equal(t.messages.length, 2);
  const stranger = ingest(s, mb.id, mail({ from: "evil@x.com", subject: `Re: Login broken [#${t.n}]` }), 2000);
  assert.equal(stranger.created, true); assert.equal(t.messages.length, 2);
});

test("duplicate deliveries and automated mail are ignored", () => {
  const { s, mb } = mk();
  const p = mail({ messageId: "<same>" });
  assert.ok(ingest(s, mb.id, p, 0).created);
  assert.equal(ingest(s, mb.id, p, 1).ignored, "duplicate delivery");
  assert.ok(ingest(s, mb.id, mail({ from: "no-reply@x.com" }), 2).ignored);
  assert.ok(ingest(s, mb.id, mail({ from: "help@acme.test" }), 3).ignored);
  assert.equal(Object.keys(s.tickets).length, 1);
});

test("a customer reply reopens a pending or closed ticket", () => {
  const { s, mb } = mk();
  const t = ingest(s, mb.id, mail({}), 0).ticket;
  addReply(s, t, "try this", { status: "closed" }, 1000);
  assert.equal(t.status, "closed"); assert.equal(t.firstResponseAt, 1000);
  ingest(s, mb.id, mail({ subject: `Re: Hi [#${t.n}]`, text: "nope" }), 2000);
  assert.equal(t.status, "open");
  addReply(s, t, "ok", { status: "pending" }, 3000); assert.equal(t.firstResponseAt, 1000);
});

test("triage raises money and outage mail and flags spam with reasons", () => {
  assert.equal(triage("URGENT: charged twice", "I was double charged!!! refund me").priority, "high");
  assert.equal(triage("Idea", "feature request, no rush, thanks!").priority, "low");
  assert.equal(triage("Question", "How do I export?").priority, "normal");
  const sp = triage("SEO service", "Buy backlinks https://spam.example");
  assert.ok(sp.spam); assert.ok(sp.reasons.some((r) => /backlink/.test(r)));
  const { s, mb } = mk();
  assert.equal(ingest(s, mb.id, mail({ subject: "seo service", text: "backlink https://x.co" }), 0).ticket.status, "spam");
});

test("first-reply target shrinks for high priority and tracks met, missed and overdue", () => {
  const { s, mb } = mk();
  const hi = ingest(s, mb.id, mail({ subject: "outage urgent", text: "site is down" }), 0).ticket;
  assert.equal(hi.priority, "high");
  assert.equal(slaState(hi, mb, 1 * H).state, "ok"); // 8h / 4 = 2h
  assert.equal(slaState(hi, mb, 1.5 * H).state, "soon");
  assert.equal(slaState(hi, mb, 3 * H).state, "overdue");
  addReply(s, hi, "on it", {}, 3 * H); assert.equal(slaState(hi, mb, 4 * H).state, "missed");
  const n = ingest(s, mb.id, mail({ from: "b@x.com", subject: "q" }), 0).ticket;
  addReply(s, n, "answer", {}, 5 * H); assert.equal(slaState(n, mb, 9 * H).state, "met");
});

test("overdue tickets sort first in the open list", () => {
  const { s, mb } = mk();
  const a = ingest(s, mb.id, mail({ from: "a@x.com", subject: "old" }), 0).ticket;
  const b = ingest(s, mb.id, mail({ from: "b@x.com", subject: "new" }), 20 * H).ticket;
  b.updated = 30 * H;
  assert.deepEqual(list(s, {}, 21 * H).map((t) => t.id), [a.id, b.id]);
  assert.equal(list(s, { q: "NEW" }, 21 * H).length, 1);
});

test("suggest ranks the macro whose words match the message", () => {
  const s = newState();
  addMacro(s, { title: "Refund policy", keywords: "refund money back charged", body: "We refund within 30 days." });
  addMacro(s, { title: "Reset password", keywords: "password login locked", body: "Use the reset link on the login page." });
  const r = suggest("I was charged twice and want my money back", s.macros);
  assert.equal(r[0].macro.title, "Refund policy");
  assert.equal(suggest("completely unrelated zebra", s.macros).length, 0);
  assert.equal(renderMacro("Hi {{name}} re {{ticket}} {{nope}}!", { name: "Ann", ticket: "[#4]" }), "Hi Ann re [#4] !");
});

test("autoClose only closes tickets waiting on the customer past the limit", () => {
  const { s, mb } = mk();
  const t = ingest(s, mb.id, mail({}), 0).ticket; addReply(s, t, "any news?", { status: "pending" }, 1000);
  assert.equal(autoClose(s, 7, 6 * 86_400_000), 0);
  assert.equal(autoClose(s, 7, 8 * 86_400_000), 1); assert.equal(t.status, "closed");
  assert.equal(autoClose(s, 0, 1e12), 0);
});

test("updateTicket cleans tags; summary and CSV are formula safe", () => {
  const { s, mb } = mk();
  const t = ingest(s, mb.id, mail({ subject: "=HYPERLINK(1)" }), 0).ticket;
  updateTicket(t, { tags: "Billing, <b>x</b> billing", priority: "high", assignee: "sam" });
  assert.deepEqual(t.tags, ["billing", "bxb"]);
  addReply(s, t, "r", { status: "closed" }, 60_000);
  addNote(s, t, "internal", "sam", 70_000);
  const sum = summary(s, 2 * H);
  assert.equal(sum.medianFirstResponseMin, 1); assert.equal(sum.slaMetPct, 100); assert.equal(sum.by.closed, 1);
  assert.match(toCsv(s), /'=HYPERLINK\(1\)/);
  assert.equal(purgeOlderThan(s, 1, 3 * 86_400_000), 1);
});
