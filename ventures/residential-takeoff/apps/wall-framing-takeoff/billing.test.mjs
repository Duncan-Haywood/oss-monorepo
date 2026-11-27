import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, PAID_FEATURES, entitlement, allowed, isPlanKey } from "./plans.mjs";
import { planOf, isDark, createBillingProvider, fakeBillingProvider } from "./billing.mjs";
import { PADDLE } from "./checkout.mjs";
import { signLicence } from "../../../../platform/billing/server.mjs";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), priv: b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey)) };
}
const litCfg = (publicKey) => ({ product: "residential-takeoff", priceId: "pri_01testtesttest", clientToken: "test_0123456789abcdef", publicKey, edge: "https://billing.example", environment: "sandbox" });

test("the shipped build is dark: no provider, every feature open", () => {
  assert.equal(isDark(PADDLE), true);
  assert.equal(createBillingProvider(PADDLE), null);
  const ent = entitlement({ dark: true });
  for (const f of PAID_FEATURES) assert.equal(allowed(f, ent).allowed, true, f);
});

test("prices sit inside the bets.md norms: $13-38 per report, $149-299 a month", () => {
  assert.equal(PLANS.report.kind, "one-off");
  assert.ok(PLANS.report.priceUsd >= 13 && PLANS.report.priceUsd <= 38);
  assert.equal(PLANS.pro.kind, "subscription");
  assert.equal(PLANS.pro.interval, "month");
  assert.ok(PLANS.pro.priceUsd >= 149 && PLANS.pro.priceUsd <= 299);
  assert.deepEqual(PLANS.free.features, []);
  for (const p of Object.values(PLANS)) for (const f of p.features) assert.ok(PAID_FEATURES.includes(f));
});

test("lit: no key or a bad verdict is the free plan, and the lock names what to buy", () => {
  for (const s of [{ dark: false }, { dark: false, valid: false, plan: "report" }, { dark: false, valid: true, plan: "nope" }, { dark: false, valid: true, plan: "__proto__" }, { dark: false, valid: "true", plan: "report" }]) {
    const ent = entitlement(/** @type {any} */ (s));
    assert.equal(ent.plan, "free", JSON.stringify(s));
    const g = allowed("material-list-export", ent);
    assert.equal(g.allowed, false);
    assert.match(g.reason, /Job report \(\$29, one house\)/);
  }
  assert.equal(allowed("material-list-export", entitlement({ dark: false, valid: true, plan: "report" })).allowed, true);
  assert.equal(allowed("bid-package", entitlement({ dark: false, valid: true, plan: "pro" })).allowed, true);
  assert.equal(isPlanKey("constructor"), false);
});

test("planOf reads the plan from the key's billing and never guesses", () => {
  assert.equal(planOf({ t: "one-off" }), "report");
  assert.equal(planOf({ t: "subscription" }), "pro");
  for (const c of [null, undefined, {}, { t: "free" }, { t: "__proto__" }, { t: ["one-off"] }, "one-off"]) assert.equal(planOf(c), null, JSON.stringify(c));
});

test("isDark: every public value must be set and well formed to light the paid path", () => {
  const lit = litCfg("A".repeat(43));
  assert.equal(isDark(lit), false);
  for (const [k, v] of [["priceId", ""], ["clientToken", ""], ["publicKey", ""], ["edge", ""], ["edge", "http://billing.example"], ["priceId", "price_1"], ["clientToken", "pdl_sk_x"], ["environment", "staging"]]) {
    assert.equal(isDark({ ...lit, [k]: v }), true, `${k}=${v}`);
  }
});

test("the Paddle provider: a one-off key for this product is a Job report, offline; anything else unlocks nothing", async () => {
  const { publicKey, priv } = await keyPair();
  let calls = 0;
  const p = createBillingProvider(litCfg(publicKey), { fetch: async () => { calls++; return new Response("{}", { status: 404 }); } });
  assert.equal(p.name, "paddle");
  const report = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_1", iat: 1 }, priv);
  assert.deepEqual(await p.validate(" " + report + "\n"), { valid: true, reason: "", plan: "report" });
  assert.equal(calls, 0, "a one-off key is checked without the network");
  const other = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "one-off", s: "txn_1", iat: 1 }, priv);
  assert.equal((await p.validate(other)).plan, null);
  const odd = await signLicence({ v: 1, p: "residential-takeoff", t: "lifetime", s: "txn_1", iat: 1 }, priv);
  assert.deepEqual(await p.validate(odd), { valid: false, reason: "this key is for a plan this page does not sell", plan: null });
  const forged = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_1", iat: 1 }, (await keyPair()).priv);
  assert.equal((await p.validate(forged)).valid, false);
  for (const junk of ["", "ABCD-1234-EFGH", null, "<script>"]) assert.equal((await p.validate(/** @type {any} */ (junk))).valid, false);
});

test("the Paddle provider passes a renewed subscription key back to the page", async () => {
  const { publicKey, priv } = await keyPair();
  const now = 1_800_000_000;
  const old = await signLicence({ v: 1, p: "residential-takeoff", t: "subscription", s: "sub_a", iat: now, exp: now + 10 }, priv);
  const fresh = await signLicence({ v: 1, p: "residential-takeoff", t: "subscription", s: "sub_a", iat: now, exp: now + 1000 }, priv);
  const p = createBillingProvider(litCfg(publicKey), { now: now + 20, fetch: async () => new Response(JSON.stringify({ key: fresh }), { status: 200 }) });
  assert.deepEqual(await p.validate(old), { valid: true, reason: "", plan: "pro", renewed: fresh });
});

test("the Paddle provider's Buy button is wired only on a real element", () => {
  const p = createBillingProvider(litCfg("A".repeat(43)));
  let listened = false;
  const el = { hidden: true, tagName: "A", getAttribute: () => null, setAttribute() {}, addEventListener: () => { listened = true; } };
  assert.equal(p.wireBuy(/** @type {any} */ (el), { onKey() {} }), true);
  assert.equal(el.hidden, false);
  assert.equal(listened, true);
  assert.equal(p.wireBuy(null, { onKey() {} }), false);
});

test("the fake provider maps keys to plans without the network", async () => {
  const p = fakeBillingProvider({ "REPORT-KEY-0001": "report", "FREE-KEY-00001": "free" });
  assert.deepEqual(await p.validate(" REPORT-KEY-0001 "), { valid: true, reason: "", plan: "report" });
  assert.equal((await p.validate("FREE-KEY-00001")).valid, false);
  assert.equal((await p.validate("OTHER-KEY-0001")).valid, false);
  assert.equal((await p.validate("")).valid, false);
  assert.equal(p.wireBuy(null, { onKey() {} }), false);
});
