import { test } from "node:test";
import assert from "node:assert/strict";
import { assignArm, clampPct, wilson, diffInterval, experiment, casesPerArm } from "./holdout.mjs";
import { newState, applyEvent, tick, summary } from "./engine.mjs";

const T0 = Date.UTC(2026, 9, 13, 12);
const DAY = 86400000;
const failed = (id, customer) => ({ id: `evt_${id}`, type: "invoice.payment_failed", data: { object: { id, customer, subscription: `sub_${customer}`, customer_email: "a@example.com", amount_due: 1000, currency: "usd", attempt_count: 1 } } });
const paid = (id) => ({ id: `evt_paid_${id}`, type: "invoice.paid", data: { object: { id } } });

test("percent is clamped to 0..50 and junk means off", () => {
  assert.equal(clampPct("20"), 20);
  assert.equal(clampPct(90), 50);
  assert.equal(clampPct(-3), 0);
  assert.equal(clampPct("x"), 0);
  assert.equal(clampPct(undefined), 0);
});

test("arm is stable per customer, off at 0, and near the requested share", () => {
  assert.equal(assignArm("cus_1", 0), "treatment");
  assert.equal(assignArm("cus_1", 20), assignArm("cus_1", 20));
  let h = 0; const N = 5000;
  for (let i = 0; i < N; i++) if (assignArm(`cus_${i}`, 20) === "holdout") h++;
  assert.ok(h / N > 0.17 && h / N < 0.23, `share ${h / N}`);
});

test("wilson interval matches a known value and handles empty", () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.low - 0.4902) < 0.002 && Math.abs(w.high - 0.9433) < 0.002, JSON.stringify(w));
  assert.equal(wilson(0, 0).p, null);
});

test("difference interval separates a real gap and straddles zero for a small one", () => {
  const big = diffInterval(160, 200, 30, 100); // 80% vs 30%
  assert.ok(big.low > 0.3 && big.high < 0.65);
  const small = diffInterval(6, 10, 5, 10);
  assert.ok(small.low < 0 && small.high > 0);
  assert.equal(diffInterval(1, 0, 1, 5), null);
});

test("sample size for 60% vs 50% is in the textbook range (~385 per arm)", () => {
  const n = casesPerArm(0.6, 0.5);
  assert.ok(n > 370 && n < 400, String(n));
  assert.equal(casesPerArm(0.5, 0.5), null);
});

test("no experiment is reported without holdout cases", () => {
  const s = newState();
  applyEvent(s, failed("in_1", "cus_1"), { now: T0, declineCode: "generic_decline" });
  assert.equal(summary(s).experiment, undefined);
  assert.equal(s.cases.in_1.arm, undefined);
});

function findCustomer(arm, pct) { for (let i = 0; ; i++) if (assignArm(`cus_${i}`, pct) === arm) return `cus_${i}`; }

test("a holdout case is recorded but never emailed, retried, cancelled or alerted", async () => {
  const cus = findCustomer("holdout", 30);
  const s = newState();
  applyEvent(s, failed("in_h", cus), { now: T0, declineCode: "insufficient_funds", holdoutPct: 30 });
  const c = s.cases.in_h;
  assert.equal(c.arm, "holdout");
  assert.deepEqual(c.steps.map((x) => x.kind), ["expire"]);
  const calls = { email: 0, pay: 0, cancel: 0, alert: 0 };
  const deps = { policy: {}, dryRun: false, cancelOnExpire: true, updateUrl: () => "u", sendEmail: async () => calls.email++, alert: async () => calls.alert++,
    stripe: { getInvoice: async () => ({ status: "open" }), payInvoice: async () => calls.pay++, cancelSubscription: async () => calls.cancel++ } };
  await tick(s, T0 + 30 * DAY, deps);
  assert.deepEqual(calls, { email: 0, pay: 0, cancel: 0, alert: 0 });
  assert.equal(c.status, "lost");
  // a card update does not trigger a retry in the holdout
  const s2 = newState();
  applyEvent(s2, failed("in_h", cus), { now: T0, declineCode: "generic_decline", holdoutPct: 30 });
  assert.deepEqual(applyEvent(s2, { id: "e2", type: "payment_method.attached", data: { object: { customer: cus } } }, { now: T0, holdoutPct: 30 }), { queued: 0 });
});

test("a holdout invoice the customer pays on their own counts as recovered", () => {
  const cus = findCustomer("holdout", 30);
  const s = newState();
  applyEvent(s, failed("in_h", cus), { now: T0, declineCode: "generic_decline", holdoutPct: 30 });
  applyEvent(s, paid("in_h"), { now: T0 + DAY, holdoutPct: 30 });
  assert.equal(s.cases.in_h.status, "recovered");
});

test("experiment compares the arms and ignores voided and open cases", () => {
  const mk = (arm, status) => ({ arm, status });
  const cases = {};
  let n = 0;
  const add = (arm, status, times) => { for (let i = 0; i < times; i++) cases[`i${n++}`] = mk(arm, status); };
  add("treatment", "recovered", 160); add("treatment", "lost", 40); add("treatment", "voided", 5); add("treatment", "open", 9);
  add("holdout", "recovered", 30); add("holdout", "lost", 70);
  const ex = experiment(cases);
  assert.equal(ex.treatment.resolved, 200);
  assert.equal(ex.treatment.rate, 0.8);
  assert.equal(ex.holdout.rate, 0.3);
  assert.ok(ex.difference.low > 0);
  assert.match(ex.verdict, /working/);
  assert.equal(ex.casesPerArmNeeded, null);
});

test("a gap that could be chance says to keep running and how many cases it would take", () => {
  const cases = {}; let n = 0;
  const add = (arm, status, times) => { for (let i = 0; i < times; i++) cases[`i${n++}`] = { arm, status }; };
  add("treatment", "recovered", 6); add("treatment", "lost", 4); add("holdout", "recovered", 5); add("holdout", "lost", 5);
  const ex = experiment(cases);
  assert.match(ex.verdict, /No clear difference/);
  assert.ok(ex.casesPerArmNeeded > 100);
});

test("a treatment arm that does worse is called out", () => {
  const cases = {}; let n = 0;
  const add = (arm, status, times) => { for (let i = 0; i < times; i++) cases[`i${n++}`] = { arm, status }; };
  add("treatment", "recovered", 20); add("treatment", "lost", 180); add("holdout", "recovered", 60); add("holdout", "lost", 40);
  assert.match(experiment(cases).verdict, /less often/);
});
