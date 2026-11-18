import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeImap } from "./fake-imap.mjs";
import { createAgent } from "./agent.mjs";
import { findSentBox, Imap } from "./imap.mjs";
import { buildPlan, toCsv } from "../../sales-cadence-builder/calc.mjs";

// The self-host server reads the mailbox's Sent folder over IMAP (headers only, read-only) and uses it as the daily
// queue's done list, as the page and CLI already do for exported mail files (daily-sent.test.mjs). Real cadence
// builder output; the mail server is the in-memory fake.
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const tasks = toCsv(plan.tasks);
const emails = (email) => plan.tasks.filter((t) => t.email === email && t.channel === "email");
const [d1, d2] = emails("dana@brightline.example");
const [o1] = emails("omar@harbor.example");

const sentMsg = ({ to, cc, subject, date, id }) => `Message-ID: <${id}@routing.example>\r\nDate: ${date}\r\nFrom: Sam Ortiz <me@example.com>\r\nTo: ${to}\r\n${cc ? `Cc: ${cc}\r\n` : ""}Subject: ${subject}\r\nContent-Type: text/plain\r\n\r\nThe body is never fetched from the Sent folder.\r\n`;

const setup = async (t, { boxes, env = {}, now = d2.date + "T18:00:00Z" } = {}) => {
  const f = fakeImap({ messages: {}, boxes });
  const port = await f.listen();
  t.after(() => f.close());
  const e = { ADMIN_TOKEN: "x".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-sent-")), IMAP_HOST: "127.0.0.1", IMAP_PORT: String(port), IMAP_SECURE: "false", IMAP_USER: "me@example.com", IMAP_PASS: "pw", ...env };
  let clock = Date.parse(now);
  const a = createAgent(e, { now: () => clock });
  return { f, a, e, setClock: (iso) => { clock = Date.parse(iso); } };
};
const due = (d) => d.queue.filter((q) => q.channel === "email").map((q) => `${q.email}|${q.step}`);

test("findSentBox: the \\Sent attribute first, then the usual names, never a \\Noselect parent", () => {
  assert.equal(findSentBox([{ name: "INBOX", flags: [] }, { name: "[Gmail]/Sent Mail", flags: ["\\hasnochildren", "\\sent"] }, { name: "Sent", flags: [] }]), "[Gmail]/Sent Mail");
  assert.equal(findSentBox([{ name: "INBOX", flags: [] }, { name: "Gesendete Elemente", flags: ["\\sent"] }]), "Gesendete Elemente");
  assert.equal(findSentBox([{ name: "INBOX", flags: [] }, { name: "INBOX.Sent", flags: [] }]), "INBOX.Sent");
  assert.equal(findSentBox([{ name: "Sent", flags: ["\\noselect"] }, { name: "Sent Items", flags: [] }]), "Sent Items");
  assert.equal(findSentBox([{ name: "INBOX", flags: [] }, { name: "Archive", flags: [] }]), null);
});

test("IMAP LIST parses quoted names with spaces and the attribute list", async (t) => {
  const f = fakeImap({ boxes: { "Sent Items": { flags: "\\HasNoChildren \\Sent", messages: {} } } });
  const port = await f.listen(); t.after(() => f.close());
  const c = new Imap({ host: "127.0.0.1", port, secure: false });
  await c.connect(); await c.login("me@example.com", "pw");
  const boxes = await c.list();
  assert.deepEqual(boxes.find((b) => b.name === "Sent Items").flags, ["\\hasnochildren", "\\sent"]);
  assert.equal((await c.examine("Sent Items")).uidValidity, 1);
  await c.logout();
});

test("poll reads the Sent folder's headers; the daily queue drops steps already sent and holds an off-plan email", async (t) => {
  const box = { flags: "\\Sent", uidValidity: 7, messages: {
    1: sentMsg({ id: "s1", to: "Dana Reyes <dana@brightline.example>", subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 +0000" }),
    2: sentMsg({ id: "s2", to: "someone@else.example", cc: "omar@harbor.example", subject: "The pricing sheet you asked for", date: `${o1.date.slice(8, 10)} ${["Oct", "Nov"][Number(o1.date.slice(5, 7)) - 10]} 2026 15:00:00 +0000`.replace(/^/, "Tue, ") }),
  } };
  const { f, a } = await setup(t, { boxes: { "Sent Items": box } });
  const before = a.daily({ tasks, maxOverdueDays: 30 });
  assert.ok(due(before).includes(`dana@brightline.example|${d1.step}`), "nothing read yet: step 1 is due");

  await a.poll();
  assert.equal(a.state.sentBox.name, "Sent Items");
  assert.equal(a.state.sent.length, 2);
  assert.deepEqual(a.state.sent[0], { date: "2026-10-26", to: ["dana@brightline.example"], subject: d1.subject, uid: 1 });
  assert.ok(a.state.sent[1].to.includes("omar@harbor.example"), "Cc counts as a recipient");

  const d = a.daily({ maxOverdueDays: 30 }); // the task list was kept from the first call
  assert.ok(!due(d).includes(`dana@brightline.example|${d1.step}`), "Dana's step 1 is in the Sent folder");
  assert.equal(d.summary.alreadySent, 1);
  assert.equal(d.sentBox, "Sent Items");
  assert.match(d.leftOutCsv, /already sent,.*in your sent mail on 2026-10-26/);
  const omar = d.held.find((x) => x.email === "omar@harbor.example" && x.step === String(o1.step));
  assert.ok(omar, "an off-plan email to Omar within two days holds his due step for a person to check");
  assert.match(omar.reason, /pricing sheet/);

  // Read-only on the wire: EXAMINE, never SELECT/STORE/COPY/MOVE/EXPUNGE; Sent messages fetched as header fields only.
  assert.ok(!f.log.some((l) => /\b(SELECT|STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE)\b/i.test(l)), f.log.join("\n"));
  const sentFetches = f.log.filter((l) => /UID FETCH/.test(l));
  assert.ok(sentFetches.length === 2 && sentFetches.every((l) => /BODY\.PEEK\[HEADER\.FIELDS \(DATE TO CC SUBJECT MESSAGE-ID\)\]/.test(l)), sentFetches.join("\n"));
  assert.ok(!a.state.sent.some((m) => "body" in m));

  // A later poll fetches only new UIDs.
  box.messages[3] = sentMsg({ id: "s3", to: "dana@brightline.example", subject: `Re: ${d2.subject}`, date: "Fri, 30 Oct 2026 15:00:00 +0000" });
  f.log.length = 0;
  await a.poll();
  assert.deepEqual(f.log.filter((l) => /UID FETCH/.test(l)).map((l) => l.split(" ")[3]), ["3"]);
  assert.ok(f.log.some((l) => /UID SEARCH UID 3:\*/.test(l)));
  const d3 = a.daily({ maxOverdueDays: 30 });
  assert.ok(!due(d3).includes(`dana@brightline.example|${d2.step}`), "a Re: of step 2's subject marks step 2 sent");
  assert.equal(d3.summary.alreadySent, 2);
});

test("a rebuilt Sent folder (new UIDVALIDITY) is read again from scratch, not appended to", async (t) => {
  const box = { flags: "\\Sent", uidValidity: 1, messages: { 1: sentMsg({ id: "a", to: "dana@brightline.example", subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 +0000" }) } };
  const { a } = await setup(t, { boxes: { Sent: box } });
  await a.poll();
  assert.equal(a.state.sent.length, 1);
  box.uidValidity = 2;
  box.messages = { 1: sentMsg({ id: "b", to: "omar@harbor.example", subject: o1.subject, date: "Mon, 26 Oct 2026 16:05:00 +0000" }) };
  await a.poll();
  assert.deepEqual(a.state.sent.map((m) => m.to[0]), ["omar@harbor.example"], "the old UID 1 is not kept as a second message");
});

test("SENT_BOX=off reads nothing; a named box is used as given; no Sent folder is reported, and the inbox still polls", async (t) => {
  const boxes = { "INBOX.Sent": { messages: { 1: sentMsg({ id: "a", to: "dana@brightline.example", subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 +0000" }) } } };
  const off = await setup(t, { boxes, env: { SENT_BOX: "off" } });
  await off.a.poll();
  assert.equal(off.a.state.sent.length, 0);
  assert.ok(!off.f.log.some((l) => / LIST /.test(l)), "no LIST when off");

  const byName = await setup(t, { boxes: { Outbox2: boxes["INBOX.Sent"] }, env: { SENT_BOX: "Outbox2" } });
  await byName.a.poll();
  assert.equal(byName.a.state.sent.length, 1);

  const fallback = await setup(t, { boxes });
  await fallback.a.poll();
  assert.equal(fallback.a.state.sentBox.name, "INBOX.Sent", "found by name when the server sends no \\Sent attribute");

  const none = await setup(t, { boxes: { Archive: { messages: {} } } });
  await none.a.poll();
  assert.equal(none.a.state.lastError, null, "the inbox poll itself succeeded");
  assert.match(none.a.state.sentError, /no Sent folder found/);
  assert.match(none.a.daily({ tasks }).sentError, /SENT_BOX/);
});

test("drafts the agent sent itself count as sent; the first-poll SEARCH date is valid IMAP in September", async (t) => {
  const { a, f } = await setup(t, { boxes: { Sent: { flags: "\\Sent", messages: {} } }, env: { SENT_SINCE_DAYS: "10" }, now: "2026-09-20T10:00:00Z" });
  await a.poll();
  const searches = f.log.filter((l) => /UID SEARCH SINCE/.test(l));
  assert.equal(searches.length, 2);
  assert.ok(searches.every((l) => /SINCE \d\d-Sep-2026$/.test(l)), searches.join("\n") + " (Node's en-GB short month is \"Sept\", which IMAP servers reject)");
  // An outbound draft the agent sent from this mailbox: in state.items with sentAt.
  a.state.items.push({ id: "research:dana@brightline.example", outbound: true, from: "dana@brightline.example", subject: d1.subject, draft: { subject: d1.subject, body: "x" }, sentAt: "2026-10-26T16:00:00Z", decision: "approved", triage: { category: "first_touch" }, applied: [] });
  const d = a.daily({ tasks, today: d2.date, maxOverdueDays: 30 });
  assert.ok(!due(d).includes(`dana@brightline.example|${d1.step}`));
});

test("HTTP: /api/daily needs the token, keeps the task list, serves both CSVs and shows on the page", async (t) => {
  const { a, e } = await setup(t, { boxes: { Sent: { flags: "\\Sent", messages: { 1: sentMsg({ id: "a", to: "dana@brightline.example", subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 +0000" }) } } } });
  await a.poll();
  await new Promise((r) => a.server.listen(0, "127.0.0.1", r));
  t.after(() => a.server.close());
  const base = `http://127.0.0.1:${a.server.address().port}`, H = { authorization: `Bearer ${e.ADMIN_TOKEN}`, "content-type": "application/json" };
  assert.equal((await fetch(`${base}/api/daily`, { method: "POST", body: JSON.stringify({ tasks }) })).status, 401);
  assert.equal((await fetch(`${base}/api/daily`, { headers: H })).status, 422, "no task list yet");
  const r = await fetch(`${base}/api/daily`, { method: "POST", headers: H, body: JSON.stringify({ tasks, maxOverdueDays: 30 }) });
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.summary.alreadySent, 1);
  const left = await (await fetch(`${base}/api/daily?format=left-out.csv`, { headers: H })).text();
  assert.match(left, /already sent/);
  const q = await fetch(`${base}/api/daily?format=queue.csv`, { headers: H });
  assert.match(q.headers.get("content-type"), /text\/csv/);
  assert.match(await q.text(), /^date,overdue,channel/);
  const page = await (await fetch(`${base}/?token=${e.ADMIN_TOKEN}`)).text();
  assert.match(page, /Today's queue/);
  assert.match(page, /<b>Sent<\/b>, 1 messages read/);
});
