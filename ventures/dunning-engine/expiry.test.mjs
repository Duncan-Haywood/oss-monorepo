import { test } from "node:test";
import assert from "node:assert/strict";
import { cardValidUntil, findExpiring, formatExpiry } from "./expiry.mjs";

const NOW = Date.UTC(2026, 9, 15, 12); // 15 Oct 2026
const sub = (id, pm, extra = {}) => ({ id, status: "active", customer: { id: `cus_${id}`, email: `${id}@x.co`, name: id }, default_payment_method: pm, ...extra });
const card = (id, m, y) => ({ id, card: { exp_month: m, exp_year: y, last4: "4242", brand: "visa" } });

test("a card is valid through the last moment of its expiry month", () => {
  assert.equal(cardValidUntil(10, 2026), Date.UTC(2026, 10, 1) - 1);
  assert.equal(cardValidUntil(12, 2026), Date.UTC(2027, 0, 1) - 1);
  assert.equal(formatExpiry(3, 2027), "03/2027");
});

test("flags cards expiring within the window, soonest first, and marks expired ones", () => {
  const subs = [
    sub("a", card("pm_a", 11, 2026)), // ends 30 Nov: 46 days out, beyond 30
    sub("b", card("pm_b", 10, 2026)), // ends 31 Oct: in window
    sub("c", card("pm_c", 9, 2026)),  // already expired
    sub("d", card("pm_d", 12, 2030)),
  ];
  const r = findExpiring(subs, NOW, { withinDays: 30 });
  assert.deepEqual(r.map((x) => x.pm), ["pm_c", "pm_b"]);
  assert.equal(r[0].expired, true);
  assert.equal(r[1].expired, false);
  assert.equal(r[1].expires, "10/2026");
});

test("a 60 day window reaches the November card", () => {
  const r = findExpiring([sub("a", card("pm_a", 11, 2026))], NOW, { withinDays: 60 });
  assert.equal(r.length, 1);
});

test("skips subscriptions that are cancelled, leaving, or have no card", () => {
  const subs = [
    sub("a", card("pm_a", 10, 2026), { status: "canceled" }),
    sub("b", card("pm_b", 10, 2026), { cancel_at_period_end: true }),
    sub("c", null),
    sub("d", { id: "pm_d", us_bank_account: {} }),
  ];
  assert.deepEqual(findExpiring(subs, NOW), []);
});

test("falls back to the customer's default method, and dedupes a card shared by two subscriptions", () => {
  const cust = { id: "cus_z", email: "z@x.co", invoice_settings: { default_payment_method: card("pm_z", 10, 2026) } };
  const subs = [
    { id: "s1", status: "active", customer: cust, default_payment_method: null },
    { id: "s2", status: "trialing", customer: cust, default_payment_method: null },
  ];
  const r = findExpiring(subs, NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].customer, "cus_z");
  assert.equal(r[0].email, "z@x.co");
});

test("an unexpanded customer id gives no email but still a customer id", () => {
  const r = findExpiring([{ id: "s1", status: "active", customer: "cus_9", default_payment_method: card("pm_9", 10, 2026) }], NOW);
  assert.equal(r[0].customer, "cus_9");
  assert.equal(r[0].email, null);
});
