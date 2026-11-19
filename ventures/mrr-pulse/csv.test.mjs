import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, subsFromCsv, sampleCsv } from "./csv.mjs";
import { backfill, summarize } from "./metrics.mjs";

test("parseCsv handles quotes, embedded commas and CRLF", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("reads a Stripe-style export by header name in any order", () => {
  const { subs, skipped } = subsFromCsv("Created (UTC),id,Status,Interval,Amount,Quantity,Canceled At (UTC)\n2026-01-05 10:00,sub_1,canceled,month,\"1,200.50\",2,2026-03-01\n2026-02-01,sub_2,active,year,120,,\n");
  assert.equal(skipped.length, 0);
  assert.equal(subs[0].mrr, 240100);
  assert.equal(subs[0].endedAt, Date.UTC(2026, 2, 1));
  assert.equal(subs[1].mrr, 1000);
  assert.equal(subs[1].endedAt, null);
});

test("bad rows are skipped with a reason, not guessed", () => {
  const { subs, skipped } = subsFromCsv("id,amount,interval,created\na,abc,month,2026-01-01\nb,10,fortnight,2026-01-01\nc,10,month,not a date\nd,10,month,2026-01-01\n");
  assert.equal(subs.length, 1);
  assert.deepEqual(skipped.map((s) => s.line), [2, 3, 4]);
});

test("missing required columns are named", () => {
  assert.deepEqual(subsFromCsv("id,status\na,active").missing, ["amount", "interval", "created"]);
});

test("the sample data produces a believable dashboard", () => {
  const now = Date.UTC(2026, 9, 15);
  const { subs, skipped } = subsFromCsv(sampleCsv(now));
  assert.equal(skipped.length, 0);
  const s = summarize(backfill(subs, now, 12).months);
  assert.ok(s.mrr > 100000 && s.customers > 50, JSON.stringify(s));
});

// Red-team 2026-11-15: the header matched the leftmost column naming any
// alias, so a Stripe export with Canceled At (the day the customer asked)
// before Ended At (the day the revenue stopped) dated churn a month early.
test("Ended At wins over an earlier Canceled At column, and Created over Start Date", () => {
  const a = subsFromCsv("id,Amount,Interval,Status,Created (UTC),Canceled At (UTC),Ended At (UTC)\nsub_1,100,month,canceled,2026-01-01 00:00,2026-03-02 10:00,2026-04-01 00:00");
  assert.equal(a.subs[0].endedAt, Date.UTC(2026, 3, 1));
  const b = subsFromCsv("id,Amount,Interval,Status,Start Date,Created\nsub_1,100,month,active,2026-02-01,2026-01-01");
  assert.equal(b.subs[0].created, Date.UTC(2026, 0, 1));
});

test("a JPY export is not multiplied by 100 (red team 2026-11-17)", () => {
  const read = (row) => subsFromCsv(`id,amount,interval,created,currency\n${row}\n`).subs.map((s) => s.mrr);
  assert.deepEqual(read("a,5000,month,2026-01-01,jpy"), [5000]);
  assert.deepEqual(read("b,50,month,2026-01-01,usd"), [5000]);
});

test("a Trial End (UTC) column is read, so history starts MRR when the trial ends (red team 2026-11-18)", () => {
  const csv = "id,Status,Amount,Interval,Created (UTC),Trial End (UTC),Ended At (UTC)\nsub_1,active,10,month,2026-08-20 10:00,2026-09-03 10:00,\nsub_2,active,5,month,2026-08-01,,";
  const { subs } = subsFromCsv(csv);
  assert.equal(subs[0].trialEnd, Date.UTC(2026, 8, 3, 10)); assert.equal(subs[1].trialEnd, null);
});

const SAMPLE_HASH = 3733524883;

// Red team 2026-11-18 (sample data): sampleCsv feeds the "Try sample data"
// button, and only a loose MRR floor checked it, so a changed plan price,
// a day-shifted date or churn inside the first 60 days all passed.
test("the sample data is pinned: plans, date window, churn after 60 days, exact output", () => {
  const now = Date.UTC(2026, 9, 15), day = 86400000;
  const csv = sampleCsv(now);
  assert.equal(csv, sampleCsv(), "the default now is 2026-10-15");
  const { subs } = subsFromCsv(csv);
  assert.equal(subs.length, 160);
  assert.deepEqual([...new Set(subs.map((s) => s.mrr))].sort((a, b) => a - b), [2417, 2900, 7900, 24900]);
  for (const s of subs) {
    assert.ok(s.created <= now && s.created >= now - 540 * day, s.id);
    if (s.status === "canceled") assert.ok(now - s.created > 60 * day && s.endedAt > s.created, s.id);
  }
  assert.ok(csv.includes("\nsub_demo0,"));
  let h = 0; for (const c of csv) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  assert.equal(h, SAMPLE_HASH, "sampleCsv output changed; update SAMPLE_HASH only if the change is intended");
});

// Red team 2026-11-18: a zero, negative or non-numeric Quantity made the row
// read as `unknown interval "month"`, and a blank Amount became a $0 plan.
test("quantity and blank amount get their own reasons; quantity 0 is a $0 subscription", () => {
  const { subs, skipped } = subsFromCsv("id,amount,interval,created,quantity\na,10,month,2026-01-01,0\nb,10,month,2026-01-01,abc\nc,10,month,2026-01-01,-2\nd,,month,2026-01-01,1\ne,0,month,2026-01-01,1\nf,10,fortnight,2026-01-01,0\n");
  assert.deepEqual(subs.map((s) => [s.id, s.mrr]), [["a", 0], ["e", 0]]);
  assert.deepEqual(skipped, [
    { line: 3, why: "quantity is not a number" },
    { line: 4, why: "quantity is not a number" },
    { line: 5, why: "amount is empty" },
    { line: 7, why: 'unknown interval "fortnight"' },
  ]);
});

test("a filled-in end or trial date that is not a date is skipped, not read as still alive (red team 2026-11-18)", () => {
  const { subs, skipped } = subsFromCsv("id,status,amount,interval,created,ended at,trial end\na,canceled,10,month,2026-01-01,2026-02-30,\nb,canceled,10,month,2026-01-01,soon,\nc,active,10,month,2026-01-01,,2026-13-01\nd,canceled,10,month,2026-01-01,,\ne,canceled,10,month,2026-01-01,2026-03-01,\n");
  assert.deepEqual(skipped.map((s) => [s.line, s.why]), [[2, "ended at is not a date"], [3, "ended at is not a date"], [4, "trial end is not a date"], [5, "canceled with no end date"]]);
  assert.deepEqual(subs.map((s) => s.id), ["e"]);
});

test("an impossible created date is skipped, not rolled into the next month (red team 2026-11-18)", () => {
  const { subs, skipped } = subsFromCsv("id,amount,interval,created\na,10,month,2025-02-29\nb,10,month,2024-02-29\n");
  assert.deepEqual(skipped.map((s) => s.why), ["created is not a date"]);
  assert.deepEqual(subs.map((s) => s.id), ["b"]);
});

// Red team 2026-11-18 (second pass): an incomplete_expired subscription is one
// whose first payment never succeeded, so it was never revenue. From the CSV
// export its end date was dropped (only "canceled" kept one) and mapAt then
// counted it as live MRR every month from its creation: a $500 row that never
// paid sat in the headline MRR for seven months.
test("an incomplete_expired row never counts as MRR", () => {
  const { subs } = subsFromCsv("id,status,amount,interval,created,ended at\nsub_a,active,100,month,2026-01-05,\nsub_b,incomplete_expired,500,month,2026-03-10,2026-03-11\n");
  const { months } = backfill(subs, Date.UTC(2026, 9, 15), 10);
  assert.deepEqual(months.map((m) => m.mrr), Array(10).fill(10000));
  assert.ok(months.every((m) => m.new <= 10000 && m.churn === 0));
});

test("rows sharing a subscription id are one subscription with several price lines, not a lost line (red team 2026-11-19)", async () => {
  const { liveMap, breakdown } = await import("./metrics.mjs");
  const { subs, skipped } = subsFromCsv("id,status,amount,interval,created\nsub_1,active,10,month,2026-01-05\nsub_1,active,20,month,2026-01-05\nsub_2,active,5,month,2026-02-01\n");
  assert.equal(skipped.length, 0);
  assert.equal(subs.length, 2);
  assert.equal(subs[0].mrr, 3000);
  const live = liveMap(subs);
  assert.equal(live.sub_1, 3000);
  // The headline and the plan breakdown count the same money.
  assert.equal(Object.values(live).reduce((a, b) => a + b, 0), breakdown(subs).total);
});

test("a repeated subscription id with a different start, end, status or currency is skipped with a reason (red team 2026-11-19)", () => {
  const { subs, skipped } = subsFromCsv("id,status,amount,interval,created,ended at,currency\nsub_1,active,10,month,2026-01-05,,usd\nsub_1,active,20,month,2026-03-05,,usd\nsub_1,canceled,20,month,2026-01-05,2026-04-01,usd\nsub_1,active,20,month,2026-01-05,,eur\n");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].mrr, 1000);
  assert.deepEqual(skipped.map((s) => s.line), [3, 4, 5]);
  assert.ok(skipped.every((s) => /sub_1/.test(s.why)));
});

// Red team 2026-11-19: the CSV path added MRR across currencies, so $100 and
// 10,000 yen read as "$200" in the browser demo. The server keeps one currency.
test("a CSV with two currencies keeps the most common one and skips the rest by line", () => {
  const { subs, skipped, currency } = subsFromCsv("id,status,amount,interval,created,currency\na,active,100,month,2026-01-05,usd\nb,active,10000,month,2026-01-05,jpy\nc,active,50,month,2026-02-05,USD\n");
  assert.equal(currency, "usd");
  assert.deepEqual(subs.map((s) => s.id), ["a", "c"]);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].line, 3);
  assert.match(skipped[0].why, /JPY/);
  const s = summarize(backfill(subs, Date.UTC(2026, 10, 19), 12).months);
  assert.equal(s.mrr, 15000);
});

test("a one-currency CSV reports that currency, and a tie goes to the first row's", () => {
  assert.equal(subsFromCsv("amount,interval,created,currency\n500,month,2026-01-05,jpy\n").currency, "jpy");
  assert.equal(subsFromCsv("amount,interval,created\n5,month,2026-01-05\n").currency, "usd");
  const tie = subsFromCsv("amount,interval,created,currency\n5,month,2026-01-05,eur\n5,month,2026-01-05,gbp\n");
  assert.equal(tie.currency, "eur");
  assert.equal(tie.subs.length, 1);
});
