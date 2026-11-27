// The client summary email: its period keys, its text in five languages (counts and rule ids,
// never a client's identity), and the opt-in and admin-triggered send on a real socket with the
// in-memory FakeMailer (nothing is sent). Proprietary (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildDashboard } from "./dashboard.mjs";
import { digestMessage, digestPeriod, validPeriod } from "./digest.mjs";
import { FakeMailer } from "./email.mjs";
import { createProHandler } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const APP_URL = "https://einvoice.example";
const ADMIN_TOKEN = "admin-token-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-11-27T09:00:00Z");

test("periods: ISO weeks (the Thursday names the year) and calendar months, in UTC", () => {
  assert.equal(digestPeriod("weekly", new Date("2026-11-27T09:00:00Z")), "2026-W48");
  assert.equal(digestPeriod("weekly", new Date("2026-11-23T00:00:00Z")), "2026-W48", "Monday starts the week");
  assert.equal(digestPeriod("weekly", new Date("2026-11-22T23:59:59Z")), "2026-W47", "Sunday ends the one before");
  assert.equal(digestPeriod("weekly", new Date("2021-01-01T12:00:00Z")), "2020-W53");
  assert.equal(digestPeriod("weekly", new Date("2024-12-30T12:00:00Z")), "2025-W01");
  assert.equal(digestPeriod("monthly", new Date("2026-11-27T09:00:00Z")), "2026-11");
  assert.ok(validPeriod("2026-W48", "weekly"));
  assert.ok(!validPeriod("2026-W54", "weekly"));
  assert.ok(!validPeriod("2026-11", "weekly"));
  assert.ok(validPeriod("2026-11", "monthly"));
  assert.ok(!validPeriod("2026-13", "monthly"));
  assert.ok(!validPeriod(202611, "monthly"));
});

const SECRET_NAMES = ["Bäckerei Geheim GmbH", "Atelier Confidentiel SARL", "Ruhig KG"];

/** Three clients: one with an open failure, one passing, one never checked. */
function sampleDashboard() {
  const now = new Date(NOW);
  const at = new Date(NOW - 86_400_000).toISOString();
  const clients = SECRET_NAMES.map((name, i) => ({ id: `c${i}`, accountId: "a", name, country: "DE", vatId: `DE12345678${i}`, reference: `REF-${i}`, createdAt: at }));
  const file = (sha, status, rules) => ({ file: `rechnung-${sha}-vertraulich.xml`, sha256: sha, bytes: 1, status, rules, blocking: rules.length, fixesApplied: [], fixedSha256: null, fixedStatus: null });
  const run = (clientId, files) => ({ id: `r-${clientId}`, accountId: "a", clientId, createdAt: at, lang: "de", profile: "", totals: { files: files.length, passed: 0, failed: 0, fixable: 0 }, files });
  const runsByClient = new Map([
    ["c0", [run("c0", [file("s1", "fail", ["BR-CO-15", "BR-DE-15"]), file("s2", "fail", ["BR-CO-15"])])]],
    ["c1", [run("c1", [file("s3", "pass", [])])]],
  ]);
  const lastByClient = new Map([["c0", at], ["c1", at], ["c2", null]]);
  return buildDashboard({ clients, runsByClient, lastByClient, now, days: 7 });
}

test("the message: counts and rule ids in each language, never a client's name, ids or file names", () => {
  const d = sampleDashboard();
  for (const [lang, word] of [["en", "need attention"], ["de", "Handlungsbedarf"], ["fr", "à traiter"], ["nl", "actie"], ["pl", "wymaga uwagi"]]) {
    const m = digestMessage(d, { lang, firm: "Kanzlei\r\nBcc: x@evil.example", link: `${APP_URL}/app`, frequency: "weekly" });
    assert.ok(m);
    assert.ok(m.subject.includes(word), `${lang} subject: ${m.subject}`);
    assert.match(m.subject, /\b1\b.*\b3\b/, "1 of 3 clients");
    assert.ok(!/[\r\n]/.test(m.subject), "the firm name cannot add a header");
    assert.ok(m.text.includes("BR-CO-15 (2)"), "the most frequent rule with its count");
    assert.ok(m.text.includes(`${APP_URL}/app`));
    assert.ok(!/\{\w+\}/.test(m.text + m.subject), `${lang}: every placeholder filled`);
    for (const secret of [...SECRET_NAMES, "DE123456780", "REF-0", "vertraulich", "s1"]) assert.ok(!m.text.includes(secret) && !m.subject.includes(secret), `${lang} leaks ${secret}`);
  }
  const en = /** @type {{ text: string }} */ (digestMessage(d, { lang: "en", firm: "F", link: "L", frequency: "monthly" }));
  assert.match(en.text, /Clients that need attention: 1, with 2 invoice\(s\) still failing\./);
  assert.match(en.text, /Clients never checked: 1\./);
  assert.match(en.text, /monthly summary is turned on/);
  assert.match(en.text, /not legal or tax advice/);
  const empty = buildDashboard({ clients: [], runsByClient: new Map(), lastByClient: new Map(), now: new Date(NOW), days: 7 });
  assert.equal(digestMessage(empty, { lang: "en", firm: "F", link: "L", frequency: "weekly" }), null, "no clients, no email");
});

async function serve({ mailer = new FakeMailer(), env = { APP_URL, ADMIN_TOKEN } } = {}) {
  const now = () => new Date(NOW);
  const store = new MemoryStore({ now });
  const server = createServer(createProHandler({ store, env, now, mailer }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
  return { store, mailer, call, close: () => server.close() };
}

async function firm(s, name, email) {
  const up = await s.call("POST", "/v1/signup", { body: { name, acceptTerms: true } });
  if (email) await s.store.setAccountEmail(up.json.account.id, email);
  return { key: up.json.apiKey, id: up.json.account.id };
}

async function addFailingClient(s, accountId, name) {
  const c = await s.store.createClient(accountId, { name, country: "DE", vatId: "", reference: "" });
  await s.store.addRun(accountId, {
    clientId: c.id,
    lang: "de",
    profile: "",
    totals: { files: 1, passed: 0, failed: 1, fixable: 0 },
    files: [{ file: "geheim.xml", sha256: "x1", bytes: 10, status: "fail", rules: ["BR-CO-15"], blocking: 1, fixesApplied: [], fixedSha256: null, fixedStatus: null }],
  });
}

test("opt in, then the admin send: once per period, to the confirmed address, in the chosen language", async (t) => {
  const s = await serve();
  t.after(s.close);
  const a = await firm(s, "Kanzlei A");
  const off = await s.call("PUT", "/v1/account/digest", { key: a.key, body: { digest: "weekly" } });
  assert.equal(off.status, 409, "no confirmed address yet");
  assert.equal(off.json.error.code, "no_email");
  assert.equal((await s.call("PUT", "/v1/account/digest", { key: a.key, body: { digest: "daily" } })).status, 400);
  assert.equal((await s.call("PUT", "/v1/account/digest", { key: a.key, body: { digest: "off" } })).status, 200, "off needs no address");

  await s.store.setAccountEmail(a.id, "office@kanzlei.example");
  const on = await s.call("PUT", "/v1/account/digest", { key: a.key, body: { digest: "weekly", lang: "de" } });
  assert.deepEqual(on.json, { digest: "weekly", lang: "de" });
  assert.equal((await s.call("GET", "/v1/account", { key: a.key })).json.account.digest, "weekly");
  await addFailingClient(s, a.id, "Bäckerei Geheim GmbH");

  const b = await firm(s, "Cabinet B", "b@cabinet.example"); // has an address, never opted in
  await addFailingClient(s, b.id, "Client B");
  const c = await firm(s, "Kanzlei C", "c@kanzlei.example"); // opted in, no clients yet
  await s.call("PUT", "/v1/account/digest", { key: c.key, body: { digest: "weekly" } });

  assert.equal((await s.call("POST", "/v1/admin/digest/send", { body: { frequency: "weekly" } })).status, 401);
  assert.equal((await s.call("POST", "/v1/admin/digest/send", { key: "wrong-token-xxxxxxxxxxxxxxxxxxxxxxxx", body: { frequency: "weekly" } })).status, 401);
  assert.equal((await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "daily" } })).status, 400);
  assert.equal((await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "weekly", period: "2026-11" } })).status, 400);

  const sent = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "weekly" } });
  assert.equal(sent.status, 200);
  assert.equal(sent.json.period, "2026-W48");
  assert.equal(sent.json.sent, 1);
  assert.deepEqual(sent.json.results.map((r) => [r.accountId, r.status]), [[a.id, "sent"], [c.id, "no_clients"]]);
  assert.equal(s.mailer.outbox.length, 1);
  const mail = s.mailer.outbox[0];
  assert.equal(mail.to, "office@kanzlei.example");
  assert.match(mail.subject, /Kanzlei A: 1 von 1 Mandanten mit Handlungsbedarf/);
  assert.ok(!mail.text.includes("Bäckerei") && !mail.text.includes("geheim.xml"));
  assert.ok(mail.text.includes(`${APP_URL}/app`));

  const again = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "weekly" } });
  assert.equal(again.json.sent, 0);
  assert.equal(again.json.results[0].status, "already_sent");
  assert.equal(s.mailer.outbox.length, 1, "nothing sent twice in one period");
  const monthly = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "monthly" } });
  assert.deepEqual(monthly.json.results, [], "nobody asked for monthly");

  // Removing the address stops it, whatever the setting says.
  await s.call("DELETE", "/v1/account/email", { key: a.key });
  const later = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "weekly", period: "2026-W49" } });
  assert.deepEqual(later.json.results.map((r) => r.accountId), [c.id]);
});

test("a failed send releases its claim; the limit caps one call; no mailer means 503", async (t) => {
  let fail = true;
  const inner = new FakeMailer();
  const mailer = { name: "flaky", send: async (m) => (fail ? Promise.reject(new Error("provider down")) : inner.send(m)) };
  const s = await serve({ mailer });
  t.after(s.close);
  for (const n of [1, 2, 3]) {
    const f = await firm(s, `Firm ${n}`, `f${n}@firm.example`);
    await s.call("PUT", "/v1/account/digest", { key: f.key, body: { digest: "monthly", lang: "fr" } });
    await addFailingClient(s, f.id, `Client ${n}`);
  }
  const r1 = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "monthly" } });
  assert.deepEqual(r1.json.results.map((r) => r.status), ["failed", "failed", "failed"]);
  assert.match(r1.json.results[0].reason, /provider down/);
  fail = false;
  const r2 = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "monthly", limit: 2 } });
  assert.equal(r2.json.sent, 2);
  assert.equal(r2.json.more, true);
  const r3 = await s.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "monthly", limit: 2 } });
  assert.deepEqual(r3.json.results.map((r) => r.status), ["already_sent", "already_sent", "sent"]);
  assert.equal(r3.json.more, false);
  assert.equal(inner.outbox.length, 3);
  assert.match(inner.outbox[0].subject, /à traiter/);

  const off = await serve({ mailer: null });
  t.after(off.close);
  assert.equal((await off.call("POST", "/v1/admin/digest/send", { key: ADMIN_TOKEN, body: { frequency: "weekly" } })).status, 503);
  const f = await firm(off, "No Mail");
  assert.equal((await off.call("PUT", "/v1/account/digest", { key: f.key, body: { digest: "weekly" } })).status, 503);
});
