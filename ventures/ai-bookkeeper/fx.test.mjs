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

// Foreign-currency invoices and bills.
import { addDocuments, aging } from "./engine.mjs";

const fxDocs = (b, csv) => addDocuments(b, csv);

test("a EUR invoice is booked at its date's rate and settled by a USD deposit with a realized loss", () => {
  let b = setRates(newBooks(), parseRates("2026-01-01,EUR,1.10").rates);
  const r = fxDocs(b, "type,number,date,due,party,amount,account,currency\ninvoice,E1,2026-01-05,,Client GmbH,1000.00,4000,EUR\n");
  assert.deepEqual(r.problems, []);
  const d = r.books.documents[0];
  assert.equal(d.total, 110000); // 1000 EUR x 1.10
  assert.equal(d.foreignTotal, 100000);
  // deposit arrived at 1.08: 1080.00
  let b2 = importStatement(r.books, "Date,Description,Amount\n2026-02-03,WIRE CLIENT GMBH E1,1080.00\n", "1000").books;
  b2 = addDocuments(b2, "").books;
  const j = journal(b2);
  const fx = j.find((e) => e.source === "fx");
  assert.ok(fx, "a realized exchange entry");
  assert.match(fx.memo, /loss/);
  const net = (c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
  assert.equal(net("1100"), 0); // receivable cleared exactly
  assert.equal(net("6190"), 2000); // 20.00 lost: booked 1100.00, received 1080.00
  assert.equal(aging(b2).receivable?.cents ?? 0, 0);
});

test("a EUR bill paid for less in USD is a gain; no rate means the document is refused", () => {
  let b = setRates(newBooks(), parseRates("2026-01-01,EUR,1.10").rates);
  const no = fxDocs(newBooks(), "type,number,date,party,amount,account,currency\nbill,B1,2026-01-05,Host AG,200.00,6100,EUR\n");
  assert.equal(no.added, 0);
  assert.match(no.problems[0], /no EUR rate/);
  const r = fxDocs(b, "type,number,date,party,amount,account,currency,rate\nbill,B1,2026-01-05,Host AG,200.00,6100,EUR,\n");
  assert.equal(r.books.documents[0].total, 22000);
  const b2 = importStatement(r.books, "Date,Description,Amount\n2026-02-03,HOST AG B1,-215.00\n", "1000").books;
  const fx = journal(b2).find((e) => e.source === "fx");
  assert.match(fx.memo, /gain/);
  const dr = fx.lines.reduce((a, l) => a + l.debit, 0), cr = fx.lines.reduce((a, l) => a + l.credit, 0);
  assert.equal(dr, 500); assert.equal(cr, 500);
});

test("an open EUR invoice is revalued at each month end; the payment realizes only the rest", () => {
  const net = (j, c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
  let b = setRates(newBooks(), parseRates("2026-01-01,EUR,1.10\n2026-01-31,EUR,1.12\n2026-02-28,EUR,1.05").rates);
  b = fxDocs(b, "type,number,date,party,amount,account,currency\ninvoice,E1,2026-01-05,Client GmbH,1000.00,4000,EUR\n").books;
  b = importStatement(b, "Date,Description,Amount\n2026-03-02,COFFEE SHOP,-5.00\n", "1000").books; // books run to March
  let j = journal(b);
  assert.equal(net(j, "1100"), 105000); // carried at 1.05 after the February month end: 1,050.00
  assert.equal(net(j, "6190"), 5000); // +20.00 in January, -70.00 in February: 50.00 loss against the booked 1,100.00
  assert.ok(trialBalance(j, b.accounts).balanced);
  // paid 1,080.00 on 3 March against 1,050.00 carried: 30.00 realized gain
  b = importStatement(b, "Date,Description,Amount\n2026-03-03,WIRE CLIENT GMBH E1,1080.00\n", "1000").books;
  j = journal(b);
  assert.equal(net(j, "1100"), 0);
  assert.equal(net(j, "6190"), 2000); // in all 1,100.00 booked less 1,080.00 received
  assert.ok(trialBalance(j, b.accounts).balanced);
});

test("a EUR bill revalued up is a loss, paid after one month end", () => {
  const net = (j, c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
  let b = setRates(newBooks(), parseRates("2026-01-01,EUR,1.10\n2026-01-31,EUR,1.13").rates);
  b = fxDocs(b, "type,number,date,party,amount,account,currency\nbill,B1,2026-01-05,Host AG,200.00,6100,EUR\n").books;
  assert.equal(net(journal(b), "2050"), -22600);
  assert.equal(net(journal(b), "6190"), 600);
  b = importStatement(b, "Date,Description,Amount\n2026-02-03,HOST AG B1,-225.00\n", "1000").books;
  const j = journal(b);
  assert.equal(net(j, "2050"), 0);
  assert.equal(net(j, "6190"), 500); // booked 220.00, paid 225.00
  assert.ok(trialBalance(j, b.accounts).balanced);
});

// A transfer between two different foreign accounts (EUR to GBP) is judged in base units.
function twoForeign(eurOut, gbpIn) {
  let b = books();
  b.accounts.push({ code: "1030", name: "GBP account", type: "asset", bank: true });
  b = addFxAccount(b, { code: "1030", currency: "GBP" });
  b = setRates(b, parseRates("2026-01-01,GBP,1.30").rates);
  b = importStatement(b, `Date,Description,Amount,Balance\n2026-01-20,TRANSFER TO GBP,-${eurOut},1000.00\n`, "1020").books;
  b = importStatement(b, `Date,Description,Amount,Balance\n2026-01-21,TRANSFER FROM EUR,${gbpIn},${gbpIn}\n`, "1030").books;
  return b;
}

test("a transfer between a EUR and a GBP account is paired, the rate difference is realized", () => {
  const b = twoForeign("1000.00", "850.00"); // 1,100.00 base out, 1,105.00 base in
  const [e, g] = b.transactions;
  assert.equal(e.status, "transfer"); assert.equal(g.status, "transfer"); assert.equal(e.pair, g.id);
  const tb = trialBalance(journal(b), b.accounts);
  assert.ok(tb.balanced);
  assert.equal(tb.rows.find((x) => x.code === "6190").credit, 500); // 5.00 gain
});

test("a EUR and a GBP line far apart in value are not paired", () => {
  const b = twoForeign("1000.00", "1200.00");
  assert.notEqual(b.transactions[0].status, "transfer");
});

const net = (j, c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
const CN_CSV = "type,number,date,due,party,amount,account,currency,against\ninvoice,E1,2026-01-05,,Client GmbH,1000.00,4000,EUR,\ncredit note,C1,2026-02-05,,Client GmbH,100.00,4000,EUR,E1\n";
const CN_RATES = "2026-01-01,EUR,1.10\n2026-02-01,EUR,1.20";

test("a EUR credit note at another rate lowers the EUR invoice by the units it carried; the rate gap is realized", () => {
  const r = addDocuments(setRates(newBooks(), parseRates(CN_RATES).rates), CN_CSV);
  assert.deepEqual(r.problems, []);
  const inv = r.books.documents.find((d) => d.id === "INV-E1");
  assert.equal(inv.credited, 11000); // 100 EUR x 1.10, what the invoice carried
  const j = journal(r.books);
  assert.equal(net(j, "1100"), 99000); // 900 EUR x 1.10 still owed
  assert.equal(net(j, "6190"), -1000); // credit note booked at 1.20: 10.00 gain
  const b2 = importStatement(r.books, "Date,Description,Amount\n2026-02-10,WIRE CLIENT GMBH E1,999.00\n", "1000").books;
  const j2 = journal(addDocuments(b2, "").books);
  assert.equal(net(j2, "1100"), 0);
  assert.equal(net(j2, "6190"), -1900);
});

test("a EUR vendor credit at another rate clears the bill exactly", () => {
  const csv = "type,number,date,due,party,amount,account,currency,against\nbill,B1,2026-01-05,,Host AG,500.00,6000,EUR,\nvendor credit,V1,2026-02-05,,Host AG,500.00,6000,EUR,B1\n";
  const r = addDocuments(setRates(newBooks(), parseRates(CN_RATES).rates), csv);
  assert.deepEqual(r.problems, []);
  const j = journal(r.books);
  assert.equal(net(j, "2050"), 0); // payable cleared, nothing left to pay
  assert.equal(net(j, "6190"), 5000); // bill 550.00, credit 600.00: 50.00 loss
});

test("a EUR invoice paid in two USD instalments closes on the last, the rate gap is realized", () => {
  const b = setRates(newBooks(), parseRates("2026-01-01,EUR,1.10").rates);
  const r = addDocuments(b, "type,number,date,party,amount,account,currency\ninvoice,E1,2026-01-05,Client GmbH,1000.00,4000,EUR\n");
  // 500.00 then 575.00: the second is 4.2% under the 600.00 still carried, outside the 3% a first payment gets
  const b2 = addDocuments(importStatement(r.books, "Date,Description,Amount\n2026-02-03,WIRE CLIENT GMBH E1,500.00\n2026-02-20,WIRE CLIENT GMBH E1,575.00\n", "1000").books, "").books;
  const j = journal(b2);
  const net = (c) => j.flatMap((x) => x.lines).filter((l) => l.account === c).reduce((n, l) => n + l.debit - l.credit, 0);
  assert.equal(net("1100"), 0);
  assert.equal(net("6190"), 2500); // 1100.00 booked, 1075.00 received
  assert.equal(aging(b2).receivable?.cents ?? 0, 0);
});

function eurBooks() {
  let b = addFxAccount({ ...newBooks(), accounts: newBooks().accounts.concat([{ code: "1020", name: "EUR account", type: "asset", bank: true }]) }, { code: "1020", currency: "eur" });
  return setRates(b, parseRates("2026-01-01,EUR,1.10\n2026-02-01,EUR,1.20").rates);
}

test("a EUR invoice paid by two EUR deposits is matched in euros and closes, the rate gap is realized per payment", () => {
  const r = addDocuments(eurBooks(), "type,number,date,party,amount,account,currency\ninvoice,E1,2026-01-05,Client GmbH,1000.00,4000,EUR\n");
  const s = importStatement(r.books, "Date,Description,Amount\n2026-02-03,WIRE CLIENT GMBH E1,400.00\n2026-02-20,WIRE CLIENT GMBH E1,600.00\n", "1020");
  const b = addDocuments(s.books, "").books;
  const j = journal(b);
  const d = b.documents[0];
  assert.deepEqual(d.payments.map((p) => p.cents), [44000, 66000]); // 400 and 600 EUR at the booking rate 1.10
  assert.equal(d.settledBy, d.payments[1].line);
  assert.equal(net(j, "1100"), 0);
  assert.equal(net(j, "6190"), -10000); // 1,100.00 booked, 1,200.00 received: 100.00 gain
  assert.equal(aging(b).receivable?.cents ?? aging(b).receivable.total, 0);
});

test("a EUR deposit of the whole balance in a EUR account settles in euros whatever the rate", () => {
  const r = addDocuments(eurBooks(), "type,number,date,party,amount,account,currency\ninvoice,E1,2026-01-05,Client GmbH,1000.00,4000,EUR\n");
  const b = addDocuments(importStatement(r.books, "Date,Description,Amount\n2026-02-03,WIRE CLIENT GMBH E1,1000.00\n", "1020").books, "").books;
  const j = journal(b);
  assert.equal(net(j, "1100"), 0);
  assert.equal(net(j, "6190"), -10000);
});

test("a part-payment leaves the euro balance open and its exchange gap booked", () => {
  const r = addDocuments(eurBooks(), "type,number,date,party,amount,account,currency\ninvoice,E1,2026-01-05,Client GmbH,1000.00,4000,EUR\n");
  const b = addDocuments(importStatement(r.books, "Date,Description,Amount\n2026-02-03,WIRE CLIENT GMBH E1,400.00\n", "1020").books, "").books;
  const j = journal(b);
  assert.equal(net(j, "1100"), 66000); // 600 EUR still owed at 1.10
  assert.equal(net(j, "6190"), -4000);
  assert.equal(aging(b).receivable.total, 66000);
});

test("a GBP credit note against a EUR invoice is applied at base value, no exchange entry, and the payment clears the rest", () => {
  const csv = "type,number,date,due,party,amount,account,currency,against\ninvoice,E1,2026-01-05,,Client GmbH,1000.00,4000,EUR,\ncredit note,C1,2026-02-05,,Client GmbH,100.00,4000,GBP,E1\n";
  const r = addDocuments(setRates(newBooks(), parseRates("2026-01-01,EUR,1.10\n2026-01-01,GBP,1.30").rates), csv);
  assert.deepEqual(r.problems, []);
  assert.equal(net(journal(r.books), "1100"), 97000); // 1,100.00 less the credit note's 130.00
  const b2 = importStatement(r.books, "Date,Description,Amount\n2026-02-10,WIRE CLIENT GMBH E1,970.00\n", "1000").books;
  const j2 = journal(addDocuments(b2, "").books);
  assert.equal(net(j2, "1100"), 0);
  assert.equal(net(j2, "6190"), 0);
});
