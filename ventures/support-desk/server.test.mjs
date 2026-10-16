import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, parseMultipart, parseAgentKeys } from "./server.mjs";
import { newState, createMailbox } from "./desk.mjs";

const KEY = "k".repeat(16);
async function boot(over = {}) {
  const state = newState();
  const mb = createMailbox(state, { name: "Support", replyTo: "help@acme.test", ack: "We got your message.", origins: "https://shop.example", ...over.mb }, 0);
  let t = 1_000_000; const sent = [], pings = [];
  const cfg = { state, save() {}, adminKey: KEY, company: "Acme <b>", sponsor: true, now: () => t, notify: (m) => pings.push(m), dryRun: false, sendEmail: async (m) => { sent.push(m); }, ...over.cfg };
  const server = http.createServer(handler(cfg)); await new Promise((r) => server.listen(0, r));
  return { base: `http://127.0.0.1:${server.address().port}`, state, mb, sent, pings, close: () => server.close() };
}
const auth = { authorization: `Bearer ${KEY}` };
const form = (url, body, headers = {}) => fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(body).toString() });
const json = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("an inbound email webhook opens a ticket, pings, and acknowledges once a day", async () => {
  const s = await boot();
  const r = await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "Ann <ann@x.com>", subject: "Where is my order?", text: "hello", messageId: "<1>" });
  assert.deepEqual(await r.json(), { ok: true, ticket: 1 });
  assert.equal(s.pings.length, 1); assert.equal(s.sent.length, 1);
  assert.match(s.sent[0].subject, /\[#1\]/); assert.match(s.sent[0].text, /We got your message\./); assert.doesNotMatch(s.sent[0].text, /hello/);
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Another", text: "x", messageId: "<2>" });
  assert.equal(s.sent.length, 1); assert.equal(Object.keys(s.state.tickets).length, 2);
  assert.equal((await json(`${s.base}/in/${"0".repeat(32)}`, {})).status, 404);
  s.close();
});

test("a Mailgun-style multipart post is parsed and file parts are skipped", async () => {
  const s = await boot();
  const b = "XBOUND";
  const body = `--${b}\r\nContent-Disposition: form-data; name="sender"\r\n\r\nbob@y.org\r\n--${b}\r\nContent-Disposition: form-data; name="subject"\r\n\r\nHelp\r\n--${b}\r\nContent-Disposition: form-data; name="stripped-text"\r\n\r\nplease help\r\n--${b}\r\nContent-Disposition: form-data; name="attachment-1"; filename="a.exe"\r\n\r\nMZ\r\n--${b}--\r\n`;
  assert.deepEqual(Object.keys(parseMultipart(body, `multipart/form-data; boundary=${b}`)), ["sender", "subject", "stripped-text"]);
  const r = await fetch(`${s.base}/in/${s.mb.inboundToken}`, { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${b}` }, body });
  assert.equal((await r.json()).ticket, 1);
  assert.equal(s.state.tickets.t1.messages[0].text, "please help");
  s.close();
});

test("the contact form honours allowed sites, the honeypot and requires an email", async () => {
  const s = await boot();
  const ok = await form(`${s.base}/m/${s.mb.id}`, { email: "a@b.co", message: "hi", name: "A" }, { origin: "https://shop.example" });
  assert.equal(ok.status, 200); assert.match(await ok.text(), /\[#1\]/);
  assert.equal((await form(`${s.base}/m/${s.mb.id}`, { email: "a@b.co", message: "hi" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await form(`${s.base}/m/${s.mb.id}`, { email: "a@b.co" })).status, 400);
  await form(`${s.base}/m/${s.mb.id}`, { email: "bot@b.co", message: "x", _gotcha: "1" });
  assert.equal(Object.keys(s.state.tickets).length, 1);
  s.close();
});

test("admin needs the key, escapes content, and a reply emails the customer and records first response", async () => {
  const s = await boot();
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "<script>alert(1)</script>", text: "<img src=x>", messageId: "<1>" });
  assert.equal((await fetch(`${s.base}/admin`)).status, 401);
  const page = await (await fetch(`${s.base}/admin`, { headers: auth })).text();
  assert.doesNotMatch(page, /<script>alert/); assert.match(page, /&lt;script&gt;/); assert.match(page, /Acme &lt;b&gt;/);
  const r = await form(`${s.base}/admin/t/1/reply`, { text: "Fixed!", after: "closed" }, auth);
  assert.equal(r.status, 303);
  const out = s.sent.at(-1); assert.equal(out.to, "ann@x.com"); assert.equal(out.replyTo, "help@acme.test"); assert.match(out.subject, /\[#1\]$/);
  assert.equal(s.state.tickets.t1.status, "closed"); assert.ok(s.state.tickets.t1.firstResponseAt);
  s.close();
});

test("a customer replies from the portal link and the ticket reopens; internal notes stay hidden", async () => {
  const s = await boot();
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Q", text: "first", messageId: "<1>" });
  const t = s.state.tickets.t1;
  await form(`${s.base}/admin/t/1/note`, { text: "secret note" }, auth);
  await form(`${s.base}/admin/t/1/reply`, { text: "answer", after: "closed" }, auth);
  const view = await (await fetch(`${s.base}/t/${t.token}`)).text();
  assert.match(view, /answer/); assert.doesNotMatch(view, /secret note/);
  await form(`${s.base}/t/${t.token}`, { text: "one more thing" });
  assert.equal(t.status, "open"); assert.equal(t.messages.at(-1).channel, "portal");
  assert.equal((await fetch(`${s.base}/t/${"a".repeat(24)}`)).status, 404);
  s.close();
});

test("a cross-site admin post riding cached credentials is refused; saved replies fill the draft", async () => {
  const s = await boot();
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Refund please", text: "I want my money back", messageId: "<1>" });
  const basic = { authorization: `Basic ${Buffer.from(`u:${KEY}`).toString("base64")}` };
  assert.equal((await form(`${s.base}/admin/macros`, { title: "Refund", body: "Hi {{name}}, refunded {{ticket}}", keywords: "refund money" }, { ...basic, origin: "https://evil.example" })).status, 403);
  assert.equal((await form(`${s.base}/admin/macros`, { title: "Refund", body: "Hi {{name}}, refunded {{ticket}}", keywords: "refund money" }, auth)).status, 303);
  const page = await (await fetch(`${s.base}/admin/t/1?macro=r1`, { headers: auth })).text();
  assert.match(page, /Refund<\/a> \(\d+% match\)/); assert.match(page, /Hi ann, refunded \[#1\]/);
  s.close();
});

test("dry run sends nothing but still stores the reply", async () => {
  const s = await boot({ cfg: { dryRun: true } });
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Q", text: "x", messageId: "<1>" });
  await form(`${s.base}/admin/t/1/reply`, { text: "hi" }, auth);
  assert.equal(s.sent.length, 0); assert.equal(s.state.tickets.t1.messages.length, 2);
  s.close();
});

test("personal agent keys sign replies and notes, claim unassigned tickets, and the shared key still works", async () => {
  const AL = "alice-key-1234567", BO = "bob-key-7654321";
  const s = await boot({ cfg: { agents: parseAgentKeys(`alice:${AL}, bob:${BO},bad:short,agent:${"z".repeat(14)}`) } });
  assert.deepEqual(Object.keys(parseAgentKeys(`alice:${AL},bob:${BO},bad:short,agent:${"z".repeat(14)}`)), ["alice", "bob"]);
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Help", text: "hi", messageId: "<1>" });
  const basic = (u, k) => ({ authorization: `Basic ${Buffer.from(`${u}:${k}`).toString("base64")}` });
  assert.equal((await fetch(`${s.base}/admin`, { headers: basic("bob", AL) })).status, 401); // wrong name for that key
  assert.equal((await fetch(`${s.base}/admin`, { headers: { authorization: "Bearer nope-nope-nope" } })).status, 401);
  await form(`${s.base}/admin/t/1/note`, { text: "checking" }, basic("alice", AL));
  await form(`${s.base}/admin/t/1/reply`, { text: "On it", after: "pending" }, basic("bob", BO));
  const t = s.state.tickets.t1;
  assert.deepEqual(t.messages.filter((m) => m.dir !== "in").map((m) => [m.dir, m.from]), [["note", "alice"], ["out", "bob"]]);
  assert.equal(t.assignee, "bob");
  await form(`${s.base}/admin/t/1/reply`, { text: "More", after: "pending" }, { authorization: `Bearer ${KEY}` });
  assert.equal(t.assignee, "bob"); assert.equal(t.messages.at(-1).from, "agent");
  await form(`${s.base}/admin/t/1/reply`, { text: "Also", after: "pending" }, { authorization: `Bearer ${AL}` });
  assert.equal(t.assignee, "bob"); assert.equal(t.messages.at(-1).from, "alice");
  s.close();
});

test("a ticket page lists the requester's earlier tickets and the admin shows a copy-paste form", async () => {
  const s = await boot();
  const post = (subject, from, id) => json(`${s.base}/in/${s.mb.inboundToken}`, { from, subject, text: "hi", messageId: id });
  await post("First problem", "ann@x.com", "<1>"); await post("Other person", "bob@x.com", "<2>"); await post("Second problem", "ann@x.com", "<3>");
  const t2 = await (await fetch(`${s.base}/admin/t/3`, { headers: auth })).text();
  assert.match(t2, /Earlier tickets from ann@x\.com/); assert.match(t2, /First problem/); assert.doesNotMatch(t2, /Other person/);
  const t1 = await (await fetch(`${s.base}/admin/t/2`, { headers: auth })).text();
  assert.doesNotMatch(t1, /Earlier tickets/);
  const admin = await (await fetch(`${s.base}/admin`, { headers: auth })).text();
  assert.match(admin, new RegExp(`&lt;form method=&quot;post&quot; action=&quot;http://127\\.0\\.0\\.1:\\d+/m/${s.mb.id}`));
  s.close();
});

test("a customer rates a ticket once staff have answered; the dashboard and CSV show it", async () => {
  const s = await boot();
  await json(`${s.base}/in/${s.mb.inboundToken}`, { from: "ann@x.com", subject: "Help", text: "broken", messageId: "<r1>" });
  const t = s.state.tickets.t1;
  await form(`${s.base}/t/${t.token}`, { rating: "good" });
  assert.equal(t.rating, undefined); // nothing to rate before a reply
  await form(`${s.base}/admin/t/1/reply`, { text: "fixed", after: "closed" }, auth);
  assert.match(await (await fetch(`${s.base}/t/${t.token}`)).text(), /Did we solve it/);
  await form(`${s.base}/t/${t.token}`, { rating: "bad", comment: "<b>still broken</b>" });
  await form(`${s.base}/t/${t.token}`, { rating: "nonsense" });
  assert.equal(t.rating.score, "bad");
  const view = await (await fetch(`${s.base}/t/${t.token}`)).text();
  assert.doesNotMatch(view, /Did we solve it/);
  const admin = await (await fetch(`${s.base}/admin/t/1`, { headers: auth })).text();
  assert.match(admin, /not satisfied/); assert.doesNotMatch(admin, /<b>still broken/);
  assert.match(await (await fetch(`${s.base}/admin`, { headers: auth })).text(), /0%<\/b>satisfied \(1 rated\)/);
  assert.match(await (await fetch(`${s.base}/admin/export.csv`, { headers: auth })).text(), /,bad\n/);
  s.close();
});
