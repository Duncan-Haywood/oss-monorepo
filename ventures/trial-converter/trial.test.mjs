import { test } from "node:test";
import assert from "node:assert/strict";
import { planTrial, replan, mergePolicy, conversionValue, formatMoney } from "./trial.mjs";
import { renderEmail, TEMPLATE_NAMES } from "./templates.mjs";

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1, 8);
const trial = (days, extra = {}) => ({ start: T0, end: T0 + days * DAY, ...extra });

test("card trial: one honest heads-up 3 days before the end, at the email hour", () => {
  const steps = planTrial({ ...trial(14), hasCard: true });
  const ending = steps.filter((s) => s.template === "ending-card");
  assert.equal(ending.length, 1);
  assert.equal(ending[0].at, Date.UTC(2026, 9, 12, 15));
  assert.ok(steps.some((s) => s.template === "tips"), "14-day trial gets a midway nudge");
  assert.ok(steps.every((s) => s.status === "pending" && s.at > T0 && s.at < T0 + 14 * DAY));
});

test("no-card trial: three escalating asks and no tips on a short trial", () => {
  const steps = planTrial({ ...trial(7), hasCard: false });
  assert.deepEqual(steps.filter((s) => s.kind === "email").map((s) => s.template), ["addcard-first", "tips", "addcard-reminder", "addcard-final"]);
  const last = steps.at(-1);
  assert.equal(last.template, "addcard-final");
  assert.equal(last.at, T0 + 7 * DAY - 0.25 * DAY);
});

test("a very short trial never schedules before it starts and always keeps one reminder", () => {
  const steps = planTrial({ ...trial(2), hasCard: true });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].at, T0 + DAY);
  const none = planTrial({ ...trial(0), hasCard: true });
  assert.deepEqual(none, []);
});

test("extension step only exists for card-less trials with extendDays set", () => {
  assert.ok(!planTrial({ ...trial(14), hasCard: false }).some((s) => s.kind === "extend"));
  assert.ok(!planTrial({ ...trial(14), hasCard: true, policy: { extendDays: 3 } }).some((s) => s.kind === "extend"));
  const x = planTrial({ ...trial(14), hasCard: false, policy: { extendDays: 3 } }).find((s) => s.kind === "extend");
  assert.equal(x.days, 3);
  assert.equal(x.at, T0 + 14 * DAY - 2 * 3600000);
});

test("replan keeps what already ran and does not repeat it", () => {
  const c = { trialStart: T0, trialEnd: T0 + 14 * DAY, hasCard: false, extensions: 0, steps: planTrial({ ...trial(14), hasCard: false }) };
  c.steps[0].status = "done";
  const firstId = c.steps[0].id;
  c.hasCard = true;
  const steps = replan(c, { now: T0 + 2 * DAY });
  assert.equal(steps.filter((s) => s.id === firstId).length, 1);
  assert.ok(steps.some((s) => s.template === "ending-card" && s.status === "pending"));
  assert.ok(!steps.some((s) => s.status === "pending" && s.template?.startsWith("addcard")), "begging for a card stops once there is one");
});

test("policy validation rejects nonsense", () => {
  assert.throws(() => mergePolicy({ emailHourUtc: 25 }), /0-23/);
  assert.throws(() => mergePolicy({ nocardReminderDays: [-1] }), /non-negative/);
  assert.throws(() => mergePolicy({ extendDays: "x" }), /non-negative/);
});

test("templates fill every placeholder the engine provides and never leak tips_line", () => {
  const vars = { name: "Sam", amount: "$49.00", interval: "month", company: "Acme", address: "1 Main St", end_date: "2026-10-15", manage_url: "https://t.example/manage/x", extra_days: 3 };
  for (const t of TEMPLATE_NAMES) {
    const m = renderEmail(t, vars);
    assert.doesNotMatch(m.subject + m.text, /\{\{/, t);
  }
  assert.match(renderEmail("ending-card", vars).text, /\$49\.00 per month/);
  assert.match(renderEmail("addcard-first-x1", vars).subject, /Acme/);
  assert.match(renderEmail("ending-card", { ...vars, manage_url: "" }).text, /\{\{manage_url\}\}/, "a missing value stays visible");
});

test("conversion value and money formatting", () => {
  assert.deepEqual(conversionValue({ trialsPerMonth: 100, price: 20, rateNow: 20, rateTarget: 25 }), { extraCustomers: 5, extraMrr: 100 });
  assert.equal(conversionValue({ trialsPerMonth: "x", price: 20, rateNow: 5, rateTarget: 1 }).extraMrr + 0, 0, "garbage input is zero, not NaN");
  assert.equal(formatMoney(4900, "usd"), "$49.00");
  assert.equal(formatMoney(5000, "jpy"), "¥5,000");
});
