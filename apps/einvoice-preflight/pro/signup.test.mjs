// Public trial sign-up and the workspace page routes, on a real socket. Proprietary (see ../LICENSE).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { createProHandler, signupLimiter } from "./server.mjs";
import { MemoryStore } from "./store.mjs";

const UBL = readFileSync(new URL("../examples/ubl-invoice.xml", import.meta.url), "utf8");
const NOW = () => new Date("2026-11-26T10:00:00Z");

async function serve(env = {}) {
  const store = new MemoryStore({ now: NOW });
  const server = createServer(createProHandler({ store, env, now: NOW }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { key, body, headers } = {}) => {
    const res = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, headers: res.headers, text, json };
  };
  return { store, call, close: () => server.close() };
}

test("sign-up creates a trial account whose key works, and the key is stored only as a hash", async (t) => {
  const s = await serve();
  t.after(s.close);
  const r = await s.call("POST", "/v1/signup", { body: { name: "Kanzlei Sign-up", acceptTerms: true } });
  assert.equal(r.status, 201);
  assert.match(r.json.apiKey, /^epk_/);
  assert.equal(r.json.account.plan, "trial");
  assert.ok(!JSON.stringify(s.store.data).includes(r.json.apiKey));
  const acct = await s.call("GET", "/v1/account", { key: r.json.apiKey });
  assert.equal(acct.status, 200);
  assert.equal(acct.json.plan.key, "trial");
  const client = await s.call("POST", "/v1/clients", { key: r.json.apiKey, body: { name: "Mandant A", country: "de" } });
  assert.equal(client.status, 201);
  const batch = await s.call("POST", `/v1/clients/${client.json.id}/batches?lang=de&fix=1`, {
    key: r.json.apiKey,
    body: { documents: [{ name: "r.xml", content: Buffer.from(UBL).toString("base64"), encoding: "base64" }] },
  });
  assert.equal(batch.status, 201);
  assert.equal(batch.json.results[0].status, "pass");
});

test("sign-up refuses a missing name, unaccepted terms, oversized bodies, and can be switched off", async (t) => {
  const s = await serve();
  t.after(s.close);
  assert.equal((await s.call("POST", "/v1/signup", { body: { name: " ", acceptTerms: true } })).status, 400);
  assert.equal((await s.call("POST", "/v1/signup", { body: { name: "X" } })).status, 400);
  assert.equal((await s.call("POST", "/v1/signup", { body: { name: "X", acceptTerms: "yes" } })).status, 400);
  assert.equal((await s.call("POST", "/v1/signup", { body: { name: "x".repeat(5000), acceptTerms: true } })).status, 413);
  assert.equal(s.store.data.accounts.length, 0);
  const off = await serve({ PUBLIC_SIGNUP: "off" });
  t.after(off.close);
  const r = await off.call("POST", "/v1/signup", { body: { name: "X", acceptTerms: true } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, "signup_closed");
});

test("sign-up is capped per IP per hour; a forwarded IP is trusted only with TRUST_PROXY=1", async (t) => {
  const s = await serve({ SIGNUP_PER_IP_PER_HOUR: "2" });
  t.after(s.close);
  const body = { name: "Spam", acceptTerms: true };
  const fwd = (ip) => ({ body, headers: { "x-forwarded-for": ip } });
  assert.equal((await s.call("POST", "/v1/signup", fwd("1.1.1.1"))).status, 201);
  assert.equal((await s.call("POST", "/v1/signup", fwd("2.2.2.2"))).status, 201);
  const third = await s.call("POST", "/v1/signup", fwd("3.3.3.3"));
  assert.equal(third.status, 429, "without TRUST_PROXY every request is the socket's address");
  assert.equal(third.json.error.code, "signup_limited");
  assert.equal(s.store.data.accounts.length, 2);

  const p = await serve({ SIGNUP_PER_IP_PER_HOUR: "1", TRUST_PROXY: "1" });
  t.after(p.close);
  assert.equal((await p.call("POST", "/v1/signup", fwd("9.9.9.9, 1.1.1.1"))).status, 201);
  assert.equal((await p.call("POST", "/v1/signup", fwd("8.8.8.8, 2.2.2.2"))).status, 201, "the last hop is the client the proxy saw");
  assert.equal((await p.call("POST", "/v1/signup", fwd("7.7.7.7, 2.2.2.2"))).status, 429, "a spoofed first entry does not reset the cap");
});

test("signupLimiter: hourly window per IP and a daily cap for everyone", () => {
  let t = Date.parse("2026-11-26T00:00:00Z");
  const lim = signupLimiter({ perIpPerHour: 1, perDay: 2, now: () => new Date(t) });
  assert.equal(lim.take("a"), "ok");
  assert.equal(lim.take("a"), "ip");
  assert.equal(lim.take("b"), "ok");
  assert.equal(lim.take("c"), "day");
  t += 3_600_001;
  assert.equal(lim.take("a"), "day");
  t += 86_400_000;
  assert.equal(lim.take("a"), "ok");
});

test("the workspace page is served with a strict CSP; / redirects to it", async (t) => {
  const s = await serve();
  t.after(s.close);
  const page = await s.call("GET", "/app");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(page.text, /<script type="module" src="\/app\/app.js">/);
  assert.doesNotMatch(page.text, /<script>(?!<\/)/, "no inline script");
  for (const [path, type] of [["/app/app.js", /javascript/], ["/app/workspace-lib.mjs", /javascript/], ["/app/app.css", /text\/css/]]) {
    const r = await s.call("GET", path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get("content-type"), type, path);
  }
  const root = await s.call("GET", "/");
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/app");
  assert.equal((await s.call("GET", "/app/server.mjs")).status, 401, "unknown paths fall through to the authenticated API");
});

test("the page never uses innerHTML or eval", () => {
  const js = readFileSync(new URL("./web/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
});
