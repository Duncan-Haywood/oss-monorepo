#!/usr/bin/env node
// AI Bookkeeper from a terminal. The books live in one JSON file you name with
// --books; every command reads it and, if it changed anything, writes it back.
//
//   node cli.mjs --books books.json import checking.csv --account 1000
//   node cli.mjs --books books.json import card.csv --account 2000 --invert
//   node cli.mjs --books books.json review
//   node cli.mjs --books books.json confirm <id>=6060 <id>=6130
//   node cli.mjs --books books.json accept 0.7
//   node cli.mjs --books books.json ai            (LLM_PROVIDER / ANTHROPIC_API_KEY / OLLAMA ...)
//   node cli.mjs --books books.json report [--from 2026-01-01] [--to 2026-03-31] [--json]
//   node cli.mjs --books books.json checks
//   node cli.mjs --books books.json documents invoices-and-bills.csv
//   node cli.mjs --books books.json aging
//   node cli.mjs --books books.json export qbo|xero|iif|ledger|beancount|csv|lines > journal.csv
//   node cli.mjs --example report
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { addLoan, addLoanExtra, applyLoanPayments, checkLenderSchedule, loanRegister, loanSchedule } from "./loans.mjs";
import { salesTaxReturn, parseRateSpecs, parseDiscountSpecs, stateDiscounts, stateDueDay, stateEndMonth, stateFilingNote } from "./salestaxreturn.mjs";
import { gstReturn } from "./gstreturn.mjs";
import { newBooks, importStatement, importOfxAccounts, importCsvAccounts, importQifAccounts, lockPeriod, closeYear, reopenYear, yearEndReport, categorize, suggestRules, addRules, addDocuments, addAsset, disposeAsset, addAssetsCsv, register, addPrepaid, prepaidRegister, addInventoryMove, addLandedCost, addInventoryWritedown, setInventoryMethod, inventoryRegister, writeOff, aging, salesTax, vatReturn, confirm, parseSplit, acceptSuggestions, reports, closeChecks, exportJournal, addFxAccount, setRates, parseRates, fxRegister, exportLines, status, analyze, fmt, taxableBusinessIncome, s179Carryforward } from "./engine.mjs";
import { parseCents } from "./bank.mjs";
import { accountMap } from "./ledger.mjs";
import { estimatedTax, taxTableOptions } from "./estimatedtax.mjs";
import { annualizedInstallments } from "./annualized.mjs";
import { taxCalendar, toIcs } from "./calendar.mjs";
import { scorpFromBooks } from "./scorp.mjs";
import { retirementLimits } from "./retirement.mjs";
import { addProject, tagProject as tagProjectLines, projectReport, projectCsv, projectMoney } from "./projects.mjs";
import { addRentalAccounts, addProperty, tagProperty, scheduleE, scheduleECsv } from "./rental.mjs";
import { bNoticeDates, seSetAside, selfEmployment, scheduleC, scheduleCCsv, contractors1099, contractors1099Csv, nec1099FilingCsv, markW9, mergePayees } from "./taxforms.mjs";
import { setOpeningBalances, clearOpeningBalances } from "./opening.mjs";
import { importChart, importTrialBalance } from "./migrate.mjs";
import { sniffFormat, splitOfx, splitQif, readStatement } from "./bank.mjs";
import { detectRecurring, forecastCash } from "./recurring.mjs";
import { findAnomalies } from "./anomalies.mjs";
import { payeeReport } from "./payees.mjs";
import { receiptTextFromFile, statementTextFromFile } from "./ocr.mjs";
import { addReceipts, attachReceipt, removeReceipt, receiptReport, taxOnReceipts, planReceiptSplit, splitFromReceipt } from "./receipts.mjs";
import { compareProfit } from "./compare.mjs";
import { cashBasis } from "./cashbasis.mjs";
import { addTrip, removeTrip, setHomeOffice, mileageDeduction } from "./deductions.mjs";
import { setBudget, budgetVsActual } from "./budget.mjs";
import { reconcile } from "./reconcile.mjs";
import { depositSchedule } from "./deposits.mjs";
import { addPayroll, planPayroll, applyPayroll, payrollSummary, form941, form940, w2Summary, reconcile941W2, employerCost } from "./payroll.mjs";
import { readPayoutReport, planPayouts, applyPayouts } from "./payouts.mjs";
import { reconcile1099K, reportable1099K, defaultProcessor } from "./form1099k.mjs";
import { setTaxTreatment, taxDepreciation } from "./taxdepr.mjs";
import { renderInvoice, setProfile, PROFILE_KEYS } from "./invoice.mjs";
import { reminders } from "./collections.mjs";
import { planBills } from "./billpay.mjs";
import { taxPack } from "./taxpack.mjs";
import { renderStatement, customers } from "./statement.mjs";

const HELP = `AI Bookkeeper: double-entry books from bank and card CSVs that learn from your corrections.

  --books FILE           the books (JSON); created on first import
  --example              start from the synthetic three-month example instead
  import FILE --account CODE [--invert] [--day-first] [--decimal-comma] [--year Y] [--auto 0.85]
  import FILE.txt|FILE.pdf                    statement text copied from a PDF, or the PDF itself via pdftotext (date, description, amount per line)
  import FILE.ofx --map OFXID=CODE,OFXID=CODE   a multi-account OFX file, one chart code per account
  review                 list lines waiting for an account
  confirm ID=CODE ...    file lines (and learn from them)
  confirm ID=CODE:AMT,CODE[:AMT] ...
                         split a line: ID=4000:1000.00,6010:-30.00 for a 970.00 payout
                         (amounts signed like the bank line; one may be left out)
  documents FILE         load an invoice and bill list (CSV: type,number,date,due,party,amount,account[,against]; type may be invoice, bill, credit note, vendor credit);
                         bank lines that pay them clear receivable/payable
  vat [--from D --to D]  UK-layout VAT return worksheet (boxes 1-9) from account 2100 and an input account 1300
  gst --region ca|au [--from D --to D]  Canada GST/HST return (lines 101-109) or Australia BAS (G1, 1A, G11, 1B) worksheet, same accounts as vat
  salestax [--from D --to D]  sales tax collected, credited and paid over by month, and what is still owed
  salestax return [--freq monthly|quarterly|annual] [--due-day N | --state CA|TX|FL|NY|WA|IL|PA] [--rate "CA state=7.25"] [--discount "CA state=0.5,100" | "IL state=1.75,1000/mo" | "FL state=2.5,30"] [--no-rollover]  return worksheet by jurisdiction (named in the tax line's description)
  opening FILE --date D  set opening balances from a trial balance CSV (code,amount or code,debit,credit); "opening" alone shows them, "opening clear" removes them
  switch chart FILE      adding the accounts of a QuickBooks Account List or Xero Chart of Accounts CSV to the chart (matches by name, keeps Xero codes)
  switch balances FILE [--date D]  opening balances from that system's Trial Balance CSV, which names accounts; the date comes from "As of ..." in the file unless given
  lock DATE|off          lock a closed period: nothing dated on or before DATE can be imported, re-filed, booked or written off
  close YEAR [--draws] [--month M]   year-end close (a fiscal year ending in month M, named for the year it ends in): that year's income and expense go to retained earnings (3900) in one dated entry, and the books lock through Dec 31; --draws also closes owner draws and contributions. "close reopen YEAR" undoes the latest; "close report YEAR" shows it
  contractors [--year Y] [--threshold DOLLARS] [--csv|--filing|--json]  contract labor paid by payee against the 1099-NEC line, with W-9 status
  taxpack YEAR [--out DIR]  one folder for your preparer: trial balance, P&L, balance sheet, journal, Schedule C, SE, 1099, payroll, sales tax, depreciation, mileage, checks, INDEX.txt
  b-notice NOTICE_DATE [--received DATE] [--second [--first-notice DATE] [--b-notice-sent DATE]]  dates for a CP2100 notice: mail the B notice, start 24% backup withholding
  merge-payee FROM INTO [--off]  count two spellings of one payee as one on the contractors worksheet
  w9 PAYEE [--off]       record that a W-9 is on file for a payee (a flag; no tax IDs are stored)
  trip add MILES --date D --purpose TEXT [--from A --to B] | trip list [--year Y] | trip remove ID   the business mileage log (goes to Schedule C line 9 with --year)
  homeoffice SQFT [--from D --to D]     simplified home office ($5 a sq ft, 300 max; 0 removes it); line 30 with schedulec --year
  rental accounts | add ID [NAME...] | tag ID (--match TEXT|--account CODE|--ids A,B) | untag (same) | list   rental properties; tag bank lines to a property
  project add ID [NAME...] | tag ID (--match TEXT|--account CODE|--ids A,B|--docs INV-1,BILL-2) | untag (same) | list   projects (jobs, classes): tag bank lines and invoices to one
  projects [--from D --to D] [--csv|--json]  profit and loss per project: revenue, cost, net and margin, with what is untagged
  schedulee [--from D --to D] [--csv|--json]  the books on US Schedule E Part I lines, one column per property (a worksheet, not a filing)
  schedulec [--year Y] [--from D --to D] [--meals PCT] [--csv|--json]  the profit and loss on US Schedule C lines (a worksheet, not a filing)
  retirement [--year Y] [--months N] [--age N] [--wages $] [--json]  most a sole proprietor can put in a SEP-IRA or solo 401(k) this year (worksheet)
  estimate [--year Y] [--months N] [--filing single|mfj|hoh] [--wages $] [--other $] [--withholding $] [--paid $] [--prior-tax $ --prior-agi $] [--as-of D] [--no-qbi] [--service] [--business-wages $] [--itemized $] [--investment $] [--eitc-children N] [--eitc-table] [--state-rate PCT [--state-deduction $] [--state-withheld $]] [--tax-table file.json] [--json]  federal income tax plus SE tax and a safe-harbour 1040-ES payment plan (worksheet)
  calendar [--year Y] [--state XX --freq monthly|quarterly|annual] [--payroll] [--contractors] [--planned Q1,Q2,Q3,Q4 dollars] [--ics file.ics] [--json]  Tax deadlines for the year (federal estimates, filing, 941/940/1099, your state's sales tax returns), printed or written as an iCalendar file with a 7-day reminder
  annualized [--year Y] [--filing ...] [--wages $] [--withholding $] [--prior-tax $ --prior-agi $] [--payment DATE:$ ...] [--tax-table file.json] [--json]  Form 2210 Schedule AI worksheet: what each estimated-tax date requires when income is uneven (annualized income installment method)
  se [--year Y] [--months N] [--wages $] [--json]  self-employment tax on the year's Schedule C profit, annualised, split into the four estimated-payment dates (worksheet; income tax not estimated)
  asset add NAME --cost 1800 --date D [--life MONTHS] [--salvage 0] [--expense]  register equipment; depreciation is booked monthly (default 60 months, straight-line)
  asset dispose ID --date D [--proceeds 0] [--into 1000]  sell or scrap it; books the gain or loss
  asset tax ID --class 5 [--s179 N] [--bonus PCT]  set the asset's US tax treatment (MACRS class 3/5/7/10/15/20 years, half-year)
  taxdepr YEAR [--income books|N] [--carry-in N] [--json]  tax depreciation worksheet beside the book depreciation, with what it cannot check
  prepaid add NAME --amount 2400 --date D [--months 12] [--into 6030]  spread an up-front payment (filed to 1400) over the months it covers
  loan add NAME --amount 20000 --rate 6.5 --months 36 --first 2026-02-01 [--payment 612.34]  a fixed-rate loan and its schedule
  loan extra ID --amount 2000 --date 2026-06-10   extra principal on top of the schedule (it ends sooner)
  loan check ID FILE.csv  compare a lender's own schedule (date, payment, interest, principal, balance) with this loan's
  loan apply ID           split the unfiled bank lines that are its scheduled payments into interest (6040) and principal (2200)
  loan [ID]               list loans (balance, next payment), or one loan's schedule
  fx account CODE CUR   mark a bank account as held in a foreign currency (e.g. 1020 EUR); lines convert at the rate on their date
  fx rate CUR DATE RATE | fx rates FILE   rates are base currency per 1 foreign unit; a file is "date,CUR,rate" lines
  fx [--as-of D]        each foreign account: balance, rate, carried in the books, exchange gain or loss booked (month-end remeasurement to 6190)
  inventory buy SKU --qty N --amount TOTAL --date D [--name TEXT]  record stock bought (file the payment to 1450)
  inventory sell SKU --qty N --date D   move that stock's cost to cost of goods sold (FIFO or average)
  inventory adjust SKU --qty N --date D write off lost or damaged stock at cost
  inventory return SKU --qty N --date D stock sent back to the supplier, at the newest layer cost (file the refund to 1450)
  inventory landed --amount TOTAL --date D --on INV-1,INV-2 [--by value|qty]  freight or duty spread over those purchases (file the payment to 1450)
  inventory writedown SKU --nrv UNIT_PRICE --date D  cut stock on hand to net realizable value (selling price less cost to sell) when that is below cost
  inventory method fifo|avg             costing method (default fifo)
  inventory             stock on hand by SKU, valued; the total should equal account 1450
  prepaid [--as-of D]     list prepaid items: amount, expensed so far, still paid ahead
  assets FILE|[--as-of D] load a CSV (name,date,cost,life_months[,salvage,method]), or list the register: cost, accumulated depreciation, net book value
  profile [KEY VALUE]     your details for invoices (name, address, email, taxId, payTo, terms); no arguments lists them
  invoice ID [--out FILE] [--as-of D]  a printable invoice or credit note (HTML; print to PDF) with payments, balance due and overdue days
  reminders [--as-of D] [--min AMOUNT] [--out DIR]  a payment reminder draft per customer with overdue invoices (friendly, firm or final by days late)
  paybills [--as-of D] [--days N] [--reserve AMOUNT] [--terms FILE.json] [--json]  when to pay each open bill so the bank balance stays above a reserve: due date, held back for cash, or cannot fit
  statement [CUSTOMER] [--from D] [--out FILE]  a printable statement of account (HTML) with running balance and what is past due; no customer lists who owes what
  writeoff ID [--date D]  write off an invoice's unpaid balance to bad debts (6900), or record a bill the supplier forgave as other income (4100)
  recurring [--as-of D] [--json]  payees that repeat on a steady interval: cost per year, next date, and which went overdue, lapsed or changed amount
  forecast [--as-of D] [--days N] [--json]  expected cash day by day from the bank balance, recurring items and open invoices and bills; the lowest point
  anomalies [--json]     lines worth a second look: double charges, amounts far above a payee's usual, large first-time payees (candidates with a reason, not an audit)
 receipts [FILE (.txt, text-layer .pdf via pdftotext, or a photo via tesseract / RECEIPT_OCR_CMD)|attach RID LINEID|detach RID|remove RID|split RID [--other CODE] [--fix WORD=CODE]... [--apply]] [--min DOLLARS] [--tax] [--json]  receipt text (blocks split by ---) matched to bank lines; lists unmatched receipts and spending over --min (default 75) with no receipt
  compare [--from D --to D --vs-from D --vs-to D] [--json]  profit and loss against an earlier period (default: latest month vs the month before): what moved, what is new or gone
  payroll FILE.csv [--apply]  book a payroll provider's pay-run report (wages, employer taxes, 2300) and find the bank lines that paid it; --apply files them to 2300
  payroll deposits YEAR [--schedule monthly|semiweekly]  federal deposit due dates (lookback, $100,000 next-day rule, holidays) and whether the bank shows each paid on time
  payroll [941 YEAR QUARTER [--deposited DOLLARS] [--schedule-b] | 940 YEAR [--state CA | --credit-reduction PCT] | w2 YEAR | reconcile YEAR]  runs, what is still owed, or a Form 941 / 940 worksheet from the register
  payouts FILE.csv [--apply] [--sales C --refunds C --fees C --disputes C] [--json]  split each processor payout (Stripe payout reconciliation CSV) in the bank into gross sales, refunds and fees; without --apply, shows the plan
  form1099k FILE.csv --year Y --gross AMT [--months J,F,...,D] [--sales CODE] [--processor card|marketplace] [--json]  tie a processor's Form 1099-K (box 1a, optional boxes 5a-5l) to its payout report and to the books' sales
  reconcile CODE --date D --balance AMT [--json]  tie an account to the closing balance on a paper statement; if it is off, name the lines that likely explain the gap
  budget [CODE AMOUNT] [--from D --to D] [--json]  set a monthly budget for an account (AMOUNT 0 removes it), or show budget against actual for the period (default: latest month)
  cashbasis [--from D --to D] [--json]  profit and loss on the cash method: income when paid, expenses when paid (invoices and bills)
  aging [--as-of D]      what customers owe you and what you owe, by days past due
  rules [--apply]        payees you filed the same way 3+ times, as rules; --apply adds them
  accept [MIN]           accept every suggestion at or above MIN confidence (default 0.7)
  ai                     ask a model for the review queue: your key or a local model
                         (LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL, LLM_API_KEY or ANTHROPIC_API_KEY)
  report [--from D] [--to D] [--json]
  checks                 close checks: review left, suspense, duplicates, unusual sizes, reconciliation
  export FORMAT          qbo | xero | iif | ledger | beancount | csv | lines

No warranty. Not accounting, tax or financial advice; check its output before you rely on it.`;

const argv = process.argv.slice(2);
const NUMERIC_FLAGS = new Set(["--year", "--months", "--wages", "--other", "--withholding", "--paid", "--prior-tax", "--prior-agi", "--threshold", "--min", "--days", "--reserve", "--age", "--gross", "--business-wages", "--itemized", "--investment", "--eitc-children"]);
const flag = (k) => {
  const i = argv.indexOf(k); if (i === -1) return null; const v = argv[i + 1]; argv.splice(i, 2);
  if (NUMERIC_FLAGS.has(k) && !Number.isFinite(Number(v ?? NaN))) { console.error(`${k} needs a number, got "${v ?? ""}".`); process.exit(2); }
  return v;
};
const has = (k) => { const i = argv.indexOf(k); if (i === -1) return false; argv.splice(i, 1); return true; };
if (has("--help") || has("-h") || !argv.length) { console.log(HELP); process.exit(0); }

const file = flag("--books");
const json = has("--json"), example = has("--example"), invert = has("--invert") ? true : undefined, dayFirst = has("--day-first") || undefined, decimalComma = has("--decimal-comma") || undefined;
const asOf = flag("--as-of");
const acctMap = flag("--map"), account = flag("--account"), from = flag("--from"), to = flag("--to"), auto = flag("--auto");
let books = example ? analyze({ example: true }).books : file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : newBooks();
const save = () => { if (file) writeFileSync(file, JSON.stringify(books, null, 1)); };
const opts = { invert, dayFirst, decimalComma, ...(argv[0] === "import" && argv.includes("--year") ? { year: +flag("--year") } : {}), ...(auto ? { autoPost: +auto } : {}) };
const [cmd, ...rest] = argv;
const map = accountMap(books.accounts);
const name = (c) => (c ? `${c} ${map.get(c)?.name ?? ""}` : "-");

if (cmd === "import" && rest[0] && !account && existsSync(rest[0])) {
  // an OFX file with several accounts: --map OFXID=CODE,OFXID=CODE
  const text = statementTextFromFile(rest[0]);
  const parts = sniffFormat(text) === "ofx" ? splitOfx(text) : [];
  const map = Object.fromEntries((acctMap ?? "").split(",").filter(Boolean).map((p) => [p.slice(0, p.lastIndexOf("=")), p.slice(p.lastIndexOf("=") + 1)]));
  // a CSV that names the account on each row (Mint, Monarch, Tiller, YNAB): --map "Account Name"=CODE,...
  const qparts = sniffFormat(text) === "qif" ? splitQif(text) : [];
  if (qparts.length) {
    if (!Object.keys(map).length) {
      for (const p of qparts) console.error(`QIF account "${p.id}": pass --map "${p.id}"=CODE`);
      console.error("this QIF file holds several accounts; map each name to a chart code with --map");
      process.exit(2);
    }
    const r = importQifAccounts(books, text, map, opts);
    books = r.books;
    save();
    for (const p of r.problems) console.error(p);
    console.log(`${r.accounts.filter((a) => a.code).length} of ${r.accounts.length} accounts imported: ${r.added} lines added, ${r.skipped} already in the books.`);
    process.exit(0);
  }
  const names = parts.length ? [] : readStatement(text, opts).accountNames ?? [];
  if (names.length > 1) {
    if (!Object.keys(map).length) {
      for (const n of names) console.error(`Account "${n}": pass --map "${n}"=CODE`);
      console.error("this file holds several accounts; map each name to a chart code with --map");
      process.exit(2);
    }
    const r = importCsvAccounts(books, text, map, opts);
    books = r.books;
    save();
    for (const p of r.problems) console.error(p);
    console.log(`${r.accounts.filter((a) => a.code).length} of ${r.accounts.length} accounts imported: ${r.added} lines added, ${r.skipped} already in the books.`);
    process.exit(0);
  }
  if (parts.length < 2 || !Object.keys(map).length) {
    if (parts.length > 1) for (const p of parts) console.error(`OFX account ${p.id} (${p.card ? "card" : p.type || "bank"}): pass --map ${p.id}=CODE`);
    console.error("import needs a CSV file and --account CODE (or, for an OFX file with several accounts, --map OFXID=CODE,...)");
    process.exit(2);
  }
  const r = importOfxAccounts(books, text, map, opts);
  books = r.books;
  save();
  for (const p of r.problems) console.error(p);
  console.log(`${r.accounts.filter((a) => a.code).length} of ${r.accounts.length} accounts imported: ${r.added} lines added, ${r.skipped} already in the books.`);
} else if (cmd === "import") {
  if (!rest[0] || !account) { console.error("import needs a CSV file and --account CODE"); process.exit(2); }
  const r = importStatement(books, statementTextFromFile(rest[0]), account, opts);
  books = r.books;
  save();
  for (const p of r.problems) console.error(p);
  const s = status(books);
  console.log(`${r.added} lines added, ${r.skipped} already in the books. ${s.auto} posted by rule or memory, ${s.transfer} transfer lines paired, ${s.review} waiting for review.`);
  if (r.balanceCheck?.checked) console.log(r.balanceCheck.breaks.length ? `The running balance breaks at ${r.balanceCheck.breaks.length} line(s), first at line ${r.balanceCheck.breaks[0].line}: a row may be missing or doubled.` : "The statement's running balance agrees with every row.");
} else if (cmd === "review") {
  const q = books.transactions.filter((t) => t.status === "review");
  if (json) console.log(JSON.stringify(q, null, 2));
  else for (const t of q) console.log(`${t.id}  ${t.date}  ${fmt(t.cents).padStart(11)}  ${t.desc.slice(0, 42).padEnd(42)}  ${name(t.suggestion?.account)}  ${(t.suggestion?.confidence ?? 0).toFixed(2)}  ${t.suggestion?.reason ?? ""}`);
  if (!json) console.log(`${q.length} waiting.`);
} else if (cmd === "confirm") {
  const choices = Object.fromEntries(rest.map((x) => { const [id, v] = x.split("="); return [id, parseSplit(v)]; }));
  books = confirm(books, choices);
  save();
  console.log(`${Object.keys(choices).length} filed. ${status(books).review} still waiting.`);
} else if (cmd === "documents") {
  if (!rest[0]) { console.error("documents needs a CSV file"); process.exit(2); }
  const r = addDocuments(books, readFileSync(rest[0], "utf8"), opts);
  books = categorize(r.books);
  save();
  for (const p of r.problems) console.error(p);
  const settled = books.documents.filter((d) => d.settledBy).length;
  console.log(`${r.added} documents added, ${r.skipped} already in the books. ${settled} of ${books.documents.length} are paid by a bank line; ${status(books).review} lines waiting for review.`);
} else if (cmd === "opening") {
  if (rest[0] === "clear") { books = clearOpeningBalances(books); save(); console.log("Opening balances cleared."); }
  else if (!rest[0]) {
    const tb = books.openingTB;
    if (!tb) console.log("No opening balances set. Usage: opening FILE.csv --date YYYY-MM-DD");
    else { console.log(`OPENING BALANCES as of ${tb.date}`); for (const l of tb.lines) console.log(`  ${name(l.account).padEnd(40)} ${(l.cents > 0 ? fmt(l.cents) : "").padStart(12)} ${(l.cents < 0 ? fmt(-l.cents) : "").padStart(12)}`); }
  } else {
    const date = flag("--date");
    if (!date) { console.error("opening needs --date YYYY-MM-DD (the day the balances are as of)"); process.exit(2); }
    try {
      const r = setOpeningBalances(books, readFileSync(rest[0], "utf8"), { date, decimalComma: !!decimalComma });
      for (const p of r.problems) console.error(p);
      if (!r.lines.length) process.exit(1);
      books = r.books; save();
      console.log(`${r.lines.length} opening balances set as of ${date}.${r.plug ? ` ${fmt(Math.abs(r.plug))} did not balance and went to ${name("3000")}.` : " They balance."}`);
    } catch (e) { console.error(e.message); process.exit(1); }
  }
} else if (cmd === "switch") {
  if (!["chart", "balances"].includes(rest[0]) || !rest[1]) { console.error("usage: switch chart FILE.csv | switch balances FILE.csv [--date YYYY-MM-DD]"); process.exit(2); }
  const text = readFileSync(rest[1], "utf8");
  try {
    if (rest[0] === "chart") {
      const r = importChart(books, text);
      for (const p of r.problems) console.error(p);
      if (!r.added.length && !r.matched.length) process.exit(1);
      books = r.books; save();
      console.log(`${r.matched.length} accounts matched the chart already; ${r.added.length} added${r.added.length ? `: ${r.added.map((a) => `${a.code} ${a.name}`).join(", ")}` : ""}.`);
    } else {
      const r = importTrialBalance(books, text, { date: flag("--date") ?? undefined, decimalComma: !!decimalComma });
      for (const p of r.problems) console.error(p);
      if (!r.lines.length) process.exit(1);
      books = r.books; save();
      console.log(`${r.lines.length} opening balances set as of ${r.date}.${r.plug ? ` ${fmt(Math.abs(r.plug))} did not balance and went to ${name("3000")}.` : " They balance."}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "lock") {
  if (!rest[0]) { console.error("lock needs a date (YYYY-MM-DD) or off"); process.exit(2); }
  try { books = lockPeriod(books, rest[0] === "off" ? null : rest[0]); save(); console.log(books.lockedThrough ? `Locked through ${books.lockedThrough}.` : "Unlocked."); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "close") {
  try {
    if (rest[0] === "reopen") { books = reopenYear(books, rest[1]); save(); console.log(`Reopened ${rest[1]}. ${books.lockedThrough ? `Still locked through ${books.lockedThrough}.` : "The books are unlocked."}`); }
    else if (rest[0] === "report") {
      const r = yearEndReport(books, rest[1]);
      if (!r.closed) { console.log(`${r.year} is not closed.`); process.exit(1); }
      if (json) console.log(JSON.stringify(r, null, 2));
      else {
        console.log(`${r.year} closed. Retained earnings ${fmt(r.retainedBefore)} -> ${fmt(r.retainedAfter)} (${r.netToRetained >= 0 ? "profit" : "loss"} ${fmt(Math.abs(r.netToRetained))} moved).`);
        for (const l of r.entry?.lines ?? []) console.log(`  ${l.account.padEnd(5)} ${name(l.account).padEnd(34)} ${l.debit ? "Dr " + fmt(l.debit) : "Cr " + fmt(l.credit)}`);
      }
    } else {
      if (!rest[0]) { console.error("close needs a year (YYYY), 'report YEAR' or 'reopen YEAR'"); process.exit(2); }
      books = closeYear(books, rest[0], { draws: rest.includes("--draws"), month: flag("--month") ?? 12 }); save();
      const r = yearEndReport(books, rest[0]);
      console.log(`Closed ${r.year}: ${r.netToRetained >= 0 ? "profit" : "loss"} of ${fmt(Math.abs(r.netToRetained))} moved to ${name("3900")}. Locked through ${books.lockedThrough}.`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "asset") {
  try {
    if (rest[0] === "add") {
      const date = flag("--date"), cost = flag("--cost"), life = flag("--life"), salvage = flag("--salvage") ?? 0, method = has("--expense") ? "expense" : "straight-line";
      const r = addAsset(books, { name: argv.slice(2).join(" "), date, cost, lifeMonths: life ? +life : 60, salvage, method });
      books = r.books; save(); console.log(`${r.asset.id} ${r.asset.name}: ${fmt(r.asset.cents)}, ${r.asset.method === "expense" ? "expensed in full in its first month" : `${r.asset.lifeMonths} months straight-line`}.`);
    } else if (rest[0] === "dispose" && rest[1]) {
      const r = disposeAsset(books, rest[1], { date: flag("--date"), proceeds: flag("--proceeds") ?? 0, account: flag("--into") ?? "1000" });
      books = r.books; save(); console.log(`${r.asset.id} disposed on ${r.asset.disposed.date}.`);
    } else if (rest[0] === "tax" && rest[1]) {
      const r = setTaxTreatment(books, rest[1], { macrsClass: flag("--class"), s179: flag("--s179") ?? 0, bonusPct: flag("--bonus") ?? 0 });
      books = r.books; save(); console.log(`${r.asset.id}: MACRS ${r.asset.tax.macrsClass}-year, section 179 ${fmt(r.asset.tax.s179)}, bonus ${r.asset.tax.bonusPct}%.`);
    } else { console.error("asset add NAME --cost N --date D, or asset dispose ID --date D, or asset tax ID --class N"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "taxdepr") {
  const year = +rest[0];
  if (!(year >= 1990 && year <= 2100)) { console.error("taxdepr needs a year, e.g. taxdepr 2026"); process.exit(2); }
  const elected = (books.assets ?? []).some((a) => a.tax?.s179);
  const incomeFlag = flag("--income");
  const businessIncome = incomeFlag !== null && incomeFlag !== "books" ? parseCents(incomeFlag) : elected ? taxableBusinessIncome(books, year) : null;
  const carryFlag = flag("--carry-in");
  const chain = carryFlag === null && elected ? s179Carryforward(books, year) : null;
  const w = taxDepreciation(books, year, { businessIncome, carryIn: carryFlag ? parseCents(carryFlag) : chain ? chain.carryIn : 0 });
  if (chain) for (const c of chain.years.filter((c) => c.carryIn || c.carryOut || c.elected)) w.warnings.push(`${c.year}: Section 179 pool ${fmt(c.dollarLimited + c.carryIn)} against business income ${fmt(c.income)}: ${fmt(c.deductible)} deducted, ${fmt(c.carryOut)} carried on${c.booked ? "" : " (no bookkeeping that year, so income counted as zero; enter the real figure with --carry-in)"}.`);
  if (json) { console.log(JSON.stringify(w, null, 2)); process.exit(0); }
  console.log(`TAX DEPRECIATION ${year} (MACRS, half-year)`);
  for (const r of w.rows) console.log(`  ${r.id.padEnd(6)} ${r.name.slice(0, 24).padEnd(24)} ${r.class}-yr  179 ${fmt(r.s179).padStart(10)}  bonus ${fmt(r.bonus).padStart(10)}  MACRS ${fmt(r.macrs).padStart(10)}  tax ${fmt(r.total).padStart(11)}  book ${fmt(r.book).padStart(10)}`);
  if (w.s179Income) console.log(`  Section 179 income limit: elected ${fmt(w.s179Income.elected)}, after dollar limit ${fmt(w.s179Income.dollarLimited)}${w.s179Income.carryIn ? ` + carried in ${fmt(w.s179Income.carryIn)}` : ""}, business income ${fmt(w.s179Income.income ?? 0)}, deductible ${fmt(w.s179Income.deductible)}, carried to ${year + 1} ${fmt(w.s179Income.carryOut)}`);
  console.log(`  Total: tax ${fmt(w.totals.total)}, book ${fmt(w.totals.book)}, difference ${fmt(w.totals.difference)}`);
  for (const x of w.warnings) console.log(`  Note: ${x}`);
} else if (cmd === "loan") {
  try {
    if (rest[0] === "add") {
      const amount = flag("--amount"), rate = flag("--rate"), months = flag("--months"), first = flag("--first"), payment = flag("--payment");
      const r = addLoan(books, { name: argv.slice(2).join(" "), amount, rate, months, first, payment });
      books = r.books; save(); console.log(`${r.loan.id} ${r.loan.name}: ${fmt(r.loan.cents)} at ${r.loan.rateBp / 100}% over ${r.loan.months} months, payment ${fmt(r.loan.payment)}. Enter the proceeds as a deposit filed to 2200 (or use opening balances), then \`loan apply ${r.loan.id}\`.`);
    } else if (rest[0] === "extra") {
      const r = addLoanExtra(books, rest[1], { amount: flag("--amount"), date: flag("--date") });
      books = r.books; save();
      const last = loanSchedule(r.loan).at(-1);
      console.log(`${r.loan.id}: extra principal recorded; the schedule now ends ${last.date} after ${last.n} of ${r.loan.months} payments. \`loan apply ${r.loan.id}\` files the bank line.`);
    } else if (rest[0] === "check") {
      const loan = (books.loans ?? []).find((l) => l.id === rest[1]);
      if (!loan) throw new Error(`No loan ${rest[1]}.`);
      if (!rest[2]) throw new Error("Usage: loan check ID LENDER_SCHEDULE.csv");
      const r = checkLenderSchedule(loan, readFileSync(rest[2], "utf8"));
      if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
      for (const x of r.rows.filter((y) => y.extra || Object.values(y.diff).some((d) => Math.abs(d) > r.tolerance)).slice(0, 12)) console.log(x.extra ? `  ${x.n}: only in the lender's schedule` : `  ${String(x.n).padStart(3)} ${x.date}  ` + Object.entries(x.diff).filter(([, d]) => d).map(([f, d]) => `${f} ${d > 0 ? "+" : "-"}${fmt(Math.abs(d))}`).join("  "));
      for (const n of r.notes) console.log(n);
    } else if (rest[0] === "apply") {
      const r = applyLoanPayments(books, rest[1]);
      books = r.books; save();
      for (const m of r.matched) console.log(`  ${m.id} ${m.date} ${m.extra === undefined ? `payment ${m.n}` : "extra principal"}: interest ${fmt(m.interest)}, principal ${fmt(m.principal)}`);
      console.log(`${r.matched.length} payment${r.matched.length === 1 ? "" : "s"} split.`);
    } else if (rest[0]) {
      const loan = (books.loans ?? []).find((l) => l.id === rest[0]);
      if (!loan) throw new Error(`No loan ${rest[0]}.`);
      const s = loanSchedule(loan);
      if (json) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }
      for (const r of s) console.log(`  ${String(r.n).padStart(3)} ${r.date} payment ${fmt(r.payment).padStart(10)}  interest ${fmt(r.interest).padStart(9)}  principal ${fmt(r.principal).padStart(10)}  balance ${fmt(r.balance).padStart(11)}`);
    } else {
      const g = loanRegister(books);
      if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
      for (const l of g.rows) console.log(`  ${l.id.padEnd(5)} ${l.name.slice(0, 24).padEnd(24)} ${fmt(l.cents).padStart(11)} at ${l.rate}%  ${l.paid}/${l.months} paid  balance ${fmt(l.balance).padStart(11)}  next ${l.next ? `${l.next.date} ${fmt(l.next.payment)}` : "none"}`);
      console.log(`  Total owing by schedule: ${fmt(g.balance)}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "fx") {
  try {
    if (rest[0] === "account") { books = addFxAccount(books, { code: rest[1], currency: rest[2] }); save(); console.log(`${rest[1]} is held in ${rest[2].toUpperCase()}. Add rates, then import its statements.`); }
    else if (rest[0] === "rate") { if (!Number.isFinite(Number(rest[3] ?? NaN))) throw new Error(`fx rate needs a number, got "${rest[3] ?? ""}".`); books = setRates(books, [{ date: rest[2], currency: String(rest[1]).toUpperCase(), rate: Number(rest[3]) }]); save(); console.log("Rate saved."); }
    else if (rest[0] === "rates") {
      const r = parseRates(readFileSync(rest[1], "utf8"));
      for (const p of r.problems) console.error(p);
      books = setRates(books, r.rates); save(); console.log(`${r.rates.length} rates saved.`);
    } else {
      const g = fxRegister(books, asOf);
      if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
      console.log(`FOREIGN CURRENCY ACCOUNTS as of ${g.asOf ?? "-"}`);
      for (const a of g.rows) console.log(`  ${a.code} ${a.currency}  balance ${fmt(a.foreign).padStart(11)}  rate ${String(a.rate ?? "none").padStart(8)}  at rate ${a.atRate === null ? "-" : fmt(a.atRate).padStart(11)}  carried ${fmt(a.carried).padStart(11)}  exchange gain/loss ${fmt(a.gain).padStart(9)}`);
      console.log(`  Total exchange gain (loss) booked: ${fmt(g.gain)}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "inventory") {
  try {
    if (["buy", "sell", "adjust", "return"].includes(rest[0])) {
      const r = addInventoryMove(books, { kind: rest[0], sku: rest[1], date: flag("--date"), qty: flag("--qty"), amount: flag("--amount") ?? undefined, name: flag("--name") ?? undefined });
      books = r.books; save(); console.log(`${r.move.id} ${rest[0]} ${r.move.qty / 1000} x ${r.move.sku}${rest[0] === "buy" ? `, ${fmt(r.move.cents)}. File the payment to 1450.` : rest[0] === "return" ? ". File the supplier's refund to 1450." : ". Cost moved to 5000."}`);
    } else if (rest[0] === "landed") {
      const r = addLandedCost(books, { amount: flag("--amount"), date: flag("--date"), to: flag("--on"), by: flag("--by") ?? undefined });
      books = r.books; save(); console.log(`${r.move.id} landed cost ${fmt(r.move.cents)}: ${r.move.alloc.map((a) => `${a.id} ${fmt(a.cents)}`).join(", ")}. File the payment to 1450.`);
    } else if (rest[0] === "writedown") {
      const r = addInventoryWritedown(books, { sku: rest[1], date: flag("--date"), nrv: flag("--nrv") });
      books = r.books; save(); console.log(`${r.move.id} ${r.move.sku} cut to net realizable value ${fmt(r.move.nrv)} a unit: ${fmt(r.loss)} to 5000.`);
    } else if (rest[0] === "method") {
      books = setInventoryMethod(books, rest[1]); save(); console.log(`Costing method: ${rest[1]}.`);
    } else {
      const g = inventoryRegister(books);
      if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
      console.log(`INVENTORY (${g.method})`);
      for (const a of g.rows) console.log(`  ${a.sku.slice(0, 20).padEnd(20)} on hand ${String(a.onHand).padStart(9)}  unit ${fmt(a.unitCost).padStart(9)}  value ${fmt(a.value).padStart(11)}  sold ${String(a.sold).padStart(8)}  COGS ${fmt(a.cogs).padStart(11)}`);
      console.log(`  Total on hand ${fmt(g.value)}, cost of goods sold ${fmt(g.cogs)}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "prepaid") {
  try {
    if (rest[0] === "add") {
      const date = flag("--date"), amount = flag("--amount"), months = flag("--months") ?? 12, into = flag("--into") ?? undefined;
      const r = addPrepaid(books, { name: argv.slice(2).join(" "), date, amount, months, expenseAccount: into });
      books = r.books; save(); console.log(`${r.prepaid.id} ${r.prepaid.name}: ${fmt(r.prepaid.cents)} over ${r.prepaid.months} months to ${r.prepaid.expenseAccount}. File the payment to 1400.`);
    } else {
      const g = prepaidRegister(books, asOf);
      if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
      console.log(`PREPAID EXPENSES as of ${g.asOf ?? "-"}`);
      for (const a of g.rows) console.log(`  ${a.id.padEnd(6)} ${a.name.slice(0, 28).padEnd(28)} ${a.date}  ${String(a.months).padStart(2)} mo  paid ${fmt(a.cents).padStart(11)}  expensed ${fmt(a.expensed).padStart(11)}  ahead ${fmt(a.remaining).padStart(11)}`);
      console.log(`  Total: paid ${fmt(g.cents)}, still paid ahead ${fmt(g.remaining)}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "assets") {
  if (rest[0]) {
    const r = addAssetsCsv(books, readFileSync(rest[0], "utf8"), opts);
    books = r.books; save();
    for (const p of r.problems) console.error(p);
    console.log(`${r.added} assets added.`);
  } else {
    const g = register(books, asOf);
    if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
    console.log(`ASSET REGISTER as of ${g.asOf ?? "-"}`);
    for (const a of g.rows) console.log(`  ${a.id.padEnd(6)} ${a.name.slice(0, 28).padEnd(28)} ${a.date}  cost ${fmt(a.cost).padStart(11)}  depreciated ${fmt(a.accumulated).padStart(11)}  net ${fmt(a.netBookValue).padStart(11)}${a.disposed ? "  disposed " + a.disposed.date : a.fullyDepreciated ? "  fully depreciated" : ""}`);
    console.log(`  Total (not disposed): cost ${fmt(g.cost)}, depreciated ${fmt(g.accumulated)}, net ${fmt(g.netBookValue)}`);
  }
} else if (cmd === "profile") {
  if (!rest[0]) { for (const k of PROFILE_KEYS) console.log(`${k.padEnd(8)} ${(books.profile?.[k] ?? "").replace(/\n/g, " / ")}`); }
  else if (rest.length < 2) { console.error(`profile needs a key and a value (keys: ${PROFILE_KEYS.join(", ")})`); process.exit(2); }
  else { try { books = setProfile(books, rest[0], rest.slice(1).join(" ").replace(/\\n/g, "\n")); save(); console.log(`Set ${rest[0]}.`); } catch (e) { console.error(e.message); process.exit(2); } }
} else if (cmd === "invoice") {
  if (!rest[0]) { console.error("invoice needs an invoice number or id"); process.exit(2); }
  try {
    const r = renderInvoice(books, rest[0], { asOf: asOf ?? null });
    const out = flag("--out");
    if (out) { writeFileSync(out, r.html); console.log(`Wrote ${out}: ${r.id}, ${r.status}${r.balance ? `, balance ${fmt(r.balance)}` : ""}.`); } else process.stdout.write(r.html);
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "reminders") {
  const min = flag("--min") ? Math.round(Number(flag("--min")) * 100) : 1;
  const r = reminders(books, { asOf: asOf ?? null, min });
  const dir = flag("--out");
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  if (dir) mkdirSync(dir, { recursive: true });
  r.forEach((x, i) => {
    if (dir) { const f = `${dir}/${String(i + 1).padStart(2, "0")}-${x.party.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer"}.txt`; writeFileSync(f, `Subject: ${x.subject}\n\n${x.text}`); }
    console.log(`${x.party.slice(0, 28).padEnd(28)} ${x.tone.padEnd(8)} ${String(x.daysLate).padStart(4)} days  ${fmt(x.overdue).padStart(12)}  ${x.invoices.length} invoice${x.invoices.length > 1 ? "s" : ""}`);
  });
  console.log(r.length ? `${r.length} reminder${r.length > 1 ? "s" : ""}${dir ? ` written to ${dir}` : " (add --out DIR to write the drafts)"}.` : "Nothing overdue.");
} else if (cmd === "paybills") {
  const p = planBills(books, { asOf: asOf ?? null, days: +(flag("--days") ?? 90), reserve: Math.round(Number(flag("--reserve") ?? 0) * 100), terms: flag("--terms") ? JSON.parse(readFileSync(flag("--terms"), "utf8")) : {} });
  if (json) { console.log(JSON.stringify(p, null, 2)); process.exit(0); }
  console.log(`BILL PLAN ${p.asOf} to ${p.to}: cash ${fmt(p.start)}, reserve ${fmt(p.reserve)}, lowest after paying ${fmt(p.lowest.cents)} on ${p.lowest.date}.`);
  for (const r of p.rows) console.log(`  ${r.payOn}  ${fmt(r.cents).padStart(11)}  ${r.id.padEnd(12)} ${r.party.slice(0, 24).padEnd(24)} due ${r.due}  ${r.status}${r.note ? ` - ${r.note}` : ""}`);
  console.log(p.rows.length ? (p.shortfall ? `${fmt(p.shortfall)} of bills cannot be covered inside the window.` : "Every bill fits.") : "No open bills.");
} else if (cmd === "statement") {
  try {
    if (!rest[0]) { for (const c of customers(books)) console.log(`${c.party.slice(0, 30).padEnd(30)} ${fmt(c.owed).padStart(12)}`); process.exit(0); }
    const r = renderStatement(books, rest[0], { from: flag("--from") ?? null, asOf: asOf ?? null });
    const out = flag("--out");
    if (out) { writeFileSync(out, r.html); console.log(`Wrote ${out}: ${r.party}, ${r.rows.length} lines, closing ${fmt(r.closing)}${r.overdue ? `, ${fmt(r.overdue)} past due` : ""}.`); } else process.stdout.write(r.html);
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "writeoff") {
  if (!rest[0]) { console.error("writeoff needs an invoice or bill id or number"); process.exit(2); }
  try { const r = writeOff(books, rest[0], { date: flag("--date") ?? undefined }); books = r.books; save(); console.log(`Wrote off ${fmt(r.cents)} of ${rest[0]} to ${r.books.documents.find((x) => x.id === rest[0] || x.number === rest[0])?.kind === 'bill' ? 'other income (bill forgiven)' : 'bad debts'}.`); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "recurring") {
  const r = detectRecurring(books, { asOf });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  for (const x of r) console.log(`${x.payee.slice(0, 26).padEnd(26)} ${x.cadence.padEnd(15)} ${fmt(x.typical).padStart(11)}  ${fmt(x.perYear).padStart(12)}/yr  next ${x.next}  ${x.status}${x.note ? ` (${x.note})` : ""}`);
  const sum = (d) => r.filter((x) => x.direction === d && x.status !== "lapsed").reduce((a, x) => a + x.perYear, 0);
  console.log(`${r.length} recurring. Per year, not lapsed: in ${fmt(sum("in"))}, out ${fmt(sum("out"))}.`);
} else if (cmd === "receipts") {
  if (rest[0] === "split") {
    try {
      const other = flag("--other");
      const fix = {};
      for (let v; (v = flag("--fix")); ) { const [w, c] = v.split("="); if (!w || !c) throw new Error("--fix takes WORD=CODE, e.g. --fix toner=6070"); fix[w] = c; }
      const plan = planReceiptSplit(books, rest[1], { other, fix });
      console.log(`${plan.receipt.merchant} ${plan.receipt.date}, line ${plan.line.id} ${fmt(plan.line.cents)}:`);
      for (const p of plan.parts) console.log(`  ${name(p.account).padEnd(34)} ${fmt(p.cents).padStart(11)}  ${p.items.map((i) => i.desc).join(", ").slice(0, 40)}${p.taxCents ? ` (+${fmt(p.taxCents)} tax)` : ""}${p.extraCents ? ` (+${fmt(p.extraCents)} tip)` : ""}`);
      for (const i of plan.unfiled) console.log(`  NO ACCOUNT for "${i.desc}" ${fmt(i.cents)}; use --other CODE`);
      if (has("--apply")) { const done = splitFromReceipt(books, rest[1], { other, fix }); books = done.books; save(); console.log(plan.single ? `Filed whole to ${name(plan.single)} (one account).` : "Split posted."); if (done.taught.length) console.log(`Learned ${done.taught.length} item${done.taught.length === 1 ? "" : "s"}: ${done.taught.map((t) => `"${t.desc}" -> ${t.account}`).join(", ")}`); }
      else console.log(plan.single ? "One account for everything: a plain filing. --apply files it." : "Add --apply to post this split.");
    } catch (e) { console.error(e.message); process.exit(2); }
    process.exit(0);
  }
  if (rest[0] === "attach" || rest[0] === "detach" || rest[0] === "remove") {
    try {
      books = rest[0] === "remove" ? removeReceipt(books, rest[1]) : attachReceipt(books, rest[1], rest[0] === "detach" ? null : rest[2]);
    } catch (e) { console.error(e.message); process.exit(2); }
    save(); console.log(`${rest[0]} ${rest[1]}: done.`); process.exit(0);
  }
  if (rest[0] && !rest[0].startsWith("--")) {
    if (!existsSync(rest[0])) { console.error(`no file ${rest[0]}`); process.exit(2); }
    let text;
    try { text = receiptTextFromFile(rest[0]); } catch (e) { console.error(e.message); process.exit(2); }
    const r = addReceipts(books, text);
    books = r.books; save();
    console.log(`Read ${r.added.length} receipt${r.added.length === 1 ? "" : "s"}; ${r.duplicates.length} already on file; ${r.skipped.length} could not be read.`);
    for (const s of r.skipped) console.log(`  skipped "${s.text.slice(0, 40)}": ${s.notes.join(", ")}`);
  }
  if (has("--tax")) {
    const t = taxOnReceipts(books, { from, to });
    if (json) { console.log(JSON.stringify(t, null, 2)); process.exit(0); }
    console.log(`TAX ON RECEIPTS ${fmt(t.taxCents)} across ${t.receipts} receipt${t.receipts === 1 ? "" : "s"}; ${t.noTax.length} with no tax line (not counted).`);
    for (const m of t.byMonth) console.log(`  ${m.month}  ${fmt(m.taxCents).padStart(10)}  on ${fmt(m.baseCents)} before tax`);
    for (const a of t.byAccount) console.log(`  ${a.code.padEnd(8)} ${fmt(a.taxCents).padStart(10)}  ${a.name}`);
    process.exit(0);
  }
  const minFlag = flag("--min");
  const min = minFlag ? parseCents(minFlag) : 7500;
  const rep = receiptReport(books, { minCents: min, from, to });
  if (json) { console.log(JSON.stringify(rep, null, 2)); process.exit(0); }
  console.log(`RECEIPTS ${rep.receipts} on file: ${rep.matched.length} matched, ${rep.unmatched.length} not. ${fmt(rep.coveredCents)} of ${fmt(rep.spendCents)} spending is covered.`);
  for (const m of rep.matched) console.log(`  ${m.id}  ${m.date}  ${fmt(m.cents).padStart(10)}${m.currency ? ` ${m.currency}` : ""}  ${m.merchant.slice(0, 26).padEnd(26)} -> ${m.line.date} ${m.line.desc.slice(0, 28)}${m.fxRate ? ` (paid ${fmt(-m.line.cents)}, rate ${m.fxRate.toFixed(4)}${m.rateSource?.startsWith("implied") ? ", from this pair only: check" : ""})` : ""}${m.tipCents ? ` (+${fmt(m.tipCents)} tip)` : ""}${m.payeeAgrees === false ? " (name differs: check)" : ""}`);
  for (const u of rep.unmatched) console.log(`  ${u.id}  ${u.date}  ${fmt(u.cents).padStart(10)}  ${u.merchant.slice(0, 26).padEnd(26)} NO BANK LINE (paid another way, or not imported)`);
  console.log(`${rep.missing.length} line${rep.missing.length === 1 ? "" : "s"} of ${fmt(min)} or more with no receipt, ${fmt(rep.missingCents)} in all:`);
  for (const t of rep.missing) console.log(`  ${t.id}  ${t.date}  ${fmt(t.cents).padStart(11)}  ${t.desc.slice(0, 40)}`);
} else if (cmd === "compare") {
  const vf = flag("--vs-from"), vt = flag("--vs-to");
  if ((from || to) && !(from && to && vf && vt)) { console.error("compare needs --from, --to, --vs-from and --vs-to together, or none of them"); process.exit(2); }
  const c = compareProfit(books, from ? { period: { from, to }, against: { from: vf, to: vt } } : {});
  if (!c) { console.error("nothing is posted yet"); process.exit(1); }
  if (json) { console.log(JSON.stringify(c, null, 2)); process.exit(0); }
  console.log(`${c.period.from} to ${c.period.to}, against ${c.against.from} to ${c.against.to}`);
  for (const [k, l] of [["income", "Income"], ["expense", "Expenses"], ["net", "Net"]]) console.log(`${l.padEnd(9)} ${fmt(c[k].now).padStart(12)} ${fmt(c[k].then).padStart(12)} ${fmt(c[k].now - c[k].then).padStart(12)}`);
  for (const x of c.accounts) console.log(`  ${x.code} ${x.name.slice(0, 26).padEnd(26)} ${fmt(x.now).padStart(11)} ${fmt(x.then).padStart(11)} ${fmt(x.change).padStart(11)}  ${x.pct === null ? x.status : `${(x.pct * 100).toFixed(0)}%${x.status === "gone" ? " gone" : ""}`}${x.hurtsProfit ? "  lowers profit" : ""}`);
  if (c.empty) console.log(`Note: ${c.empty}.`);
  if (c.partial) console.log(`Note: ${c.partial}.`);
} else if (cmd === "payroll") {
  try {
    if (rest[0] === "941") {
      const di = argv.indexOf("--deposited");
      if (di >= 0 && !Number.isFinite(Number(argv[di + 1] ?? NaN))) throw new Error(`--deposited needs a number, got "${argv[di + 1] ?? ""}".`);
      const f = form941(books, rest[1], rest[2], di >= 0 ? { depositedCents: Math.round(Number(argv[di + 1]) * 100) } : {});
      if (json) { console.log(JSON.stringify(f, null, 2)); process.exit(0); }
      console.log(`FORM 941 WORKSHEET ${f.year} Q${f.quarter} (${f.from} to ${f.to}), ${f.runs} run${f.runs === 1 ? "" : "s"}`);
      for (const [l, v] of [["Wages (line 2)", f.wages], ["Federal income tax withheld (line 3)", f.federalWithheld], ...(f.socialSecurityWages == null ? [] : [["Taxable social security wages (line 5a col 1)", f.socialSecurityWages]]), ["Social security tax, both shares (line 5a)", f.socialSecurityTax], ["Medicare tax, both shares (line 5c)", f.medicareTax], ...(f.additionalMedicareWages ? [["Wages over $200,000 (line 5d col 1)", f.additionalMedicareWages], ["Additional Medicare Tax at 0.9% (line 5d)", f.additionalMedicareTax]] : []), ["Total taxes before adjustments", f.totalTaxes], ["Federal deposits due from the register", f.deposited], ...f.monthlyLiability.map((v, i) => [`Tax liability, month ${i + 1} (line 16)`, v]), ...(f.depositsMade == null ? [] : [["Total deposits (line 13)", f.depositsMade], ...(f.balanceDue ? [["Balance due (line 14)", f.balanceDue]] : []), ...(f.overpayment ? [["Overpayment (line 15)", f.overpayment]] : [])]), ["FUTA (Form 940)", f.futa]]) console.log(`  ${l.padEnd(46)} ${fmt(v).padStart(12)}`);
      if (has("--schedule-b")) {
        console.log("  SCHEDULE B (semiweekly depositors): liability by day the wages were paid");
        for (const m of f.scheduleB) console.log(`    ${m.month}  ${m.days.length ? m.days.map((d) => `day ${d.day} ${fmt(d.cents)}`).join(", ") : "no pay dates"}  = ${fmt(m.total)}`);
        console.log(`    Total for the quarter (line 16 / Schedule B)  ${fmt(f.scheduleB.reduce((a, m) => a + m.total, 0))}`);
      }
      for (const w of f.warnings) console.log(`  CHECK ${w}`);
      console.log("  Worksheet only: tips, adjustments and credits are not modelled.");
    } else if (rest[0] === "deposits") {
      const i = argv.indexOf("--schedule");
      const d = depositSchedule(books, rest[1] ?? new Date().getFullYear(), { schedule: i >= 0 ? argv[i + 1] : null });
      if (json) { console.log(JSON.stringify(d, null, 2)); process.exit(0); }
      console.log(`FEDERAL DEPOSITS ${d.year}: ${d.schedule} depositor (${d.basis})${d.nextDay ? ", $100,000 next-day rule hit" : ""}`);
      for (const x of d.deposits) console.log(`  due ${x.due}  ${fmt(x.amount).padStart(11)}  pay dates ${x.from}${x.to !== x.from ? " to " + x.to : ""}  ${x.rule}  ${x.status}${x.paid ? " (" + x.paid + ")" : ""}${x.penalty ? `  late ${x.daysLate}d, about ${x.penaltyPct}% = ${fmt(x.penalty)}` : ""}`);
      for (const w of d.warnings) console.log(`  CHECK ${w}`);
      console.log("  Worksheet only: penalty tier is an estimate; interest, abatement and EFTPS timing are not modelled.");
    } else if (rest[0] === "940") {
      const argOf = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
      const cr = argOf("--credit-reduction");
      const f = form940(books, rest[1], { state: argOf("--state"), creditReduction: cr == null ? undefined : Number(cr) });
      if (json) { console.log(JSON.stringify(f, null, 2)); process.exit(0); }
      console.log(`FORM 940 WORKSHEET ${f.year}, ${f.runs} run${f.runs === 1 ? "" : "s"}`);
      for (const [l, v] of [["Total payments to employees (line 3)", f.wages], ...(f.futaWages == null ? [] : [["Taxable FUTA wages (line 7)", f.futaWages]]), ["FUTA in the register", f.futa], ...(f.computed == null ? [] : [["FUTA at 0.6% of taxable wages", f.computed]]), ["Q1", f.quarters[0]], ["Q2", f.quarters[1]], ["Q3", f.quarters[2]], ["Q4", f.quarters[3]], ["Not yet deposited (carried)", f.dueWithReturn], ...(f.creditReduction == null ? [] : [[`Credit reduction ${f.creditReductionPct}% (Schedule A)`, f.creditReduction]])]) console.log(`  ${l.padEnd(46)} ${fmt(v).padStart(12)}`);
      for (const w of f.warnings) console.log(`  CHECK ${w}`);
      console.log("  Worksheet only: exempt payments and multi-state filers are not modelled.");
    } else if (rest[0] === "reconcile") {
      const t = reconcile941W2(books, rest[1]);
      if (json) { console.log(JSON.stringify(t, null, 2)); process.exit(0); }
      console.log(`FORM 941 AGAINST W-2 TOTALS ${t.year}, ${t.employees} employee${t.employees === 1 ? "" : "s"}`);
      for (const r of t.rows) console.log(`  ${r.ok ? "ok  " : "DIFF"} ${r.label.slice(0, 60).padEnd(60)} ${fmt(r.f941).padStart(12)} ${fmt(r.w2).padStart(12)}`);
      for (const x of t.warnings) console.log(`  CHECK ${x}`);
      console.log("  Worksheet only: tips, adjustments and sick pay are not modelled.");
    } else if (rest[0] === "w2") {
      const w = w2Summary(books, rest[1]);
      if (json) { console.log(JSON.stringify(w, null, 2)); process.exit(0); }
      console.log(`W-2 BOX FIGURES ${w.year}, ${w.employees.length} employee${w.employees.length === 1 ? "" : "s"}`);
      console.log(`  ${"Employee".padEnd(20)} ${["1 wages", "2 fed tax", "3 SS wages", "4 SS tax", "5 Medicare", "6 Med tax", "16 state"].map((h) => h.padStart(11)).join(" ")}`);
      for (const e of w.employees) console.log(`  ${e.employee.slice(0, 20).padEnd(20)} ${[e.box1, e.box2, e.box3, e.box4, e.box5, e.box6, e.state].map((v) => fmt(v).padStart(11)).join(" ")}`);
      for (const x of w.warnings) console.log(`  CHECK ${x}`);
      console.log("  Worksheet only: no SSN, address, box 12 codes or state wages; file with a W-2 service.");
    } else if (rest[0] && existsSync(rest[0])) {
      const r = addPayroll(books, readFileSync(rest[0], "utf8"));
      books = r.books;
      for (const p of r.problems) console.error(p);
      const plan = planPayroll(books);
      let result = null;
      if (has("--apply")) result = applyPayroll(books, plan);
      if (result) books = result.books;
      save();
      if (json) { console.log(JSON.stringify({ added: r.added, skipped: r.skipped, problems: r.problems, ...plan, applied: result?.posted ?? 0 }, null, 2)); process.exit(0); }
      console.log(`${r.added.length} pay run${r.added.length === 1 ? "" : "s"} booked${r.skipped.length ? `, ${r.skipped.length} already in the books` : ""}.`);
      for (const m of plan.matched) console.log(`  ${m.run.padEnd(24)} ${m.kind.padEnd(24)} ${fmt(m.amount).padStart(11)} -> line ${m.line} ${m.lineDate}${m.ambiguous ? "  AMBIGUOUS (skipped by --apply)" : ""}`);
      for (const m of plan.unmatched) console.log(`  ${m.run.padEnd(24)} ${m.kind.padEnd(24)} ${fmt(m.amount).padStart(11)}  NOT MATCHED: ${m.why}`);
      console.log(result ? `${result.posted} bank line${result.posted === 1 ? "" : "s"} filed to 2300.` : plan.matched.length ? "Add --apply to file these lines to 2300." : "Nothing to file.");
    } else {
      const s = payrollSummary(books);
      if (json) { console.log(JSON.stringify({ ...s, register: books.payroll ?? [] }, null, 2)); process.exit(0); }
      for (const r of books.payroll ?? []) console.log(`  ${r.date}  ${String(r.employees).padStart(3)} emp  gross ${fmt(r.gross).padStart(11)}  net ${fmt(r.net).padStart(11)}  employer ${fmt(employerCost(r)).padStart(10)}`);
      console.log(`Accrued ${fmt(s.accrued)}, paid from the bank ${fmt(s.paid)}, still owed ${fmt(s.owed)}`);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "payouts") {
  if (!rest[0] || !existsSync(rest[0])) { console.error("payouts needs the processor's payout reconciliation CSV, e.g. payouts stripe-payouts.csv [--apply]"); process.exit(2); }
  const roles = {};
  for (const k of ["sales", "refunds", "fees", "disputes", "other", "tax", "ads", "reserve", "tips"]) { const v = flag(`--${k}`); if (v) roles[k] = v; }
  const doApply = has("--apply");
  let plan;
  try { plan = planPayouts(books, readPayoutReport(readFileSync(rest[0], "utf8")), roles); } catch (e) { console.error(e.message); process.exit(2); }
  let result = null;
  if (doApply) { try { result = applyPayouts(books, plan); } catch (e) { console.error(e.message); process.exit(1); } books = result.books; save(); }
  if (json) { console.log(JSON.stringify({ ...plan, applied: result?.posted ?? 0 }, null, 2)); process.exit(0); }
  for (const p of plan.problems) console.error(p);
  for (const m of plan.matched) console.log(`${m.id.padEnd(14)} ${m.date}  net ${fmt(m.net).padStart(11)} = gross ${fmt(m.gross)} less fees ${fmt(m.fees)}  -> line ${m.line} ${m.lineDate}${m.ambiguous ? "  AMBIGUOUS (another line fits as well; pass --apply after checking, it is skipped)" : ""}`);
  for (const m of plan.done) console.log(`${m.id.padEnd(14)} ${m.date}  already split on line ${m.line}`);
  for (const m of plan.unmatched) console.log(`${m.id.padEnd(14)} ${m.date}  net ${fmt(m.net).padStart(11)}  NOT MATCHED: ${m.why}`);
  if (plan.pending.length) console.log(`${plan.pending.length} row${plan.pending.length > 1 ? "s" : ""} not paid out yet (${fmt(plan.pending.reduce((a, x) => a + x.net, 0))}); they match once the payout lands.`);
  if (plan.offPlatform?.length) console.log(`${plan.offPlatform.length} cash or other-tender row${plan.offPlatform.length > 1 ? "s" : ""} (${fmt(plan.offPlatform.reduce((a, x) => a + x.net, 0))}) never pass through a payout; book them from the till, not the bank.`);
  console.log(doApply ? `${result.posted} payout${result.posted === 1 ? "" : "s"} split in the books${result.skipped.length ? `, ${result.skipped.length} skipped as ambiguous` : ""}.` : plan.matched.length ? "Add --apply to post these splits." : "Nothing to post.");
} else if (cmd === "form1099k") {
  const year = Number(flag("--year")), gross = parseCents(String(flag("--gross") ?? ""));
  if (!rest[0] || !existsSync(rest[0]) || !Number.isInteger(year) || gross === null || Number.isNaN(gross)) { console.error("form1099k needs the processor's report CSV, --year and --gross (box 1a), e.g. form1099k stripe-payouts.csv --year 2026 --gross 94000.00 [--months 0,0,800,...]"); process.exit(2); }
  let res;
  try {
    const mflag = flag("--months");
    const months = mflag ? String(mflag).split(",").map((v) => parseCents(v)) : null;
    res = reconcile1099K(readPayoutReport(readFileSync(rest[0], "utf8")), { gross, months }, year, books, { sales: flag("--sales") ?? "4000" });
  } catch (e) { console.error(e.message); process.exit(2); }
  if (json) { console.log(JSON.stringify(res, null, 2)); process.exit(0); }
  try { console.log(`Will one be filed? ${reportable1099K(readPayoutReport(readFileSync(rest[0], "utf8")), year, { processor: flag("--processor") ?? defaultProcessor(readPayoutReport(readFileSync(rest[0], "utf8"))) }).why}`); } catch (e) { console.error(e.message); process.exit(2); }
  for (const b of res.bridge) console.log(`${b.label.padEnd(46)} ${fmt(b.cents).padStart(13)}`);
  console.log(`${"Refunds in the report (not netted on the form)".padEnd(46)} ${fmt(res.report.refunds).padStart(13)}`);
  console.log(`${"Fees in the report (not netted on the form)".padEnd(46)} ${fmt(res.report.fees).padStart(13)}`);
  if (res.ledger) console.log(`${`Books: account ${res.ledger.account} (expected ${fmt(res.ledger.expected)})`.padEnd(46)} ${fmt(res.ledger.books).padStart(13)}`);
  if (res.monthly) for (const m of res.monthly) console.log(`  ${m.month}  form ${fmt(m.form).padStart(12)}  report ${fmt(m.report).padStart(12)}${m.diff ? `  differs by ${fmt(m.diff)}` : ""}`);
  for (const n of res.notes) console.log(`- ${n}`);
} else if (cmd === "reconcile") {
  const cents = parseCents(String(flag("--balance") ?? "")), rdate = flag("--date");
  const code = argv[1];
  if (argv.length !== 2 || !rdate || cents === null || cents === undefined || Number.isNaN(cents)) { console.error("reconcile CODE --date YYYY-MM-DD --balance AMOUNT, e.g. reconcile 1000 --date 2026-03-31 --balance 691.50"); process.exit(2); }
  let r;
  try { r = reconcile(books, { account: code, date: rdate, balance: cents }); } catch (e) { console.error(e.message); process.exit(2); }
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(r.agrees ? 0 : 1); }
  console.log(`${name(r.account)} on ${r.date}: books ${fmt(r.book)}, statement ${fmt(r.statement)}${r.agrees ? "  AGREES" : `, difference ${fmt(r.difference)}`}`);
  for (const h of r.hints) console.log(`  [${h.kind}] ${h.message}${h.ids.length ? `  (${h.ids.slice(0, 5).join(", ")}${h.ids.length > 5 ? `, +${h.ids.length - 5} more` : ""})` : ""}`);
  if (!r.agrees && !r.hints.length) console.log("  No single line, pair or still-unfiled line explains it. Compare the statement to the list line by line, and check the opening balance.");
  process.exit(r.agrees ? 0 : 1);
} else if (cmd === "budget") {
  if (rest.length) {
    const cents = parseCents(rest[1] ?? "");
    if (rest.length !== 2 || cents === null || cents === undefined || Number.isNaN(cents)) { console.error("budget CODE AMOUNT, e.g. budget 6130 200"); process.exit(2); }
    try { books = setBudget(books, rest[0], cents); } catch (e) { console.error(e.message); process.exit(2); }
    save();
    console.log(`${name(rest[0])}: ${cents ? `${fmt(cents)} a month` : "budget removed"}`);
    process.exit(0);
  }
  const b = budgetVsActual(books, { from, to });
  if (!b) { console.error("nothing is posted yet"); process.exit(1); }
  if (json) { console.log(JSON.stringify(b, null, 2)); process.exit(0); }
  console.log(`BUDGET ${b.from} to ${b.to} (${b.months} month${b.months === 1 ? "" : "s"})        budget       actual     variance`);
  for (const x of b.rows) console.log(`  ${x.code} ${x.name.slice(0, 26).padEnd(26)} ${fmt(x.budget).padStart(11)} ${fmt(x.actual).padStart(12)} ${fmt(x.variance).padStart(12)}  ${x.status}${x.pct === null ? "" : ` ${(x.pct * 100).toFixed(0)}%`}`);
  console.log(`Net ${fmt(b.net.budget).padStart(37)} ${fmt(b.net.actual).padStart(12)} ${fmt(b.net.variance).padStart(12)}`);
  if (b.empty) console.log(`Note: ${b.empty}.`);
  if (b.partial) console.log(`Note: ${b.partial}.`);
} else if (cmd === "anomalies") {
  const a = findAnomalies(books);
  if (json) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }
  for (const x of a) console.log(`${x.date}  ${fmt(x.cents).padStart(11)}  ${x.kind.padEnd(9)} ${x.desc.slice(0, 30).padEnd(30)} ${x.reason}`);
  console.log(`${a.length} line${a.length === 1 ? "" : "s"} to look at.`);
} else if (cmd === "payees") {
  const r = payeeReport(books, { from, to });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  for (const [h, side] of [["CUSTOMERS (money in)", r.customers], ["SUPPLIERS (money out)", r.suppliers]]) {
    console.log(`${h}: ${fmt(side.total)} from ${side.payees} payee${side.payees === 1 ? "" : "s"}; top 3 are ${(side.top3 * 100).toFixed(0)}%`);
    for (const x of side.rows) console.log(`  ${x.example.slice(0, 32).padEnd(32)} ${fmt(x.cents).padStart(12)} ${(x.share * 100).toFixed(1).padStart(5)}%  ${String(x.count).padStart(3)} line${x.count === 1 ? " " : "s"}  ${x.first} to ${x.last}${x.conduit ? "  (processor or own money)" : ""}`);
  }
  for (const w of r.warnings) console.log(`Warning: ${w}`);
  if (r.unreviewed) console.log(`${r.unreviewed} lines are still in review; they are counted here.`);
} else if (cmd === "forecast") {
  const f = forecastCash(books, { asOf, days: +(flag("--days") ?? 90) });
  if (json) { console.log(JSON.stringify(f, null, 2)); process.exit(0); }
  console.log(`CASH FORECAST ${f.asOf} to ${f.to}: start ${fmt(f.start)}, end ${fmt(f.end)}, lowest ${fmt(f.lowest.cents)} on ${f.lowest.date}.`);
  let bal = f.start;
  for (const it of f.items) { bal += it.cents; console.log(`  ${it.date}  ${fmt(it.cents).padStart(11)}  ${fmt(bal).padStart(12)}  ${it.label}`); }
  if (f.runwayDays !== null) console.log(f.runwayDays === 0 ? "The balance is already below zero." : `The balance goes below zero in ${f.runwayDays} days.`);
} else if (cmd === "cashbasis") {
  const c = cashBasis(books, { from, to });
  if (json) { console.log(JSON.stringify(c, null, 2)); process.exit(0); }
  const p = c.profitAndLoss;
  console.log(`PROFIT AND LOSS, CASH BASIS ${p.months[0] ?? ""} to ${p.months.at(-1) ?? ""}`);
  for (const l of p.income) console.log(`  ${l.name.padEnd(40)} ${fmt(l.total).padStart(12)}`);
  console.log(`  ${"Total income".padEnd(40)} ${fmt(p.totalIncome).padStart(12)}`);
  for (const l of p.expense) console.log(`  ${l.name.padEnd(40)} ${fmt(l.total).padStart(12)}`);
  console.log(`  ${"Total expenses".padEnd(40)} ${fmt(p.totalExpense).padStart(12)}\n  ${"Net profit (cash)".padEnd(40)} ${fmt(p.net).padStart(12)}`);
  console.log(`  ${"Net profit (accrual)".padEnd(40)} ${fmt(c.accrual.net).padStart(12)}\n  ${"Timing difference".padEnd(40)} ${fmt(c.timing.net).padStart(12)}   (accrual less cash: invoiced or billed, not yet paid)`);
  for (const n of c.notes) console.log(`  Note: ${n}`);
  console.log("Not tax advice: check the method your return uses.");
} else if (cmd === "aging") {
  const a = aging(books, asOf);
  if (json) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }
  console.log(`AGING as of ${a.asOf}`);
  for (const [h, side] of [["Receivable (owed to you)", a.receivable], ["Payable (you owe)", a.payable]]) console.log(`  ${h.padEnd(26)} ${fmt(side.total).padStart(12)}   ${a.buckets.map((b, i) => `${b}: ${fmt(side.byBucket[i])}`).join("  ")}`);
  for (const d of a.open) console.log(`    ${d.id.padEnd(14)} ${d.party.slice(0, 28).padEnd(28)} ${fmt(d.total).padStart(11)}  due ${d.due ?? d.date}  ${d.credit ? "credit not applied" : d.daysLate ? `${d.daysLate} days late` : "not due"}${d.partlyPaid ? `  (of ${fmt(d.original)})` : ""}`);
} else if (cmd === "trip") {
  try {
    if (rest[0] === "add") {
      const r = addTrip(books, { miles: rest[1], date: flag("--date"), purpose: flag("--purpose"), from: from ?? "", to: to ?? "" });
      books = r.books; save(); console.log(`${r.trip.id} ${r.trip.date} ${r.trip.miles} miles: ${r.trip.purpose}`);
    } else if (rest[0] === "remove" && rest[1]) { books = removeTrip(books, rest[1]); save(); console.log(`Removed ${rest[1]}.`); }
    else if (rest[0] === "list") {
      const y = flag("--year"), trips = (books.mileage ?? []).filter((t) => !y || t.date.startsWith(`${y}-`));
      if (json) { console.log(JSON.stringify(trips, null, 2)); process.exit(0); }
      for (const t of trips) console.log(`  ${t.id.padEnd(6)} ${t.date} ${String(t.miles).padStart(7)} mi  ${t.purpose}${t.from || t.to ? ` (${t.from ?? ""} to ${t.to ?? ""})` : ""}`);
      if (y) { const m = mileageDeduction(books, +y); console.log(`  ${y}: ${m.miles} miles${m.rate ? ` (${m.label}) = ${fmt(m.cents)}` : ""}`); for (const w of m.warnings) console.log(`  ! ${w}`); }
      if (!trips.length) console.log("  no trips logged");
    } else { console.error("trip add MILES --date D --purpose TEXT, trip list [--year Y], or trip remove ID"); process.exit(2); }
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "homeoffice") {
  try {
    books = setHomeOffice(books, { sqft: rest[0], from, to }); save();
    console.log(books.homeOffice ? `Home office: ${books.homeOffice.sqft} sq ft (${Math.min(books.homeOffice.sqft, 300)} count).` : "Home office removed.");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "rental") {
  try {
    const sub = rest[0];
    if (sub === "accounts") { books = addRentalAccounts(books); save(); console.log("Rental accounts added (4300 rental income, 6200 to 6230, 2400 deposits held)."); }
    else if (sub === "add") { books = addProperty(books, { id: rest[1], name: rest.slice(2).join(" ") }); save(); console.log(`Property ${rest[1]} saved.`); }
    else if (sub === "tag" || sub === "untag") {
      const ids = flag("--ids"), match = flag("--match"), account = flag("--account");
      const r = tagProperty(books, sub === "tag" ? rest[1] : null, { ids: ids ? ids.split(",") : null, match, account });
      books = r.books; save(); console.log(`${r.tagged} line${r.tagged === 1 ? "" : "s"} ${sub === "tag" ? `tagged ${rest[1]}` : "untagged"}.`);
    } else if (sub === "list" || !sub) {
      for (const p of books.properties ?? []) console.log(`  ${p.id.padEnd(14)} ${p.name}  (${books.transactions.filter((t) => t.property === p.id).length} tagged lines)`);
      if (!(books.properties ?? []).length) console.log("  No properties. rental add oak 12 Oak St");
    } else throw new Error("rental accounts | add ID [NAME] | tag ID --match TEXT | untag --match TEXT | list");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "project") {
  try {
    const sub = rest[0];
    if (sub === "add") { books = addProject(books, { id: rest[1], name: rest.slice(2).join(" ") }); save(); console.log(`Project ${rest[1]} saved.`); }
    else if (sub === "tag" || sub === "untag") {
      const ids = flag("--ids"), match = flag("--match"), account = flag("--account"), docs = flag("--docs");
      const r = tagProjectLines(books, sub === "tag" ? rest[1] : null, { ids: ids ? ids.split(",") : null, match, account, docs: docs ? docs.split(",") : null });
      books = r.books; save(); console.log(`${r.tagged} item${r.tagged === 1 ? "" : "s"} ${sub === "tag" ? `tagged ${rest[1]}` : "untagged"}.`);
    } else if (sub === "list" || !sub) {
      for (const p of books.projects ?? []) console.log(`  ${p.id.padEnd(14)} ${p.name}  (${books.transactions.filter((t) => t.project === p.id).length} tagged lines, ${(books.documents ?? []).filter((d) => d.project === p.id).length} documents)`);
      if (!(books.projects ?? []).length) console.log("  No projects. project add kitchen Kitchen reno");
    } else throw new Error("project add ID [NAME] | tag ID --match TEXT | untag --match TEXT | list");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "projects") {
  const r = projectReport(books, { from, to });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  if (has("--csv")) { process.stdout.write(projectCsv(r)); process.exit(0); }
  console.log(`PROFIT AND LOSS BY PROJECT${from || to ? ` ${from ?? ""}..${to ?? ""}` : ""}`);
  for (const p of r.projects) console.log(`  ${p.name.padEnd(24)} revenue ${projectMoney(p.revenue).padStart(12)}  cost ${projectMoney(p.cost).padStart(12)}  net ${projectMoney(p.net).padStart(12)}  ${p.margin === null ? "" : `${(p.margin * 100).toFixed(1)}%`}`);
  console.log(`  ${"Total".padEnd(24)} revenue ${projectMoney(r.total.revenue).padStart(12)}  cost ${projectMoney(r.total.cost).padStart(12)}  net ${projectMoney(r.total.net).padStart(12)}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
} else if (cmd === "schedulee") {
  const se = scheduleE(books, { from, to });
  if (json) { console.log(JSON.stringify(se, null, 2)); process.exit(0); }
  if (has("--csv")) { process.stdout.write(scheduleECsv(se)); process.exit(0); }
  console.log(`SCHEDULE E PART I WORKSHEET${from || to ? ` ${from ?? ""}..${to ?? ""}` : ""}`);
  for (const p of se.properties) {
    console.log(`\n  ${p.name}${p.address ? ` (${p.address})` : ""}`);
    for (const l of p.lines) console.log(`    ${l.line.padEnd(3)} ${l.label.padEnd(34)} ${fmt(l.cents).padStart(12)}`);
    console.log(`    20  ${"Total expenses".padEnd(34)} ${fmt(p.totalExpenses).padStart(12)}\n    21  ${"Income or (loss)".padEnd(34)} ${fmt(p.net).padStart(12)}`);
  }
  console.log(`\n  All properties: rents ${fmt(se.total.rents)}, expenses ${fmt(se.total.totalExpenses)}, net ${fmt(se.total.net)}`);
  for (const w of se.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet for you or your preparer. Not tax advice; it leaves out passive-loss limits, personal-use days and the depreciation schedule.");
} else if (cmd === "schedulec") {
  const yr = flag("--year");
  const sc = scheduleC(books, { from, to, mealsPct: flag("--meals") !== null ? +flag("--meals") : 50, year: yr ? +yr : null });
  if (json) { console.log(JSON.stringify(sc, null, 2)); process.exit(0); }
  if (has("--csv")) { process.stdout.write(scheduleCCsv(sc)); process.exit(0); }
  console.log(`SCHEDULE C WORKSHEET${from || to ? ` ${from ?? ""}..${to ?? ""}` : ""}`);
  for (const l of sc.lines) console.log(`  ${l.line.padEnd(4)} ${l.label.padEnd(36)} ${fmt(l.cents).padStart(12)}`);
  console.log(`  7    ${"Gross income".padEnd(36)} ${fmt(sc.grossIncome).padStart(12)}\n  28   ${"Total expenses".padEnd(36)} ${fmt(sc.totalExpenses).padStart(12)}\n  31   ${"Net profit or (loss)".padEnd(36)} ${fmt(sc.netProfit).padStart(12)}`);
  if (sc.meals.booked) console.log(`  Meals booked ${fmt(sc.meals.booked)}, ${sc.meals.pct}% carried to 24b.`);
  for (const w of sc.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet for you or your preparer. Not tax advice; it leaves out depreciation and self-employment tax, and mileage and home office unless you pass --year.");
} else if (cmd === "se") {
  const yr = flag("--year"), mo = flag("--months"), wg = flag("--wages");
  const r = seSetAside(books, { year: yr ? +yr : new Date().getFullYear(), monthsElapsed: mo ? +mo : 12, wages: wg ? Math.round(+wg * 100) : 0 });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(`SELF-EMPLOYMENT TAX ${r.year}  (profit to date ${fmt(r.profitToDate)} over ${r.monthsElapsed} months, annualised ${fmt(r.annualisedProfit)})`);
  console.log(`  Net earnings (92.35%)  ${fmt(r.se.netEarnings).padStart(12)}\n  Social security 12.4%  ${fmt(r.se.socialSecurity).padStart(12)}\n  Medicare 2.9%          ${fmt(r.se.medicare).padStart(12)}\n  Tax                    ${fmt(r.se.tax).padStart(12)}   (half, ${fmt(r.se.deduction)}, is deductible)`);
  for (const p of r.payments) console.log(`  set aside by ${p.due}  ${fmt(p.cents).padStart(12)}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet. Not tax advice; it leaves out income tax, the 0.9% additional Medicare tax and state tax.");
} else if (cmd === "scorp") {
  const yr = flag("--year"), mo = flag("--months"), c = (n) => { const v = flag(n); return v !== null ? Math.round(+v * 100) : undefined; };
  try {
    const r = scorpFromBooks(books, { year: yr ? +yr : new Date().getFullYear(), monthsElapsed: mo ? +mo : 12, filing: flag("--filing") ?? "single", salary: c("--salary"), salaryPct: flag("--salary-pct") !== null ? +flag("--salary-pct") / 100 : undefined, extraCost: c("--extra-cost"), stateUnemployment: c("--suta"), otherIncome: c("--other-income"), service: has("--service") });
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`S-CORPORATION ELECTION ${r.year} (${r.filing}), profit annualised ${fmt(r.profit)}, salary ${fmt(r.salary)}`);
    const row = (l, a, b) => console.log(`  ${l.padEnd(26)} ${fmt(a).padStart(12)} ${fmt(b).padStart(12)}`);
    console.log(`  ${"".padEnd(26)} ${"Sole prop".padStart(12)} ${"S corp".padStart(12)}`);
    row("Income tax", r.sole.incomeTax, r.scorp.incomeTax); row("Payroll / SE tax", r.sole.payrollTax, r.scorp.payrollTax); row("Yearly cost of the entity", 0, r.scorp.extraCost); row("All in", r.sole.allIn, r.scorp.allIn);
    console.log(`  ${r.savings >= 0 ? "S corporation saves" : "S corporation costs"} ${fmt(Math.abs(r.savings))} at this salary; break-even profit ${r.breakEven === null ? "not found up to $500,000" : fmt(r.breakEven)}.`);
    console.log("  Salary sweep (share of profit -> saving): " + r.sweep.map((x) => `${x.salaryPct}% ${fmt(x.savings)}`).join(", "));
    for (const w of r.warnings) console.log(`  ! ${w}`);
    console.log("  A worksheet. Not tax advice; the salary must be reasonable for the work, and state tax is left out.");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "estimate") {
  const yr = flag("--year"), mo = flag("--months"), c = (n) => { const v = flag(n); return v !== null ? Math.round(+v * 100) : undefined; };
  try {
    const ttFile = flag("--tax-table");
    const table = ttFile ? taxTableOptions(JSON.parse(readFileSync(ttFile, "utf8"))) : {};
    const stateRatePct = flag("--state-rate");
    const r = estimatedTax(books, { ...table, year: yr ? +yr : new Date().getFullYear(), monthsElapsed: mo ? +mo : 12, filing: flag("--filing") ?? "single", wages: c("--wages"), otherIncome: c("--other"), withholding: c("--withholding"), paid: c("--paid"), priorYearTax: c("--prior-tax"), priorAgi: c("--prior-agi"), healthInsurance: c("--health-insurance"), retirement: c("--retirement"), over65: +(flag("--over65") ?? 0), blind: +(flag("--blind") ?? 0), children: +(flag("--children") ?? 0), otherDependents: +(flag("--other-dependents") ?? 0), asOf: asOf ?? undefined, qbi: has("--no-qbi") ? false : undefined, service: has("--service"), businessWages: c("--business-wages"), itemized: c("--itemized"), investmentIncome: c("--investment"), eitcChildren: flag("--eitc-children") !== undefined ? +flag("--eitc-children") : undefined, eitcTable: has("--eitc-table"), stateRate: stateRatePct !== null ? +stateRatePct / 100 : undefined, stateDeduction: c("--state-deduction"), stateWithheld: c("--state-withheld") });
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`FEDERAL ESTIMATE ${r.year} (${r.filing}), profit annualised ${fmt(r.profit)}`);
    console.log(`${r.healthDeduction ? `  Health insurance (7206)  ${fmt(r.healthDeduction).padStart(12)}\n` : ""}${r.retirementDeduction ? `  Retirement contribution  ${fmt(r.retirementDeduction).padStart(12)}\n` : ""}  Adjusted gross income    ${fmt(r.agi).padStart(12)}\n  Standard deduction       ${fmt(r.standardDeduction).padStart(12)}\n  QBI deduction            ${fmt(r.qbiDeduction).padStart(12)}\n  Taxable income           ${fmt(r.taxable).padStart(12)}\n  Income tax (${Math.round(r.marginalRate * 100)}% top)    ${fmt(r.incomeTax).padStart(12)}\n  Self-employment tax      ${fmt(r.se.tax).padStart(12)}\n  Additional Medicare tax  ${fmt(r.addlMedicare).padStart(12)}\n  Total                    ${fmt(r.totalTax).padStart(12)}  (${(r.effectiveRate * 100).toFixed(1)}% of income)`);
    console.log(`  Safe harbour: 90% of this year ${fmt(r.safeHarbor.current90)}${r.safeHarbor.prior != null ? `, prior year ${fmt(r.safeHarbor.prior)}` : ""}; pay ${fmt(r.safeHarbor.required)} in estimates`);
    for (const p of r.payments) console.log(`  ${p.due}  ${p.status === "past" ? "(past)".padStart(12) : fmt(p.cents).padStart(12)}`);
    if (r.state) console.log(`  State tax at ${(r.state.rate * 100).toFixed(2)}% of ${fmt(r.state.base)}: ${fmt(r.state.tax)}, less ${fmt(r.state.withheld)} withheld = ${fmt(r.state.balance)} (about ${fmt(r.state.quarterly)} a quarter); not in the federal total above`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
    console.log(`  A worksheet. Not tax advice; it leaves out ${r.state ? "state brackets" : "state tax"}, credits and itemised deductions.`);
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "annualized") {
  const yr = flag("--year"), c = (n) => { const v = flag(n); return v !== null ? Math.round(+v * 100) : undefined; };
  try {
    const ttFile = flag("--tax-table");
    const table = ttFile ? taxTableOptions(JSON.parse(readFileSync(ttFile, "utf8"))) : {};
    const payments = [];
    process.argv.forEach((a, i) => { if (a === "--payment") { const [d, v] = (process.argv[i + 1] ?? "").split(":"); if (!/^\d{4}-\d\d-\d\d$/.test(d ?? "") || !Number.isFinite(+v)) { console.error("--payment takes DATE:AMOUNT, like 2026-04-15:1500"); process.exit(1); } payments.push({ date: d, cents: Math.round(+v * 100) }); } });
    const r = annualizedInstallments(books, { ...table, year: yr ? +yr : new Date().getFullYear(), filing: flag("--filing") ?? "single", wages: c("--wages"), otherIncome: c("--other"), withholding: c("--withholding"), priorYearTax: c("--prior-tax"), priorAgi: c("--prior-agi"), payments });
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`ANNUALIZED INCOME INSTALLMENTS ${r.year} (Form 2210 Schedule AI), required annual payment ${fmt(r.requiredAnnual)}, regular quarter ${fmt(r.regularQuarter)}`);
    console.log("  Due         Profit to date  Annualized tax  Installment  Cumulative  Regular cum.  Credits  Short (annualized / regular)");
    for (const x of r.rows) console.log(`  ${x.due}  ${fmt(x.profitToDate).padStart(13)}  ${fmt(x.annualizedTax).padStart(14)}  ${fmt(x.installment).padStart(11)}  ${fmt(x.cumulativeRequired).padStart(10)}  ${fmt(x.regularCumulative).padStart(12)}  ${fmt(x.creditsByDue).padStart(7)}  ${fmt(x.shortfall)} / ${fmt(x.regularShortfall)}`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
    console.log("  A worksheet. Not tax advice; the penalty rate and the form's alternative periods are not modelled.");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "retirement") {
  const yr = flag("--year"), mo = flag("--months"), ag = flag("--age"), wg = flag("--wages");
  const year = yr ? +yr : new Date().getFullYear(), months = Math.min(12, Math.max(1, mo ? +mo : 12));
  try {
    const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
    const r = retirementLimits(Math.round((sc.netProfit * 12) / months), { year, age: ag ? +ag : 40, wages: wg ? Math.round(+wg * 100) : 0 });
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`RETIREMENT CONTRIBUTION LIMITS ${r.year} (profit annualised ${fmt(r.profit)}, after half SE tax ${fmt(r.earned)})`);
    console.log(`  SEP-IRA, most you can put in       ${fmt(r.sep.max).padStart(12)}`);
    console.log(`  Solo 401(k): employee deferral     ${fmt(r.solo401k.employee).padStart(12)}\n               employer share (20%)  ${fmt(r.solo401k.employer).padStart(12)}\n               total                 ${fmt(r.solo401k.total).padStart(12)}`);
    for (const w of r.warnings) console.log(`  ! ${w}`);
    console.log("  A worksheet. Not tax advice; plan rules and your other plans decide what you can actually contribute.");
  } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "b-notice") {
  try {
    const r = bNoticeDates(rest[0], { received: flag("--received") ?? null, second: has("--second"), firstNotice: flag("--first-notice") ?? null, bNoticeSent: flag("--b-notice-sent") ?? null });
    if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    console.log(`CP2100 ${r.second ? "(second notice) " : ""}counted from ${r.base}\n  mail the ${r.second ? "Second" : "First"} B Notice by ${r.mailBNoticeBy}, enclosing ${r.enclose}\n  start ${r.rate * 100}% backup withholding by ${r.startWithholdingBy} unless a signed W-9 arrives first (stop within ${r.stopWithholdingWithinDays} calendar days of receiving it)${r.disregard ? "\n  Pub. 1281 Q17: this second CP2100 is in the same calendar year as the first, so you may disregard it" : ""}\n  ${r.note}\n  Worksheet dates from the IRS B-program pages, not tax advice.`);
  } catch (e) { console.error(e.message); process.exit(2); }
} else if (cmd === "contractors") {
  const yr = flag("--year"), th = flag("--threshold");
  const r = contractors1099(books, { year: yr ? +yr : undefined, threshold: th !== null ? Math.round(+th * 100) : undefined });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  if (has("--csv")) { process.stdout.write(contractors1099Csv(r)); process.exit(0); }
  if (has("--filing")) { process.stdout.write(nec1099FilingCsv(r)); process.exit(0); }
  console.log(`CONTRACT LABOR ${r.year}, 1099-NEC line ${fmt(r.threshold)}`);
  for (const p of r.payees) console.log(`  ${p.name.slice(0, 34).padEnd(34)} ${fmt(p.cents).padStart(12)}  ${p.over ? "REPORT" : "under "}  ${p.w9 ? "W-9 on file" : "no W-9"}${p.cardCents ? `  (+${fmt(p.cardCents)} by card)` : ""}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet, not a filing. Whether someone is a contractor, and any exemption, is for you or your preparer to decide.");
} else if (cmd === "taxpack") {
  const out = flag("--out");
  if (!/^\d{4}$/.test(rest[0] ?? "")) { console.error("taxpack needs a four-digit year"); process.exit(2); }
  const pack = taxPack(books, rest[0]);
  const dir = out ?? `taxpack-${rest[0]}`;
  mkdirSync(dir, { recursive: true });
  for (const [n, t] of Object.entries(pack.files)) writeFileSync(join(dir, n), t);
  console.log(`${Object.keys(pack.files).length} files in ${dir}/ (start with INDEX.txt)`);
  for (const n of pack.notes) console.log(`  ! ${n}`);
} else if (cmd === "merge-payee") {
  if (!rest[0] || !rest[1]) { console.error("merge-payee needs two payee names as they appear on the bank lines"); process.exit(2); }
  try { books = mergePayees(books, rest[0], rest[1], !has("--off")); save(); console.log(has("--off") ? "Merge undone." : `"${rest[0]}" is now counted with "${rest[1]}".`); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "w9") {
  if (!rest[0]) { console.error("w9 needs a payee name as it appears on the bank line"); process.exit(2); }
  const off = has("--off");
  try { books = markW9(books, rest[0], !off); save(); console.log(off ? "W-9 flag cleared." : "W-9 marked on file."); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "calendar") {
  const year = +(flag("--year") ?? new Date().getFullYear()), state = flag("--state");
  const plannedArg = flag("--planned");
  const planned = plannedArg ? plannedArg.split(",").map((v) => Math.round(parseFloat(v.replace(/[$\s]/g, "")) * 100)) : null;
  if (planned && (planned.length !== 4 || planned.some((n) => !Number.isFinite(n) || n < 0))) { console.error("--planned needs four dollar amounts, e.g. --planned 1200,1200,1200,1500"); process.exit(2); }
  const ev = taxCalendar(year, { state, frequency: flag("--freq") ?? "quarterly", payroll: has("--payroll"), contractors: has("--contractors"), estimates: planned });
  const out = flag("--ics");
  if (out) { writeFileSync(out, toIcs(ev, { name: `${year} tax calendar` })); console.log(`wrote ${ev.length} events to ${out}; import or subscribe to it in your calendar app.`); }
  else if (json) console.log(JSON.stringify(ev, null, 2));
  else { for (const e of ev) console.log(`${e.date}  ${e.title}`); console.log("  Dates to plan from, not advice: confirm your state's and your own deadlines."); }
} else if (cmd === "salestax" && rest[0] === "return") {
  const specs = (name) => { const out = []; for (let v = flag(name); v; v = flag(name)) out.push(v); return out; };
  const rates = parseRateSpecs(specs("--rate"));
  let t;
  const discounts = parseDiscountSpecs(specs("--discount"));
  for (const [k, d] of Object.entries(stateDiscounts(flag("--state")))) if (!(k in discounts)) discounts[k] = d;
  try { t = salesTaxReturn(books, { frequency: flag("--freq") ?? "quarterly", endMonth: flag("--end-month") ? Number(flag("--end-month")) : stateEndMonth(flag("--state"), flag("--freq") ?? "quarterly"), dueDay: flag("--due-day") ? Number(flag("--due-day")) : stateDueDay(flag("--state"), flag("--freq") ?? "quarterly"), from, to, rates, discounts, rollover: !has("--no-rollover"), asOf: new Date().toISOString().slice(0, 10) }); } catch (e) { console.error(e.message); process.exit(2); }
  const stateNote = stateFilingNote(flag("--state"), t.frequency);
  if (stateNote) t.warnings.push(stateNote);
  if (json) { console.log(JSON.stringify(t, null, 2)); process.exit(0); }
  console.log(`SALES TAX RETURN WORKSHEET (${t.frequency})`);
  for (const p of t.periods) {
    console.log(`  ${p.period}   non-taxable sales ${fmt(p.nonTaxableSales)}`);
    for (const r of p.rows) console.log(`    ${r.jurisdiction.padEnd(18)} taxable ${fmt(r.taxableSales).padStart(12)}  tax ${fmt(r.tax).padStart(10)}  rate ${r.rate == null ? "-" : (r.rate * 100).toFixed(2) + "%"}  due ${r.due}${r.discount ? `  discount ${fmt(r.discount)}` : ""}`);
    console.log(`    payable ${fmt(p.payable)}  paid over ${fmt(p.paid)}  still owed ${fmt(p.owed)}`);
  }
  for (const w of t.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet to check a return against, not a filing. Rates, exemptions, vendor discounts and due dates are your state's to say.");
} else if (cmd === "salestax") {
  const t = salesTax(books, { from, to });
  if (json) { console.log(JSON.stringify(t, null, 2)); process.exit(0); }
  console.log(`SALES TAX (account ${t.account})\n  ${"month".padEnd(8)} ${["sales", "collected", "credited", "paid over", "owed"].map((h) => h.padStart(12)).join(" ")}`);
  for (const r of t.months) console.log(`  ${r.month.padEnd(8)} ${[r.sales, r.collected, r.credited, r.remitted, r.owed].map((v) => fmt(v).padStart(12)).join(" ")}`);
  console.log(`  ${"total".padEnd(8)} ${[t.totals.sales, t.totals.collected, t.totals.credited, t.totals.remitted, t.owed].map((v) => fmt(v).padStart(12)).join(" ")}`);
} else if (cmd === "vat") {
  const v = vatReturn(books, { from, to });
  if (json) { console.log(JSON.stringify(v, null, 2)); process.exit(0); }
  const label = { 1: "VAT due on sales", 2: "VAT due on EU acquisitions", 3: "Total VAT due", 4: "VAT reclaimed on purchases", 5: v.payable === "pay" ? "Net VAT to pay" : "Net VAT to reclaim", 6: "Sales ex VAT (whole)", 7: "Purchases ex VAT (whole)", 8: "EU supplies ex VAT", 9: "EU acquisitions ex VAT" };
  console.log(`VAT RETURN WORKSHEET${v.from || v.to ? ` (${v.from ?? "start"} to ${v.to ?? "end"})` : ""}`);
  for (const k of Object.keys(v.boxes)) console.log(`  Box ${k}  ${label[k].padEnd(30)} ${(k >= 6 ? String(v.boxes[k]) : fmt(Math.abs(v.boxes[k]))).padStart(12)}`);
  console.log(`  VAT already paid over by bank lines in the period: ${fmt(v.paid)}`);
  for (const w of v.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet to check a return against, not a filing. Scheme, rates and partial exemption are yours to decide.");
} else if (cmd === "gst") {
  const region = (flag("--region") ?? "ca").toLowerCase();
  const g = gstReturn(books, { region, from, to });
  if (json) { console.log(JSON.stringify(g, null, 2)); process.exit(0); }
  const label = region === "ca"
    ? { 101: "Sales before GST/HST", 103: "GST/HST collected", 105: "Total GST/HST to remit", 106: "Input tax credits", 108: "Total credits", 109: g.payable === "pay" ? "Net tax to pay" : "Net tax refund" }
    : { G1: "Total sales (with GST)", "1A": "GST on sales", G11: "Purchases (with GST)", "1B": "GST on purchases", net: g.payable === "pay" ? "Net GST to pay" : "Net GST refund" };
  console.log(`${region === "ca" ? "GST/HST RETURN" : "BAS GST"} WORKSHEET${g.from || g.to ? ` (${g.from ?? "start"} to ${g.to ?? "end"})` : ""}`);
  for (const [k, v] of Object.entries(g.lines)) console.log(`  ${k.padEnd(4)} ${label[k].padEnd(26)} ${(region === "ca" ? fmt(Math.abs(v)) : String(Math.abs(v))).padStart(12)}`);
  for (const w of g.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet to check a return against, not a filing.");
} else if (cmd === "rules") {
  const sug = suggestRules(books);
  for (const r of sug) console.log(`${r.rule.padEnd(40)} ${r.count} times, ${Math.round(r.share * 100)}% to ${name(r.account)}`);
  if (has("--apply") && sug.length) { books = addRules(books, sug.map((r) => r.rule)); save(); console.log(`${sug.length} rule(s) added.`); }
  else console.log(sug.length ? `${sug.length} suggested. Run again with --apply to add them.` : "No payee has been filed the same way often enough.");
} else if (cmd === "accept") {
  const before = status(books).review;
  books = acceptSuggestions(books, rest[0] ? +rest[0] : 0.7);
  save();
  console.log(`${before - status(books).review} suggestions accepted. ${status(books).review} still waiting.`);
} else if (cmd === "ai") {
  const { configFromEnv } = await import("./byok.mjs");
  const { aiSuggest } = await import("./ai.mjs");
  const r = await aiSuggest(configFromEnv(process.env), books);
  if (r.source !== "model") { console.error(`AI is off or failed: ${r.error ?? "no provider configured"}. Set LLM_PROVIDER=ollama and LLM_MODEL, or ANTHROPIC_API_KEY.`); process.exit(1); }
  books = categorize(r.books);
  save();
  console.log(`${r.suggested} lines have an AI suggestion (${r.dropped} answers dropped). Review them with "review", then "confirm" or "accept".`);
} else if (cmd === "report") {
  const r = reports(books, { from, to });
  if (json) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  const p = r.profitAndLoss, b = r.balanceSheet;
  console.log(`PROFIT AND LOSS ${p.months[0] ?? ""} to ${p.months.at(-1) ?? ""}`);
  for (const l of p.income) console.log(`  ${l.name.padEnd(40)} ${fmt(l.total).padStart(12)}`);
  console.log(`  ${"Total income".padEnd(40)} ${fmt(p.totalIncome).padStart(12)}`);
  for (const l of p.expense) console.log(`  ${l.name.padEnd(40)} ${fmt(l.total).padStart(12)}`);
  console.log(`  ${"Total expenses".padEnd(40)} ${fmt(p.totalExpense).padStart(12)}\n  ${"Net profit".padEnd(40)} ${fmt(p.net).padStart(12)}\n`);
  console.log("BALANCE SHEET");
  for (const [h, list] of [["Assets", b.assets], ["Liabilities", b.liabilities], ["Equity", b.equity]]) { console.log(`  ${h}`); for (const l of list) console.log(`    ${l.name.padEnd(38)} ${fmt(l.amount).padStart(12)}`); }
  console.log(`    ${"Current earnings".padEnd(38)} ${fmt(b.currentEarnings).padStart(12)}`);
  console.log(`  Assets ${fmt(b.totalAssets)} = liabilities ${fmt(b.totalLiabilities)} + equity ${fmt(b.totalEquity)}: ${b.balanced ? "balanced" : "NOT BALANCED"}`);
  const c = r.cashFlow;
  console.log("\nCASH FLOW (indirect)");
  const row = (n, v) => console.log(`  ${n.padEnd(40)} ${fmt(v).padStart(12)}`);
  row("Net profit", c.netProfit);
  for (const l of c.operatingItems) row(`Change in ${l.name.toLowerCase()}`, l.amount);
  row("Cash from operations", c.operating);
  for (const l of c.investingItems) row(l.name, l.amount);
  row("Cash from investing", c.investing);
  for (const l of c.financingItems) row(l.name, l.amount);
  row("Cash from financing", c.financing);
  row("Change in cash", c.change);
  row("Free cash flow (operations less purchases)", c.freeCashFlow);
  if (c.monthlyBurn) console.log(`  Burn ${fmt(c.monthlyBurn)} a month before financing${c.runwayMonths == null ? "; no cash left" : `; ${c.runwayMonths} months of runway at this pace`}`);
  console.log(`  Cash ${fmt(c.openingCash)} -> ${fmt(c.closingCash)}: ${c.ties ? "ties to the bank accounts" : "DOES NOT TIE"}`);
  const bm = r.cashByMonth;
  if (bm.months.length > 1) {
    console.log("\n  Month      Operations   Investing   Financing  Closing cash");
    for (const m of bm.months) console.log(`  ${m.month} ${fmt(m.operating).padStart(12)} ${fmt(m.investing).padStart(11)} ${fmt(m.financing).padStart(11)} ${fmt(m.closingCash).padStart(13)}`);
    if (bm.recentBurn) console.log(`  Last three months burn ${fmt(bm.recentBurn)} a month${bm.recentRunwayMonths == null ? "; no cash left" : `; ${bm.recentRunwayMonths} months of runway at that pace`}`);
  }
  const k = r.ratios, pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`), x = (v) => (v == null ? "n/a" : v.toFixed(2));
  console.log(`\n  Ratios: gross margin ${pct(k.grossMargin)}, net margin ${pct(k.netMargin)}, working capital ${fmt(k.workingCapital)}`);
  console.log(`  Current ratio ${x(k.currentRatio)}, quick ratio ${x(k.quickRatio)}, debt to equity ${x(k.debtToEquity)} (the loan counts as long term)`);
  if (k.receivableDays != null || k.payableDays != null) console.log(`  Customers take ${k.receivableDays ?? "n/a"} days to pay; suppliers are paid in ${k.payableDays ?? "n/a"} days (open balance over the period's flow)`);
  const be = r.breakEven;
  if (be) console.log(`  Break-even: fixed costs ${fmt(be.monthlyFixed)} a month at a ${pct(be.contributionMargin)} contribution margin ${be.breakEvenMonthly == null ? "never cover themselves (each sale leaves nothing after its own costs)" : `need ${fmt(be.breakEvenMonthly)} of income a month; you made ${fmt(be.monthlyIncome)} (${pct(be.marginOfSafety)} margin of safety)`}`);
  const s = status(books);
  if (s.review) console.log(`\n${s.review} lines are still in review and not in these figures.`);
} else if (cmd === "checks") {
  const c = closeChecks(books, opts);
  if (json) console.log(JSON.stringify(c, null, 2));
  else for (const x of c) console.log(`[${x.severity}] ${x.message}`);
} else if (cmd === "export") {
  process.stdout.write(rest[0] === "lines" ? exportLines(books) : exportJournal(books, rest[0] ?? "csv"));
} else {
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exit(2);
}
