import { test } from "node:test";
import assert from "node:assert/strict";
import { spread, schedule, journal, journalCsv, summary, backlog } from "./revrec.mjs";

const D = (y, m, d) => Date.UTC(y, m - 1, d);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test("spread: an annual line is split by days and sums exactly", () => {
  const s = spread({ amount: 120000, start: D(2026, 1, 1), end: D(2027, 1, 1) });
  assert.equal(sum(s), 120000);
  assert.equal(Object.keys(s).length, 12);
  assert.equal(s["2026-01"], Math.round((120000 * 31) / 365));
  assert.ok(s["2026-02"] < s["2026-01"]);
});

test("spread: odd amounts never lose a cent", () => {
  for (const amt of [1, 7, 99999, 100001, -12345]) {
    const s = spread({ amount: amt, start: D(2026, 3, 17), end: D(2026, 9, 2) });
    assert.equal(sum(s), amt);
  }
});

test("spread: a one-off or zero-length period lands on its start month", () => {
  assert.deepEqual(spread({ amount: 5000, start: D(2026, 5, 31), end: D(2026, 5, 31) }), { "2026-05": 5000 });
});

test("spread: a period inside one month stays in it", () => {
  assert.deepEqual(spread({ amount: 3000, start: D(2026, 2, 3), end: D(2026, 2, 10) }), { "2026-02": 3000 });
});

test("schedule: roll-forward balances and deferred returns to zero when the term ends", () => {
  const lines = [{ id: "a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2027, 1, 1), amount: 36500 }];
  const rows = schedule(lines, { asOf: D(2026, 6, 15) });
  assert.equal(rows[0].month, "2026-01");
  assert.equal(rows[0].billed, 36500);
  assert.equal(rows[0].closing, 36500 - rows[0].recognized);
  for (const r of rows) assert.equal(r.opening + r.billed - r.recognized, r.closing);
  assert.equal(rows.at(-1).month, "2026-12");
  assert.equal(rows.at(-1).closing, 0);
  assert.equal(rows.filter((r) => r.future).length, 6);
});

test("schedule: a credit note reduces revenue the month it is issued, not the past", () => {
  const lines = [
    { id: "a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2026, 2, 1), amount: 3100 },
    { id: "cn", billedAt: D(2026, 2, 10), start: D(2026, 2, 10), end: D(2026, 2, 10), amount: -1000 },
  ];
  const rows = schedule(lines, { asOf: D(2026, 3, 1) });
  assert.equal(rows[0].recognized, 3100);
  assert.equal(rows[1].recognized, -1000);
  assert.equal(rows[1].closing, 0);
});

test("schedule: empty input gives no rows", () => assert.deepEqual(schedule([]), []));

test("backlog and summary: only future months count as still to recognise", () => {
  const lines = [{ id: "a", billedAt: D(2026, 4, 1), start: D(2026, 4, 1), end: D(2027, 4, 1), amount: 36500 }];
  const asOf = D(2026, 10, 15);
  const rows = schedule(lines, { asOf });
  const b = backlog(rows, asOf);
  assert.equal(b[0].month, "2026-11");
  const s = summary(rows, asOf);
  assert.equal(s.backlog, b.reduce((a, r) => a + r.recognized, 0));
  assert.equal(s.lastMonth.month, "2026-09");
  assert.equal(s.deferredNow, rows.find((r) => r.month === "2026-10").closing);
});

test("journal: every month balances, billings and recognition are separate entries", () => {
  const rows = schedule([
    { id: "a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2027, 1, 1), amount: 120000 },
    { id: "cn", billedAt: D(2026, 3, 5), start: D(2026, 3, 5), end: D(2026, 3, 5), amount: -2500 },
  ], { asOf: D(2026, 5, 1) });
  const entries = journal(rows.filter((r) => !r.future));
  const byMemo = {};
  for (const e of entries) { byMemo[e.memo] ||= 0; byMemo[e.memo] += Number(e.debit || 0) - Number(e.credit || 0); }
  for (const v of Object.values(byMemo)) assert.ok(Math.abs(v) < 1e-9);
  assert.ok(entries.some((e) => e.memo === "Billings 2026-01" && e.account === "Stripe balance" && e.debit === "1200.00"));
  assert.ok(entries.some((e) => e.memo === "Billings 2026-03" && e.account === "Stripe balance" && e.credit === "25.00"));
});

test("journalCsv: header, quoting and trailing newline", () => {
  const csv = journalCsv([{ date: "2026-01-31", memo: 'a,"b"', account: "X", debit: "1.00", credit: "" }]);
  assert.equal(csv, 'Date,Memo,Account,Debit,Credit\n2026-01-31,"a,""b""",X,1.00,\n');
});

test("a prorated refund linked to its line stops the schedule (ASC 606, quality audit 2026-11-17)", () => {
  const D = (y, m, d) => Date.UTC(y, m - 1, d);
  const cn = Math.round((120000 * 320) / 365);
  const rows = schedule([
    { id: "il_a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2027, 1, 1), amount: 120000 },
    { id: "cn:1", credits: "il_a", billedAt: D(2026, 2, 15), start: D(2026, 2, 15), end: D(2026, 2, 15), amount: -cn },
  ], { asOf: D(2026, 3, 1) });
  const f = (m) => rows.find((r) => r.month === m);
  assert.equal(f("2026-02").recognized, 4603); // 1,200 x 14/365 for Feb 1-14
  assert.equal(f("2026-02").closing, 0);
  assert.equal(rows.filter((r) => r.month >= "2026-03").reduce((a, r) => a + r.recognized, 0), 0);
});

test("zero-decimal currencies stay whole: Stripe sends JPY in yen, not sen (red team 2026-11-17)", async () => {
  const { formatMoney, minorExponent } = await import("./revrec.mjs");
  assert.equal(formatMoney(12000, "jpy"), "¥12,000");
  assert.equal(formatMoney(12000, "usd"), "$120");
  assert.equal(minorExponent("KRW"), 0);
  assert.equal(minorExponent("kwd"), 3);
  const rows = schedule([{ id: "a", billedAt: D(2026, 1, 5), start: D(2026, 1, 5), end: D(2026, 1, 5), amount: 12000 }], { asOf: D(2026, 1, 20) });
  assert.equal(journal(rows, { currency: "jpy" })[0].debit, "12000");
  assert.equal(journal(rows, { currency: "kwd" })[0].debit, "12.000");
  assert.equal(journal(rows)[0].debit, "120.00");
});

test("spread of a zero line is +0, not -0 (red team 2026-11-17)", () => {
  assert.deepStrictEqual(spread({ amount: 0, start: D(2026, 1, 1), end: D(2026, 1, 1) }), { "2026-01": 0 });
  assert.deepStrictEqual(spread({ amount: -5, start: D(2026, 1, 1), end: D(2026, 1, 1) }), { "2026-01": -5 });
});

test("a credit linked to a one-off charge stays on its own date (red team 2026-11-17)", () => {
  const rows = schedule([
    { id: "fee", billedAt: D(2026, 3, 10), start: D(2026, 3, 10), end: D(2026, 3, 10), amount: 5000 },
    { id: "cn", credits: "fee", billedAt: D(2026, 2, 1), start: D(2026, 2, 1), end: D(2026, 2, 1), amount: -5000 },
  ], { asOf: D(2026, 4, 1) });
  assert.equal(rows.find((r) => r.month === "2026-02").recognized, -5000);
  assert.equal(rows.find((r) => r.month === "2026-03").recognized, 5000);
});

test("summary: asked about a month after the last row, deferred is the last closing balance", () => {
  const rows = schedule([{ id: "a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2026, 4, 1), amount: 9000 }, { id: "b", billedAt: D(2026, 3, 1), start: D(2026, 3, 1), end: D(2026, 3, 1), amount: 500 }], { asOf: D(2026, 2, 15) });
  const s = summary(rows, D(2026, 9, 15));
  assert.equal(s.deferredNow, rows[rows.length - 1].closing);
  assert.notEqual(rows[rows.length - 1].closing, rows[rows.length - 2].closing);
});

// Stripe periods carry the subscription's time of day. Flooring only the start
// counted 32 days for a month and 366 for a year, pushing a sliver of revenue
// past the period end (known gap from the 2026-11-17 audit, fixed 2026-11-18).
test("spread: a period that starts and ends at the same time of day counts whole days only", () => {
  const H = 3600000;
  const m = spread({ amount: 3100, start: D(2026, 1, 15) + 10 * H, end: D(2026, 2, 15) + 10 * H });
  assert.deepEqual(m, { "2026-01": 1700, "2026-02": 1400 });
  const y = spread({ amount: 36500, start: D(2026, 3, 1) + 17 * H, end: D(2027, 3, 1) + 17 * H });
  assert.equal(y["2027-03"], undefined);
  assert.equal(y["2026-03"], 3100);
});

test("only a negative line is re-spread over the line it credits; a positive one keeps its date (red team 2026-11-18)", () => {
  const rows = schedule([
    { id: "il_a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2027, 1, 1), amount: 36500 },
    { id: "fee", credits: "il_a", billedAt: D(2026, 2, 1), start: D(2026, 2, 1), end: D(2026, 2, 1), amount: 5000 },
  ], { asOf: D(2026, 3, 1) });
  assert.equal(rows.find((r) => r.month === "2026-02").recognized, 2800 + 5000);
});

// Period lock (quality audit 2026-11-17, defect 4).
test("schedule: a line billed after the close books its closed-month share as a catch-up in the first open month", () => {
  const onTime = { id: "a", billedAt: D(2026, 1, 1), start: D(2026, 1, 1), end: D(2026, 4, 1), amount: 9000 };
  const latePaid = { id: "b", billedAt: D(2026, 3, 10), start: D(2026, 1, 1), end: D(2026, 4, 1), amount: 9000 };
  const asOf = D(2026, 3, 15);
  const before = schedule([onTime], { asOf, closedThrough: "2026-02" });
  const after = schedule([onTime, latePaid], { asOf, closedThrough: "2026-02" });
  for (const m of ["2026-01", "2026-02"]) assert.deepEqual(after.find((r) => r.month === m), before.find((r) => r.month === m), m);
  const mar = after.find((r) => r.month === "2026-03");
  assert.equal(mar.recognized, 3100 + 9000); // onTime's March share (31 of 90 days) + all of the late line (Jan-Mar)
  assert.equal(mar.billed, 9000);
  const unlocked = schedule([onTime, latePaid], { asOf });
  assert.equal(unlocked.find((r) => r.month === "2026-01").recognized, after.find((r) => r.month === "2026-01").recognized + 3100);
  const tot = (rs) => rs.reduce((a, r) => a + r.recognized, 0);
  assert.equal(tot(after), tot(unlocked));
  assert.equal(after.at(-1).closing, unlocked.at(-1).closing);
});

test("schedule: the lock leaves future months alone and rejects a malformed month", () => {
  const l = { id: "c", billedAt: D(2026, 3, 1), start: D(2026, 1, 1), end: D(2027, 1, 1), amount: 36500 };
  const rs = schedule([l], { asOf: D(2026, 3, 5), closedThrough: "2026-02" });
  assert.equal(rs[0].month, "2026-03");
  assert.equal(rs.find((r) => r.month === "2026-03").recognized, 3100 + 2800 + 3100);
  assert.equal(rs.find((r) => r.month === "2026-04").recognized, 3000);
  assert.throws(() => schedule([l], { closedThrough: "2026-13" }));
  // January and December are valid closes (red team 2026-11-18: a mutant rejecting 01 escaped).
  assert.equal(schedule([l], { asOf: D(2026, 3, 5), closedThrough: "2026-01" })[0].month, "2026-02");
  assert.equal(schedule([l], { asOf: D(2026, 3, 5), closedThrough: "2025-12" })[0].month, "2026-01");
  // October is a valid close too (red team 2026-11-18, second run: a mutant rejecting 10 escaped).
  assert.equal(schedule([l], { asOf: D(2026, 3, 5), closedThrough: "2025-10" })[0].month, "2026-01");
});

test("journal: billings debit cash, so a paid invoice leaves no receivable", () => {
  const rows = schedule([{ id: "x", billedAt: D(2026, 1, 5), start: D(2026, 1, 5), end: D(2026, 1, 5), amount: 1000 }], { asOf: D(2026, 1, 20) });
  const e = journal(rows);
  assert.ok(e.every((x) => x.account !== "Accounts receivable"));
  assert.ok(e.some((x) => x.account === "Stripe balance" && x.debit === "10.00"));
});

// Defect 7: the remainder sort was an untested mutant. 100 over 3 equal months
// of 1 day each gives remainders 1,1,1; over days 31/28/31 the two 31-day months
// carry the larger remainders and must get the extra cents.
test("spread: rounding remainder goes to the months with the largest fractional share", () => {
  const s = spread({ amount: 1001, start: D(2026, 1, 1), end: D(2026, 4, 1) });
  // exact shares: 1001*31/90 = 344.79, 1001*28/90 = 311.42, 344.79
  assert.deepEqual(s, { "2026-01": 345, "2026-02": 311, "2026-03": 345 });
});

test("journal: a one-cent month is still journaled, a zero month is not (red team 2026-11-18)", () => {
  const rows = [{ month: "2026-01", billed: 1, recognized: 0 }, { month: "2026-02", billed: 0, recognized: 1 }];
  const e = journal(rows);
  assert.deepEqual(e.map((x) => [x.memo, x.account, x.debit, x.credit]), [
    ["Billings 2026-01", "Stripe balance", "0.01", ""], ["Billings 2026-01", "Deferred revenue", "", "0.01"],
    ["Revenue recognised 2026-02", "Deferred revenue", "0.01", ""], ["Revenue recognised 2026-02", "Subscription revenue", "", "0.01"],
  ]);
});
