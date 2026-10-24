import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance } from "./bank.mjs";

const f = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("CBA-style CSV with no header: day-first dates, signed amounts, balance chain", () => {
  const r = readStatement(f("cba-no-header.csv"));
  assert.equal(r.bank, "cba");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-03", -4520], ["2026-03-04", 250000], ["2026-03-05", -1299]]);
  assert.equal(r.rows[0].desc, "WOOLWORTHS 1234 SYDNEY");
  assert.equal(r.rows[2].balance, 444181);
  assert.equal(r.problems.length, 0);
  assert.deepEqual(checkRunningBalance(r.rows)?.breaks ?? [], []);
});

test("TD-style CSV with no header: withdrawals and deposits columns", () => {
  const r = readStatement(f("td-no-header.csv"));
  assert.equal(r.bank, "td");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-03", -485], ["2026-03-04", 180000], ["2026-03-05", -12040]]);
  assert.equal(r.rows[1].balance, 279515);
});

test("a three-column file (ANZ style, no balance) is read", () => {
  const r = readStatement("03/03/2026,-45.20,COFFEE\n04/03/2026,100.00,REFUND\n");
  assert.equal(r.bank, "anz");
  assert.equal(r.rows[1].date, "2026-03-04");
});

test("a Type column of DEBIT/CREDIT or Withdrawal/Deposit words signs an unsigned amount", () => {
  for (const [hdr, a, b] of [["Date,Description,Type,Amount", "DEBIT", "CREDIT"], ["Posting Date,Payee,Transaction Type,Amount", "Withdrawal", "Deposit"]]) {
    const r = readStatement(`${hdr}\n01/05/2026,Fee,${a},12.50\n01/06/2026,Dep,${b},1200.00\n`);
    assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 120000]);
  }
});

test("a card export's Sale/Return Type column is not read as debit/credit", () => {
  const r = readStatement("Date,Description,Type,Amount\n01/05/2026,Shop,Sale,-12.50\n01/06/2026,Shop,Return,5.00\n");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1250, 500]);
});

// Layouts below are rewritten from the column orders in bank2ynab's config (MIT);
// the rows are made up. `node eval/bank2ynab-probe.mjs bank2ynab.conf` runs all 16.
const amounts = (r) => r.rows.map((x) => x.cents);

test("any header-less file: semicolon, dd.mm.yyyy, decimal comma, a leading empty column (Raiffeisen shape)", () => {
  const r = readStatement(";COFFEE SHOP 4411;13.03.2026;-4,50;;\n;PAYROLL ACME LTD;14.03.2026;1200,00;;\n");
  assert.deepEqual(amounts(r), [-450, 120000]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-13", "2026-03-14"]);
  assert.equal(r.rows[0].desc, "COFFEE SHOP 4411");
});

test("any header-less file: a balance column that chains with the amount is the balance, in either sort order", () => {
  const up = readStatement("13 Mar 26,-4.50,,,,COFFEE SHOP 4411,4995.50\n14 Mar 26,1200.00,,,,PAYROLL ACME,6195.50\n");
  assert.deepEqual(up.rows.map((x) => [x.cents, x.balance]), [[-450, 499550], [120000, 619550]]);
  const down = readStatement("14 Mar 26,1200.00,,,,PAYROLL ACME,6195.50\n13 Mar 26,-4.50,,,,COFFEE SHOP 4411,4995.50\n");
  assert.deepEqual(down.rows.map((x) => x.cents), [120000, -450]);
  assert.deepEqual(checkRunningBalance(down.rows)?.breaks ?? [], []);
});

test("any header-less file: US month-first dates, a money-out/money-in pair with one cell filled per row", () => {
  const r = readStatement("03/13/2026,,,,COFFEE SHOP 4411,4.50,,,,\n03/14/2026,,,,PAYROLL ACME,,1200.00,,,\n");
  assert.deepEqual(amounts(r), [-450, 120000]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-13", "2026-03-14"]);
});

test("any header-less file: a D/C flag column signs an unsigned amount (Rabobank shape)", () => {
  const r = readStatement(",,20260313,D,4.50,,COFFEE SHOP 4411,,,,COFFEE SHOP 4411,\n,,20260314,C,1200.00,,PAYROLL ACME,,,,PAYROLL ACME,\n");
  assert.deepEqual(amounts(r), [-450, 120000]);
});

test("any header-less file: an unlabelled out/in pair with no balance says the order is a guess", () => {
  const r = readStatement("13/03/2026,COFFEE,4.50,\n14/03/2026,PAYROLL,,1200.00\n");
  assert.deepEqual(amounts(r), [-450, 120000]);
  assert.ok(r.problems.some((p) => /not labelled/.test(p)));
});

test("a file with a header row is never read as header-less, and pasted statement text still goes to the text reader", () => {
  const h = readStatement("Date,Description,Amount\n03/13/2026,COFFEE,-4.50\n03/14/2026,PAYROLL,1200.00\n");
  assert.deepEqual(amounts(h), [-450, 120000]);
  assert.equal(h.problems.length, 0);
  const t = readStatement("03/13 COFFEE SHOP 4.50\n03/14 PAYROLL ACME 1200.00\n", { year: 2026 });
  assert.deepEqual(t.rows.map((x) => x.desc), ["COFFEE SHOP", "PAYROLL ACME"]);
});

test("a row with a description and no amount is named, not dropped silently", () => {
  const r = readStatement("Date,Description,Amount\n2026-01-02,Shop,\n2026-01-03,Coffee,-3.00\n");
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.problems, ["Line 2: no amount, skipped."]);
});

// A date written "Mar 13, 2026" (Revolut's layout in the Firefly III configs) is a date column too.
test("header-less file with month-name-first dates", () => {
  const r = readStatement("Mar 13, 2026;COFFEE SHOP 4411;4,50;;\nMar 14, 2026;PAYROLL ACME LTD;;1.200,00;\nMar 15, 2026;RENT MARCH;950,00;;\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-13", -450], ["2026-03-14", 120000], ["2026-03-15", -95000]]);
});
