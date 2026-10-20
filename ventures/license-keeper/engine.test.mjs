import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent } from "./engine.mjs";
import { newState, findBy } from "./store.mjs";
import { generateKeyPair, verifyLicense } from "./token.mjs";

const T = Date.UTC(2026, 0, 1);
const DAY = 86400000;
const plans = { price_pro: { product: "app", plan: "pro", features: ["export"], machines: 2, days: null }, price_sub: { product: "app", plan: "sub", machines: 1 } };

async function setup(extra = {}) {
  const keys = await generateKeyPair(); const sent = [];
  const stripe = {
    lineItems: async () => extra.items || [{ priceId: "price_pro", quantity: 1 }],
    subscription: async () => ({ current_period_end: (T + 30 * DAY) / 1000 }),
  };
  return { keys, sent, deps: { plans, stripe, signKey: keys.privateKey, sendEmail: async (m) => sent.push(m), company: "Acme", graceDays: 3, now: T, dryRun: false } };
}
const checkout = (id, o = {}) => ({ id, type: "checkout.session.completed", data: { object: { id: "cs_" + id, mode: "payment", payment_status: "paid", customer_details: { email: "Buy@x.co" }, payment_intent: "pi_" + id, ...o } } });

test("a paid checkout issues a license and emails a key that verifies offline", async () => {
  const { keys, sent, deps } = await setup(); const s = newState();
  await applyEvent(s, checkout("e1"), deps);
  assert.equal(sent.length, 1);
  const token = sent[0].text.match(/LK1\.[\w.-]+/)[0];
  const v = await verifyLicense(keys.publicKey, token, { now: T });
  assert.equal(v.valid, true);
  assert.equal(v.claims.plan, "pro"); assert.equal(v.claims.exp, null); assert.equal(v.claims.machines, 2);
  assert.equal(sent[0].to, "buy@x.co");
});

test("a replayed event does not issue a second license", async () => {
  const { sent, deps } = await setup(); const s = newState();
  await applyEvent(s, checkout("e1"), deps); await applyEvent(s, checkout("e1"), deps);
  assert.equal(Object.keys(s.licenses).length, 1); assert.equal(sent.length, 1);
});

test("dry run issues and logs but sends no email", async () => {
  const { sent, deps } = await setup(); const s = newState();
  const log = await applyEvent(s, checkout("e1"), { ...deps, dryRun: true });
  assert.equal(sent.length, 0); assert.match(log[0], /DRY RUN/); assert.equal(Object.keys(s.licenses).length, 1);
});

test("quantity scales machines; unknown prices are skipped; unpaid sessions wait", async () => {
  let r = await setup({ items: [{ priceId: "price_pro", quantity: 3 }, { priceId: "price_other", quantity: 1 }] }); const s = newState();
  const log = await applyEvent(s, checkout("e1"), r.deps);
  assert.equal(Object.values(s.licenses)[0].machines, 6); assert.ok(log.some((l) => /no plan/.test(l)));
  r = await setup(); const s2 = newState();
  await applyEvent(s2, checkout("e2", { payment_status: "unpaid" }), r.deps);
  assert.equal(Object.keys(s2.licenses).length, 0);
});

test("a subscription runs to period end plus grace and each paid invoice extends it", async () => {
  const { deps } = await setup({ items: [{ priceId: "price_sub", quantity: 1 }] }); const s = newState();
  await applyEvent(s, checkout("e1", { mode: "subscription", subscription: "sub_1" }), deps);
  const l = findBy(s, "subscription", "sub_1")[0];
  assert.equal(l.exp, (T + 33 * DAY) / 1000);
  const inv = { id: "e2", type: "invoice.paid", data: { object: { subscription: "sub_1", lines: { data: [{ period: { end: (T + 60 * DAY) / 1000 } }] } } } };
  await applyEvent(s, inv, deps);
  assert.equal(l.exp, (T + 63 * DAY) / 1000);
});

test("a full refund or a dispute revokes; a partial refund does not", async () => {
  const { deps } = await setup(); const s = newState();
  await applyEvent(s, checkout("e1"), deps);
  const l = Object.values(s.licenses)[0];
  await applyEvent(s, { id: "r0", type: "charge.refunded", data: { object: { payment_intent: "pi_e1", refunded: false } } }, deps);
  assert.equal(l.status, "active");
  await applyEvent(s, { id: "r1", type: "charge.refunded", data: { object: { payment_intent: "pi_e1", refunded: true } } }, deps);
  assert.equal(l.status, "revoked");
  await applyEvent(s, checkout("e2"), deps);
  const l2 = Object.values(s.licenses)[1];
  await applyEvent(s, { id: "d1", type: "charge.dispute.created", data: { object: { payment_intent: "pi_e2" } } }, deps);
  assert.equal(l2.status, "revoked");
});

test("a Stripe lookup failure releases the event id so Stripe's retry can succeed", async () => {
  const { deps } = await setup(); const s = newState();
  await assert.rejects(applyEvent(s, checkout("e1"), { ...deps, stripe: { lineItems: async () => { throw new Error("boom"); } } }));
  assert.equal(s.seen.e1, undefined);
  await applyEvent(s, checkout("e1"), deps);
  assert.equal(Object.keys(s.licenses).length, 1);
});
