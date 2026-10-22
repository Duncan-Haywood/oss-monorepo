import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, journal, closeChecks, fxRegister } from "./engine.mjs";
import { addFxAccount, setRates, parseRates, convertCents, rateOn } from "./fx.mjs";
import { trialBalance } from "./ledger.mjs";

const CSV = `Date,Description,Amount,Balance
2026-01-10,CLIENT GMBH INVOICE 7,1000.00,3000.00
2026-02-12,HOSTING AG,-200.00,2800.00
`;
const RATES = "date,cur,rate\n2026-01-01,EUR,1.10\n2026-02-01,EUR,1.05\n2026-02-28,EUR,1.20\n";

function books() {
  let b = addFxAccount({ ...newBooks(), accounts: newBooks().accounts.concat([{ code: "1020", name: "EUR account", type: "asset", bank: true }]) }, { code: "1020", currency: "eur" });
  b = setRates(b, parseRates(RATES).rates);
  return b;
}

test("conversion is exact and rounds half away from zero", () => {
  assert.equal(convertCents(1000, 1.0855), 1086); // 1085.5 -> 1086
  assert.equal(convertCents(-1000, 1.0855), -1086);
  assert.equal(convertCents(123456789012, 1.123456), Number((123456789012n * 1123456n + 500000n) / 1000000n));
});

test("rate is the latest on or before the date", () => {
  const b = books();
  assert.equal(rateOn(b, "EUR", "2026-01-31"), 1.1);
  assert.equal(rateOn(b, "EUR", "2026-02-01"), 1.05);
  assert.equal(rateOn(b, "EUR", "2025-12-31"), null);
});

test("lines convert at their date's rate, opening and closing are checked in EUR", () => {
  const r = importStatement(books(), CSV, "1020");
  assert.equal(r.added, 2);
  const [a, c] = r.books.transactions;
  assert.equal(a.cents, 110000); assert.equal(a.foreign.cents, 100000);
  assert.equal(c.cents, -21000); assert.equal(c.foreign.cents, -20000);
  assert.equal(r.books.fx.opening["1020"], 200000);
  assert.equal(r.books.opening["1020"], 220000); // 2000.00 EUR at 1.10
  let b = confirm(r.books, { [a.id]: "4000", [c.id]: "6060" });
  assert.equal(closeChecks(b).find((x) => x.check === "reconcile").severity, "ok"); // 2,800.00 EUR agrees in EUR
});

test("month-end remeasurement books the exchange difference and the books balance", () => {
  const r = importStatement(books(), CSV, "1020");
  const [a, c] = r.books.transactions;
  const b = confirm(r.books, { [a.id]: "4000", [c.id]: "6060" });
  const g = fxRegister(b, "2026-02-28");
  const row = g.rows[0];
  assert.equal(row.foreign, 280000);
  assert.equal(row.rate, 1.2);
  assert.equal(row.atRate, 336000);
  assert.equal(row.carried, row.atRate); // remeasured through the last month end (Feb 28 at 1.20)
  // carried = opening 220000 + 110000 - 21000 + remeasurement; gain is the rest
  assert.equal(row.gain, 336000 - (220000 + 110000 - 21000));
  const tb = trialBalance(journal(b), b.accounts);
  assert.ok(tb.balanced);
  assert.ok(tb.rows.find((x) => x.code === "6190").credit > 0);
});

test("a line with no rate yet is left out and named", () => {
  let b = addFxAccount({ ...newBooks(), accounts: newBooks().accounts.concat([{ code: "1020", name: "EUR account", type: "asset", bank: true }]) }, { code: "1020", currency: "EUR" });
  const r = importStatement(b, CSV, "1020");
  assert.equal(r.added, 0);
  assert.match(r.problems.join(" "), /no EUR exchange rate/);
});

test("bad rate lines are reported, base currency and non-bank accounts refused", () => {
  assert.equal(parseRates("2026-13-01,EUR,1.1\n2026-01-01,EUR,0").problems.length, 2);
  assert.throws(() => addFxAccount(newBooks(), { code: "1000", currency: "USD" }), /own currency/);
  assert.throws(() => addFxAccount(newBooks(), { code: "4000", currency: "EUR" }), /not a bank account/);
});

test("a transfer between a EUR and a USD account is paired, the rate difference is realized gain", () => {
  let b = books();
  b.accounts.push({ code: "1010", name: "USD savings", type: "asset", bank: true });
  const eur = "Date,Description,Amount,Balance\n2026-01-20,TRANSFER TO USD,-1000.00,1000.00\n";
  const usd = "Date,Description,Amount,Balance\n2026-01-21,TRANSFER FROM EUR,1120.00,1120.00\n";
  b = importStatement(b, eur, "1020").books;
  b = importStatement(b, usd, "1010").books;
  const [e, u] = b.transactions;
  assert.equal(e.cents, -110000); // 1,000.00 EUR at the typed 1.10
  assert.equal(e.status, "transfer"); assert.equal(u.status, "transfer"); assert.equal(e.pair, u.id);
  const tb = trialBalance(journal(b), b.accounts);
  assert.ok(tb.balanced);
  assert.equal(tb.rows.find((x) => x.code === "6190").credit, 2000); // bank gave 1,120.00 for 1,100.00 carried: 20.00 gain
  assert.equal(closeChecks(b).filter((c) => c.severity === "high").length, 0);
});

test("a USD line far from the EUR line's value is not paired", () => {
  let b = books();
  b.accounts.push({ code: "1010", name: "USD savings", type: "asset", bank: true });
  b = importStatement(b, "Date,Description,Amount,Balance\n2026-01-20,X,-1000.00,1000.00\n", "1020").books;
  b = importStatement(b, "Date,Description,Amount,Balance\n2026-01-21,Y,1300.00,1300.00\n", "1010").books;
  assert.notEqual(b.transactions[0].status, "transfer");
});
