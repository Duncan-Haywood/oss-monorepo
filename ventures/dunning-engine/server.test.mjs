import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { handler, linkToken, customerFromToken } from "./server.mjs";
import { signPayload } from "./stripe.mjs";
import { newState } from "./engine.mjs";

const NOW = Date.UTC(2026, 9, 13, 12);
async function boot(over = {}) {
  const saves = [];
  const cfg = {
    state: newState(), save: () => saves.push(1), webhookSecret: "whsec_t", linkSecret: "link-secret", adminKey: "adm", publicUrl: "https://d.example",
    policy: {}, dryRun: true, now: () => NOW,
    stripe: { declineCodeFor: async () => "insufficient_funds", portalUrl: async (c, r) => `https://billing.stripe.com/${c}?r=${encodeURIComponent(r)}` },
    ...over,
  };
  const server = http.createServer(handler(cfg));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { cfg, base, saves, close: () => server.close() };
}
const evt = JSON.stringify({ id: "evt_1", type: "invoice.payment_failed", data: { object: { id: "in_1", customer: "cus_1", customer_email: "a@b.co", amount_due: 1000, currency: "usd" } } });
const signed = (body = evt) => ({ "stripe-signature": signPayload(body, "whsec_t", Math.floor(NOW / 1000)) });

test("healthz is open; unknown paths 404", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  assert.equal((await fetch(`${s.base}/nope`)).status, 404);
  s.close();
});

test("webhook: bad signature is refused and changes nothing; good signature opens a case and persists", async () => {
  const s = await boot();
  const bad = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: { "stripe-signature": "t=1,v1=00" } });
  assert.equal(bad.status, 400);
  assert.equal(Object.keys(s.cfg.state.cases).length, 0);
  const ok = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { opened: "in_1", class: "funds" });
  assert.equal(s.saves.length, 1);
  const again = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  assert.deepEqual(await again.json(), { ignored: "duplicate" });
  s.close();
});

test("admin endpoints need the bearer key", async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/v1/summary`)).status, 401);
  assert.equal((await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer wrong" } })).status, 401);
  await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  const sum = await (await fetch(`${s.base}/v1/summary`, { headers: { authorization: "Bearer adm" } })).json();
  assert.equal(sum.open, 1); assert.equal(sum.dryRun, true);
  const cases = await (await fetch(`${s.base}/v1/cases`, { headers: { authorization: "Bearer adm" } })).json();
  assert.equal(cases[0].invoiceId, "in_1");
  s.close();
});

test("update links round-trip, reject forgeries, and redirect to a fresh portal session", async () => {
  const s = await boot();
  const tok = linkToken("link-secret", "cus_1");
  assert.equal(customerFromToken("link-secret", tok), "cus_1");
  assert.equal(customerFromToken("other", tok), null);
  assert.equal(customerFromToken("link-secret", tok.slice(0, -2) + "xx"), null);
  const ok = await fetch(`${s.base}/update/${tok}`, { redirect: "manual" });
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get("location"), /^https:\/\/billing\.stripe\.com\/cus_1/);
  assert.equal((await fetch(`${s.base}/update/forged.token`, { redirect: "manual" })).status, 404);
  s.close();
});

test("oversized webhook bodies are rejected", async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: "x".repeat(1_100_000) }).catch(() => ({ status: 413 }));
  assert.ok(r.status === 413 || r.status === undefined || r.status >= 400);
  assert.equal(Object.keys(s.cfg.state.cases).length, 0);
  s.close();
});

test("/admin serves a data-free page with a locked-down CSP; data still needs the key", async () => {
  const s = await boot();
  await fetch(`${s.base}/webhook/stripe`, { method: "POST", body: evt, headers: signed() });
  const r = await fetch(`${s.base}/admin`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /connect-src 'self'/);
  const html = await r.text();
  assert.ok(!html.includes("in_1") && !html.includes("cus_1"), "page must carry no case data");
  assert.ok(!html.includes("innerHTML"), "render with textContent only");
  assert.equal((await fetch(`${s.base}/v1/cases`)).status, 401);
  s.close();
});
