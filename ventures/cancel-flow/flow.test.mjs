import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, monthlyAmount, addMonths, summarize, describeOffer, mergePolicy, REASONS } from "./flow.mjs";

const NOW = Date.UTC(2026, 9, 15, 12);
const monthly = { status: "active", amount: 4900, currency: "usd", interval: "month", intervalCount: 1 };

test("every reason maps to a Stripe cancellation_details feedback value", () => {
  const ok = new Set(["customer_service", "low_quality", "missing_features", "other", "switched_service", "too_complex", "too_expensive", "unused"]);
  for (const [k, r] of Object.entries(REASONS)) assert.ok(ok.has(r.stripe), k);
});

test("price objections get a discount sized in money, not just percent", () => {
  const d = decide({ reason: "too_expensive", sub: monthly, now: NOW });
  assert.equal(d.action, "offer");
  assert.deepEqual(d.offer, { type: "discount", percent: 30, months: 3, duration: "repeating", saving: 4410, monthly: 4900 });
  assert.match(describeOffer(d.offer), /30% off for 3 months \(saves \$44\.10\)/);
});

test("annual plans get a one-time discount, never a months-long coupon", () => {
  const d = decide({ reason: "too_expensive", sub: { ...monthly, amount: 49000, interval: "year" }, now: NOW });
  assert.equal(d.offer.duration, "once");
  assert.equal(d.offer.saving, 14700);
  assert.equal(d.offer.monthly, Math.round(49000 / 12));
});

test("not using it offers a pause that resumes on a real calendar date", () => {
  const d = decide({ reason: "not_using", sub: monthly, now: NOW });
  assert.equal(d.offer.type, "pause");
  assert.equal(new Date(d.offer.resumesAt).toISOString().slice(0, 10), "2026-12-15");
});

test("month arithmetic clamps to the last day instead of rolling over", () => {
  assert.equal(new Date(addMonths(Date.UTC(2026, 0, 31), 1)).toISOString().slice(0, 10), "2026-02-28");
  assert.equal(new Date(addMonths(Date.UTC(2026, 10, 30), 3)).toISOString().slice(0, 10), "2027-02-28");
});

test("missing-feature and other go straight to confirm; technical offers help", () => {
  assert.equal(decide({ reason: "missing_feature", sub: monthly }).action, "confirm");
  assert.equal(decide({ reason: "other", sub: monthly }).action, "confirm");
  assert.deepEqual(decide({ reason: "technical", sub: monthly, policy: { supportUrl: "https://x.test/help" } }).offer, { type: "help", url: "https://x.test/help" });
});

test("no discount to trialing customers, and only one accepted save per cooldown window", () => {
  assert.equal(decide({ reason: "too_expensive", sub: { ...monthly, status: "trialing" }, now: NOW }).why, "trialing");
  const history = [{ at: NOW - 100 * 86400000, outcome: "saved" }];
  assert.equal(decide({ reason: "too_expensive", sub: monthly, history, now: NOW }).why, "cooldown");
  const old = [{ at: NOW - 400 * 86400000, outcome: "saved" }];
  assert.equal(decide({ reason: "too_expensive", sub: monthly, history: old, now: NOW }).action, "offer");
  // declining an offer earlier does not burn the customer's one chance
  assert.equal(decide({ reason: "too_expensive", sub: monthly, history: [{ at: NOW - 86400000, outcome: "canceled" }], now: NOW }).action, "offer");
});

test("blocked states: unknown reason, canceled, already canceling", () => {
  assert.equal(decide({ reason: "bogus", sub: monthly }).why, "unknown_reason");
  assert.equal(decide({ reason: "other", sub: { ...monthly, status: "canceled" } }).why, "not_active");
  assert.equal(decide({ reason: "other", sub: { ...monthly, cancelAtPeriodEnd: true } }).why, "already_canceling");
});

test("policy values are clamped so a typo cannot give away the product", () => {
  const d = decide({ reason: "too_expensive", sub: monthly, policy: { offers: { too_expensive: { type: "discount", percent: 900, months: 99 } } } });
  assert.equal(d.offer.percent, 100); assert.equal(d.offer.months, 12);
  assert.equal(mergePolicy({ offers: { other: { type: "pause", months: 1 } } }).offers.too_expensive.type, "discount");
});

test("monthlyAmount normalises every interval", () => {
  assert.equal(monthlyAmount(1200, "year"), 100);
  assert.equal(monthlyAmount(3000, "month", 3), 1000);
  assert.equal(Math.round(monthlyAmount(100, "week")), 433);
});

test("summarize counts saves, save rate and the revenue a discount keeps", () => {
  const offer = { type: "discount", percent: 30, monthly: 4900 };
  const s = summarize([
    { reason: "too_expensive", offer, outcome: "saved" },
    { reason: "too_expensive", offer, outcome: "canceled" },
    { reason: "not_using", offer: { type: "pause", monthly: 4900 }, outcome: "saved" },
    { reason: "missing_feature", outcome: "canceled" },
    { outcome: "abandoned" },
  ]);
  assert.equal(s.started, 5); assert.equal(s.offered, 3); assert.equal(s.saved, 2); assert.equal(s.saveRate, 66.7);
  assert.equal(s.monthlyKept, 3430);
  assert.deepEqual(s.byReason.too_expensive, { n: 2, saved: 1, canceled: 1 });
  assert.deepEqual(s.savedByType, { discount: 1, pause: 1 });
});

import { assignVariant, summarizeExperiments, twoProportionP } from "./flow.mjs";

const exp = { experiments: { too_expensive: { variants: { B: { type: "discount", percent: 15, months: 6 } } } } };

test("variant assignment is sticky, even, and absent without a test", () => {
  assert.equal(assignVariant({ customer: "cus_1", reason: "other", policy: exp }), null);
  assert.equal(assignVariant({ customer: "cus_1", reason: "too_expensive", policy: exp }), assignVariant({ customer: "cus_1", reason: "too_expensive", policy: exp }));
  let b = 0; for (let i = 0; i < 2000; i++) if (assignVariant({ customer: `cus_${i}`, reason: "too_expensive", policy: exp }) === "B") b++;
  assert.ok(b > 900 && b < 1100, `B share ${b}/2000`);
});

test("variant B replaces the control offer; control and unknown arms keep the default", () => {
  const policy = mergePolicy(exp);
  assert.equal(decide({ reason: "too_expensive", sub: monthly, policy, now: NOW, variant: "B" }).offer.percent, 15);
  assert.equal(decide({ reason: "too_expensive", sub: monthly, policy, now: NOW, variant: "A" }).offer.percent, 30);
  assert.equal(decide({ reason: "too_expensive", sub: monthly, policy, now: NOW, variant: "Z" }).offer.percent, 30);
});

test("two-proportion p-value matches a worked example", () => {
  // 40/100 vs 25/100: pooled p=.325, z=2.264, two-sided p=0.0236
  assert.equal(twoProportionP(40, 100, 25, 100), 0.024);
  assert.equal(twoProportionP(5, 0, 1, 10), null);
  assert.equal(twoProportionP(0, 50, 0, 50), 1);
});

test("experiment verdict waits for enough offers, then calls a real difference", () => {
  const mk = (variant, n, saved) => Array.from({ length: n }, (_, i) => ({ reason: "too_expensive", variant, offer: { type: "discount", monthly: 1000, percent: 20 }, outcome: i < saved ? "saved" : "canceled" }));
  const small = summarizeExperiments([...mk("A", 10, 2), ...mk("B", 10, 8)]);
  assert.equal(small.too_expensive.B.verdict, "keep collecting");
  const big = summarizeExperiments([...mk("A", 100, 25), ...mk("B", 100, 40)]);
  assert.equal(big.too_expensive.B.verdict, "beats control on save rate");
  assert.equal(big.too_expensive.A.saveRate, 25);
  const tie = summarizeExperiments([...mk("A", 100, 25), ...mk("B", 100, 27)]);
  assert.equal(tie.too_expensive.B.verdict, "no clear difference");
});
