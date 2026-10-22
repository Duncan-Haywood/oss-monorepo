import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, reports, closeChecks } from "./engine.mjs";
import { addPrepaid, prepaidSchedule, prepaidRegister } from "./prepaid.mjs";
import { trialBalance } from "./ledger.mjs";

const CSV = `Date,Description,Amount
2026-03-01,STATE FARM INSURANCE ANNUAL,-2400.00
2026-08-20,LANDLORD RENT,-500.00
`;
function base() {
  let b = importStatement(newBooks(), CSV, "1000").books;
  const ids = b.transactions.map((t) => t.id);
  return confirm(b, { [ids[0]]: "1400", [ids[1]]: "6080" });
}

test("cents add up exactly across odd amounts", () => {
  const { prepaid } = addPrepaid(newBooks(), { name: "Odd", date: "2026-01-10", amount: "1000.01", months: 7 });
  const s = prepaidSchedule(prepaid);
  assert.equal(s.length, 7);
  assert.equal(s.reduce((a, r) => a + r.cents, 0), 100001);
  assert.equal(s[0].date, "2026-01-31");
  assert.equal(s[6].date, "2026-07-31");
});

test("expense is booked monthly through the latest month and the books balance", () => {
  const { books } = addPrepaid(base(), { name: "Insurance", date: "2026-03-01", amount: "2400", months: 12 });
  const r = prepaidRegister(books);
  assert.equal(r.asOf, "2026-08-20");
  assert.equal(r.rows[0].expensed, 120000); // March to August: 6 x 200
  assert.equal(r.remaining, 120000);
  const tb = trialBalance(journal(books), books.accounts);
  const get = (c) => tb.rows.find((x) => x.code === c);
  assert.equal(get("6030").debit - get("6030").credit, 120000);
  assert.equal(get("1400").debit - get("1400").credit, 120000);
  assert.ok(tb.balanced);
  assert.equal(closeChecks(books).some((c) => c.check === "prepaid"), false);
});

test("close check flags a payment with no register row", () => {
  let b = base();
  b = addPrepaid(b, { name: "Other", date: "2026-03-01", amount: "100", months: 2 }).books;
  assert.ok(closeChecks(b).some((c) => c.check === "prepaid"));
});

test("bad input is refused", () => {
  const b = newBooks();
  assert.throws(() => addPrepaid(b, { name: "x", date: "2026-01-01", amount: "0", months: 12 }));
  assert.throws(() => addPrepaid(b, { name: "x", date: "2026-01-01", amount: "10", months: 1 }));
  assert.throws(() => addPrepaid(b, { name: "x", date: "2026-01-01", amount: "10", months: 12, expenseAccount: "1000" }));
});

test("months are bounded at both ends, 2 to 60", () => {
  const add = (months) => addPrepaid(newBooks(), { name: "X", date: "2026-01-10", amount: "600", months });
  assert.equal(add(2).prepaid.months, 2);
  assert.equal(add(60).prepaid.months, 60);
  assert.throws(() => add(1), /2 to 60/);
  assert.throws(() => add(61), /2 to 60/);
  assert.throws(() => add(12.5), /2 to 60/);
});
