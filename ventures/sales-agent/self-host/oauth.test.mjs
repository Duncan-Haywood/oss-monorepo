import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenProvider, xoauth2, authUrl, exchangeCode, pkce, oauthWanted } from "./oauth.mjs";
import { fakeImap } from "./fake-imap.mjs";
import { fakeSmtp } from "./fake-smtp.mjs";
import { createAgent } from "./agent.mjs";
import { Imap } from "./imap.mjs";

// A local token endpoint: counts calls, issues "at-N" access tokens, rejects a wrong refresh token.
function tokenServer({ refresh = "rt-1", expiresIn = 3600 } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const p = new URLSearchParams(b); calls.push(Object.fromEntries(p));
      const ok = p.get("grant_type") === "refresh_token" ? p.get("refresh_token") === refresh : p.get("code") === "good-code" && p.get("code_verifier");
      res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
      res.end(JSON.stringify(ok ? { access_token: `at-${calls.length}`, expires_in: expiresIn, refresh_token: p.get("grant_type") === "authorization_code" ? "rt-new" : undefined } : { error: "invalid_grant", error_description: `bad ${p.get("refresh_token") || p.get("code")}` }));
    });
  });
  return { calls, listen: () => new Promise((r) => server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${server.address().port}/token`))), close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }) };
}

test("xoauth2 string matches the documented format", () => {
  // Google's documented example: user=someuser@example.com^Aauth=Bearer ya29.vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg^A^A
  assert.equal(Buffer.from(xoauth2("someuser@example.com", "ya29.vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg"), "base64").toString(), "user=someuser@example.com\x01auth=Bearer ya29.vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg\x01\x01");
});

test("tokenProvider: caches until a minute before expiry, then refreshes once for concurrent callers", async () => {
  const ts = tokenServer({ expiresIn: 3600 }); const url = await ts.listen();
  let t = 1_000_000;
  const get = tokenProvider({ OAUTH_PROVIDER: "google", OAUTH_CLIENT_ID: "cid", OAUTH_CLIENT_SECRET: "sec", OAUTH_REFRESH_TOKEN: "rt-1", OAUTH_TOKEN_URL: url }, { now: () => t });
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, "at-1"); assert.equal(b, "at-1"); assert.equal(ts.calls.length, 1);
  assert.equal(ts.calls[0].client_secret, "sec");
  t += 3000 * 1000; assert.equal(await get(), "at-1", "still cached");
  t += 541 * 1000; assert.equal(await get(), "at-2", "within 60 s of expiry: refreshed");
  await ts.close();
});

test("tokenProvider: a rejected refresh token reports the provider's error and never prints a secret", async () => {
  const ts = tokenServer({ refresh: "other" }); const url = await ts.listen();
  const get = tokenProvider({ OAUTH_CLIENT_ID: "cid", OAUTH_CLIENT_SECRET: "topsecret", OAUTH_REFRESH_TOKEN: "rt-1", OAUTH_TOKEN_URL: url });
  await assert.rejects(get(), (e) => /invalid_grant/.test(e.message) && !/rt-1|topsecret/.test(e.message));
  assert.throws(() => tokenProvider({ OAUTH_PROVIDER: "google" }), /OAUTH_CLIENT_ID, OAUTH_REFRESH_TOKEN/);
  assert.throws(() => tokenProvider({ OAUTH_PROVIDER: "yahoo", OAUTH_CLIENT_ID: "a", OAUTH_REFRESH_TOKEN: "b" }), /google or microsoft/);
  assert.ok(oauthWanted({ OAUTH_PROVIDER: "google" }) && !oauthWanted({ IMAP_PASS: "x" }));
  await ts.close();
});

test("setup: auth URL carries PKCE, offline access and the mailbox hint; the code exchange returns the refresh token", async () => {
  const { verifier, challenge } = pkce();
  const env = { OAUTH_PROVIDER: "google", OAUTH_CLIENT_ID: "cid", IMAP_USER: "me@gmail.com" };
  const u = new URL(authUrl(env, { redirect: "http://127.0.0.1:8789/callback", state: "s1", challenge }));
  assert.equal(u.host, "accounts.google.com"); assert.equal(u.searchParams.get("scope"), "https://mail.google.com/");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256"); assert.equal(u.searchParams.get("access_type"), "offline"); assert.equal(u.searchParams.get("login_hint"), "me@gmail.com");
  const ms = new URL(authUrl({ ...env, OAUTH_PROVIDER: "microsoft", OAUTH_TENANT: "contoso.com" }, { redirect: "r", state: "s", challenge }));
  assert.equal(ms.pathname, "/contoso.com/oauth2/v2.0/authorize"); assert.match(ms.searchParams.get("scope"), /IMAP\.AccessAsUser\.All/);
  const ts = tokenServer(); const url = await ts.listen();
  assert.equal(await exchangeCode({ ...env, OAUTH_TOKEN_URL: url }, { code: "good-code", redirect: "r", verifier }), "rt-new");
  assert.equal(ts.calls[0].code_verifier, verifier);
  await assert.rejects(exchangeCode({ ...env, OAUTH_TOKEN_URL: url }, { code: "bad", redirect: "r", verifier }), /invalid_grant/);
  await ts.close();
});

test("IMAP XOAUTH2: good token reads mail; a bad token fails after answering the error challenge, without a password command", async () => {
  const f = fakeImap({ token: "at-good" }); const port = await f.listen();
  const c = new Imap({ host: "127.0.0.1", port, secure: false });
  await c.connect(); await c.loginXoauth2("me@example.com", "at-good"); await c.examine(); await c.logout();
  const bad = new Imap({ host: "127.0.0.1", port, secure: false });
  await bad.connect(); await assert.rejects(bad.loginXoauth2("me@example.com", "at-bad"), /XOAUTH2.*NO/); await bad.logout();
  assert.ok(!f.log.some((l) => /LOGIN/i.test(l)));
  await f.close();
});

test("agent with OAuth: polls over XOAUTH2 with a refreshed token and sends with it over SMTP; no password set anywhere", async () => {
  const ts = tokenServer(); const turl = await ts.listen();
  const imap = fakeImap({ token: "at-1", messages: { 1: "From: Lee <lee@corp.example>\r\nSubject: Re: routes\r\nMessage-ID: <l1@corp>\r\nContent-Type: text/plain\r\n\r\nWhat does it cost, and does it integrate with QuickBooks?" } });
  const smtp = fakeSmtp({ token: "at-1" });
  const ip = await imap.listen(), sp = await smtp.listen();
  const env = { ADMIN_TOKEN: "o".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), PORT: "0", IMAP_HOST: "127.0.0.1", IMAP_PORT: String(ip), IMAP_SECURE: "false", IMAP_USER: "me@example.com",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sp), OAUTH_PROVIDER: "google", OAUTH_CLIENT_ID: "cid", OAUTH_CLIENT_SECRET: "sec", OAUTH_REFRESH_TOKEN: "rt-1", OAUTH_TOKEN_URL: turl };
  const a = createAgent(env, { now: () => Date.parse("2026-10-26T10:00:00Z") });
  assert.equal(await a.poll(), 1, a.state.lastError);
  const id = a.state.items[0].id;
  a.decide(id, "approved", "It starts at $29 a month and exports to QuickBooks. Thanks, Sam");
  const r = await a.send(id);
  assert.ok(r.sentAt, JSON.stringify(r));
  assert.equal(ts.calls.length, 1, "one refresh served IMAP and SMTP");
  assert.equal(smtp.delivered.length, 1);
  assert.ok(smtp.log.some((l) => l.startsWith("AUTH XOAUTH2")) && !smtp.log.some((l) => l.startsWith("AUTH PLAIN")));
  assert.ok(!imap.log.some((l) => /LOGIN/i.test(l)));
  await imap.close(); await smtp.close(); await ts.close();
});

test("agent with OAuth: a revoked refresh token is a poll error that names the cause, with nothing secret in it", async () => {
  const ts = tokenServer({ refresh: "other" }); const turl = await ts.listen();
  const env = { ADMIN_TOKEN: "o".repeat(16), DATA_DIR: mkdtempSync(join(tmpdir(), "sa-")), PORT: "0", IMAP_HOST: "127.0.0.1", IMAP_PORT: "1", IMAP_SECURE: "false", IMAP_USER: "me@example.com", OAUTH_CLIENT_ID: "cid", OAUTH_REFRESH_TOKEN: "rt-1", OAUTH_TOKEN_URL: turl };
  const imap = fakeImap({ token: "x" }); env.IMAP_PORT = String(await imap.listen());
  const a = createAgent(env);
  assert.equal(await a.poll(), 0);
  assert.match(a.state.lastError, /OAuth refresh failed.*invalid_grant/); assert.ok(!/rt-1/.test(a.state.lastError));
  await imap.close(); await ts.close();
});
