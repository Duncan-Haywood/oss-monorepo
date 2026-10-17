import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDecline, planRecovery, snapToPayday, mergePolicy, replan, formatMoney } from "./dunning.mjs";
import { renderEmail } from "./templates.mjs";

const T0 = Date.UTC(2026, 9, 13, 12); // Tue 13 Oct 2026 12:00Z

test("decline codes map to the right recovery class; unknown codes are soft", () => {
  assert.equal(classifyDecline("lost_card"), "hard");
  assert.equal(classifyDecline("expired_card"), "update");
  assert.equal(classifyDecline("insufficient_funds"), "funds");
  assert.equal(classifyDecline("authentication_required"), "auth");
  assert.equal(classifyDecline("do_not_honor"), "soft");
  assert.equal(classifyDecline(undefined), "soft");
  assert.equal(classifyDecline(" EXPIRED_CARD "), "update");
});

test("hard and update declines are never retried, only emailed", () => {
  for (const code of ["stolen_card", "expired_card", "authentication_required"]) {
    const { steps } = planRecovery({ declineCode: code, t0: T0 });
    assert.equal(steps.filter((s) => s.kind === "retry").length, 0, code);
    assert.ok(steps.filter((s) => s.kind === "email").length >= 3, code);
  }
});

test("soft declines get spaced retries and the first email goes out immediately", () => {
  const { steps } = planRecovery({ declineCode: "generic_decline", t0: T0 });
  const retries = steps.filter((s) => s.kind === "retry");
  assert.equal(retries.length, 4);
  assert.equal(steps[0].kind, "email");
  assert.equal(steps[0].at, T0);
  assert.equal(steps[0].template, "soft-first");
  assert.equal(steps.at(-1).kind, "expire");
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].at >= steps[i - 1].at);
});

test("the last email is the final notice and nothing is scheduled past the grace period", () => {
  const { steps } = planRecovery({ declineCode: "insufficient_funds", t0: T0, policy: { graceDays: 8 } });
  const expire = steps.find((s) => s.kind === "expire");
  assert.ok(steps.every((s) => s.at <= expire.at));
  const emails = steps.filter((s) => s.kind === "email");
  assert.match(emails.at(-1).template, /-final$/);
});

test("payday snapping moves a funds retry to a 1st/2nd/15th/16th or Friday within two days", () => {
  const d = (y, m, day) => Date.UTC(y, m, day);
  assert.equal(snapToPayday(d(2026, 9, 13)), d(2026, 9, 15)); // Tue -> 15th
  assert.equal(snapToPayday(d(2026, 9, 21)), d(2026, 9, 23)); // Wed -> Fri
  assert.equal(snapToPayday(d(2026, 9, 19)), d(2026, 9, 19)); // Mon 19th: 19-21 hold no payday, stays
  assert.equal(snapToPayday(d(2026, 9, 31)), d(2026, 10, 1)); // Sat 31 Oct -> 1 Nov
  assert.equal(snapToPayday(d(2026, 9, 29)), d(2026, 9, 30)); // Thu -> Fri
});

test("paydayAware:false keeps the nominal day", () => {
  const on = planRecovery({ declineCode: "insufficient_funds", t0: T0 }).steps.filter((s) => s.kind === "retry");
  const off = planRecovery({ declineCode: "insufficient_funds", t0: T0, policy: { paydayAware: false } }).steps.filter((s) => s.kind === "retry");
  assert.equal(new Date(off[0].at).toISOString(), "2026-10-15T10:00:00.000Z");
  assert.equal(off.length, on.length);
});

test("retries stay strictly one day apart even when snapping collides", () => {
  const retries = planRecovery({ declineCode: "insufficient_funds", t0: Date.UTC(2026, 9, 14, 8), policy: { fundsRetryDays: [1, 2, 3, 4] } }).steps.filter((s) => s.kind === "retry");
  for (let i = 1; i < retries.length; i++) assert.ok(retries[i].at - retries[i - 1].at >= 86400000);
});

test("bad policy is rejected loudly", () => {
  assert.throws(() => mergePolicy({ emailDays: "3" }), /emailDays/);
  assert.throws(() => mergePolicy({ retryHourUtc: 30 }), /hours/);
  assert.throws(() => mergePolicy({ graceDays: -1 }), /graceDays/);
});

test("replan: a retry that comes back as a hard decline drops pending retries and keeps sent emails", () => {
  const plan = planRecovery({ declineCode: "generic_decline", t0: T0 });
  plan.steps.find((s) => s.id === "email0").status = "done";
  plan.t0 = T0;
  const now = T0 + 86400000 * 2;
  const next = replan(plan, { declineCode: "lost_card", now });
  assert.equal(next.class, "hard");
  assert.equal(next.steps.filter((s) => s.kind === "retry" && s.status === "pending").length, 0);
  assert.equal(next.steps.filter((s) => s.id === "email0").length, 1);
  assert.equal(next.steps.find((s) => s.id === "email0").status, "done");
  assert.ok(next.steps.some((s) => s.kind === "expire"));
});

test("replan with the same class changes nothing", () => {
  const plan = planRecovery({ declineCode: "generic_decline", t0: T0 }); plan.t0 = T0;
  assert.deepEqual(replan(plan, { declineCode: "do_not_honor", now: T0 + 1 }).steps, plan.steps);
});

test("emails are neutral and fill every placeholder", () => {
  const vars = { name: "Sam", amount: "$49.00", company: "Acme", address: "1 Main St", update_url: "https://x/u", deadline: "2026-10-27" };
  for (const t of ["hard-first", "update-reminder", "funds-final", "soft-first", "auth-first", "auth-final"]) {
    const m = renderEmail(t, vars);
    assert.doesNotMatch(m.subject + m.text, /\{\{/, t);
    assert.doesNotMatch(m.text, /stolen|fraud|lost/i, t);
    assert.match(m.text, /https:\/\/x\/u/);
  }
  assert.match(renderEmail("funds-final", vars).subject, /2026-10-27/);
  assert.match(renderEmail("soft-first", { ...vars, name: "" }).text, /\{\{name\}\}/); // typos stay visible
});

test("money formatting handles zero-decimal currencies", () => {
  assert.equal(formatMoney(4900, "usd"), "$49.00");
  assert.match(formatMoney(5000, "jpy"), /5,000/);
});
