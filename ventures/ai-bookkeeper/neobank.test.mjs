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

test("Discover card: charges still flip when no payment row names itself", () => {
  const t = "Trans. Date,Post Date,Description,Amount,Category\n03/01/2026,03/02/2026,COFFEE,4.50,Restaurants\n03/05/2026,03/05/2026,PAYMENT,-100.00,Payments and Credits\n";
  const r = readStatement(t);
  assert.equal(r.bank, "discover");
  assert.deepEqual(r.rows.map((x) => x.cents), [-450, 10000]);
  const only = readStatement("Trans. Date,Post Date,Description,Amount,Category\n03/01/2026,03/02/2026,COFFEE,4.50,Restaurants\n");
  assert.deepEqual(only.rows.map((x) => x.cents), [-450], "a month of purchases only");
  const kept = readStatement(t, { invert: false });
  assert.deepEqual(kept.rows.map((x) => x.cents), [450, -10000], "an explicit flag still wins");
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

test("N26: ISO dates, partner name as the description, signed euro amounts", () => {
  const r = read("n26-account.csv");
  assert.equal(r.bank, "n26");
  assert.deepEqual(r.rows.map((x) => x.cents), [-2490, 150000, -1367]);
  assert.equal(r.rows[0].desc, "Hetzner Online GmbH");
  assert.deepEqual(r.problems, []);
});

test("Venmo: preamble and balance rows skipped, pending rows reported, the other party named", () => {
  const r = read("venmo-statement.csv");
  assert.equal(r.bank, "venmo");
  assert.deepEqual(r.rows.map((x) => x.cents), [25000, -4000, -20000]);
  assert.equal(r.rows[0].desc, "Pat Customer - Logo design deposit");
  assert.equal(r.rows[1].desc, "Photo Depot - Stock photos");
  assert.equal(r.rows[2].desc, "Standard Transfer");
  assert.equal(r.problems.length, 1, "the pending lunch payment is reported, not imported");
});

test("Cash App: net amount after the fee, canceled payments reported, payee named", () => {
  const r = read("cashapp-report.csv");
  assert.equal(r.bank, "cash-app");
  assert.deepEqual(r.rows.map((x) => x.cents), [11652, -4500, -10000]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-03", "2026-03-05"]);
  assert.equal(r.rows[0].desc, "Pat Customer - Fence repair deposit");
  assert.equal(r.rows[2].desc, "Cash out");
  assert.equal(r.problems.length, 1);
});

test("SoFi: pending rows skipped, balance chain holds", () => {
  const r = read("sofi-checking.csv");
  assert.equal(r.bank, "sofi");
  assert.deepEqual(r.rows.map((x) => x.cents), [125, -1199, 30000]);
  assert.equal(r.problems.length, 1);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("RBC: CAD$ column, MM/DD dates, both description columns joined", () => {
  const r = read("rbc-chequing.csv");
  assert.equal(r.bank, "rbc");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-04", "2026-03-09"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(r.rows[1].desc, "E-TRANSFER CLIENT LTD INV 88");
});

test("RBC: a USD$ row is read, and the file says it mixes currencies", () => {
  const csv = "Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$\n" +
    "Chequing,1,3/2/2026,,STAPLES #412,PURCHASE,-45.20,\n" +
    "Chequing,1,3/3/2026,,US SUPPLIER,WIRE,,-120.00\n";
  const r = readStatement(csv);
  assert.equal(r.bank, "rbc");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, -12000]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /mixes currencies \(CAD, USD\)/);
  const cad = readStatement(csv.split("\n").filter((l, i) => i !== 2).join("\n"));
  assert.deepEqual(cad.problems, []);
});

test("Westpac: day-first dates, debit and credit columns, balance chain holds", () => {
  const r = read("westpac-business.csv");
  assert.equal(r.bank, "westpac");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-04", "2026-03-09"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(checkRunningBalance(r.rows).checked, true);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("NAB: 'DD Mon YY' dates, signed amount, transaction details as description", () => {
  const r = read("nab-transactions.csv");
  assert.equal(r.bank, "nab");
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-04", "2026-03-09"]);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000, -30000]);
  assert.equal(r.rows[0].desc, "OFFICEWORKS 0412");
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("USAA: original description column ignored, pending rows skipped", () => {
  const r = read("usaa-checking.csv");
  assert.equal(r.bank, "usaa");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4210, 250000]);
  assert.equal(r.rows[0].desc, "Shell");
  assert.equal(r.problems.length, 1);
});

test("balance-less checking export: outgoing 'online payment' rows do not flip the signs", () => {
  const t = "Date,Description,Amount\n2026-03-02,ONLINE PAYMENT VERIZON,-85.00\n2026-03-03,STRIPE PAYOUT,1200.00\n2026-03-04,AUTOPAY GEICO,-140.00\n2026-03-05,ADOBE,-54.99\n";
  const r = readStatement(t);
  assert.deepEqual(r.rows.map((x) => x.cents), [-8500, 120000, -14000, -5499]);
  assert.equal(r.inferred, null);
});

test("card export with positive charges and 'payment thank you' rows still flips", () => {
  const t = "Date,Description,Amount\n2026-03-02,PAYMENT THANK YOU,-500.00\n2026-03-03,AMAZON,60.00\n2026-03-04,UBER,22.50\n";
  const r = readStatement(t);
  assert.deepEqual(r.rows.map((x) => x.cents), [50000, -6000, -2250]);
  assert.match(r.inferred, /flipped/);
});

test("autopay-only card export (mostly positive charges) still flips", () => {
  const t = "Date,Description,Amount\n2026-03-02,AUTOPAY PAYMENT,-300.00\n2026-03-03,AMAZON,60.00\n2026-03-04,UBER,22.50\n2026-03-05,SHELL,40.00\n";
  assert.deepEqual(readStatement(t).rows.map((x) => x.cents), [30000, -6000, -2250, -4000]);
});

test("European semicolon export: day-first dates and decimal commas are inferred", () => {
  const r = readStatement("sep=;\nDatum;Beschreibung;Betrag\n01.03.2026;Miete;-1.200,50\n02.03.2026;Gehalt;3.000,00\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-01", -120050], ["2026-03-02", 300000]]);
  assert.match(r.inferred, /day first/);
});

test("locale inference never overrides an explicit choice, and US files are untouched", () => {
  const us = readStatement("Date,Description,Amount\n03/01/2026,Coffee,-4.50\n03/02/2026,Pay,\"1,100.00\"\n");
  assert.deepEqual(us.rows.map((x) => [x.date, x.cents]), [["2026-03-01", -450], ["2026-03-02", 110000]]);
  const forced = readStatement("Date,Description,Amount\n03/01/2026,Coffee,-4.50\n", { dayFirst: false });
  assert.equal(forced.rows[0].date, "2026-03-01");
  const dmy = readStatement("Date,Description,Amount\n13/01/2026,Coffee,-4.50\n02/02/2026,Pay,10.00\n");
  assert.deepEqual(dmy.rows.map((x) => x.date), ["2026-01-13", "2026-02-02"]);
});

test("a DR/CR marker column signs an unsigned amount; dd-Mon-yyyy dates read", () => {
  const r = readStatement("Date,Description,Amount,DR/CR\n1-Mar-2026,Coffee,4.50,DR\n2-Mar-2026,Pay,100.00,CR\n");
  assert.deepEqual(r.rows.map((x) => [x.date, x.cents]), [["2026-03-01", -450], ["2026-03-02", 10000]]);
});

test("PayPal activity CSV: Net moves the balance, pending rows skipped, balance chains", () => {
  const r = read("paypal-activity.csv");
  assert.equal(r.bank, "paypal");
  assert.deepEqual(r.rows.map((x) => x.cents), [9680, 4825, -14505]);
  assert.equal(r.rows[0].desc, "Ann Lee - Website Payment");
  assert.equal(r.problems.filter((p) => !/payment processor/.test(p)).length, 1, "the pending row is reported, not imported");
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Any export with a Status column: pending and declined rows are reported, settled ones kept", () => {
  const r = readStatement([
    "Transaction Date,Transaction Type,Description,Amount,Net Amount,Settlement Date,Status",
    "03/02/2026,Card Purchase,Shell Oil,-45.20,-45.20,03/03/2026,Settled",
    "03/05/2026,Direct Deposit,ACME PAYROLL,2000.00,2000.00,03/05/2026,Settled",
    "03/06/2026,Card Purchase,Pending Cafe,-4.00,-4.00,,Pending",
    "03/07/2026,Card Purchase,Gas Co,-9.00,-9.00,,Declined",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-4520, 200000]);
  assert.equal(r.problems.length, 2);
});

test("Card export whose payment row is just 'Payment' and whose charges are positive", () => {
  const r = readStatement([
    "Transaction Date,Posted Date,Description,Merchant,Card Last Four,Amount,Category,Memo",
    "2026-03-02,2026-03-03,AWS,Amazon Web Services,1234,120.50,Software,",
    "2026-03-04,2026-03-05,GitHub,GitHub,1234,40.00,Software,",
    "2026-03-04,2026-03-05,Notion,Notion,1234,16.00,Software,",
    "2026-03-05,2026-03-06,Payment,Brex,,-5000.00,Payment,",
  ].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-12050, -4000, -1600, 500000]);
});

test("A checking export with an outgoing 'Payment' row is not flipped", () => {
  const r = readStatement(["Date,Description,Amount", "2026-03-02,Payment,-50.00", "2026-03-03,Deposit,400.00", "2026-03-04,Rent,-300.00"].join("\n"));
  assert.deepEqual(r.rows.map((x) => x.cents), [-5000, 40000, -30000]);
});

test("PostFinance: tab-separated, YYYYMMDD dates, 'Value' is the value date not the amount", () => {
  const r = read("postfinance-account.tsv");
  assert.deepEqual(r.rows.map((x) => x.cents), [-4560, 300000]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-03-02", "2026-03-03"]);
  assert.match(r.rows[0].desc, /Migros/);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Nationwide-style export: summary block, quoted £ amounts with thousands commas, newest first", () => {
  const r = read("nationwide-current.csv");
  assert.deepEqual(r.rows.map((x) => x.cents), [-8500, 150000, -2275]);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-04", "2026-10-03", "2026-10-02"]);
  assert.equal(r.rows[0].balance, 120050);
  assert.equal(r.rows[2].balance, -21450);
});

test("Nationwide-style export: the balance chain holds read newest first", () => {
  const c = checkRunningBalance(read("nationwide-current.csv").rows);
  assert.equal(c.checked, true);
  assert.deepEqual(c.breaks, []);
});

test("Dutch banks: ING Af/Bij and Knab CreditDebet markers set the sign", () => {
  // Layouts from the ofxstatement-dutch plugin's tests (rows made up).
  const ing = read("ing-nl.csv");
  assert.deepEqual(ing.rows.map((x) => x.cents), [-1234, 125000]);
  assert.deepEqual(ing.rows.map((x) => x.date), ["2020-02-13", "2020-02-14"]);
  const knab = read("knab-nl.csv");
  assert.deepEqual(knab.rows.map((x) => x.cents), [-702, 500, -123450]);
});

// Small-business neobanks (Relay, Brex, Chime, Bluevine): hand-written from remembered column headings, made-up rows; no real export tried.
test("Relay: Date/Description/Amount/Balance/Account Name is Relay, not Amex; balance chains", () => {
  const r = read("relay-checking.csv");
  assert.equal(r.bank, "relay");
  assert.deepEqual(r.rows.map((x) => x.cents), [482015, -5999, -320000]);
  assert.deepEqual(checkRunningBalance(r.rows).breaks, []);
});

test("Brex: pending rows are reported, settled rows import", () => {
  const r = read("brex-card.csv");
  assert.equal(r.bank, "brex");
  assert.deepEqual(r.rows.map((x) => x.cents), [-2100, 500000]);
  assert.equal(r.problems.length, 1);
});

test("Chime and Bluevine: read by amount or debit/credit columns", () => {
  const c = read("chime-checking.csv");
  assert.equal(c.bank, "chime");
  assert.deepEqual(c.rows.map((x) => x.cents), [150000, -4512]);
  const b = read("bluevine-checking.csv");
  assert.equal(b.bank, "bluevine");
  assert.deepEqual(b.rows.map((x) => x.cents), [250000, -8950]);
  assert.deepEqual(checkRunningBalance(b.rows).breaks, []);
});

test("N26: the German, French and older English exports are named n26 and read", () => {
  for (const [f, desc] of [["n26-de.csv", "Hetzner Online GmbH - Rechnung 4471"], ["n26-fr.csv", "Hetzner Online GmbH Facture 4471"], ["n26-en-old.csv", "Hetzner Online GmbH"]]) {
    const r = read(f);
    assert.equal(r.bank, "n26", f);
    assert.equal(r.rows[0].cents, -2490, f);
    assert.equal(r.rows[0].date, "2026-03-05", f);
    assert.equal(r.rows[0].desc, desc, f);
    assert.deepEqual(r.problems, [], f);
  }
});
