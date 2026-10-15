import { test } from "node:test";
import assert from "node:assert/strict";
import { verifySignature, signPayload, createStripe } from "./stripe.mjs";

const SECRET = "whsec_test";
const body = '{"id":"evt_1"}';

test("valid signature passes; tampered body, wrong secret, stale timestamp and junk fail", () => {
  const t = 1_800_000_000;
  const h = signPayload(body, SECRET, t);
  assert.ok(verifySignature(body, h, SECRET, t + 10));
  assert.ok(!verifySignature(body + " ", h, SECRET, t + 10));
  assert.ok(!verifySignature(body, h, "whsec_other", t + 10));
  assert.ok(!verifySignature(body, h, SECRET, t + 301));
  assert.ok(!verifySignature(body, "garbage", SECRET, t));
  assert.ok(!verifySignature(body, undefined, SECRET, t));
  assert.ok(!verifySignature(body, `t=${t},v1=zz`, SECRET, t));
});

test("an old v1 alongside a new one still verifies (secret rotation)", () => {
  const t = 1_800_000_000;
  const good = signPayload(body, SECRET, t).split(",")[1];
  assert.ok(verifySignature(body, `t=${t},v1=${"0".repeat(64)},${good}`, SECRET, t));
});

function fakeFetch(routes) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, ...opts });
    const key = `${opts.method} ${new URL(url).pathname}`;
    const r = routes[key];
    if (!r) return { ok: false, status: 404, json: async () => ({ error: { message: "nope" } }) };
    return { ok: r.status === undefined || r.status < 400, status: r.status || 200, json: async () => r.body };
  };
  f.calls = calls;
  return f;
}

test("declineCodeFor reads the intent on the invoice, or invoice_payments on newer API versions", async () => {
  const f1 = fakeFetch({ "GET /v1/payment_intents/pi_1": { body: { last_payment_error: { decline_code: "insufficient_funds", code: "card_declined" } } } });
  assert.equal(await createStripe({ key: "k", fetchImpl: f1 }).declineCodeFor({ id: "in_1", payment_intent: "pi_1" }), "insufficient_funds");
  const f2 = fakeFetch({
    "GET /v1/invoice_payments": { body: { data: [{ payment: { payment_intent: "pi_2" } }] } },
    "GET /v1/payment_intents/pi_2": { body: { last_payment_error: { code: "expired_card" } } },
  });
  assert.equal(await createStripe({ key: "k", fetchImpl: f2 }).declineCodeFor({ id: "in_2" }), "expired_card");
  assert.equal(await createStripe({ key: "k", fetchImpl: fakeFetch({}) }).declineCodeFor({ id: "in_3" }), null);
});

test("payInvoice sends an idempotency key and surfaces a decline as an error with its code", async () => {
  const f = fakeFetch({ "POST /v1/invoices/in_1/pay": { status: 402, body: { error: { message: "declined", code: "card_declined", decline_code: "do_not_honor" } } } });
  await assert.rejects(createStripe({ key: "sk", fetchImpl: f }).payInvoice("in_1", "idem-1"), (e) => e.status === 402 && e.declineCode === "do_not_honor");
  assert.equal(f.calls[0].headers["idempotency-key"], "idem-1");
  assert.equal(f.calls[0].headers.authorization, "Bearer sk");
});

test("portalUrl posts the customer and return url form-encoded", async () => {
  const f = fakeFetch({ "POST /v1/billing_portal/sessions": { body: { url: "https://billing.stripe.com/p/x" } } });
  assert.equal(await createStripe({ key: "k", fetchImpl: f }).portalUrl("cus_1", "https://me.example"), "https://billing.stripe.com/p/x");
  assert.equal(f.calls[0].body, "customer=cus_1&return_url=https%3A%2F%2Fme.example");
});

test("listSubscriptionsWithCards pages through results and expands the card", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const second = String(url).includes("starting_after=sub_2");
    return { ok: true, status: 200, json: async () => (second ? { data: [{ id: "sub_3" }], has_more: false } : { data: [{ id: "sub_1" }, { id: "sub_2" }], has_more: true }) };
  };
  const s = createStripe({ key: "rk_t", fetchImpl });
  const subs = await s.listSubscriptionsWithCards();
  assert.deepEqual(subs.map((x) => x.id), ["sub_1", "sub_2", "sub_3"]);
  assert.equal(urls.length, 2);
  assert.match(decodeURIComponent(urls[0]), /expand\[\]=data\.default_payment_method/);
});
