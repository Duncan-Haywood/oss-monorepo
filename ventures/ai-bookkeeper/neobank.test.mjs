import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStatement, checkRunningBalance, readQif, splitOfx } from "./bank.mjs";

const read = (f) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));

test("Revolut: completed rows only, fee taken off, balance chain holds", () => {
  const r = read("revolut-current.csv");
  assert.equal(r.bank, "revolut");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1500, 120000, -10150]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-03", "2026-03-04", "2026-03-05"]);
  assert.equal(r.problems.length, 2, "pending and reverted rows are reported, not imported");
  const c = checkRunningBalance(r.rows);
  assert.equal(c.checked, true);
  assert.deepEqual(c.breaks, []);
  assert.equal(c.opening, 200000);
});

test("Revolut: a file with two currencies is flagged", () => {
  const t = readFileSync(new URL("./fixtures/revolut-current.csv", import.meta.url), "utf8").replace("Figma,-15.00,0.00,EUR", "Figma,-15.00,0.00,USD");
  assert.ok(readStatement(t).problems.some((p) => /mixes currencies/.test(p)));
});

test("Wise: DD-MM-YYYY dates read day first, running balance chains", () => {
  const r = read("wise-statement.csv");
  assert.equal(r.bank, "wise");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-13", "2026-03-12"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2499, 100000]);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Monzo: day-first dates, merchant name as description", () => {
  const r = read("monzo-business.csv");
  assert.equal(r.bank, "monzo");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-13"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-800, 150000]);
  assert.equal(r.rows[0].desc, "Notion");
});

test("Starling: counter party, currency-suffixed amount and balance chain", () => {
  const r = read("starling-business.csv");
  assert.equal(r.bank, "starling");
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-13"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-800, 150000]);
  assert.equal(r.rows[1].desc, "Client Ltd");
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Mercury: pending rows are reported, not imported", () => {
  const r = read("mercury-checking.csv");
  assert.equal(r.bank, "mercury");
  assert.deepEqual(r.rows.map((x) => x.cents), [-12050, 500000]);
  assert.equal(r.problems.length, 1);
});

test("Discover card: charges positive, DIRECTPAY row settles the sign", () => {
  const r = read("discover-card.csv");
  assert.equal(r.bank, "discover");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4217, -5999, 10216]);
  assert.ok(r.inferred);
});

test("Citi card: debit and credit columns, Status column ignored", () => {
  const r = read("citi-card.csv");
  assert.equal(r.bank, "citi");
  assert.deepEqual(r.rows.map((x) => x.cents), [-3850, 3850, -1725]);
});

test("US Bank and Ally checking are recognised and signed as written", () => {
  const u = read("us-bank-checking.csv");
  assert.equal(u.bank, "us-bank");
  assert.deepEqual(u.rows.map((x) => x.cents), [-125000, 480000, -9640]);
  const a = read("ally-checking.csv");
  assert.equal(a.bank, "ally");
  assert.deepEqual(a.rows.map((x) => x.cents), [-4500, 250000, -1299]);
});

test("Apple Card: charges positive, the ACH deposit row settles the sign", () => {
  const r = read("apple-card.csv");
  assert.equal(r.bank, "apple-card");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4217, -5999, 10216]);
});

test("Lloyds: day-first dates, debit and credit columns, balance chain holds", () => {
  const r = read("lloyds-current.csv");
  assert.equal(r.bank, "lloyds");
  assert.deepEqual(r.rows.map((x) => x.cents), [-2450, 120000, -4500]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-04", "2026-03-05"]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
});

test("Barclays: day-first dates, Memo as description, no dates dropped", () => {
  const r = read("barclays-current.csv");
  assert.equal(r.bank, "barclays");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-05", "2026-03-13", "2026-03-14"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-2499, 150000, -850]);
  assert.equal(r.rows[1].desc, "CLIENT LTD INV 114");
});

test("PNC: withdrawals and deposits columns, quoted thousands, balance chain holds", () => {
  const r = read("pnc-checking.csv");
  assert.equal(r.bank, "pnc");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
});

test("Schwab: Withdrawal and Deposit columns with dollar signs, balance chain holds", () => {
  const r = read("schwab-checking.csv");
  assert.equal(r.bank, "schwab");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
});

test("European headers: German, French and Spanish exports with decimal commas", () => {
  const opt = { dayFirst: true, decimalComma: true };
  const de = readStatement("Buchungstag;Verwendungszweck;Betrag;Saldo\n02.01.2026;Kaffee;-4,50;95,50\n03.01.2026;Gehalt;100,00;195,50\n", opt);
  assert.deepEqual(de.rows.map((x) => x.cents), [-450, 10000]);
  assert.equal(checkRunningBalance(de.rows).breaks.length, 0);
  const fr = readStatement("Date;Libellé;Débit;Crédit\n02/01/2026;LOYER;1 000,00;\n03/01/2026;VENTE;;50,00\n", opt);
  assert.deepEqual(fr.rows.map((x) => x.cents), [-100000, 5000]);
  const es = readStatement("Fecha;Concepto;Importe;Saldo\n02/01/2026;CAFE;-4,50;95,50\n", opt);
  assert.deepEqual(es.rows.map((x) => x.cents), [-450]);
});

test("Wells Fargo: the headerless export takes the description from the fifth column", () => {
  const r = read("wells-fargo-checking.csv");
  assert.equal(r.bank, "wells-fargo");
  assert.equal(r.rows[0].desc, "DEPOSIT NORTHWIND LLC INV 1041");
  assert.ok(r.rows.every((x) => x.desc !== ""));
});

test("QIF: a slash date reads month first unless day first is asked for", () => {
  const q = "!Type:Bank\nD03/04/2026\nT-5.00\nPCafe\n^\n";
  assert.equal(readQif(q).rows[0].date, "2026-03-04");
  assert.equal(readQif(q, { dayFirst: true }).rows[0].date, "2026-04-03");
});

test("OFX: a card account is flagged as a card, a bank account is not", () => {
  const t = readFileSync(new URL("./fixtures/two-accounts.ofx", import.meta.url), "utf8");
  const parts = splitOfx(t);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((p) => p.card), [false, true]);
  assert.equal(splitOfx("<OFX><CCSTMTRS><CCACCTFROM><ACCTID>9</CCACCTFROM></CCSTMTRS></OFX>")[0].card, true);
  assert.equal(splitOfx("<OFX><CCSTMTRS><ACCTID>9</CCSTMTRS></OFX>")[0].card, true, "a card block without an account-from element");
  assert.equal(splitOfx("<OFX><CCACCTFROM><ACCTID>9</CCACCTFROM></OFX>")[0].card, true, "an account-from element without a block");
  assert.equal(splitOfx("<OFX><STMTRS><BANKACCTFROM><ACCTID>9<ACCTTYPE>CHECKING</BANKACCTFROM></STMTRS></OFX>")[0].card, false);
});

test("OFX: a single-account file reads its id from the statement block, not from earlier text", () => {
  const t = "<OFX><INVSTMTRS><INVACCTFROM><ACCTID>INV-1</INVACCTFROM></INVSTMTRS>\n<STMTRS><BANKACCTFROM><ACCTID>CHK-2<ACCTTYPE>CHECKING</BANKACCTFROM></STMTRS></OFX>";
  const parts = splitOfx(t);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].id, "CHK-2");
});
