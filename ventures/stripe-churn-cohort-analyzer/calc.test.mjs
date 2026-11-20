import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeRows, analyze, sampleCsv, parseDate, simulatePriceIncrease, simulateChurnReduction, planChurn } from "./calc.mjs";

const csv = (rows) => rows.join("\n");

test("parseCsv handles quotes, embedded commas, CRLF and BOM", () => {
  const t = parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2');
  assert.deepEqual(t, [["a", "b"], ["x, y", 'he said "hi"'], ["1", "2"]]);
});

test("parseDate reads Stripe timestamps, dates and unix seconds", () => {
  assert.equal(parseDate("2026-03-05 14:22").toISOString(), "2026-03-05T14:22:00.000Z");
  assert.equal(parseDate("2026-03-05").toISOString(), "2026-03-05T00:00:00.000Z");
  assert.equal(parseDate("1772668800").toISOString(), "2026-03-05T00:00:00.000Z");
  assert.equal(parseDate("nope"), null);
});

test("normalizeRows reports a missing date or amount column instead of guessing", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /start/i);
  assert.match(normalizeRows(parseCsv("Created (UTC),x\n2026-01-01,2")).error, /amount/i);
  assert.match(normalizeRows([]).error, /empty/);
});

test("yearly, weekly and quantity amounts normalise to MRR", () => {
  const { subs } = normalizeRows(parseCsv(csv([
    "id,Start Date (UTC),Amount,Interval,Quantity",
    "a,2026-01-01,1200,year,1",
    "b,2026-01-01,10,week,1",
    "c,2026-01-01,20,month,3",
  ])));
  assert.equal(subs[0].mrr, 100);
  assert.ok(Math.abs(subs[1].mrr - 10 * 52 / 12) < 1e-9);
  assert.equal(subs[2].mrr, 60);
});

test("bad rows are skipped with a reason, never silently dropped", () => {
  const r = normalizeRows(parseCsv(csv([
    "id,Status,Start Date (UTC),Canceled At (UTC),Amount,Interval",
    "ok,active,2026-01-01,,10,month",
    "bd,active,garbage,,10,month",
    "ba,active,2026-01-01,,,month",
    "rev,canceled,2026-03-01,2026-02-01,10,month",
    "nc,canceled,2026-01-01,,10,month",
    "inc,incomplete_expired,2026-01-01,2026-01-02,10,month",
    "iv,active,2026-01-01,,10,fortnight",
  ])));
  assert.equal(r.subs.length, 1);
  assert.equal(r.skipped.length, 6);
  assert.ok(r.skipped.every((s) => s.reason && s.line >= 3));
});

const FIXTURE = csv([
  "id,Start Date (UTC),Canceled At (UTC),Amount,Interval",
  "a,2026-01-10,,100,month",
  "b,2026-01-20,2026-02-15,50,month",
  "c,2026-02-05,2026-02-25,20,month", // starts and ends in the same month
  "d,2026-02-10,,200,month",
  "e,2026-03-03,,10,month",
]);

test("waterfall reconciles every month, including same-month start and end", () => {
  const { subs } = normalizeRows(parseCsv(FIXTURE));
  const r = analyze(subs, { asOf: new Date("2026-03-31T00:00:00Z") });
  assert.deepEqual(r.months.map((m) => m.key), ["2026-01", "2026-02", "2026-03"]);
  assert.ok(r.months.every((m) => m.reconciles));
  const [jan, feb, mar] = r.months;
  assert.equal(jan.newMrr, 150); assert.equal(jan.endMrr, 150);
  assert.equal(feb.startMrr, 150); assert.equal(feb.newMrr, 220); assert.equal(feb.churnedMrr, 70); assert.equal(feb.endMrr, 300);
  assert.equal(mar.newMrr, 10); assert.equal(mar.endMrr, 310);
  assert.equal(feb.churnedCustomers, 2); assert.equal(mar.endCustomers, 3);
});

test("cohort retention counts customers still active at each month end", () => {
  const { subs } = normalizeRows(parseCsv(FIXTURE));
  const r = analyze(subs, { asOf: new Date("2026-03-31T00:00:00Z") });
  const jan = r.cohorts.find((c) => c.key === "2026-01");
  assert.equal(jan.size, 2);
  assert.deepEqual(jan.logo, [1, 0.5, 0.5]);
  assert.ok(Math.abs(jan.revenue[1] - 100 / 150) < 1e-9);
  const feb = r.cohorts.find((c) => c.key === "2026-02");
  assert.deepEqual(feb.logo, [0.5, 0.5]);
});

test("summary reports current MRR, churn window and lifetime from churn", () => {
  const { subs } = normalizeRows(parseCsv(FIXTURE));
  const s = analyze(subs, { asOf: new Date("2026-03-31T00:00:00Z") }).summary;
  assert.equal(s.currentMrr, 310);
  assert.equal(s.currentCustomers, 3);
  assert.ok(s.lifetimeMonths > 0 && Math.abs(s.lifetimeMonths - 1 / s.logoChurn) < 1e-9);
  assert.ok(s.windowLabel.length > 0);
});

test("sample data is deterministic, parses cleanly and reconciles", () => {
  assert.equal(sampleCsv(), sampleCsv());
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, null);
  assert.equal(n.skipped.length, 0);
  assert.ok(n.subs.length > 200);
  const r = analyze(n.subs);
  assert.ok(r.months.every((m) => m.reconciles));
  assert.ok(r.summary.currentMrr > 0);
  assert.ok(r.cohorts.every((c) => c.logo[0] === 1 || c.logo[0] <= 1));
  assert.ok(r.findings.length >= 1);
});

test("early-life churn finding fires when most cancellations are in the first months", () => {
  const rows = ["id,Start Date (UTC),Canceled At (UTC),Amount,Interval"];
  for (let i = 0; i < 12; i++) rows.push(`e${i},2026-01-05,2026-02-05,10,month`);
  for (let i = 0; i < 4; i++) rows.push(`l${i},2025-01-05,2026-06-05,10,month`);
  const r = analyze(normalizeRows(parseCsv(csv(rows))).subs, { asOf: new Date("2026-06-30T00:00:00Z") });
  assert.ok(r.findings.some((f) => /first three months/.test(f.title)));
});

test("concentration finding names a subscription over 20% of MRR", () => {
  const rows = ["id,Customer ID,Start Date (UTC),Amount,Interval", "big,BigCo,2026-01-01,1000,month"];
  for (let i = 0; i < 6; i++) rows.push(`s${i},c${i},2026-01-01,50,month`);
  const r = analyze(normalizeRows(parseCsv(csv(rows))).subs, { asOf: new Date("2026-03-31T00:00:00Z") });
  assert.ok(r.findings.some((f) => /over 20% of MRR/.test(f.title) && /BigCo/.test(f.detail)));
});

test("price rise: no extra cancellations is a pure gain of the rise itself", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  const r = simulatePriceIncrease(subs, { plan: "all", increasePct: 10, extraLossPct: 0, months: 12 });
  assert.ok(Math.abs(r.withRevenue / r.withoutRevenue - 1.1) < 1e-9);
  assert.ok(r.pays && r.delta > 0);
});

test("price rise: the break-even loss is exactly where the delta crosses zero", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  const r = simulatePriceIncrease(subs, { plan: "Pro", increasePct: 20, extraLossPct: 0, churnLiftPts: 0, months: 12 });
  assert.ok(Math.abs(r.breakevenLossPct - (100 * 0.2) / 1.2) < 1e-9);
  const at = simulatePriceIncrease(subs, { plan: "Pro", increasePct: 20, extraLossPct: r.breakevenLossPct, months: 12 });
  assert.ok(Math.abs(at.delta) < 1e-6);
  const worse = simulatePriceIncrease(subs, { plan: "Pro", increasePct: 20, extraLossPct: r.breakevenLossPct + 5, months: 12 });
  assert.equal(worse.pays, false);
});

test("price rise: ongoing churn lift lowers the break-even loss", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  const a = simulatePriceIncrease(subs, { increasePct: 15, churnLiftPts: 0 });
  const b = simulatePriceIncrease(subs, { increasePct: 15, churnLiftPts: 1.5 });
  assert.ok(b.breakevenLossPct < a.breakevenLossPct);
});

test("price rise: unknown plan and empty input are reported, not invented", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  assert.match(simulatePriceIncrease(subs, { plan: "Nope" }).invalid, /No active/);
  assert.match(simulatePriceIncrease([]).invalid, /No subscriptions/);
  assert.ok(planChurn(subs, "Starter") > planChurn(subs, "Team"));
});

test("churn reduction: zero points changes nothing, more points gain more", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  const none = simulateChurnReduction(subs, { reductionPts: 0 });
  assert.ok(Math.abs(none.mrrGain) < 1e-9 && Math.abs(none.cumulativeGain) < 1e-9);
  const one = simulateChurnReduction(subs, { reductionPts: 1 });
  const two = simulateChurnReduction(subs, { reductionPts: 2 });
  assert.ok(one.mrrGain > 0 && two.mrrGain > one.mrrGain);
  assert.equal(one.arrGain, 12 * one.mrrGain);
  assert.equal(one.path.length, 12);
});

test("churn reduction: matches a hand-rolled one-month step", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  const r = simulateChurnReduction(subs, { reductionPts: 1, months: 1 });
  assert.ok(Math.abs(r.baselineMrr - (r.currentMrr * (1 - r.baselineChurn) + r.newMrrPerMonth)) < 1e-6);
  assert.ok(Math.abs(r.reducedMrr - (r.currentMrr * (1 - r.reducedChurn) + r.newMrrPerMonth)) < 1e-6);
});

test("churn reduction: floors at zero churn and reports empty input", () => {
  const { subs } = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(simulateChurnReduction(subs, { reductionPts: 99 }).reducedChurn, 0);
  assert.match(simulateChurnReduction([]).invalid, /No subscriptions/);
});

// Red-team gap tests, 2026-11-16 (prompts/runs/2026-11-16-session_01EhTJVMWEWjfG8yqSCF8XUS.json).
test("skipped rows name their file line after blank lines, CRLF and a quoted line break", () => {
  const text = 'id,Start Date (UTC),Amount,Plan\r\na,2026-01-01,10,"Pro\r\nannual"\r\n\r\nb,garbage,10,Pro\r\nc,2026-01-01,,Pro\r\n';
  assert.deepEqual(normalizeRows(parseCsv(text)).skipped, [{ line: 5, reason: "unreadable start date" }, { line: 6, reason: "unreadable amount" }]);
});

test("a blank quantity counts as one seat", () => {
  const { subs } = normalizeRows(parseCsv("id,Start Date (UTC),Amount,Quantity\na,2026-01-01,30,"));
  assert.equal(subs[0].mrr, 30);
});

test("early-life finding fires at exactly 10 cancellations, 40% early", () => {
  const rows = ["id,Start Date (UTC),Canceled At (UTC),Amount,Interval"];
  for (let i = 0; i < 4; i++) rows.push(`e${i},2026-01-05,2026-02-05,10,month`);
  for (let i = 0; i < 6; i++) rows.push(`l${i},2025-01-05,2026-06-05,10,month`);
  const r = analyze(normalizeRows(parseCsv(csv(rows))).subs, { asOf: new Date("2026-06-30T00:00:00Z") });
  assert.ok(r.findings.some((f) => /first three months/.test(f.title)));
});

test("concentration finding names the largest subscription wherever it sits in the file", () => {
  const rows = ["id,Customer ID,Start Date (UTC),Amount,Interval"];
  for (let i = 0; i < 6; i++) rows.push(`s${i},c${i},2026-01-01,${50 + i},month`);
  rows.push("big,BigCo,2026-01-01,1000,month");
  const r = analyze(normalizeRows(parseCsv(csv(rows))).subs, { asOf: new Date("2026-03-31T00:00:00Z") });
  assert.ok(r.findings.some((f) => /over 20% of MRR/.test(f.title) && /BigCo/.test(f.detail)));
});

test("planChurn counts only cancellations inside each window month", () => {
  const { subs } = normalizeRows(parseCsv(csv([
    "id,Start Date (UTC),Canceled At (UTC),Amount",
    "a,2026-01-05,,10", "b,2026-01-05,2026-03-10,10", "c,2026-01-05,2026-02-10,10", "d,2026-01-05,,10",
  ])));
  assert.ok(Math.abs(planChurn(subs, "all", { asOf: new Date("2026-04-15T00:00:00Z") }) - 2 / 7) < 1e-12);
});

test("churn reduction refuses a book with no live MRR", () => {
  const { subs } = normalizeRows(parseCsv(csv(["id,Start Date (UTC),Canceled At (UTC),Amount", "a,2026-01-05,2026-02-10,10"])));
  assert.match(simulateChurnReduction(subs, { asOf: new Date("2026-04-15T00:00:00Z") }).invalid, /No active/);
});

test("sample data keeps its shape: 308 subscriptions, 153 canceled", () => {
  const lines = sampleCsv().split("\n").slice(1);
  assert.equal(lines.length, 308);
  assert.equal(lines.filter((l) => l.includes(",canceled,")).length, 153);
});

test("parseDate refuses an impossible day instead of rolling it into the next month", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("2026-04-31 10:00"), null);
  assert.equal(parseDate("2026-02-28 23:30").toISOString(), "2026-02-28T23:30:00.000Z");
  assert.ok(parseDate("1772409600") instanceof Date);
});

// Added by the 2026-11-20 quality audit (portfolio/quality/audits/2026-11-20-stripe-churn-cohort-analyzer.json).
test("trialing rows are not MRR; Trial End moves the first paid month; unconverted trials are skipped", () => {
  const r = normalizeRows(parseCsv(csv([
    "id,Status,Start Date (UTC),Trial End (UTC),Ended At (UTC),Amount",
    "t,trialing,2026-03-01,2026-03-15,,99",
    "x,canceled,2026-01-01,2026-01-15,2026-01-14,50",
    "c,active,2026-01-20,2026-02-03,,30",
  ])));
  assert.deepEqual(r.subs.map((s) => s.id), ["c"]);
  assert.equal(r.subs[0].start.toISOString().slice(0, 10), "2026-02-03");
  assert.deepEqual(r.skipped.map((s) => s.reason), ["in trial, not yet paying", "trial ended before the first payment"]);
});

test("an active row with Canceled At (cancel at period end) is still live", () => {
  const r = normalizeRows(parseCsv(csv([
    "id,Status,Start Date (UTC),Canceled At (UTC),Amount",
    "p,active,2026-01-05,2026-03-10,10",
    "g,canceled,2026-01-05,2026-03-10,10",
  ])));
  assert.equal(r.subs[0].end, null);
  assert.equal(r.subs[1].end.toISOString().slice(0, 10), "2026-03-10");
});

test("an explicit quantity of 0 is honoured, a blank one means 1", () => {
  const { subs } = normalizeRows(parseCsv(csv(["id,Start Date (UTC),Amount,Quantity", "a,2026-01-01,10,0", "b,2026-01-01,10,"])));
  assert.deepEqual(subs.map((s) => s.mrr), [0, 10]);
});

// Ten subscriptions open from December; one ends in each of Jan, Feb, Mar; April is the partial month
// with one more cancellation that must stay out of the three-complete-month window.
const WINDOW = csv([
  "id,Start Date (UTC),Canceled At (UTC),Amount,Plan",
  ...Array.from({ length: 10 }, (_, i) => `s${i},2025-12-0${1 + (i % 9)},${["2026-01-10", "2026-02-10", "2026-03-10", "2026-04-02"][i] ?? ""},${i < 2 ? 100 : 50},P`),
]);

test("summary churn uses the last three complete months, and LTV is ARPA / logo churn", () => {
  const { subs } = normalizeRows(parseCsv(WINDOW));
  const s = analyze(subs).summary;
  assert.equal(s.windowLabel, "2026-01 to 2026-03");
  assert.ok(Math.abs(s.logoChurn - 3 / (10 + 9 + 8)) < 1e-12); // 3 ended over 27 opening subscription-months
  assert.ok(Math.abs(s.revenueChurn - 250 / (600 + 500 + 400)) < 1e-12);
  assert.ok(Math.abs(s.revenueLtv - s.arpa / s.logoChurn) < 1e-9);
  assert.ok(Math.abs(s.arpa - 300 / 6) < 1e-9); // April end: 6 live x $50
});

test("plan-gap finding fires at a 25-point gap and not below it", () => {
  const rows = (plan, n, ended) => Array.from({ length: n }, (_, i) => `${plan}${i},2026-01-05,${i < ended ? "2026-02-10" : ""},10,${plan}`);
  const run = (endedB) => analyze(normalizeRows(parseCsv(csv(["id,Start Date (UTC),Canceled At (UTC),Amount,Plan", ...rows("A", 20, 5), ...rows("B", 20, endedB)]))).subs)
    .findings.some((f) => /differ a lot between plans/.test(f.title));
  assert.equal(run(10), true);  // 50% vs 25%
  assert.equal(run(9), false);  // 45% vs 25%
});
