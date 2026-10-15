import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePolicy, newState, createAffiliate, attribute, accrue, applyRefund, balances, markPaid, payoutCsv, extractCode, recordClick, summarize, statsFor, addMonths } from "./commission.mjs";

const T0 = Date.UTC(2026, 0, 10, 12);
const DAY = 86400000;
const policy = mergePolicy({ rate: 0.2, months: 3, holdDays: 30, minPayoutCents: 1000 });
const inv = (id, over = {}) => ({ id, customer: "cus_1", amount_paid: 10000, total: 11000, tax: 1000, currency: "usd", created: Math.floor(T0 / 1000), ...over });

function setup() {
  const s = newState();
  createAffiliate(s, { name: "Ada Lovelace", email: "ada@example.com", code: "ada" }, T0);
  assert.ok(attribute(s, { customer: "cus_1", code: "ada", email: "buyer@example.com", now: T0 }).ok);
  return s;
}

test("policy is clamped so a typo cannot pay out more than half or never hold", () => {
  const p = mergePolicy({ rate: 5, months: -3, holdDays: 9999, cookieDays: 0, minPayoutCents: "x" });
  assert.equal(p.rate, 0.5); assert.equal(p.months, 0); assert.equal(p.holdDays, 120); assert.equal(p.cookieDays, 1); assert.equal(p.minPayoutCents, 5000);
});

test("extractCode reads client_reference_id or metadata and rejects junk", () => {
  assert.equal(extractCode({ client_reference_id: "rk_Ada" }), "ada");
  assert.equal(extractCode({ metadata: { referral: "ada" } }), "ada");
  assert.equal(extractCode({ client_reference_id: "order-123" }), null);
  assert.equal(extractCode({ metadata: { referral: "../etc" } }), null);
  assert.equal(extractCode({}), null);
});

test("affiliates: validation, generated codes, uniqueness", () => {
  const s = newState();
  assert.match(createAffiliate(s, { name: "", email: "a@b.co" }, T0).error, /name/);
  assert.match(createAffiliate(s, { name: "X", email: "nope" }, T0).error, /email/);
  const a = createAffiliate(s, { name: "Grace Hopper", email: "G@Example.com", rand: () => "ab12" }, T0).affiliate;
  assert.equal(a.code, "grace-hopper-ab12"); assert.equal(a.email, "g@example.com");
  assert.match(createAffiliate(s, { name: "Z", email: "z@z.co", code: "grace-hopper-ab12" }, T0).error, /taken/);
  assert.match(createAffiliate(s, { name: "Z", email: "z@z.co", code: "A B" }, T0).error, /code/);
});

test("commission is on the amount paid before tax, rounded to a cent", () => {
  const s = setup();
  const r = accrue(s, inv("in_1", { amount_paid: 11000, total: 11000, tax: 1000 }), policy, T0);
  assert.equal(r.cents, 2000); // 20% of 10000 ex-tax, not of 11000
  const s2 = setup();
  assert.equal(accrue(s2, inv("in_x", { amount_paid: 3333, total: 3333, tax: 0 }), policy, T0).cents, 667);
});

test("an invoice is paid commission once, however many times the event replays", () => {
  const s = setup();
  assert.ok(accrue(s, inv("in_1"), policy, T0).ok);
  assert.equal(accrue(s, inv("in_1"), policy, T0).why, "duplicate");
  assert.equal(s.entries.length, 1);
});

test("first touch wins and a self-referral earns nothing", () => {
  const s = setup();
  createAffiliate(s, { name: "Bob", email: "bob@example.com", code: "bob" }, T0);
  assert.equal(attribute(s, { customer: "cus_1", code: "bob", now: T0 }).why, "already_attributed");
  assert.equal(attribute(s, { customer: "cus_2", code: "ada", email: "ADA@example.com", now: T0 }).why, "self_referral");
  assert.equal(attribute(s, { customer: "cus_3", code: "ghost", now: T0 }).why, "unknown_code");
  const t = setup();
  assert.equal(accrue(t, inv("in_9", { customer_email: "ada@example.com" }), policy, T0).why, "self_referral");
});

test("the commission window runs from the first paid invoice; annual plans count once", () => {
  const s = setup();
  const at = (months, id) => inv(id, { created: Math.floor(addMonths(T0, months) / 1000) });
  assert.ok(accrue(s, at(0, "in_a"), policy, T0).ok);
  assert.ok(accrue(s, at(2, "in_b"), policy, T0).ok);
  assert.equal(accrue(s, at(3, "in_c"), policy, T0).why, "window_over");
  const life = mergePolicy({ months: 0 });
  const s2 = setup(); accrue(s2, at(0, "in_a"), life, T0);
  assert.ok(accrue(s2, at(40, "in_z"), life, T0).ok, "lifetime never expires");
});

test("a suspended affiliate accrues nothing new", () => {
  const s = setup(); s.affiliates.ada.status = "suspended";
  assert.equal(accrue(s, inv("in_1"), policy, T0).why, "affiliate_inactive");
});

test("per-affiliate rate overrides the default", () => {
  const s = newState();
  createAffiliate(s, { name: "VIP", email: "v@v.co", code: "vip", rate: 0.35 }, T0);
  attribute(s, { customer: "cus_1", code: "vip", now: T0 });
  assert.equal(accrue(s, inv("in_1", { amount_paid: 10000, tax: 0, total: 10000 }), policy, T0).cents, 3500);
});

test("commission matures after the hold; refunds inside the hold shrink it, a full refund removes it", () => {
  const s = setup();
  accrue(s, inv("in_1", { charge: "ch_1", amount_paid: 10000, total: 10000, tax: 0 }), policy, T0);
  assert.deepEqual(balances(s, policy, T0)["ada"].usd, { pending: 2000, payable: 0, paid: 0, earned: 2000, due: 0 });
  assert.equal(balances(s, policy, T0 + 31 * DAY)["ada"].usd.payable, 2000);
  assert.equal(applyRefund(s, { keys: ["ch_1"], amount: 10000, amountRefunded: 2500 }, T0 + DAY), 1);
  assert.equal(s.entries[0].cents, 1500);
  assert.equal(applyRefund(s, { keys: ["ch_1"], amount: 10000, amountRefunded: 2500 }, T0 + DAY), 0, "replaying the same refund changes nothing");
  assert.equal(applyRefund(s, { keys: ["ch_1"], full: true }, T0 + 2 * DAY), 1);
  assert.equal(s.entries[0].cents, 0);
});

test("a refund after payout becomes a negative adjustment that nets on the next payout", () => {
  const s = setup();
  accrue(s, inv("in_1", { charge: "ch_1", amount_paid: 10000, total: 10000, tax: 0 }), policy, T0);
  const later = T0 + 40 * DAY;
  const paid = markPaid(s, { code: "ada", currency: "usd", method: "paypal", reference: "tx1" }, policy, later);
  assert.equal(paid.payout.cents, 2000);
  assert.equal(markPaid(s, { code: "ada", currency: "usd" }, policy, later).error, "nothing payable", "cannot pay the same money twice");
  applyRefund(s, { keys: ["ch_1"], amount: 10000, amountRefunded: 5000 }, later + DAY);
  const adj = s.entries.at(-1);
  assert.equal(adj.kind, "adjust"); assert.equal(adj.cents, -1000);
  assert.equal(balances(s, policy, later + DAY).ada.usd.payable, -1000);
  assert.equal(balances(s, policy, later + DAY).ada.usd.due, 0, "a negative balance is never 'due'");
});

test("the minimum payout rolls small balances over; currencies never mix", () => {
  const s = setup();
  const p = mergePolicy({ rate: 0.2, holdDays: 0, minPayoutCents: 1500, months: 0 });
  accrue(s, inv("in_1", { amount_paid: 5000, total: 5000, tax: 0 }), p, T0); // 1000 usd
  s.customers["cus_2"] = { code: "ada", at: T0, firstPaidAt: null };
  accrue(s, inv("in_2", { customer: "cus_2", amount_paid: 9000, total: 9000, tax: 0, currency: "eur" }), p, T0); // 1800 eur
  const b = balances(s, p, T0 + DAY).ada;
  assert.equal(b.usd.due, 0); assert.equal(b.eur.due, 1800);
  assert.match(markPaid(s, { code: "ada", currency: "usd" }, p, T0 + DAY).error, /minimum/);
  assert.equal(markPaid(s, { code: "ada", currency: "eur" }, p, T0 + DAY).payout.cents, 1800);
});

test("payout CSV lists only what is due and neutralises spreadsheet formulas in names", () => {
  const s = newState();
  createAffiliate(s, { name: "=HYPERLINK(\"x\")", email: "e@x.co", code: "evil" }, T0);
  attribute(s, { customer: "cus_1", code: "evil", now: T0 });
  const p = mergePolicy({ holdDays: 0, minPayoutCents: 100, months: 0 });
  accrue(s, inv("in_1", { amount_paid: 10000, total: 10000, tax: 0 }), p, T0);
  const csv = payoutCsv(s, p, T0 + DAY).trim().split("\n");
  assert.equal(csv.length, 2);
  assert.match(csv[1], /^evil,"'=HYPERLINK/);
  assert.match(csv[1], /,USD,20\.00,2000,1$/);
});

test("clicks are counted per day and old days are pruned", () => {
  const s = newState();
  for (let d = 0; d < 100; d++) recordClick(s, "ada", T0 + d * DAY);
  recordClick(s, "ada", T0 + 99 * DAY);
  assert.equal(s.clicks.ada.total, 101);
  assert.equal(Object.keys(s.clicks.ada.days).length, 90);
});

test("summary and per-affiliate stats add up", () => {
  const s = setup();
  accrue(s, inv("in_1", { amount_paid: 10000, total: 10000, tax: 0 }), policy, T0);
  recordClick(s, "ada", T0);
  const sum = summarize(s, policy, T0);
  assert.equal(sum.affiliates, 1); assert.equal(sum.payingCustomers, 1); assert.equal(sum.attributedRevenue.usd, 10000);
  assert.equal(sum.commission.usd.earned, 2000);
  const st = statsFor(s, "ada", policy, T0);
  assert.equal(st.visits, 1); assert.equal(st.referred, 1); assert.equal(st.paying, 1); assert.equal(st.recent.length, 1);
});

import { projectEconomics } from "./commission.mjs";
test("projectEconomics: a 12-month window costs less than lifetime, and shares are consistent", () => {
  const base = { price: 50, rate: 0.2, churn: 0.05, referralsPerMonth: 10 };
  const w12 = projectEconomics({ ...base, months: 12 }), life = projectEconomics({ ...base, months: 0 });
  assert.ok(Math.abs(w12.lifeMonths - 20) < 1e-9);
  assert.ok(life.commission > w12.commission);
  assert.ok(Math.abs(life.commission - 50 * 0.2 * 20) < 1e-9, "lifetime commission is rate x lifetime revenue");
  assert.ok(Math.abs(life.commissionShareOfRevenue - 0.2) < 1e-9);
  assert.ok(Math.abs(w12.net - (w12.revenue - w12.commission)) < 1e-9);
  assert.ok(Math.abs(w12.monthlyCommissionAtSteadyState - 10 * w12.commission) < 1e-9);
  assert.equal(projectEconomics({ price: "x", rate: 9, months: -1, churn: 0 }).commission, 0, "junk input is clamped, never NaN");
});
