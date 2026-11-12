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
  for (let i = headerAt + 1; i < lines.length; i++) if (lines[i].replace(/[,\s"]/g, "") && !got.has(i + 1)) skipped.push({ line: i + 1, why: /,0\.00,|,"?0\.00"?,?$|,,"?0\.00"?$/.test(lines[i]) ? "zero amount" : /beginning balance|ending balance/i.test(lines[i]) ? "balance line" : "other" });
  const bal = checkRunningBalance(r.rows);
  const signWrong = [];
  for (const x of r.rows) {
    const re = src.card ? PAY_IN_CARD : PAY_IN_BANK;
    // Card payments are money in on a card account; "PAYMENT" inside a merchant name
    // ("PAYMENT ID" on a Venmo row of a checking file) is why checking uses its own list.
    if (re.test(x.desc) && !/\b(fee|interest charge|plan fee)\b/i.test(x.desc) && x.cents < 0) signWrong.push({ line: x.line, cents: x.cents });
  }
  return {
    bank: r.bank ?? null, rows: r.rows.length, skipped,
    otherSkipped: skipped.filter((s) => s.why === "other").length,
    problems: r.problems ?? [], balance: bal.checked ? { breaks: bal.breaks.length, reordered: !!bal.reordered } : null,
    signWrong, inferred: r.inferred ?? null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
    console.log(`${src.bank.padEnd(16)} ${src.kind.padEnd(8)} named ${String(a.bank).padEnd(16)} rows ${String(a.rows).padStart(4)}  skipped ${a.skipped.length} (${a.otherSkipped} unexplained)  ${bal}  sign wrong ${a.signWrong.length}  problems ${a.problems.length}`);
    if (process.argv.includes("--show")) { for (const s of a.skipped) console.log(`    skipped line ${s.line}: ${s.why}`); for (const p of a.problems) console.log(`    problem: ${p.slice(0, 160)}`); for (const s of a.signWrong) console.log(`    sign line ${s.line}: ${s.cents}`); }
  }
  console.log(`\n${files} files (${fetched} fetched now), ${rows} rows read; named right ${named}/${files}; unexplained skips ${other}; payment/deposit rows with the wrong sign ${wrongSign}`);
}
