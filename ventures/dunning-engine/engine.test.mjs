import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, applyEvent, dueSteps, tick, summary } from "./engine.mjs";

const T0 = Date.UTC(2026, 9, 13, 12);
const DAY = 86400000;
const failed = (id = "in_1", extra = {}) => ({ id: `evt_${Math.random()}`, type: "invoice.payment_failed", data: { object: { id, customer: "cus_1", subscription: "sub_1", customer_email: "sam@example.com", customer_name: "Sam", amount_due: 4900, currency: "usd", attempt_count: 1, hosted_invoice_url: "https://inv/h", ...extra } } });
const mkDeps = (over = {}) => {
  const log = { emails: [], pays: [], cancels: [], alerts: [] };
  return {
    log,
    deps: {
      policy: {}, dryRun: false, company: "Acme", address: "1 Main", updateUrl: () => "https://x/update/tok",
      sendEmail: async (m) => log.emails.push(m),
      alert: async (t) => log.alerts.push(t),
      stripe: {
        getInvoice: async () => ({ status: "open" }),
        payInvoice: async (id, key) => { log.pays.push([id, key]); return {}; },
        cancelSubscription: async (id) => log.cancels.push(id),
      },
      ...over,
    },
  };
};

test("a failure opens one case with a plan; the same event id is ignored", () => {
  const s = newState(); const e = failed();
  assert.deepEqual(applyEvent(s, e, { now: T0, declineCode: "insufficient_funds" }), { opened: "in_1", class: "funds" });
  assert.deepEqual(applyEvent(s, e, { now: T0, declineCode: "insufficient_funds" }), { ignored: "duplicate" });
  assert.equal(Object.keys(s.cases).length, 1);
  assert.equal(s.cases.in_1.amountMinor, 4900);
});

test("tick sends the first email now and skips nothing it cannot do", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "generic_decline" });
  const { deps, log } = mkDeps();
  await tick(s, T0, deps);
  assert.equal(log.emails.length, 1);
  assert.equal(log.emails[0].to, "sam@example.com");
  assert.match(log.emails[0].text, /\$49\.00/);
  assert.match(log.emails[0].text, /https:\/\/x\/update\/tok/);
  await tick(s, T0, deps); // idempotent: nothing new is due
  assert.equal(log.emails.length, 1);
});

test("dry run changes no step into a real effect", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "generic_decline" });
  const { deps, log } = mkDeps({ dryRun: true });
  await tick(s, T0 + 30 * DAY, deps);
  assert.equal(log.emails.length + log.pays.length + log.cancels.length, 0);
  assert.equal(s.cases.in_1.status, "lost");
});

test("a retry that succeeds recovers the case, books the money and skips the rest", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "generic_decline" });
  const { deps, log } = mkDeps();
  await tick(s, T0 + DAY + 11 * 3600000, deps);
  assert.equal(log.pays.length, 1);
  assert.equal(log.pays[0][1], "dd-in_1-retry0");
  assert.equal(s.cases.in_1.status, "recovered");
  assert.deepEqual(summary(s).recoveredMinor, { usd: 4900 });
  assert.equal(dueSteps(s, T0 + 99 * DAY).length, 0);
});

test("a retry that is declined as lost_card switches the case to hard and stops retrying", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "generic_decline" });
  const { deps, log } = mkDeps({ stripe: {
    getInvoice: async () => ({ status: "open" }),
    payInvoice: async () => { throw Object.assign(new Error("declined"), { status: 402, declineCode: "lost_card" }); },
  } });
  await tick(s, T0 + DAY + 11 * 3600000, deps);
  const c = s.cases.in_1;
  assert.equal(c.class, "hard");
  assert.equal(c.steps.filter((x) => x.kind === "retry" && x.status === "pending").length, 0);
  assert.equal(log.alerts.length, 0);
});

test("an invoice paid outside this tool is noticed before retrying and nothing is charged", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "generic_decline" });
  const { deps, log } = mkDeps({ stripe: { getInvoice: async () => ({ status: "paid" }), payInvoice: async () => { throw new Error("must not run"); } } });
  await tick(s, T0 + DAY + 11 * 3600000, deps);
  assert.equal(s.cases.in_1.status, "recovered");
  assert.equal(log.pays.length, 0);
});

test("invoice.paid, voided and subscription.deleted close cases", () => {
  const s = newState(); applyEvent(s, failed("in_a"), { now: T0, declineCode: "x" }); applyEvent(s, failed("in_b", { subscription: "sub_b" }), { now: T0, declineCode: "x" });
  assert.deepEqual(applyEvent(s, { id: "e1", type: "invoice.paid", data: { object: { id: "in_a" } } }, { now: T0 }), { closed: "in_a", outcome: "recovered" });
  assert.deepEqual(applyEvent(s, { id: "e2", type: "customer.subscription.deleted", data: { object: { id: "sub_b" } } }, { now: T0 }), { closed: 1 });
  assert.equal(summary(s).open, 0);
});

test("a new card on file queues one immediate retry per open case, once", () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "expired_card" });
  const ev = (id) => ({ id, type: "payment_method.attached", data: { object: { customer: "cus_1" } } });
  assert.deepEqual(applyEvent(s, ev("p1"), { now: T0 + 1000 }), { queued: 1 });
  assert.deepEqual(applyEvent(s, ev("p2"), { now: T0 + 2000 }), { queued: 0 });
});

test("expiry alerts the owner and cancels only when told to", async () => {
  for (const cancelOnExpire of [false, true]) {
    const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "expired_card" });
    const { deps, log } = mkDeps({ cancelOnExpire });
    await tick(s, T0 + 20 * DAY, deps);
    assert.equal(s.cases.in_1.status, "lost");
    assert.equal(log.alerts.length, 1);
    assert.equal(log.cancels.length, cancelOnExpire ? 1 : 0);
  }
});

test("an email failure backs off, then gives up and tells the owner after three tries", async () => {
  const s = newState(); applyEvent(s, failed(), { now: T0, declineCode: "expired_card" });
  const { deps, log } = mkDeps({ sendEmail: async () => { throw new Error("smtp down"); } });
  let t = T0;
  for (let i = 0; i < 3; i++) { await tick(s, t, deps); t += 60 * 60000; }
  assert.equal(s.cases.in_1.steps.find((x) => x.id === "email0").status, "failed");
  assert.equal(log.alerts.length, 1);
});

test("a customer with no email is skipped, not crashed on", async () => {
  const s = newState(); applyEvent(s, failed("in_n", { customer_email: null }), { now: T0, declineCode: "expired_card" });
  const { deps, log } = mkDeps();
  await tick(s, T0, deps);
  assert.equal(log.emails.length, 0);
  assert.equal(s.cases.in_n.steps.find((x) => x.id === "email0").status, "skipped");
});

import { scanExpiring } from "./engine.mjs";
const NOWX = Date.UTC(2026, 9, 15, 12);
const expSub = (id, pmId, m, y, cust = `cus_${id}`) => ({ id, status: "active", customer: { id: cust, email: `${id}@x.co`, name: id }, default_payment_method: { id: pmId, card: { exp_month: m, exp_year: y, last4: "4242", brand: "visa" } } });
const expDeps = (subs, over = {}) => {
  const { deps, log } = mkDeps({ expiryNotices: true, expiryDays: 30, stripe: { listSubscriptionsWithCards: async () => subs }, ...over });
  return { deps, log };
};

test("expiry scan emails each expiring card once, then not again", async () => {
  const s = newState(); const { deps, log } = expDeps([expSub("a", "pm_a", 10, 2026), expSub("b", "pm_b", 12, 2030)]);
  const out = await scanExpiring(s, NOWX, deps);
  assert.equal(log.emails.length, 1);
  assert.equal(log.emails[0].to, "a@x.co");
  assert.match(log.emails[0].subject, /ending 4242 expires 10\/2026/);
  assert.match(log.emails[0].text, /https:\/\/x\/update\/tok/);
  assert.equal(s.stats.expiryEmails, 1);
  assert.equal(out.length, 1);
  await scanExpiring(s, NOWX + 25 * 3600000, deps); // next day: card already notified
  assert.equal(log.emails.length, 1);
});

test("expiry scan runs at most once a day", async () => {
  const s = newState(); let calls = 0;
  const { deps } = expDeps([], { stripe: { listSubscriptionsWithCards: async () => { calls++; return []; } } });
  await scanExpiring(s, NOWX, deps); await scanExpiring(s, NOWX + 3600000, deps);
  assert.equal(calls, 1);
});

test("expiry scan skips customers already being dunned, and is off when disabled", async () => {
  const s = newState(); applyEvent(s, failed("in_9", { customer: "cus_a" }), { now: NOWX, declineCode: "expired_card" });
  const { deps, log } = expDeps([expSub("a", "pm_a", 9, 2026, "cus_a")]);
  await scanExpiring(s, NOWX, deps);
  assert.equal(log.emails.length, 0);
  const off = expDeps([expSub("c", "pm_c", 9, 2026)], { expiryNotices: false });
  await scanExpiring(newState(), NOWX, off.deps);
  assert.equal(off.log.emails.length, 0);
});

test("expiry scan in dry run sends nothing and does not mark the card notified", async () => {
  const s = newState(); const { deps, log } = expDeps([expSub("a", "pm_a", 10, 2026)], { dryRun: true });
  const out = await scanExpiring(s, NOWX, deps);
  assert.equal(log.emails.length, 0);
  assert.match(out[0], /dry run: would email a@x.co/);
  assert.deepEqual(s.expiry.notified, {});
});

test("an expired card gets past-tense wording", async () => {
  const s = newState(); const { deps, log } = expDeps([expSub("a", "pm_a", 9, 2026)]);
  await scanExpiring(s, NOWX, deps);
  assert.match(log.emails[0].subject, /expired on 09\/2026/);
});
