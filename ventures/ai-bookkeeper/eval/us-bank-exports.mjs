// The bank readers on US bank and card exports that people committed to public
// GitHub repositories (flagship item 2: "the bank readers on real US bank
// exports"). None of these files carries a licence we can copy under, and some
// hold real names and account digits, so they are fetched at run time into a
// cache directory and never committed; only the counts below are kept.
//
//   node eval/us-bank-exports.mjs [--cache DIR] [--show]
//
// Each source is a path on raw.githubusercontent.com (reachable from cloud
// sessions). For each file the script reports the layout `sniffBank` names,
// how many data lines were read, which were skipped and why, the running
// balance chain where the file prints one, and a sign check: on a card file
// the payment rows ("PAYMENT", "THANK YOU", "AUTOPAY") must come in as money
// in, and on a checking file payroll, deposits and Zelle/transfer-from rows
// must too. A file whose rows look made up (EXAMPLE, "John Doe", sample
// fixtures) is marked `kind: "layout"`: it tests the column layout only.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readStatement, checkRunningBalance } from "../bank.mjs";
import { pathToFileURL } from "node:url";

// kind: "download" = looks like a person's own statement download (real merchants,
// dated statement-period file names); "layout" = anonymised or sample rows in the
// bank's real column layout.
export const SOURCES = [
  { bank: "citi", kind: "download", card: true, path: "pdeepanraj/expensefiles/HEAD/files/2025/Citi_Costco_2025.CSV" },
  { bank: "citi", kind: "download", card: true, path: "pdeepanraj/expensefiles/HEAD/files/2025/Citi_Double_2025.CSV" },
  { bank: "citi", kind: "download", card: true, path: "ste900811/creditCardParser/HEAD/statements/stevenLu/Citi/strataElite/251017.CSV" },
  { bank: "citi", kind: "download", card: true, path: "ste900811/creditCardParser/HEAD/statements/stevenLu/Citi/strataElite/251119.CSV" },
  { bank: "navy-federal", kind: "layout", path: "raishish/fin-manager/HEAD/testdata/bank-exports/data/navy_federal_credit_union/checking_2025.csv" },
  { bank: "navy-federal", kind: "layout", path: "tacticalpacket/purser/HEAD/tests/fixtures/nfcu-checking-sample.csv" },
  { bank: "navy-federal", kind: "layout", card: true, path: "tacticalpacket/purser/HEAD/tests/fixtures/nfcu-cc-sample.csv" },
  { bank: "td-bank", kind: "download", path: "lonelytango/swiss-finance/HEAD/personal_finance/input/checking/td/1_2024.csv" },
  { bank: "td-bank", kind: "download", path: "lonelytango/swiss-finance/HEAD/personal_finance/input/checking/td/7_2024.csv" },
  { bank: "td-bank", kind: "layout", path: "raishish/fin-manager/HEAD/testdata/bank-exports/data/td_bank/checking_2025.csv" },
  { bank: "truist", kind: "download", path: "NormalxPerson/MM/HEAD/src/main/resources/truistNovToJan.csv" },
  { bank: "truist", kind: "layout", path: "raishish/fin-manager/HEAD/testdata/bank-exports/data/truist/checking_2026.csv" },
  { bank: "bank-of-america", kind: "layout", path: "VishruthR/Pennyful/HEAD/data/bankofamericatransactions.csv" },
  { bank: "bank-of-america-card", kind: "download", card: true, path: "YukioRivera/expenseTracker/HEAD/data/BOA/raw/March2025_1371.csv" },
  { bank: "bank-of-america-card", kind: "download", card: true, path: "YukioRivera/expenseTracker/HEAD/data/BOA/raw/October2025_1371.csv" },
  { bank: "capital-one", kind: "download", card: true, path: "hoffmanaiden/finances/HEAD/csv/recurring/CapitalOne_2026-07.csv" },
  { bank: "capital-one", kind: "download", card: true, path: "mjohnnywest/Project_4_data_acquisition/HEAD/statements/may_c1_transactions.csv" },
  { bank: "discover", kind: "download", card: true, path: "amkchari/ExpenseManager/HEAD/statements/discover-new-2024.csv" },
  { bank: "discover", kind: "download", card: true, path: "ubahmapk/ynab-format-csv/HEAD/resources/DiscoverCard-Statement.csv" },
  { bank: "amex", kind: "download", card: true, path: "bartonhammond/finance-nue/HEAD/data/amex/activity.csv" },
  { bank: "chase-checking", kind: "layout", path: "kielpedia/expat-finance/HEAD/sample_data/chase_checking.csv" },
  { bank: "us-bank", kind: "layout", path: "kmark43/budgeting/HEAD/sample.csv" },
  // Added 2026-11-14 (README "More real US exports: Wells Fargo, Chase, Ally, Apple Card"): the
  // Wells Fargo, Chase and US Bank downloads the first batch lacked, and the first business account.
  { bank: "chase-checking", kind: "download", business: true, path: "kanema20/primeorca/HEAD/Chase7573_Activity_20230828.CSV" },
  { bank: "chase-checking", kind: "download", path: "loftusa/General-Projects-And-Scripts/HEAD/Analyses/b-info/activity-big.csv" },
  { bank: "chase-checking", kind: "download", path: "briggstwitchell/resume/HEAD/transaction_processor/chasedebit.csv" },
  { bank: "chase-checking", kind: "layout", path: "Denzil10/pocket-budget/HEAD/samples/Chase4826_Activity_20261031.CSV" },
  { bank: "chase-checking", kind: "layout", business: true, path: "just-every/run-pantry/HEAD/fixtures/bank/operating-checking-2026-09.csv" },
  { bank: "chase-card", kind: "download", card: true, path: "baoquang98/Monthly_Finance/HEAD/Chase9938_Activity20251228.CSV" },
  { bank: "chase-card", kind: "download", card: true, path: "mren08/Personal-Finance-Assistant/HEAD/nov25_statement.CSV" },
  { bank: "chase-card", kind: "download", card: true, path: "hoffmanaiden/finances/HEAD/csv/joint/ChaseJoint_2026-07.csv" },
  { bank: "chase-card", kind: "download", card: true, path: "blakeb211/billcat-local-llm/HEAD/data/cc_transactions.csv" },
  { bank: "wells-fargo", kind: "download", path: "wolfedr/Finances/HEAD/Data/Archive/Checking1.csv" },
  { bank: "wells-fargo", kind: "download", path: "ronknighton/Budgeter/HEAD/Budgeter/Uploads/05.17.52.566721_Checking1.csv" },
  { bank: "wells-fargo", kind: "download", path: "marzdevs/PythonProjects/HEAD/ExpenseTracker/Checking1.csv" },
  { bank: "wells-fargo", kind: "layout", path: "Denzil10/pocket-budget/HEAD/samples/Checking1.csv" },
  { bank: "ally", kind: "download", path: "davydog187/finances/HEAD/exports/ally_savings.csv" },
  { bank: "ally", kind: "download", path: "davydog187/finances/HEAD/exports/ally_spending.csv" },
  { bank: "ally", kind: "download", path: "dcapps4140/Keyword-Categorization/HEAD/transactions.csv" },
  { bank: "ally", kind: "layout", path: "EliRibble/budgery/HEAD/tests/import_data/ally.csv" },
  { bank: "apple-card", kind: "download", card: true, path: "lonelytango/swiss-finance/HEAD/personal_finance/input/credit/apple/4_2024.csv" },
  { bank: "us-bank", kind: "download", card: true, path: "livingkurt/Copper-rt/HEAD/client/public/Expenses/Fidelity-1-1-20.csv" },
  // Added 2026-11-14 later (README "Credit unions and the US Bank memo"): a US Bank card download with ISO
  // dates whose memo holds five semicolons (read 0 rows before), and a layout several US credit unions'
  // online banking writes (Posting Date, Effective Date, Transaction Type, signed Amount, Balance).
  { bank: "us-bank", kind: "download", card: true, path: "cincotree/ai-money/HEAD/backend/statements/sample-statement.csv" },
  { bank: "us-bank", kind: "layout", path: "dvdhfrst-afk/solo-books/HEAD/samples/layouts/example-us-bank.csv" },
  { bank: "credit-union", kind: "download", path: "jessclem7/CashFlow/HEAD/ExportedTransactions%20(2).csv" },
  { bank: "credit-union", kind: "download", card: true, path: "JohnTelford/envelope/HEAD/cc-march-2024.csv" },
  { bank: "credit-union", kind: "layout", path: "MattFox1388/BudgetMobileClient/HEAD/resources/checkings.csv" },
  { bank: "credit-union", kind: "layout", path: "lonesome-polecat/budgetbee/HEAD/tests/bank1_sample_transactions.csv" },
  { bank: "credit-union", kind: "layout", path: "Mitchellscot/CashTrack/HEAD/tests/CashTrack.Tests/Files/test-bank-import.csv" },
  // Added 2026-11-14, third batch (README "Chase business cards and a US Bank checking download"): Chase's
  // business card download, which names each employee's card in a first "Card" column, and the US Bank
  // checking download the earlier batches lacked.
  { bank: "chase-business-card", kind: "download", card: true, business: true, path: "Delta-Compute/DeltaCFOAgent/HEAD/Chase4774_Q12025.CSV" },
  { bank: "chase-business-card", kind: "download", card: true, business: true, path: "avibanerjee/aiPersonalFinance/HEAD/ChaseStatements/UnitedBusiness.CSV" },
  { bank: "chase-business-card", kind: "download", card: true, business: true, path: "baldemar1979-beep/Jeskor-PnL/HEAD/Chase0162_Activity_20260811.csv" },
  { bank: "chase-business-card", kind: "download", card: true, business: true, path: "link2dawood/resturantbackend/HEAD/docs/docs/Chase8741_Activity20260206_20260305_20260316.CSV" },
  { bank: "chase-business-card", kind: "layout", card: true, business: true, path: "MinYenYimYinYen/sg-monti-com/HEAD/src/app/qbo/planning/sampleData/Chase%20Sample.csv" },
  { bank: "chase-business-card", kind: "layout", card: true, path: "bdmckean/code_off/HEAD/data/chase_transactions.csv" },
  { bank: "us-bank", kind: "download", path: "Ledger-Software/Ledger/HEAD/src/test/resources/USBankSample.csv" },
  { bank: "us-bank", kind: "download", card: true, path: "baoquang98/Monthly_Finance/HEAD/USBank.csv" },
  { bank: "us-bank", kind: "download", card: true, path: "daquino/usbank-es-loader/HEAD/doc/sample.csv" },
  { bank: "us-bank", kind: "layout", path: "BaileyPillon/buildable/HEAD/fixtures/statements/usbank.csv" },
  { bank: "us-bank", kind: "layout", path: "raishish/fin-manager/HEAD/testdata/bank-exports/data/us_bank/checking_2026.csv" },
  { bank: "us-bank", kind: "layout", card: true, path: "velicanu/expenses/HEAD/sample-data/usbank.csv" },
  { bank: "us-bank", kind: "layout", path: "Izzy-Gottz/aggregate-finance/HEAD/packages/connectors/files/fixtures/redacted/usbank.csv" },
  { bank: "us-bank", kind: "layout", path: "cubic1M/Jane/HEAD/src/data-sources/csv/__fixtures__/us-bank.csv" },
  { bank: "us-bank", kind: "layout", path: "mikebean233/finance_tool/HEAD/src/main/resources/dataExample/transaction.csv" },
];

const PAY_IN_CARD = /\b(payment|thank you|autopay|auto pay|directpay)\b/i;
const PAY_IN_BANK = /\b(payroll|direct dep|dir dep|deposit|zelle (payment )?from|transfer from|interest paid|refund)\b/i;

export function analyse(text, src) {
  const r = readStatement(text, src.card ? {} : {});
  const lines = text.replace(/\r(?!\n)/g, "\n").split(/\r?\n/);
  const got = new Set(r.rows.map((x) => x.line));
  const skipped = [];
  // Lines after the header row that hold something but were not read.
  const headerAt = lines.findIndex((l) => /date/i.test(l) && /,/.test(l));
  for (let i = headerAt + 1; i < lines.length; i++) if (lines[i].replace(/[,\s"]/g, "") && !got.has(i + 1)) skipped.push({ line: i + 1, why: /,"?-?0\.0{2,4}"?,|,"?-?0\.0{2,4}"?,?$|,,"?0\.00"?$/.test(lines[i]) ? "zero amount" : /beginning balance|ending balance/i.test(lines[i]) ? "balance line" : "other" });
  // As importStatement does: a card file may print what is owed as positive, so try both signs.
  const asIs = checkRunningBalance(r.rows);
  const flipped = checkRunningBalance(r.rows.map((x) => ({ ...x, balance: x.balance === null ? null : -x.balance })));
  const bal = asIs.checked && (flipped.breaks.length < asIs.breaks.length || (src.card && flipped.breaks.length === asIs.breaks.length)) ? flipped : asIs;
  const signWrong = [];
  for (const x of r.rows) {
    const re = src.card ? PAY_IN_CARD : PAY_IN_BANK;
    // Card payments are money in on a card account; "PAYMENT" inside a merchant name
    // ("PAYMENT ID" on a Venmo row of a checking file) is why checking uses its own list.
    // "Ext Credit Card Debit ATT* BILL PAYMENT" is a purchase from AT&T (the credit-union card file says
    // "Credit Card Debit" on every purchase), not a payment to the card.
    if (re.test(x.desc) && !/\b(fee|interest charge|plan fee)\b/i.test(x.desc) && !/credit card debit|\*bill payment/i.test(x.desc) && x.cents < 0) signWrong.push({ line: x.line, cents: x.cents });
  }
  return {
    bank: r.bank ?? null, rows: r.rows.length, skipped,
    otherSkipped: skipped.filter((s) => s.why === "other").length,
    problems: r.problems ?? [], balance: bal.checked ? { breaks: bal.breaks.length, reordered: !!bal.reordered } : null,
    signWrong, inferred: r.inferred ?? null, mcc: r.rows.filter((x) => x.mcc).length, cards: new Set(r.rows.map((x) => x.card).filter(Boolean)).size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
  const cache = arg("--cache", "/tmp/us-bank-exports");
  mkdirSync(cache, { recursive: true });
  let files = 0, rows = 0, other = 0, wrongSign = 0, named = 0, fetched = 0;
  for (const src of SOURCES) {
    const f = join(cache, src.path.replace(/\//g, "_"));
    if (!existsSync(f)) {
      const res = await fetch(`https://raw.githubusercontent.com/${src.path}`).catch((e) => ({ ok: false, status: String(e) }));
      if (!res.ok) { console.log(`${src.bank.padEnd(16)} FETCH ${res.status} ${src.path}`); continue; }
      writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
    const a = analyse(readFileSync(f, "utf8").replace(/^﻿/, ""), src);
    files++; rows += a.rows; other += a.otherSkipped; wrongSign += a.signWrong.length; if (a.bank === src.bank) named++;
    const bal = a.balance ? (a.balance.breaks ? `balance ${a.balance.breaks} breaks` : "balance chains") : "no balance";
    console.log(`${src.bank.padEnd(16)} ${src.kind.padEnd(8)} named ${String(a.bank).padEnd(16)} rows ${String(a.rows).padStart(4)}  skipped ${a.skipped.length} (${a.otherSkipped} unexplained)  ${bal}  sign wrong ${a.signWrong.length}  problems ${a.problems.length}${a.cards ? `  cards ${a.cards}` : ""}`);
    if (process.argv.includes("--show")) { for (const s of a.skipped) console.log(`    skipped line ${s.line}: ${s.why}`); for (const p of a.problems) console.log(`    problem: ${p.slice(0, 160)}`); for (const s of a.signWrong) console.log(`    sign line ${s.line}: ${s.cents}`); }
  }
  console.log(`\n${files} files (${fetched} fetched now), ${rows} rows read; named right ${named}/${files}; unexplained skips ${other}; payment/deposit rows with the wrong sign ${wrongSign}`);
}
