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
  assert.ok(entries.some((e) => e.memo === "Billings 2026-01" && e.account === "Accounts receivable" && e.debit === "1200.00"));
  assert.ok(entries.some((e) => e.memo === "Billings 2026-03" && e.account === "Accounts receivable" && e.credit === "25.00"));
});

test("journalCsv: header, quoting and trailing newline", () => {
  const csv = journalCsv([{ date: "2026-01-31", memo: 'a,"b"', account: "X", debit: "1.00", credit: "" }]);
  assert.equal(csv, 'Date,Memo,Account,Debit,Credit\n2026-01-31,"a,""b""",X,1.00,\n');
});
