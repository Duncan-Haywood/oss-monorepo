import { test } from "node:test";
import assert from "node:assert/strict";
import { writeOff, lockPeriod, newBooks, importStatement, confirm, parseSplit, suggestRules, addRules, acceptSuggestions, journal, reports, closeChecks, exportJournal, exportLines, status, analyze } from "./engine.mjs";
import { parseCents, parseDate, readStatement, checkRunningBalance } from "./bank.mjs";
import { validateEntry, DEFAULT_ACCOUNTS, parseAccounts } from "./ledger.mjs";
import { payeeKey, suggest, parseRules } from "./categorize.mjs";
import { generateYear, toCsv } from "./eval/synth.mjs";
import { runSeed } from "./eval/benchmark.mjs";

const CHK = `Date,Description,Amount,Balance
2026-01-02,STRIPE TRANSFER ST-1,1000.00,6000.00
2026-01-03,SQ *BLUE BOTTLE 0412 OAKLAND CA,-9.50,5990.50
2026-01-10,CHASE CREDIT CRD AUTOPAY 99,-200.00,5790.50
2026-01-12,ADOBE *CREATIVE CLD 1A,-59.99,5730.51
`;
const CARD = `Transaction Date,Description,Amount
01/05/2026,ADOBE *CREATIVE CLD 2B,59.99
01/11/2026,AUTOMATIC PAYMENT - THANK YOU,-200.00
`;

test("amounts and dates in the shapes banks print", () => {
  assert.equal(parseCents("1,234.56"), 123456);
  assert.equal(parseCents("(12.00)"), -1200);
  assert.equal(parseCents("12.00-"), -1200);
  assert.equal(parseCents("-$5"), -500);
  assert.equal(parseCents("1.234,56", true), 123456);
  assert.equal(parseDate("03/04/2026"), "2026-03-04");
  assert.equal(parseDate("03/04/2026", true), "2026-04-03");
  assert.equal(parseDate("12 Mar 2026"), "2026-03-12");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("12 Mar 26"), "2026-03-12");
  assert.equal(parseDate("3/4/26"), "2026-03-04");
});

test("a preamble row that names a date but no amount is not taken for the header", () => {
  const r = readStatement("Date,Generated 2026-01-31\nDate,Description,Amount\n01/02/2026,A,-10.00\n");
  assert.deepEqual(r.rows.map((x) => x.cents), [-1000]);
  assert.equal(r.problems.length, 0);
});

test("debit and credit columns, and the running balance check catches a missing row", () => {
  const r = readStatement("Posted Date,Payee,Debit,Credit,Balance\n01/02/2026,A,,100.00,100.00\n01/03/2026,B,30.00,,70.00\n01/04/2026,C,5.00,,60.00\n");
  assert.deepEqual(r.rows.map((x) => x.cents), [10000, -3000, -500]);
  const b = checkRunningBalance(r.rows);
  assert.equal(b.breaks.length, 1);
  assert.equal(b.breaks[0].line, 4);
});

test("messy payees normalise to one key", () => {
  assert.equal(payeeKey("SQ *BLUE BOTTLE 0412 OAKLAND CA"), payeeKey("POS DEBIT SQ *BLUE BOTTLE 9981"));
  assert.equal(payeeKey("PURCHASE AUTHORIZED ON 03/14 AMZN MKTP US*2K3AB CARD 4417"), "amzn mktp");
});

test("a card payment from checking pairs into one transfer, not income and expense", () => {
  let b = importStatement(newBooks(), CHK, "1000").books;
  b = importStatement(b, CARD, "2000", { invert: true }).books;
  const pay = b.transactions.filter((t) => t.status === "transfer");
  assert.equal(pay.length, 2);
  const entries = journal(b).filter((e) => e.source === "transfer");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].lines, [{ account: "2000", debit: 20000, credit: 0 }, { account: "1000", debit: 0, credit: 20000 }]);
});

test("re-importing the same statement adds nothing", () => {
  const b = importStatement(newBooks(), CHK, "1000").books;
  const again = importStatement(b, CHK, "1000");
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 4);
});

test("the opening balance comes from the statement and the books reconcile to it once filed", () => {
  let b = importStatement(newBooks(), CHK, "1000").books;
  b = importStatement(b, CARD, "2000", { invert: true }).books;
  assert.equal(b.opening["1000"], 500000);
  b = confirm(b, Object.fromEntries(b.transactions.filter((t) => t.status === "review").map((t) => [t.id, t.cents > 0 ? "4000" : /bottle/i.test(t.desc) ? "6130" : "6060"])));
  const rec = closeChecks(b).filter((c) => c.check === "reconcile");
  assert.equal(rec.length, 1);
  assert.equal(rec[0].severity, "ok", rec[0].message);
  const r = reports(b);
  assert.ok(r.trialBalance.balanced);
  assert.ok(r.balanceSheet.balanced);
  assert.equal(r.profitAndLoss.net, 100000 - 950 - 5999 - 5999);
});

test("a confirmed choice is remembered: the payee posts itself after three", () => {
  let b = newBooks();
  for (let m = 1; m <= 4; m++) {
    const csv = `Date,Description,Amount\n2026-0${m}-15,FIGMA ${m}X MONTHLY SF,-45.00\n`;
    b = importStatement(b, csv, "2000").books;
    const t = b.transactions.at(-1);
    if (m <= 3) { assert.equal(t.status, "review", `month ${m}`); b = confirm(b, { [t.id]: "6060" }); }
    else { assert.equal(t.status, "auto"); assert.equal(t.posted, "6060"); assert.equal(t.suggestion.source, "memory"); }
  }
});

test("your rules win and name themselves; a rule to an unknown account is reported", () => {
  const { rules, problems } = parseRules("blue bottle => Meals\n/adobe/ => 6060\nzzz => 7777", DEFAULT_ACCOUNTS);
  assert.equal(rules.length, 2);
  assert.match(problems[0], /no account "7777"/);
  const s = suggest({ desc: "SQ *BLUE BOTTLE", cents: -950 }, { rules, codes: new Set(DEFAULT_ACCOUNTS.map((a) => a.code)) });
  assert.equal(s.account, "6130");
  assert.equal(s.source, "rule");
});

test("an unbalanced entry is refused", () => {
  assert.match(validateEntry({ date: "2026-01-01", lines: [{ account: "1000", debit: 100, credit: 0 }, { account: "6060", debit: 0, credit: 99 }] }, DEFAULT_ACCOUNTS).join(), /do not equal/);
});

test("a custom chart of accounts reads from CSV", () => {
  const { accounts, problems } = parseAccounts("code,name,type,bank\n1001,Operating,asset,yes\n4010,Design fees,income\n5x,Bad,thing");
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].bank, true);
  assert.equal(problems.length, 1);
});

test("exports: QuickBooks Online, Xero and IIF lines sum to zero per entry", () => {
  let b = importStatement(newBooks(), CHK, "1000").books;
  b = acceptSuggestions(b, 0.5);
  const qbo = exportJournal(b, "qbo").trim().split("\n");
  assert.match(qbo[0], /^\*JournalNo,\*JournalDate,\*AccountName,Debits,Credits/);
  const xero = exportJournal(b, "xero").trim().split("\n").slice(1);
  const byNarr = new Map();
  for (const l of xero) { const cells = l.split(","); const amt = Math.round(+cells.at(-1) * 100); byNarr.set(cells[1] + cells[0], (byNarr.get(cells[1] + cells[0]) ?? 0) + amt); }
  for (const v of byNarr.values()) assert.equal(v, 0);
  assert.match(exportJournal(b, "iif"), /^!TRNS/);
  assert.match(exportLines(b), /^date,bank_account,description,amount,status/);
});

test("the agent entry point runs the example and every entry balances", () => {
  const r = analyze({ example: true });
  assert.ok(r.status.lines > 100);
  assert.ok(r.status.transfer >= 2);
  for (const e of journal(r.books)) assert.deepEqual(validateEntry(e, r.books.accounts), []);
  assert.ok(r.reports.balanceSheet.balanced);
});

test("synthetic CSV round trip keeps every line", () => {
  const lines = generateYear({ seed: 3, months: 2 });
  let b = importStatement(newBooks(), toCsv(lines, "checking"), "1000").books;
  b = importStatement(b, toCsv(lines, "card"), "2000", { invert: true }).books;
  assert.equal(status(b).lines, lines.length);
});

// The benchmark in the README is reproducible; pin its headline on one seed.
test("learning curve: by the fourth month most lines post alone and almost none wrongly", () => {
  const months = runSeed(1);
  const late = months.slice(3);
  const lines = late.reduce((a, r) => a + r.lines, 0), auto = late.reduce((a, r) => a + r.auto, 0), wrong = late.reduce((a, r) => a + r.autoWrong, 0);
  assert.ok(auto / lines > 0.5, `posted alone ${auto}/${lines}`);
  assert.ok(wrong / auto < 0.01, `wrong ${wrong}/${auto}`);
  assert.equal(months[0].auto, 0);
});

// The guide page quotes these figures; they come from the example filed with
// every line's true account.
test("the guide's worked example figures", () => {
  const lines = generateYear({ seed: 7, year: 2026, months: 3, oneOffPerMonth: 4 });
  let b = analyze({ example: true }).books;
  const pool = new Map();
  for (const l of lines) { const k = `${l.account === "checking" ? "1000" : "2000"}|${l.date}|${l.cents}|${l.desc.trim().replace(/\s+/g, " ")}`; pool.set(k, [...(pool.get(k) ?? []), l.truth]); }
  const choices = {};
  for (const t of b.transactions) if (t.status !== "transfer") choices[t.id] = pool.get(`${t.account}|${t.date}|${t.cents}|${t.desc}`).shift();
  b = confirm(b, choices);
  const { profitAndLoss: p, balanceSheet: bs } = reports(b);
  assert.equal(p.totalIncome, 3902152);
  assert.equal(p.totalExpense, 3095859);
  assert.equal(p.net, 806293);
  const cardPaid = b.transactions.filter((t) => t.status === "transfer" && t.account === "1000").reduce((a, t) => a - t.cents, 0);
  const draws = b.transactions.filter((t) => t.posted === "3100").reduce((a, t) => a - t.cents, 0);
  assert.equal(cardPaid, 460860);
  assert.equal(draws, 963044);
  assert.equal(p.net - cardPaid - draws, -617611);
  assert.ok(bs.balanced);
  const c = closeChecks(b);
  assert.ok(c.some((x) => x.check === "reconcile" && x.severity === "ok" && /10,947\.46/.test(x.message)));
  assert.deepEqual(c.filter((x) => x.check === "liability").map((x) => x.message.match(/is (-[\d,.]+)/)[1]), ["-1,197.16", "-1,230.00"]);
});

const PAYOUT = `Date,Description,Amount,Balance
2026-02-01,STRIPE PAYOUT 970,970.00,970.00
2026-02-05,LOAN PMT ACME BANK,-1000.00,-30.00
`;

test("a Stripe payout splits into gross sales less fees, and posts one balanced entry", () => {
  let b = importStatement(newBooks(), PAYOUT, "1000").books;
  const id = b.transactions[0].id;
  b = confirm(b, { [id]: parseSplit("4000:1000.00, 6010:-30.00") });
  const e = journal(b).find((x) => x.id === id);
  assert.equal(e.source, "split");
  assert.deepEqual(e.lines, [{ account: "1000", debit: 97000, credit: 0 }, { account: "4000", debit: 0, credit: 100000 }, { account: "6010", debit: 3000, credit: 0 }]);
  assert.deepEqual(validateEntry(e, b.accounts), []);
  const r = reports(b);
  assert.equal(r.profitAndLoss.totalIncome, 100000);
  assert.equal(r.profitAndLoss.totalExpense, 3000);
  assert.equal(b.history.length, 0, "splits are not learned from");
});

test("a loan payment splits into principal and interest; the open part takes the remainder", () => {
  let b = importStatement(newBooks(), PAYOUT, "1000").books;
  const id = b.transactions[1].id;
  b = confirm(b, { [id]: parseSplit("6040:-200.00,2200") });
  const e = journal(b).find((x) => x.id === id);
  assert.deepEqual(e.lines, [{ account: "1000", debit: 0, credit: 100000 }, { account: "6040", debit: 20000, credit: 0 }, { account: "2200", debit: 80000, credit: 0 }]);
  assert.deepEqual(validateEntry(e, b.accounts), []);
  assert.equal(exportLines(b).includes("split"), true);
});

test("a split that does not add up to the line is refused, and a later plain choice undoes a split", () => {
  let b = importStatement(newBooks(), PAYOUT, "1000").books;
  const id = b.transactions[0].id;
  assert.throws(() => confirm(b, { [id]: parseSplit("4000:1000.00,6010:-20.00") }), /add to/);
  assert.throws(() => confirm(b, { [id]: [{ account: "4000", cents: 97000 }] }), /at least two/);
  assert.throws(() => confirm(b, { [id]: parseSplit("4000,6010") }), /only one part/);
  assert.throws(() => confirm(b, { [id]: parseSplit("4000:970.00,6010:0") }), /non-zero|remainder/);
  b = confirm(b, { [id]: parseSplit("4000:1000.00,6010:-30.00") });
  assert.equal(status(b).split, 1);
  b = confirm(b, { [id]: "4000" });
  assert.equal(b.transactions[0].split, undefined);
  assert.equal(status(b).confirmed, 1);
  assert.equal(journal(b).find((x) => x.id === id).lines.length, 2);
});

test("the loan check and the QuickBooks export see every leg of a split", () => {
  let b = importStatement(newBooks(), PAYOUT, "1000").books;
  b = confirm(b, { [b.transactions[1].id]: parseSplit("6040:-200.00,2200") });
  assert.ok(closeChecks(b).some((c) => c.check === "liability" && c.ids.includes(b.transactions[1].id)));
  const qbo = exportJournal(b, "qbo").trim().split("\n").slice(1);
  assert.equal(qbo.length, 3);
});

test("payees filed the same way repeatedly are offered as rules, once, and not when a rule exists", () => {
  const rows = ["Date,Description,Amount"];
  for (let i = 1; i <= 4; i++) rows.push(`2026-03-0${i},ZOOM.US 88${i},-15.99`);
  rows.push("2026-03-09,OAKLAND DINER 11,-20.00", "2026-03-10,OAKLAND DINER 12,-22.00");
  let b = importStatement(newBooks(), rows.join("\n") + "\n", "1000").books;
  const choices = {};
  for (const t of b.transactions) choices[t.id] = /ZOOM/.test(t.desc) ? "6060" : "6130";
  b = confirm(b, choices);
  const s = suggestRules(b);
  assert.deepEqual(s.map((r) => r.rule), ["zoom => 6060"]);
  assert.equal(s[0].count, 4);
  b = addRules(b, s.map((r) => r.rule));
  assert.match(b.rules, /zoom => 6060/);
  assert.deepEqual(suggestRules(b), []);
  assert.equal(addRules(b, ["zoom => 6060"]).rules, b.rules);
});

// Accruals: invoices and bills.
import { addDocuments, aging } from "./engine.mjs";
import { parseDocuments, settle } from "./accruals.mjs";

const DOCS = `type,number,date,due,party,amount,account
invoice,1042,2026-01-05,2026-02-04,Acme Design Co,1500.00,4000
invoice,1043,2026-01-20,2026-02-19,Birch Studio,800.00,4000
invoice,1043,2026-01-20,2026-02-19,Birch Studio,64.00,2100
bill,77,2026-01-10,2026-01-25,Paper Supply Inc,230.00,6100
`;
const PAID = `Date,Description,Amount
2026-02-01,ACH CREDIT ACME DESIGN CO INV 1042,1500.00
2026-02-10,DEPOSIT,864.00
2026-02-15,CHECK 2231,-230.00
`;
const accrual = () => addDocuments(importStatement(newBooks(), PAID, "1000").books, DOCS);

test("rows with one number are one document with a line each; bad rows are reported", () => {
  const r = parseDocuments(DOCS + "invoice,9,2026-13-40,,X,5.00,4000\nbill,10,2026-01-01,,Y,-5.00,6100\n");
  assert.equal(r.documents.length, 3);
  assert.equal(r.documents.find((d) => d.id === "INV-1043").total, 86400);
  assert.equal(r.problems.length, 2);
});

test("an invoice is income on its own date, before any money arrives", () => {
  const r = addDocuments(newBooks(), DOCS);
  assert.equal(r.added, 3);
  const pl = reports(r.books).profitAndLoss;
  assert.equal(pl.totalIncome, 230000);
  assert.equal(pl.totalExpense, 23000);
  const bs = reports(r.books).balanceSheet;
  assert.equal(bs.balanced, true);
  assert.equal(addDocuments(r.books, DOCS).added, 0);
});

test("a payment with the invoice number or party name settles it; an amount alone only suggests", () => {
  const { books } = accrual();
  const by = (d) => books.transactions.find((t) => t.desc.includes(d));
  assert.equal(by("ACME").status, "settled");
  assert.equal(by("ACME").posted, "1100");
  assert.equal(books.documents.find((d) => d.id === "INV-1042").settledBy, by("ACME").id);
  assert.equal(by("DEPOSIT").status, "review");
  assert.equal(by("DEPOSIT").suggestion.account, "1100");
  assert.equal(by("DEPOSIT").suggestion.confidence, 0.6);
  assert.equal(aging(books, "2026-02-28").receivable.total, 86400);
});

test("accepting the suggestions clears receivable and payable, and the control check agrees", () => {
  let { books } = accrual();
  books = confirm(books, Object.fromEntries(books.transactions.filter((t) => t.status === "review").map((t) => [t.id, t.suggestion.account])));
  assert.equal(books.documents.every((d) => d.settledBy), true);
  const bs = reports(books).balanceSheet;
  assert.equal(bs.balanced, true);
  assert.equal(aging(books).receivable.total + aging(books).payable.total, 0);
  assert.equal(closeChecks(books).some((c) => c.check === "control" || c.check === "overdue"), false);
  // Revenue is booked once: in January by invoice, not again in February by the deposit.
  assert.equal(reports(books).profitAndLoss.totalIncome, 230000);
});

test("filing a settled line elsewhere un-settles the document; open items are aged and flagged", () => {
  let { books } = accrual();
  const t = books.transactions.find((x) => x.desc.includes("ACME"));
  books = confirm(books, { [t.id]: "4100" });
  assert.equal(books.transactions.find((x) => x.id === t.id).status, "confirmed");
  assert.equal(books.documents.find((d) => d.id === "INV-1042").settledBy, undefined);
  const a = aging(books, "2026-05-01");
  assert.equal(a.receivable.byBucket[3], 150000 + 86400);
  assert.ok(closeChecks(books, { asOf: "2026-05-01" }).some((c) => c.check === "overdue"));
});

test("analyze takes documents and returns the aging", () => {
  const r = analyze({ statements: [{ csv: PAID, account: "1000" }], documents: [{ csv: DOCS }] });
  assert.equal(r.aging.receivable.total, 86400);
  assert.equal(r.status.settled, 1);
});

test("ablation: switching a layer off removes its suggestions, and without memory nothing posts alone", () => {
  const full = runSeed(1).slice(3), noMem = runSeed(1, undefined, { skipLayers: ["memory"] }).slice(3);
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  assert.ok(sum(full, "auto") > 0);
  assert.equal(sum(noMem, "auto"), 0);
  assert.equal(sum(noMem.map((r) => ({ n: r.bySource.memory?.n ?? 0 })), "n"), 0);
  const none = runSeed(1, undefined, { skipLayers: ["memory", "learned", "built-in"] }).slice(3);
  assert.equal(sum(none, "suggested"), 0);
});

// Part-payments and credit notes against a document.
const DOCS2 = `type,number,date,due,party,amount,account,against
invoice,2001,2026-01-05,2026-02-04,Acme Design Co,1000.00,4000,
invoice,2002,2026-01-06,2026-02-05,Acme Design Co,500.00,4000,
credit note,C1,2026-01-20,,Acme Design Co,100.00,4000,2002
bill,90,2026-01-10,2026-01-25,Paper Supply Inc,300.00,6100,
vendor credit,V1,2026-01-15,,Paper Supply Inc,50.00,6100,
`;
const INSTAL = `Date,Description,Amount
2026-02-01,ACH ACME INV 2001 PART 1,600.00
2026-02-20,ACH ACME INV 2001 FINAL,400.00
2026-02-22,ACH ACME 2002,400.00
2026-02-25,CHECK PAPER SUPPLY INC,-100.00
`;
const inst = () => addDocuments(importStatement(newBooks(), INSTAL, "1000").books, DOCS2);

test("a credit note reduces the invoice it names; the payment expected is net of it", () => {
  const { books } = inst();
  const inv = books.documents.find((d) => d.id === "INV-2002");
  assert.equal(inv.credited, 10000);
  assert.equal(books.documents.find((d) => d.id === "CN-C1").applied, 10000);
  assert.equal(books.transactions.find((t) => t.desc.includes("2002")).status, "settled");
  assert.equal(inv.settledBy, books.transactions.find((t) => t.desc.includes("2002")).id);
});

test("instalments are part-payments until the balance reaches zero", () => {
  const { books } = inst();
  const part = books.transactions.find((t) => t.desc.includes("PART 1"));
  assert.equal(part.status, "settled");
  assert.equal(part.partial, true);
  const inv = books.documents.find((d) => d.id === "INV-2001");
  assert.equal(inv.payments.length, 2);
  assert.equal(inv.settledBy, books.transactions.find((t) => t.desc.includes("FINAL")).id);
  assert.equal(aging(books, "2026-02-28").receivable.total, 0);
  const half = { ...books, transactions: books.transactions.filter((t) => !t.desc.includes("FINAL")) };
  const a = aging(settle(half), "2026-02-28");
  assert.equal(a.open.find((d) => d.id === "INV-2001").total, 40000);
  assert.equal(a.open.find((d) => d.id === "INV-2001").partlyPaid, true);
});

test("a vendor credit and a part-payment leave the bill and the control check consistent", () => {
  const { books } = inst();
  const a = aging(books);
  assert.equal(a.payable.total, 15000);
  assert.equal(a.open.find((d) => d.id === "BILL-90").total, 20000);
  assert.equal(a.open.find((d) => d.id === "BILL-90").partlyPaid, true);
  assert.equal(books.documents.find((d) => d.id === "VC-V1").applied, undefined, "a vendor credit with no 'against' stays unapplied");
  assert.equal(a.open.find((d) => d.id === "VC-V1").total, -5000);
  assert.equal(reports(books).balanceSheet.balanced, true);
  assert.equal(closeChecks(books).some((c) => c.check === "control"), false);
  assert.equal(reports(books).profitAndLoss.totalIncome, 140000);
  assert.equal(reports(books).profitAndLoss.totalExpense, 25000);
});

// One payment across several documents, and the sales tax report.
import { salesTax } from "./engine.mjs";
const DOCS3 = `type,number,date,due,party,amount,account
invoice,3001,2026-01-05,2026-02-04,Acme Design Co,1000.00,4000
invoice,3001,2026-01-05,2026-02-04,Acme Design Co,80.00,2100
invoice,3002,2026-01-12,2026-02-11,Acme Design Co,500.00,4000
invoice,3003,2026-01-14,2026-02-13,Acme Design Co,250.00,4000
invoice,3004,2026-01-15,2026-02-14,Birch Studio,500.00,4000
credit note,C9,2026-02-01,,Acme Design Co,40.00,4000
`;
const BUNDLE = `Date,Description,Amount
2026-02-10,ACH ACME DESIGN CO INV 3001 3003,1330.00
2026-02-11,ACH BIRCH STUDIO,500.00
2026-04-20,STATE TAX BOARD SALES TAX,-80.00
`;
const bundled = () => addDocuments(importStatement(newBooks(), BUNDLE, "1000").books, DOCS3);

test("one bank line that adds up to several documents of one party settles them all", () => {
  const { books } = bundled();
  const t = books.transactions.find((x) => x.desc.includes("3001 3003"));
  assert.equal(t.status, "settled");
  assert.deepEqual(t.docs, ["INV-3001", "INV-3003"]);
  assert.equal(books.documents.find((d) => d.id === "INV-3001").settledBy, t.id);
  assert.equal(books.documents.find((d) => d.id === "INV-3002").settledBy, undefined, "the invoice not named stays open");
  assert.equal(reports(books).balanceSheet.balanced, true);
  assert.equal(aging(books, "2026-02-28").receivable.total, 46000);
});

test("a bundle that two different sets of documents could make is left in review", () => {
  const twin = DOCS3.replace("invoice,3003,2026-01-14,2026-02-13,Acme Design Co,250.00,4000", "invoice,3003,2026-01-14,2026-02-13,Acme Design Co,250.00,4000\ninvoice,3005,2026-01-16,2026-02-15,Acme Design Co,250.00,4000\ninvoice,3006,2026-01-16,2026-02-15,Acme Design Co,1080.00,4000");
  const { books } = addDocuments(importStatement(newBooks(), "Date,Description,Amount\n2026-02-10,ACH ACME DESIGN CO,1330.00\n", "1000").books, twin);
  assert.notEqual(books.transactions[0].status, "settled");
});

test("sales tax is collected on invoices, taken off by credit notes and paid over by bank lines", () => {
  let { books } = bundled();
  books = confirm(books, { [books.transactions.find((x) => x.desc.includes("STATE TAX")).id]: "2100" });
  const t = salesTax(books);
  assert.equal(t.totals.collected, 8000);
  assert.equal(t.totals.remitted, 8000);
  assert.equal(t.owed, 0);
  assert.equal(t.months.find((m) => m.month === "2026-04").remitted, 8000);
  assert.equal(t.invoices[0].rate, 0.08);
  assert.equal(salesTax(books, { to: "2026-03-31" }).owed, 8000);
});

// Red-team guards (2026-10-21): boundaries of the matching window, the aging
// buckets, the as-of day and the document columns.
const withDocs = (docs, stmt) => addDocuments(importStatement(newBooks(), stmt, "1000").books, docs).books;

test("a payment matches up to 180 days after the document, not 181", () => {
  const docs = "type,number,date,due,party,amount,account\ninvoice,5,2026-01-01,,Zed Ltd,100.00,4000\n";
  const on = withDocs(docs, "Date,Description,Amount\n2026-06-30,ZED LTD INV 5,100.00\n");
  assert.equal(on.transactions[0].status, "settled");
  const after = withDocs(docs, "Date,Description,Amount\n2026-07-01,ZED LTD INV 5,100.00\n");
  assert.notEqual(after.transactions[0].status, "settled");
});

test("aging buckets split on the day: due today is current, 30 days late is 1-30, 31 is 31-60", () => {
  const docs = "type,number,date,due,party,amount,account\n" +
    ["a,2026-01-01,2026-03-01", "b,2026-01-01,2026-02-01", "c,2026-01-01,2026-01-30", "d,2026-01-01,2026-01-29", "e,2026-01-01,2025-12-30", "f,2026-01-01,2025-11-30"]
      .map((s) => { const [n, dt, du] = s.split(","); return `invoice,${n},${dt},${du},P${n},10.00,4000`; }).join("\n") + "\n";
  const a = aging(withDocs(docs, "Date,Description,Amount\n2026-01-01,X,1.00\n"), "2026-03-01");
  const bucket = (n) => a.open.find((d) => d.id === `INV-${n}`).bucket;
  assert.deepEqual(["a", "b", "c", "d", "e", "f"].map(bucket), ["current", "1-30", "1-30", "31-60", "61-90", "90+"]);
  assert.equal(a.open.find((d) => d.id === "INV-a").daysLate, 0);
  assert.equal(a.open.find((d) => d.id === "INV-c").daysLate, 30);
  assert.equal(a.open.find((d) => d.id === "INV-a").partlyPaid, undefined, "an unpaid invoice is not part-paid");
});

test("a document dated on the as-of day is counted, one dated after is not", () => {
  const docs = "type,number,date,due,party,amount,account\ninvoice,1,2026-03-01,,A Co,10.00,4000\ninvoice,2,2026-03-02,,B Co,20.00,4000\n";
  const a = aging(withDocs(docs, "Date,Description,Amount\n2026-01-01,X,1.00\n"), "2026-03-01");
  assert.equal(a.receivable.total, 1000);
});

test("the credit-note 'against' column may be the first column", () => {
  const docs = "against,type,number,date,party,amount,account\n,invoice,7,2026-01-01,Q Co,100.00,4000\n7,credit note,C7,2026-01-05,Q Co,40.00,4000\n";
  const r = parseDocuments(docs);
  assert.equal(r.problems.length, 0);
  assert.equal(r.documents.find((d) => d.credit).against, "7");
});

test("a one-cent part-payment counts, and a zero line never settles a paid document", () => {
  const docs = "type,number,date,due,party,amount,account\ninvoice,8,2026-01-01,,Kay Co,10.00,4000\n";
  const one = withDocs(docs, "Date,Description,Amount\n2026-01-05,KAY CO INV 8,0.01\n");
  assert.equal(one.transactions[0].status, "settled");
  assert.equal(one.transactions[0].partial, true);
  const paid = withDocs(docs, "Date,Description,Amount\n2026-01-05,KAY CO INV 8,10.00\n2026-01-06,KAY CO INV 8,0.00\n");
  assert.equal(paid.transactions.filter((t) => t.status === "settled").length, 1);
});

test("a second credit note against an already-credited invoice applies nothing", () => {
  const docs = "type,number,date,due,party,amount,account,against\ninvoice,9,2026-01-01,,R Co,50.00,4000,\ncredit note,C1,2026-01-02,,R Co,50.00,4000,9\ncredit note,C2,2026-01-03,,R Co,20.00,4000,9\n";
  const books = withDocs(docs, "Date,Description,Amount\n2026-01-01,X,1.00\n");
  assert.equal(books.documents.find((d) => d.id === "CN-C1").applied, 5000);
  assert.equal(books.documents.find((d) => d.id === "CN-C2").applied, undefined);
});

// Refunding a credit note, and writing off a bad debt.
const DOCS4 = `type,number,date,due,party,amount,account,against
invoice,4001,2026-03-01,2026-03-31,Dune Dental,900.00,4000,
credit note,C9,2026-03-10,,Elm Events,250.00,4000,
vendor credit,V9,2026-03-12,,Paper Supply Inc,80.00,6100,
`;
const refunds = (stmt) => addDocuments(importStatement(newBooks(), stmt, "1000").books, DOCS4).books;

test("a bank line that pays back an unapplied credit note settles it", () => {
  const b = refunds(`Date,Description,Amount\n2026-03-20,CHECK ELM EVENTS REFUND C9,-250.00\n2026-03-25,PAPER SUPPLY INC REFUND,80.00\n`);
  assert.equal(b.transactions[0].status, "settled");
  assert.equal(b.transactions[0].posted, "1100");
  assert.equal(b.transactions[1].posted, "2050");
  const a = aging(b, "2026-03-31");
  assert.equal(a.open.filter((d) => d.credit).length, 0);
  assert.equal(a.receivable.total, 90000);
  assert.equal(closeChecks(b).filter((c) => c.check === "control").length, 0);
});

test("a refund of the wrong amount leaves the credit open", () => {
  const b = refunds(`Date,Description,Amount\n2026-03-20,CHECK ELM EVENTS REFUND,-200.00\n`);
  assert.notEqual(b.transactions[0].status, "settled");
  assert.equal(aging(b, "2026-03-31").open.filter((d) => d.credit).length, 2);
});

test("writing off an invoice moves its balance to bad debts and out of aging", () => {
  const b = refunds(`Date,Description,Amount\n2026-03-05,ACH DUNE DENTAL INV 4001 PART,300.00\n`);
  const { books, cents } = writeOff(b, "4001", { date: "2026-06-30" });
  assert.equal(cents, 60000);
  assert.equal(aging(books, "2026-06-30").open.filter((d) => d.id === "INV-4001").length, 0);
  assert.equal(reports(books).profitAndLoss.totalExpense, 60000 - 8000); // 600.00 bad debt less the 80.00 vendor credit
  assert.equal(closeChecks(books).filter((c) => c.check === "control").length, 0);
  assert.throws(() => writeOff(books, "4001"), /nothing owing/);
  assert.throws(() => writeOff(books, "C9"), /only an invoice/);
});

test("the five major US export shapes read to the same rows, signs and balances", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f, o) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"), o);
  const checking = { "chase-checking.csv": "chase-checking", "bofa-checking.csv": "bank-of-america", "wells-fargo-checking.csv": "wells-fargo" };
  for (const [f, bank] of Object.entries(checking)) {
    const r = read(f);
    assert.equal(r.bank, bank, f);
    assert.deepEqual(r.problems, [], f);
    assert.deepEqual(r.rows.map((x) => x.cents), [420000, -5999, -85000, ...(bank === "chase-checking" ? [-30000] : [])], f);
    assert.equal(r.rows[0].date, "2026-03-02", f);
  }
  // Chase and Bank of America print a running balance; both reconcile, and BofA's "Beginning balance" row is not a transaction.
  assert.deepEqual(checkRunningBalance(read("chase-checking.csv").rows).breaks, []);
  const bofa = checkRunningBalance(read("bofa-checking.csv").rows);
  assert.equal(bofa.breaks.length, 0);
  assert.equal(bofa.closing, 829001);
  // Cards: Amex lists charges positive, Chase negative, Capital One in Debit/Credit columns; all read to the same signs.
  const cards = ["amex-card.csv", "chase-card.csv", "capital-one-card.csv"].map((f) => read(f));
  assert.deepEqual(cards.map((c) => c.bank), ["amex", "chase-card", "capital-one"]);
  for (const c of cards) assert.deepEqual(c.rows.map((x) => x.cents), [30000, -5999, -2340], c.bank);
  assert.ok(cards[0].inferred, "Amex flip is reported");
  assert.equal(cards[1].inferred, null);
  // An explicit invert still wins over inference.
  assert.deepEqual(read("amex-card.csv", { invert: false }).rows.map((x) => x.cents), [-30000, 5999, 2340]);
});

test("a locked period refuses imports, re-filing, documents and write-offs", () => {
  const csv = "Date,Description,Amount\n2026-01-05,ACME SUPPLIES,-40.00\n2026-02-05,ACME SUPPLIES,-50.00\n";
  let b = importStatement(newBooks(), csv, "1000").books;
  assert.throws(() => lockPeriod(b, "2026-01-31"), /still need an account/);
  b = confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, "6010"])));
  assert.throws(() => lockPeriod(b, "Jan 31"), /YYYY-MM-DD/);
  b = lockPeriod(b, "2026-01-31");
  assert.equal(b.lockedThrough, "2026-01-31");
  assert.throws(() => lockPeriod(b, "2026-01-15"), /unlock first/);
  const jan = b.transactions.find((t) => t.date === "2026-01-05");
  assert.throws(() => confirm(b, { [jan.id]: "6020" }), /locked through 2026-01-31/);
  const feb = b.transactions.find((t) => t.date === "2026-02-05");
  assert.doesNotThrow(() => confirm(b, { [feb.id]: "6020" }));
  const again = importStatement(newBooks({}), csv, "1000").books;
  const r = importStatement({ ...again, transactions: [], lockedThrough: "2026-01-31" }, csv, "1000");
  assert.equal(r.added, 1);
  assert.ok(r.problems.some((p) => /locked/.test(p)));
  const docs = addDocuments(b, "type,number,date,due,party,amount,account\ninvoice,1,2026-01-10,2026-02-10,Acme,100.00,4000\ninvoice,2,2026-02-10,2026-03-10,Acme,100.00,4000\n");
  assert.equal(docs.added, 1);
  assert.ok(docs.problems.some((p) => /locked/.test(p)));
  assert.throws(() => writeOff(docs.books, "2", { date: "2026-01-20" }), /locked/);
  assert.equal(lockPeriod(b, null).lockedThrough, undefined);
});

test("OFX (SGML and XML), QFX and QIF read to the same rows and signs as the CSV shapes", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (f, o) => readStatement(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"), o);
  const ofx = read("checking.ofx");
  assert.equal(ofx.bank, "ofx");
  assert.deepEqual(ofx.problems, []);
  assert.deepEqual(ofx.rows.map((r) => r.cents), [420000, -5999, -85000, -300000]);
  assert.deepEqual(ofx.rows.map((r) => r.date), ["2026-03-02", "2026-03-05", "2026-03-10", "2026-03-15"]);
  assert.equal(ofx.rows[0].desc, "CLIENT PAYMENT ACME INV 1042");
  assert.equal(ofx.rows[1].desc, "ADOBE & CREATIVE CLOUD");
  assert.equal(ofx.rows[2].desc, "LANDLORD LLC CHECK 1007");
  assert.deepEqual(ofx.statement, { cents: 29001, date: "2026-03-31" });
  const qfx = read("card.qfx");
  assert.deepEqual(qfx.rows.map((r) => r.cents), [-2340, -30000, 300000]);
  assert.deepEqual(qfx.statement, { cents: -32340, date: "2026-03-31" });
  const qif = read("checking.qif");
  assert.equal(qif.bank, "qif");
  assert.deepEqual(qif.rows.map((r) => [r.date, r.cents]), [["2026-03-02", 420000], ["2026-03-05", -5999], ["2026-03-10", -85000]]);
  assert.equal(qif.rows[2].desc, "LANDLORD LLC CHECK 1007");
  assert.deepEqual(read("checking.ofx", { invert: true }).rows.map((r) => r.cents), [-420000, 5999, 85000, 300000]);
  assert.match(readStatement("<OFX></OFX>").problems[0], /No transactions/);
  assert.match(readStatement("<OFX><STMTTRN><DTPOSTED>2026<TRNAMT>1</STMTTRN></OFX>").problems[0], /date/);
});

test("importing OFX keeps the bank's closing balance and reconciles the books to it", async () => {
  const { readFileSync } = await import("node:fs");
  const f = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
  let b = newBooks();
  b.opening["1000"] = 0;
  let r = importStatement(b, f("checking.ofx"), "1000");
  assert.equal(r.added, 4);
  assert.deepEqual(r.books.statements["1000"], { closing: 29001, closingDate: "2026-03-31" });
  // Re-importing the same file, or the same lines from the QIF, adds nothing.
  assert.equal(importStatement(r.books, f("checking.ofx"), "1000").added, 0);
  assert.equal(importStatement(r.books, f("checking.qif"), "1000").added, 0);
  const c = importStatement(r.books, f("card.qfx"), "2000");
  assert.equal(c.added, 3);
  assert.deepEqual(c.books.statements["2000"], { closing: -32340, closingDate: "2026-03-31" });
  // The 3,000 payment is paired as a transfer between the two imported accounts.
  assert.ok(c.books.transactions.filter((t) => t.status === "transfer").length >= 2);
});
