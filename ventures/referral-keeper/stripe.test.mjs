import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySignature, signPayload, createStripe } from "./stripe.mjs";

test("webhook signatures: valid, wrong secret, stale, malformed", () => {
  const raw = '{"a":1}', t = 1_800_000_000;
  const h = signPayload(raw, "whsec", t);
  assert.equal(verifySignature(raw, h, "whsec", t), true);
  assert.equal(verifySignature(raw, h, "other", t), false);
  assert.equal(verifySignature(raw, h, "whsec", t + 600), false);
  assert.equal(verifySignature(raw + " ", h, "whsec", t), false);
  assert.equal(verifySignature(raw, "garbage", "whsec", t), false);
  assert.equal(verifySignature(raw, undefined, "whsec", t), false);
});

test("invoicePaymentRefs reads charge and payment_intent ids with a read-only GET", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init.method]); return { ok: true, json: async () => ({ data: [{ payment: { type: "payment_intent", payment_intent: "pi_1" } }, { payment: { charge: "ch_1" } }] }) }; };
  const refs = await createStripe({ key: "rk_x", fetchImpl }).invoicePaymentRefs("in_1");
  assert.deepEqual(refs, ["pi_1", "ch_1"]);
  assert.match(calls[0][0], /\/v1\/invoice_payments\?invoice=in_1/);
  assert.equal(calls[0][1], undefined, "no write verbs: default GET");
});

test("Stripe errors surface with their status", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "no permission" } }) });
  await assert.rejects(createStripe({ key: "k", fetchImpl }).invoicePaymentRefs("in_1"), (e) => e.status === 403 && /no permission/.test(e.message));
});
