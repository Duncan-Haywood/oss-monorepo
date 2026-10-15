import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, applyEvent, tick, summary } from "./engine.mjs";

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 1, 8);
const sub = (over = {}) => ({ id: "sub_1", customer: "cus_1", status: "trialing", trial_start: NOW / 1000, trial_end: (NOW + 14 * DAY) / 1000, items: { data: [{ quantity: 2, price: { unit_amount: 2500, currency: "usd", recurring: { interval: "month" } } }] }, ...over });
let n = 0;
const ev = (type, object) => ({ id: `evt_${++n}`, type, data: { object } });
const deps = (over = {}) => {
  const sent = [], calls = [];
  return {
    sent, calls, policy: {}, dryRun: false, company: "Acme", address: "1 Main", manageUrl: (c) => `https://t.example/manage/${c.customer}`,
    sendEmail: async (m) => sent.push(m),
    stripe: {
      customerEmail: async () => ({ email: "sam@example.com", name: "Sam" }),
      getSubscription: async () => ({ status: "trialing", default_payment_method: null }),
      extendTrial: async (id, end, key) => calls.push({ id, end, key }),
    },
    ...over,
  };
};

test("a new trial opens one case, prices it from the plan, and ignores a duplicate event", () => {
  const s = newState();
  const e = ev("customer.subscription.created", sub());
  const r = applyEvent(s, e, { now: NOW, policy: {}, hasCard: false });
  assert.deepEqual([r.opened, r.mode], ["sub_1", "nocard"]);
  assert.equal(s.cases.sub_1.amountMinor, 5000);
  assert.deepEqual(applyEvent(s, e, { now: NOW, policy: {} }), { ignored: "duplicate" });
  assert.equal(applyEvent(s, ev("customer.subscription.updated", sub()), { now: NOW, policy: {}, hasCard: false }).ignored, "no change");
});

test("ignores non-trial subscriptions and trials that are already over", () => {
  const s = newState();
  assert.equal(applyEvent(s, ev("customer.subscription.created", sub({ status: "active", trial_end: null })), { now: NOW, policy: {} }).ignored, "not a trial");
  assert.equal(applyEvent(s, ev("customer.subscription.created", sub({ trial_end: (NOW - DAY) / 1000 })), { now: NOW, policy: {} }).ignored, "trial already over");
  assert.equal(Object.keys(s.cases).length, 0);
});

test("emails go out on schedule with the price and the manage link; each once", async () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  const d = deps();
  assert.deepEqual(await tick(s, NOW + DAY, d), []);
  const log = await tick(s, NOW + 11 * DAY + 8 * 3600000, d);
  assert.ok(log.length >= 1);
  const ending = d.sent.find((m) => /ends 2026-10-15/.test(m.subject));
  assert.ok(ending, d.sent.map((m) => m.subject).join("|"));
  assert.match(ending.text, /\$50\.00 per month/);
  assert.match(ending.text, /manage\/cus_1/);
  assert.equal(ending.to, "sam@example.com");
  const before = d.sent.length;
  await tick(s, NOW + 11 * DAY + 9 * 3600000, d);
  assert.equal(d.sent.length, before);
});

test("dry run sends nothing and extends nothing but records what it would do", async () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: { extendDays: 3 }, hasCard: false });
  const d = deps({ dryRun: true, policy: { extendDays: 3 } });
  const log = await tick(s, NOW + 14 * DAY - 2 * 3600000, d);
  assert.deepEqual(d.sent, []); assert.deepEqual(d.calls, []);
  assert.ok(log.some((l) => /would extend/.test(l)));
});

test("a card added mid-trial swaps begging for a heads-up", async () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: false });
  assert.deepEqual(applyEvent(s, ev("payment_method.attached", { customer: "cus_1" }), { now: NOW + DAY, policy: {} }), { cardAdded: 1 });
  const d = deps();
  await tick(s, NOW + 15 * DAY, d);
  assert.ok(!d.sent.some((m) => /Keep using|Last call/.test(m.subject)));
  const c = s.cases.sub_1;
  assert.ok(c.steps.some((x) => x.template === "ending-card"));
});

test("a stale email is skipped, not sent after the trial moved on", async () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  const d = deps();
  const log = await tick(s, NOW + 12 * DAY + 20 * 3600000, d);
  assert.deepEqual(d.sent, []);
  assert.ok(log.some((l) => /too late/.test(l)));
});

test("extension: once, only if still no card, then the replan and a notice follow", async () => {
  const s = newState();
  const policy = { extendDays: 3 };
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy, hasCard: false });
  const d = deps({ policy });
  const end = NOW + 14 * DAY;
  await tick(s, end - 2 * 3600000, d);
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].end, (end + 3 * DAY) / 1000);
  assert.equal(s.cases.sub_1.extensions, 1);
  assert.equal(s.cases.sub_1.trialEnd, end + 3 * DAY);
  await tick(s, end - 2 * 3600000 + 60000, d);
  assert.ok(d.sent.some((m) => /extended/.test(m.subject) && /3 more days/.test(m.text)));
  assert.equal(s.cases.sub_1.steps.filter((x) => x.kind === "extend" && x.status === "pending").length, 0, "never a second extension");
});

test("extension is skipped if Stripe says a card arrived", async () => {
  const s = newState();
  const policy = { extendDays: 3 };
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy, hasCard: false });
  const d = deps({ policy, stripe: { getSubscription: async () => ({ status: "trialing", default_payment_method: "pm_1" }), customerEmail: async () => null, extendTrial: async () => { throw new Error("must not run"); } } });
  const log = await tick(s, NOW + 14 * DAY - 2 * 3600000, d);
  assert.ok(log.some((l) => /with a card/.test(l)));
  assert.equal(s.cases.sub_1.extensions, 0);
});

test("outcomes: conversion and loss close the case, stop all steps, and feed the card/no-card rates", () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  applyEvent(s, ev("customer.subscription.created", sub({ id: "sub_2", customer: "cus_2" })), { now: NOW, policy: {}, hasCard: false });
  applyEvent(s, ev("customer.subscription.created", sub({ id: "sub_3", customer: "cus_3" })), { now: NOW, policy: {}, hasCard: false });
  assert.deepEqual(applyEvent(s, ev("customer.subscription.updated", sub({ status: "active" })), { now: NOW + 14 * DAY, policy: {} }), { closed: "sub_1", outcome: "converted" });
  assert.deepEqual(applyEvent(s, ev("customer.subscription.deleted", sub({ id: "sub_2", status: "canceled" })), { now: NOW + 14 * DAY, policy: {} }), { closed: "sub_2", outcome: "lost" });
  assert.deepEqual(applyEvent(s, ev("invoice.paid", { subscription: "sub_3", amount_paid: 5000 }), { now: NOW + 14 * DAY, policy: {} }), { closed: "sub_3", outcome: "converted" });
  assert.ok(Object.values(s.cases).every((c) => c.status !== "open" && c.steps.every((x) => x.status !== "pending")));
  assert.deepEqual(summary(s), { open: 0, openWithoutCard: 0, converted: 2, lost: 1, conversionPctWithCard: 100, conversionPctWithoutCard: 50, emails: 0, extensions: 0 });
});

test("a $0 invoice does not count as a conversion", () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  assert.equal(applyEvent(s, ev("invoice.paid", { subscription: "sub_1", amount_paid: 0 }), { now: NOW + DAY, policy: {} }).ignored, "no case");
  assert.equal(s.cases.sub_1.status, "open");
});

test("a failing email retries with backoff and alerts after three tries", async () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  const alerts = [];
  const d = deps({ sendEmail: async () => { throw new Error("resend 500"); }, alert: async (t) => alerts.push(t) });
  let t = NOW + 11 * DAY + 8 * 3600000;
  for (let i = 0; i < 3; i++) { await tick(s, t, d); t += 30 * 60000; }
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /failed 3 times/);
});

test("a moved trial end re-plans from the new date", () => {
  const s = newState();
  applyEvent(s, ev("customer.subscription.created", sub()), { now: NOW, policy: {}, hasCard: true });
  const r = applyEvent(s, ev("customer.subscription.updated", sub({ trial_end: (NOW + 30 * DAY) / 1000 })), { now: NOW + DAY, policy: {}, hasCard: true });
  assert.equal(r.moved, true);
  assert.ok(s.cases.sub_1.steps.every((x) => x.at < NOW + 30 * DAY));
  assert.ok(s.cases.sub_1.steps.some((x) => x.template === "ending-card" && x.at > NOW + 20 * DAY));
});
