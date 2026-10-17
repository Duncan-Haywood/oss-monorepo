import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, classifyPlan, normalizeRows, analyze, statusOf, sampleCsv } from "./calc.mjs";

const HEAD = "email,active_subscription,expiry,plan,email_disabled,created_at,first_payment_at,activity_rating\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const sub = (n, active, plan, created, first = "", expiry = "", act = 0, dis = "false") => `${n}@x.invalid,${active},${expiry},${plan},${dis},${created},${first},${act}\n`;

test("plan wording is classified", () => {
  assert.equal(classifyPlan("monthly"), "monthly");
  assert.equal(classifyPlan("yearly"), "annual");
  assert.equal(classifyPlan("founding"), "founding");
  assert.equal(classifyPlan("comp"), "comp");
  assert.equal(classifyPlan(""), "none");
});

test("no recognisable header gives a plain error; empty file too", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2\n")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("paid, free, comp and former are told apart, and emails are not kept", () => {
  const n = load(sub("a", "true", "monthly", "2026-01-01", "2026-01-10") + sub("b", "true", "", "2026-02-01") + sub("c", "true", "comp", "2026-02-01") + sub("d", "false", "monthly", "2026-01-01", "2026-01-05", "2026-03-01"));
  assert.equal(n.error, undefined);
  assert.ok(!JSON.stringify(n.members).includes("x.invalid"));
  const asOf = Date.UTC(2026, 7, 1);
  assert.deepEqual(n.members.map((m) => statusOf(m, asOf)), ["paid", "free", "comp", "former"]);
});

test("revenue is monthly-equivalent from typed prices and reconciles with fees", () => {
  const n = load(sub("a", "true", "monthly", "2026-01-01", "2026-01-02") + sub("b", "true", "yearly", "2026-01-01", "2026-01-02", "2027-01-02") + sub("c", "true", "founding", "2026-01-01", "2026-01-02", "2027-01-02"));
  const r = analyze(n.members, { monthlyPrice: 10, annualPrice: 120, foundingPrice: 240 });
  near(r.summary.mrr, 10 + 10 + 20);
  near(r.byPlan.reduce((t, p) => t + p.mrr, 0), r.summary.mrr);
  near(r.net, r.summary.mrr - r.fees.total);
  near(r.fees.platform, 4);
  near(r.fees.processing, 40 * 0.029 + 0.3 * (1 + 2 / 12));
});

test("conversion and churn exclude comp; churn is former over ever paid", () => {
  const body = sub("a", "true", "monthly", "2026-01-01", "2026-01-02") + sub("b", "false", "monthly", "2026-01-01", "2026-01-02", "2026-02-02") + sub("c", "true", "", "2026-01-01") + sub("d", "true", "", "2026-01-01") + sub("e", "true", "comp", "2026-01-01");
  const r = analyze(load(body).members);
  assert.equal(r.summary.paidEver, 2);
  near(r.summary.conversion, 2 / 4);
  near(r.summary.churnRate, 1 / 2);
  assert.equal(r.summary.counts.comp, 1);
});

test("paid survival counts only subscribers old enough to be measured", () => {
  let body = "";
  for (let i = 0; i < 6; i++) body += sub("k" + i, "true", "monthly", "2025-01-01", "2025-01-02");
  for (let i = 0; i < 6; i++) body += sub("q" + i, "false", "monthly", "2025-01-01", "2025-01-02", "2025-01-20");
  body += sub("new", "true", "monthly", "2026-01-01", "2026-01-02");
  const r = analyze(load(body).members, { asOf: Date.UTC(2026, 0, 3) });
  const s12 = r.survival.find((x) => x.months === 12);
  assert.equal(s12.eligible, 12);
  assert.equal(s12.kept, 6);
});

test("annual renewals due are windowed from the as-of date", () => {
  const body = sub("a", "true", "yearly", "2025-09-01", "2025-09-02", "2026-09-10") + sub("b", "true", "yearly", "2025-10-01", "2025-10-02", "2026-11-15") + sub("c", "true", "monthly", "2025-10-01", "2025-10-02", "2026-09-05");
  const r = analyze(load(body).members, { asOf: Date.UTC(2026, 8, 1), annualPrice: 100 });
  assert.equal(r.renewals[0].count, 1);
  near(r.renewals[0].amount, 100);
  assert.equal(r.renewals[2].count, 2);
});

test("time to first payment and growth are bucketed by month", () => {
  const body = sub("a", "true", "monthly", "2026-05-01", "2026-05-03") + sub("b", "true", "monthly", "2026-05-10", "2026-07-20") + sub("c", "true", "", "2026-06-01");
  const r = analyze(load(body).members);
  assert.equal(r.lagBuckets[0].count, 1);
  assert.equal(r.lagBuckets[3 - 1].count, 1);
  assert.deepEqual(r.growth.map((g) => [g.month, g.joined, g.upgraded]), [["2026-05", 2, 1], ["2026-06", 1, 0], ["2026-07", 0, 1]]);
});

test("invalid assumptions are refused", () => {
  const r = load(sub("a", "true", "monthly", "2026-01-01", "2026-01-02"));
  assert.ok(analyze(r.members, { platformPct: 60, processingPct: 50 }).invalid);
  assert.ok(analyze(r.members, { monthlyPrice: -1 }).invalid);
});

test("the built-in example parses and produces every table without warnings", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.members);
  assert.equal(r.summary.counts.total, 400);
  assert.ok(r.summary.mrr > 0 && r.growth.length > 0 && r.findings.length > 0);
  assert.equal(r.summary.counts.paid + r.summary.counts.free + r.summary.counts.comp + r.summary.counts.former, 400);
});
