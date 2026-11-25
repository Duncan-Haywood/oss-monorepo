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

test("a status spelled the British way or with a space is read, and an unknown one is skipped, never dropped silently (red team 2026-11-19, second pass)", () => {
  // "Cancelled" kept the row out of every month: the churned subscription's
  // MRR vanished from history and its churn was never counted.
  const { subs, skipped } = subsFromCsv("id,status,amount,interval,created,ended at\na,Cancelled,20,month,2026-01-05,2026-06-10\nb,Past Due,10,month,2026-01-05,\nc,expired,10,month,2026-01-05,2026-03-01\nd,active,10,month,2026-01-05,\n");
  assert.deepEqual(subs.map((s) => [s.id, s.status, s.endedAt !== null]), [["a", "canceled", true], ["b", "past_due", false], ["d", "active", false]]);
  assert.deepEqual(skipped, [{ line: 4, why: 'unknown status "expired"' }]);
  const hist = backfill(subs, Date.UTC(2026, 9, 15), 12).months;
  assert.equal(hist.find((m) => m.month === "2026-03").mrr, 4000);
  assert.equal(hist.find((m) => m.month === "2026-06").churn, 2000);
});

test("a lone CR ends a row without eating the next row's second character", () => {
  assert.deepEqual(parseCsv("a\rb\nc"), [["a"], ["b"], ["c"]]);
  assert.deepEqual(parseCsv("x,y\r\n1,2\r\n"), [["x", "y"], ["1", "2"]]);
});

test("skipped rows come back in line order, currency skips merged with row skips", () => {
  const { skipped } = subsFromCsv("id,amount,interval,created,currency\na,10,month,2026-01-01,eur\nb,x,month,2026-01-01,usd\nc,10,month,2026-01-01,usd\nd,10,month,2026-01-01,usd\ne,10,month,2026-01-01,eur\nf,y,month,2026-01-01,usd\ng,10,month,2026-01-01,usd\n");
  assert.deepEqual(skipped.map((s) => s.line), [2, 3, 6, 7]);
});

// The class behind the "Cancelled" defect: a row that is neither counted nor
// listed as skipped. Every non-blank row lands in exactly one of the two, and an
// imported row carries a status the metrics understand.
test("no row vanishes: every data row is imported or skipped with a reason (fuzzed)", () => {
  let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) % 10000) / 10000;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const statuses = ["active", "Active", "canceled", "Cancelled", "past due", "Past_Due", "trialing", "paused", "unpaid", "incomplete", "incomplete_expired", "expired", "ended", "", "churned"];
  const amounts = ["10", "0", "", "-5", "abc", "1,200.50", "$29"];
  const intervals = ["month", "year", "week", "day", "fortnight", ""];
  const dates = ["2026-01-05", "2026-02-30", "", "soon", "2025-07-01 10:00"];
  const currencies = ["usd", "eur", ""];
  for (let round = 0; round < 50; round++) {
    const n = 1 + Math.floor(rnd() * 12);
    const lines = ["id,status,amount,interval,created,ended at,trial end,currency"];
    for (let k = 0; k < n; k++) lines.push([`s${k}`, pick(statuses), `"${pick(amounts)}"`, pick(intervals), pick(dates.slice(0, 4)), pick(dates), rnd() < 0.8 ? "" : pick(dates), pick(currencies)].join(","));
    const { subs, skipped } = subsFromCsv(lines.join("\n"));
    assert.equal(subs.length + skipped.length, n, lines.join("\n"));
    for (const s of skipped) assert.ok(s.why, "every skip says why");
    // An imported row whose status no rule downstream knows is dropped there.
    for (const s of subs) assert.ok(["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "trialing", "paused"].includes(s.status), `status ${s.status}`);
  }
});

test("a decimal comma is read as a decimal, never as a thousands separator (red team 2026-11-20)", () => {
  // An EU-locale sheet writes 29,99 and 1.234,56: stripping every comma read
  // the first as 2,999 a month and the second as 1.23.
  const one = (amount) => subsFromCsv(`id,status,amount,interval,created\ns1,active,"${amount}",month,2026-01-05`);
  assert.deepEqual(one("29,99").subs.map((s) => s.mrr), [2999]);
  assert.deepEqual(one("29,9").subs.map((s) => s.mrr), [2990]);
  assert.deepEqual(one("1.234,56").subs.map((s) => s.mrr), [123456]);
  assert.deepEqual(one("1 234,56").subs.map((s) => s.mrr), [123456]);
  // Thousands commas in groups of three still read as before.
  assert.deepEqual(one("1,200.50").subs.map((s) => s.mrr), [120050]);
  assert.deepEqual(one("1,200").subs.map((s) => s.mrr), [120000]);
  assert.deepEqual(one("$1,234,567").subs.map((s) => s.mrr), [123456700]);
  // Anything else with a comma is ambiguous: skipped with a reason, not guessed.
  for (const bad of ["1,2,3", "12,3456", "1.234.5,6"]) {
    const r = one(bad);
    assert.equal(r.subs.length, 0, bad);
    assert.equal(r.skipped[0].why, "amount is not a number", bad);
  }
});

test("an interval count that is not a whole number of at least 1 is skipped, not read as 1 (red team 2026-11-20)", () => {
  const r = subsFromCsv("id,status,amount,interval,interval count,created\ns1,active,90,month,3 months,2026-01-05\ns2,active,90,month,0,2026-01-05\ns3,active,90,month,-3,2026-01-05\ns4,active,90,month,3,2026-01-05\ns5,active,90,month,,2026-01-05");
  assert.deepEqual(r.subs.map((s) => [s.id, s.mrr]), [["s4", 3000], ["s5", 9000]]);
  assert.deepEqual(r.skipped.map((s) => [s.line, s.why]), [[2, "interval count is not a whole number"], [3, "interval count is not a whole number"], [4, "interval count is not a whole number"]]);
});

test("a Customer ID column groups subscriptions into customers", () => {
  const { subs } = subsFromCsv("id,Customer ID,status,amount,interval,created\nsub_1,cus_1,active,50,month,2026-01-05\nsub_2,cus_1,active,10,month,2026-01-05\nsub_3,cus_2,active,20,month,2026-01-05");
  assert.deepEqual(subs.map((s) => s.customer), ["cus_1", "cus_1", "cus_2"]);
  const s = summarize(backfill(subs, Date.UTC(2026, 3, 15), 3).months);
  assert.equal(s.customers, 2); assert.equal(s.mrr, 8000);
});
