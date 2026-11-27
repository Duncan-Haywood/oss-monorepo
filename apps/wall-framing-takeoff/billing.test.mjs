import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, PAID_FEATURES, entitlement, allowed, isPlanKey } from "./plans.mjs";
import { planOf, isDark, createBillingProvider, fakeBillingProvider } from "./billing.mjs";
import { CHECKOUT_URLS, VALIDATE_URL, VARIANT_PLANS } from "./checkout.mjs";

const lit = { checkoutUrls: { report: "https://shop.example.com/checkout/report", pro: "" }, validateUrl: "https://shop.example.com/v1/licenses/validate", variantPlans: { 101: "report", 202: "pro" } };

test("the shipped build is dark: no checkout link, no provider, every feature open", () => {
  const shipped = { checkoutUrls: CHECKOUT_URLS, validateUrl: VALIDATE_URL, variantPlans: VARIANT_PLANS };
  assert.equal(isDark(shipped), true);
  assert.equal(createBillingProvider(shipped), null);
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

test("planOf maps the merchant's variant id and never guesses", () => {
  assert.equal(planOf({ meta: { variant_id: 101 } }, lit.variantPlans), "report");
  assert.equal(planOf({ meta: { variant_id: "202" } }, lit.variantPlans), "pro");
  for (const j of [null, {}, { meta: null }, { meta: { variant_id: 999 } }, { meta: { variant_id: {} } }, { meta: { variant_id: "toString" } }]) assert.equal(planOf(j, lit.variantPlans), null, JSON.stringify(j));
  assert.equal(planOf({ meta: { variant_id: 1 } }, { 1: "free" }), null);
});

test("isDark: only a plain https link lights the paid path", () => {
  assert.equal(isDark({ ...lit, checkoutUrls: { report: "http://shop.example.com/x" } }), true);
  assert.equal(isDark({ ...lit, checkoutUrls: { report: "https://u:p@shop.example.com/x" } }), true);
  assert.equal(isDark(lit), false);
});

test("the Lemon Squeezy provider validates once, reads the plan from the variant and never throws", async () => {
  const calls = [];
  const answer = (j) => async (u, init) => { calls.push({ u, body: init.body }); return { json: async () => j }; };
  let p = createBillingProvider(lit, { fetch: answer({ valid: true, license_key: { status: "active" }, meta: { variant_id: 101 } }) });
  assert.equal(p.name, "lemonsqueezy");
  assert.equal(p.checkoutUrl("report"), lit.checkoutUrls.report);
  assert.equal(p.checkoutUrl("pro"), null);
  assert.equal(p.checkoutUrl("__proto__"), null);
  assert.deepEqual(await p.validate(" ABCD-1234-EFGH "), { valid: true, reason: "", plan: "report" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u, lit.validateUrl);
  assert.equal(calls[0].body, "license_key=ABCD-1234-EFGH"); // gitleaks:allow (made-up key)
  // a valid key for another product unlocks nothing
  p = createBillingProvider(lit, { fetch: answer({ valid: true, meta: { variant_id: 999 } }) });
  assert.deepEqual(await p.validate("ABCD-1234-EFGH"), { valid: false, reason: "this key is for a product this page does not sell", plan: null });
  p = createBillingProvider(lit, { fetch: answer({ valid: true, license_key: { status: "expired" }, meta: { variant_id: 101 } }) });
  assert.equal((await p.validate("ABCD-1234-EFGH")).valid, false);
  p = createBillingProvider(lit, { fetch: async () => { throw new Error("offline"); } });
  assert.match((await p.validate("ABCD-1234-EFGH")).reason, /could not reach/);
  calls.length = 0;
  p = createBillingProvider(lit, { fetch: answer({ valid: true, meta: { variant_id: 101 } }) });
  assert.equal((await p.validate("bad key!")).valid, false);
  assert.equal(calls.length, 0, "a malformed key never reaches the network");
});

test("the fake provider maps keys to plans without the network", async () => {
  const p = fakeBillingProvider({ "REPORT-KEY-0001": "report", "FREE-KEY-00001": "free" });
  assert.deepEqual(await p.validate("REPORT-KEY-0001"), { valid: true, reason: "", plan: "report" });
  assert.equal((await p.validate("FREE-KEY-00001")).valid, false);
  assert.equal((await p.validate("OTHER-KEY-0001")).valid, false);
  assert.equal((await p.validate("x")).valid, false);
  assert.equal(p.checkoutUrl("report"), "https://checkout.example.com/report");
});
