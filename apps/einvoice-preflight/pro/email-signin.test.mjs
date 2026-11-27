// Email sign-in on a real socket: verify an address, ask for a link, redeem it once. The mailer is
// the in-memory FakeMailer; nothing is sent. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { FakeMailer, mailerFromEnv, message, normalizeEmail, oneLine, ResendMailer } from "./email.mjs";
import { createProHandler, EMAIL_KEY_NAME } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const APP_URL = "https://einvoice.example";

async function serve({ env = { APP_URL }, mailer = new FakeMailer(), clock } = {}) {
  let t = Date.parse("2026-11-26T10:00:00Z");
  const now = clock ?? (() => new Date(t));
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
  return { store, mailer, call, advance: (ms) => (t += ms), close: () => server.close() };
}

/** The token from the last message's link, and the link's fragment kind. @param {FakeMailer} mailer */
function lastLink(mailer) {
  const msg = mailer.outbox.at(-1);
  const m = /https:\/\/einvoice\.example\/app#(verify|signin)=([\w-]+)/.exec(msg?.text ?? "");
  assert.ok(m, "the message carries an /app# link");
  return { kind: m[1], token: m[2], to: msg.to, subject: msg.subject };
}

async function trialWithEmail(s, email = "Office@Kanzlei.example") {
  const up = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei Mail", acceptTerms: true } });
  const key = up.json.apiKey;
  const set = await s.call("POST", "/v1/account/email", { key, body: { email, lang: "de" } });
  assert.equal(set.status, 202);
  assert.equal(set.json.verified, false);
  const link = lastLink(s.mailer);
  assert.equal(link.kind, "verify");
  assert.equal(link.to, email.toLowerCase(), "stored and sent lower-cased");
  assert.match(link.subject, /Bestätigen/, "in the language asked for");
  const v = await s.call("POST", "/v1/email/verify", { body: { token: link.token } });
  assert.equal(v.status, 200);
  assert.equal(v.json.email, email.toLowerCase());
  return { key, accountId: up.json.account.id };
}

test("verify an address, then sign in by email: a new key that works, from a one-time link", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.deepEqual((await s.call("GET", "/v1/signin/options")).json, { email: true });
  const { key, accountId } = await trialWithEmail(s);
  const acct = await s.call("GET", "/v1/account", { key });
  assert.equal(acct.json.account.email, "office@kanzlei.example");

  const ask = await s.call("POST", "/v1/signin/email", { body: { email: " OFFICE@kanzlei.example ", lang: "fr" } });
  assert.equal(ask.status, 202);
  const link = lastLink(s.mailer);
  assert.equal(link.kind, "signin");
  assert.match(link.subject, /connexion/);
  assert.ok(!JSON.stringify(s.store.data).includes(link.token), "only the token's hash is stored");

  const r = await s.call("POST", "/v1/signin/redeem", { body: { token: link.token } });
  assert.equal(r.status, 201);
  assert.equal(r.json.account.id, accountId);
  const me = await s.call("GET", "/v1/account", { key: r.json.apiKey });
  assert.equal(me.status, 200);
  const keys = (await s.call("GET", "/v1/keys", { key: r.json.apiKey })).json.items;
  assert.deepEqual(keys.map((k) => k.name).sort(), ["default", EMAIL_KEY_NAME]);
  assert.equal((await s.call("GET", "/v1/account", { key })).status, 200, "the old key keeps working");

  const again = await s.call("POST", "/v1/signin/redeem", { body: { token: link.token } });
  assert.equal(again.status, 400);
  assert.equal(again.json.error.code, "invalid_link");
});

test("an unknown or unverified address gets the same answer and no message", async (t) => {
  const s = await serve();
  t.after(s.close);
  const up = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei Pending", acceptTerms: true } });
  await s.call("POST", "/v1/account/email", { key: up.json.apiKey, body: { email: "pending@kanzlei.example" } });
  const sentBefore = s.mailer.outbox.length;
  const unknown = await s.call("POST", "/v1/signin/email", { body: { email: "nobody@example.com" } });
  const unverified = await s.call("POST", "/v1/signin/email", { body: { email: "pending@kanzlei.example" } });
  assert.deepEqual([unknown.status, unknown.json], [202, { sent: true }]);
  assert.deepEqual([unverified.status, unverified.json], [202, { sent: true }]);
  assert.equal(s.mailer.outbox.length, sentBefore, "nothing sent");
  assert.equal((await s.call("POST", "/v1/signin/email", { body: { email: "a@b.c, x@y.z" } })).status, 400);
  assert.equal((await s.call("POST", "/v1/signin/email", { body: { email: "a@b.example\r\nBcc: x@y.z" } })).status, 400);
});

test("links expire, and removing the address cancels sign-in links already sent", async (t) => {
  const s = await serve();
  t.after(s.close);
  const { key } = await trialWithEmail(s);
  await s.call("POST", "/v1/signin/email", { body: { email: "office@kanzlei.example" } });
  const old = lastLink(s.mailer);
  s.advance(16 * 60_000);
  assert.equal((await s.call("POST", "/v1/signin/redeem", { body: { token: old.token } })).json.error.code, "invalid_link", "15 minutes");

  await s.call("POST", "/v1/signin/email", { body: { email: "office@kanzlei.example" } });
  const pending = lastLink(s.mailer);
  assert.equal((await s.call("DELETE", "/v1/account/email", { key })).status, 204);
  assert.equal((await s.call("POST", "/v1/signin/redeem", { body: { token: pending.token } })).status, 400);
  assert.equal((await s.call("GET", "/v1/account", { key })).json.account.email, null);

  const up = await s.call("POST", "/v1/signup", { body: { name: "Other", acceptTerms: true } });
  await s.call("POST", "/v1/account/email", { key: up.json.apiKey, body: { email: "late@kanzlei.example" } });
  const late = lastLink(s.mailer);
  s.advance(25 * 3_600_000);
  assert.equal((await s.call("POST", "/v1/email/verify", { body: { token: late.token } })).status, 400, "24 hours");
  assert.equal((await s.call("POST", "/v1/email/verify", { body: { token: "short" } })).status, 400);
});

test("an address verified by one account cannot be verified by another", async (t) => {
  const s = await serve();
  t.after(s.close);
  await trialWithEmail(s, "shared@kanzlei.example");
  const up = await s.call("POST", "/v1/signup", { body: { name: "Second", acceptTerms: true } });
  await s.call("POST", "/v1/account/email", { key: up.json.apiKey, body: { email: "shared@kanzlei.example" } });
  const v = await s.call("POST", "/v1/email/verify", { body: { token: lastLink(s.mailer).token } });
  assert.equal(v.status, 409);
  assert.equal(v.json.error.code, "email_in_use");
  assert.equal((await s.call("GET", "/v1/account", { key: up.json.apiKey })).json.account.email, null);
});

test("per-address caps: a fourth link in an hour is not sent", async (t) => {
  const s = await serve();
  t.after(s.close);
  await trialWithEmail(s); // the verification link counts too
  for (let i = 0; i < 4; i++) await s.call("POST", "/v1/signin/email", { body: { email: "office@kanzlei.example" } });
  assert.equal(s.mailer.outbox.length, 3, "1 verification + 2 sign-in links in the hour");
  s.advance(61 * 60_000);
  await s.call("POST", "/v1/signin/email", { body: { email: "office@kanzlei.example" } });
  assert.equal(s.mailer.outbox.length, 4, "the hour rolled over");
});

test("at the plan's key limit, sign-in replaces the oldest email key, else is the one key over", async (t) => {
  const s = await serve();
  t.after(s.close);
  const { key } = await trialWithEmail(s);
  const limit = (await s.call("GET", "/v1/account", { key })).json.plan.apiKeys;
  for (let i = 1; i < limit; i++) assert.equal((await s.call("POST", "/v1/keys", { key, body: { name: `k${i}` } })).status, 201);
  const redeem = async () => {
    s.advance(61 * 60_000); // stay under the per-address cap
    await s.call("POST", "/v1/signin/email", { body: { email: "office@kanzlei.example" } });
    const r = await s.call("POST", "/v1/signin/redeem", { body: { token: lastLink(s.mailer).token } });
    assert.equal(r.status, 201);
    return r.json.apiKey;
  };
  const first = await redeem();
  const count = async () => (await s.call("GET", "/v1/keys", { key })).json.items.length;
  assert.equal(await count(), limit + 1, "recovery is allowed one over the limit");
  assert.equal((await s.call("POST", "/v1/keys", { key, body: { name: "more" } })).status, 403, "but no more by hand");
  const second = await redeem();
  assert.equal(await count(), limit + 1, "the earlier email key was replaced");
  assert.equal((await s.call("GET", "/v1/account", { key: first })).status, 401);
  assert.equal((await s.call("GET", "/v1/account", { key: second })).status, 200);
});

test("email sign-in is off without a mailer or APP_URL, and links never use the Host header", async (t) => {
  for (const opts of [{ mailer: null }, { env: {} }, { env: { APP_URL: "not a url" } }]) {
    const s = await serve(opts);
    t.after(s.close);
    assert.deepEqual((await s.call("GET", "/v1/signin/options")).json, { email: false });
    const r = await s.call("POST", "/v1/signin/email", { body: { email: "a@example.com" } });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, "email_unavailable");
    const up = await s.call("POST", "/v1/signup", { body: { name: "X", acceptTerms: true } });
    assert.equal((await s.call("POST", "/v1/account/email", { key: up.json.apiKey, body: { email: "a@example.com" } })).status, 503);
  }
  const s = await serve();
  t.after(s.close);
  await trialWithEmail(s);
  assert.ok(s.mailer.outbox.every((m) => m.text.includes(`${APP_URL}/app#`)));
});

test("the mail port: bare addresses only, single-line subjects, Resend request shape, env selection", async () => {
  assert.equal(normalizeEmail(" A.B+tag@Example.COM "), "a.b+tag@example.com");
  for (const bad of ["", "a", "a@b", "A <a@b.example>", "a@b.example,c@d.example", "a@b.example\nBcc: c@d.example", "a b@c.example", 5, null])
    assert.equal(normalizeEmail(bad), null, String(bad));
  assert.equal(oneLine("Hi\r\nBcc: x@y.z"), "Hi Bcc: x@y.z");
  const m = message("signin", "xx", { firm: "Evil\r\nFirm", link: "https://e.example/app#signin=t" });
  assert.match(m.text, /Evil Firm/);
  assert.match(m.subject, /^Your sign-in link/);

  /** @type {any[]} */
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
  };
  const r = new ResendMailer("re_key", "login@einvoice.example", fetchImpl);
  assert.deepEqual(await r.send({ to: "x@y.example", subject: "S\nX", text: "body" }), { id: "re_1" });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].init.headers.authorization, "Bearer re_key");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: "login@einvoice.example", to: ["x@y.example"], subject: "S X", text: "body" });
  await assert.rejects(r.send({ to: "x@y.example, z@w.example", subject: "S", text: "b" }), /bare address/);
  const failing = new ResendMailer("k", "f@e.example", async () => new Response("{}", { status: 422 }));
  await assert.rejects(failing.send({ to: "x@y.example", subject: "S", text: "b" }), /422/);

  assert.equal(mailerFromEnv({}), null);
  assert.equal(mailerFromEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" }), null, "EMAIL_FROM needed");
  assert.equal(mailerFromEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "f@e.example" })?.name, "resend");
  assert.equal(mailerFromEnv({ FAKE_EXTERNALS: "true" })?.name, "fake");
  assert.throws(() => mailerFromEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "Name <f@e.example>" }));
});
