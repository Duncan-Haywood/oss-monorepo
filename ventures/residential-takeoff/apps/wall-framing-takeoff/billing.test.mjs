import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, PAID_FEATURES, entitlement, allowed, isPlanKey } from "./plans.mjs";
import { PRODUCT_PLAN, isDark, createBillingProvider, fakeBillingProvider } from "./billing.mjs";
import { PADDLE } from "./checkout.mjs";
import { signLicence } from "../../../../platform/billing/server.mjs";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)), priv: b64u(await crypto.subtle.exportKey("pkcs8", pair.privateKey)) };
}
// Every public value set, all made up: what the page holds once the owner fills the catalogue.
const litWith = (publicKey) => ({ ...PADDLE, priceId: "pri_" + "0".repeat(26), clientToken: "test_" + "a".repeat(27), publicKey, edge: "https://billing.example" });

test("the shipped build is dark: no public Paddle values, no provider, every feature open", () => {
  assert.equal(PADDLE.product, "residential-takeoff", "sold as its own product, not the free tool's pack");
  assert.equal(isDark(), true);
  assert.equal(isDark(PADDLE), true);
  assert.equal(createBillingProvider(), null);
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
  assert.equal(PRODUCT_PLAN, "report");
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

test("isDark: any missing or malformed public value keeps the paid path dark", async () => {
  const lit = litWith("A".repeat(43));
  assert.equal(isDark(lit), false);
  for (const [k, v] of [["priceId", ""], ["priceId", "price_123"], ["clientToken", ""], ["clientToken", "pdl_live_apikey_" + "x".repeat(20)], ["publicKey", ""], ["edge", "http://billing.example"], ["edge", ""], ["environment", "live"]]) {
    assert.equal(isDark({ ...lit, [k]: v }), true, `${k}=${v}`);
    assert.equal(createBillingProvider({ ...lit, [k]: v }), null, `${k}=${v}`);
  }
});

test("the Paddle provider: a key signed for this product is the Job report; any other key unlocks nothing", async () => {
  const { publicKey, priv } = await keyPair();
  const p = createBillingProvider(litWith(publicKey));
  assert.ok(p);
  assert.equal(p.name, "paddle");
  const now = 1_800_000_000;
  const good = await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_job1", iat: now }, priv);
  assert.deepEqual(await p.validate(" " + good + "\n"), { valid: true, reason: "", plan: "report" });
  // The free tool's bid-package key is another product: it must not unlock the paid edition.
  const otherTool = await signLicence({ v: 1, p: "wall-framing-takeoff", t: "subscription", s: "sub_x", iat: now, exp: now + 1e9 }, priv);
  const o = await p.validate(otherTool);
  assert.equal(o.valid, false);
  assert.equal(o.plan, null);
  assert.match(o.reason, /another tool/);
  // A key signed by someone else's private key, a tampered key and junk all fail.
  const stranger = await keyPair();
  assert.equal((await p.validate(await signLicence({ v: 1, p: "residential-takeoff", t: "one-off", s: "txn_x", iat: now }, stranger.priv))).valid, false);
  const [pre, body, sig] = good.split(".");
  assert.equal((await p.validate([pre, body, sig.slice(0, -2) + (sig.endsWith("AA") ? "BA" : "AA")].join("."))).valid, false);
  for (const junk of ["", "ABCD-1234-EFGH", "ms1.x.y", "<script>", null]) assert.equal((await p.validate(/** @type {any} */ (junk))).valid, false, String(junk));
});

test("the Paddle provider wires the Buy link only while lit", async () => {
  const { publicKey } = await keyPair();
  let wired = 0;
  const el = { hidden: true, tagName: "A", getAttribute: () => null, setAttribute() {}, addEventListener: () => { wired++; } };
  const p = createBillingProvider(litWith(publicKey));
  assert.equal(p.wireBuy(/** @type {any} */ (el), { onKey() {} }), true);
  assert.equal(el.hidden, false);
  assert.equal(wired, 1);
  assert.equal(p.wireBuy(null, { onKey() {} }), false);
});

test("the fake provider maps keys to plans without the network", async () => {
  const p = fakeBillingProvider({ "REPORT-KEY-0001": "report", "FREE-KEY-00001": "free" });
  assert.deepEqual(await p.validate("REPORT-KEY-0001"), { valid: true, reason: "", plan: "report" });
  assert.equal((await p.validate("FREE-KEY-00001")).valid, false);
  assert.equal((await p.validate("OTHER-KEY-0001")).valid, false);
  assert.equal((await p.validate("x")).valid, false);
});
