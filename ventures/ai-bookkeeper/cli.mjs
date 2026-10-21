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
//   node cli.mjs --books books.json export qbo|xero|iif|csv|lines > journal.csv
//   node cli.mjs --example report
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { newBooks, importStatement, importOfxAccounts, lockPeriod, categorize, suggestRules, addRules, addDocuments, writeOff, aging, salesTax, confirm, parseSplit, acceptSuggestions, reports, closeChecks, exportJournal, exportLines, status, analyze, fmt } from "./engine.mjs";
import { accountMap } from "./ledger.mjs";
import { scheduleC, scheduleCCsv, contractors1099, contractors1099Csv, nec1099FilingCsv, markW9, mergePayees } from "./taxforms.mjs";
import { sniffFormat, splitOfx } from "./bank.mjs";

const HELP = `AI Bookkeeper: double-entry books from bank and card CSVs that learn from your corrections.

  --books FILE           the books (JSON); created on first import
  --example              start from the synthetic three-month example instead
  import FILE --account CODE [--invert] [--day-first] [--decimal-comma] [--auto 0.85]
  import FILE.ofx --map OFXID=CODE,OFXID=CODE   a multi-account OFX file, one chart code per account
  review                 list lines waiting for an account
  confirm ID=CODE ...    file lines (and learn from them)
  confirm ID=CODE:AMT,CODE[:AMT] ...
                         split a line: ID=4000:1000.00,6010:-30.00 for a 970.00 payout
                         (amounts signed like the bank line; one may be left out)
  documents FILE         load an invoice and bill list (CSV: type,number,date,due,party,amount,account[,against]; type may be invoice, bill, credit note, vendor credit);
                         bank lines that pay them clear receivable/payable
  salestax [--from D --to D]  sales tax collected, credited and paid over by month, and what is still owed
  lock DATE|off          lock a closed period: nothing dated on or before DATE can be imported, re-filed, booked or written off
  contractors [--year Y] [--threshold DOLLARS] [--csv|--filing|--json]  contract labor paid by payee against the 1099-NEC line, with W-9 status
  merge-payee FROM INTO [--off]  count two spellings of one payee as one on the contractors worksheet
  w9 PAYEE [--off]       record that a W-9 is on file for a payee (a flag; no tax IDs are stored)
  schedulec [--from D --to D] [--meals PCT] [--csv|--json]  the profit and loss on US Schedule C lines (a worksheet, not a filing)
  writeoff ID [--date D]  write off an invoice's unpaid balance to bad debts (6900)
  aging [--as-of D]      what customers owe you and what you owe, by days past due
  rules [--apply]        payees you filed the same way 3+ times, as rules; --apply adds them
  accept [MIN]           accept every suggestion at or above MIN confidence (default 0.7)
  ai                     ask a model for the review queue: your key or a local model
                         (LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL, LLM_API_KEY or ANTHROPIC_API_KEY)
  report [--from D] [--to D] [--json]
  checks                 close checks: review left, suspense, duplicates, unusual sizes, reconciliation
  export FORMAT          qbo | xero | iif | csv | lines

No warranty. Not accounting, tax or financial advice; check its output before you rely on it.`;

const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); if (i === -1) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const has = (k) => { const i = argv.indexOf(k); if (i === -1) return false; argv.splice(i, 1); return true; };
if (has("--help") || has("-h") || !argv.length) { console.log(HELP); process.exit(0); }

const file = flag("--books");
const json = has("--json"), example = has("--example"), invert = has("--invert") ? true : undefined, dayFirst = has("--day-first"), decimalComma = has("--decimal-comma");
const asOf = flag("--as-of");
const acctMap = flag("--map"), account = flag("--account"), from = flag("--from"), to = flag("--to"), auto = flag("--auto");
let books = example ? analyze({ example: true }).books : file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : newBooks();
const save = () => { if (file) writeFileSync(file, JSON.stringify(books, null, 1)); };
const opts = { invert, dayFirst, decimalComma, ...(auto ? { autoPost: +auto } : {}) };
const [cmd, ...rest] = argv;
const map = accountMap(books.accounts);
const name = (c) => (c ? `${c} ${map.get(c)?.name ?? ""}` : "-");

if (cmd === "import" && rest[0] && !account && existsSync(rest[0])) {
  // an OFX file with several accounts: --map OFXID=CODE,OFXID=CODE
  const text = readFileSync(rest[0], "utf8");
  const parts = sniffFormat(text) === "ofx" ? splitOfx(text) : [];
  const map = Object.fromEntries((acctMap ?? "").split(",").filter(Boolean).map((p) => p.split("=")));
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
  const r = importStatement(books, readFileSync(rest[0], "utf8"), account, opts);
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
} else if (cmd === "lock") {
  if (!rest[0]) { console.error("lock needs a date (YYYY-MM-DD) or off"); process.exit(2); }
  try { books = lockPeriod(books, rest[0] === "off" ? null : rest[0]); save(); console.log(books.lockedThrough ? `Locked through ${books.lockedThrough}.` : "Unlocked."); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "writeoff") {
  if (!rest[0]) { console.error("writeoff needs an invoice id or number"); process.exit(2); }
  try { const r = writeOff(books, rest[0], { date: flag("--date") ?? undefined }); books = r.books; save(); console.log(`Wrote off ${fmt(r.cents)} of ${rest[0]} to bad debts.`); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "aging") {
  const a = aging(books, asOf);
  if (json) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }
  console.log(`AGING as of ${a.asOf}`);
  for (const [h, side] of [["Receivable (owed to you)", a.receivable], ["Payable (you owe)", a.payable]]) console.log(`  ${h.padEnd(26)} ${fmt(side.total).padStart(12)}   ${a.buckets.map((b, i) => `${b}: ${fmt(side.byBucket[i])}`).join("  ")}`);
  for (const d of a.open) console.log(`    ${d.id.padEnd(14)} ${d.party.slice(0, 28).padEnd(28)} ${fmt(d.total).padStart(11)}  due ${d.due ?? d.date}  ${d.credit ? "credit not applied" : d.daysLate ? `${d.daysLate} days late` : "not due"}${d.partlyPaid ? `  (of ${fmt(d.original)})` : ""}`);
} else if (cmd === "schedulec") {
  const sc = scheduleC(books, { from, to, mealsPct: flag("--meals") !== null ? +flag("--meals") : 50 });
  if (json) { console.log(JSON.stringify(sc, null, 2)); process.exit(0); }
  if (has("--csv")) { process.stdout.write(scheduleCCsv(sc)); process.exit(0); }
  console.log(`SCHEDULE C WORKSHEET${from || to ? ` ${from ?? ""}..${to ?? ""}` : ""}`);
  for (const l of sc.lines) console.log(`  ${l.line.padEnd(4)} ${l.label.padEnd(36)} ${fmt(l.cents).padStart(12)}`);
  console.log(`  7    ${"Gross income".padEnd(36)} ${fmt(sc.grossIncome).padStart(12)}\n  28   ${"Total expenses".padEnd(36)} ${fmt(sc.totalExpenses).padStart(12)}\n  31   ${"Net profit or (loss)".padEnd(36)} ${fmt(sc.netProfit).padStart(12)}`);
  if (sc.meals.booked) console.log(`  Meals booked ${fmt(sc.meals.booked)}, ${sc.meals.pct}% carried to 24b.`);
  for (const w of sc.warnings) console.log(`  ! ${w}`);
  console.log("  A worksheet for you or your preparer. Not tax advice; it leaves out depreciation, home office, mileage and self-employment tax.");
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
} else if (cmd === "merge-payee") {
  if (!rest[0] || !rest[1]) { console.error("merge-payee needs two payee names as they appear on the bank lines"); process.exit(2); }
  try { books = mergePayees(books, rest[0], rest[1], !has("--off")); save(); console.log(has("--off") ? "Merge undone." : `"${rest[0]}" is now counted with "${rest[1]}".`); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "w9") {
  if (!rest[0]) { console.error("w9 needs a payee name as it appears on the bank line"); process.exit(2); }
  const off = has("--off");
  try { books = markW9(books, rest[0], !off); save(); console.log(off ? "W-9 flag cleared." : "W-9 marked on file."); } catch (e) { console.error(e.message); process.exit(1); }
} else if (cmd === "salestax") {
  const t = salesTax(books, { from, to });
  if (json) { console.log(JSON.stringify(t, null, 2)); process.exit(0); }
  console.log(`SALES TAX (account ${t.account})\n  ${"month".padEnd(8)} ${["sales", "collected", "credited", "paid over", "owed"].map((h) => h.padStart(12)).join(" ")}`);
  for (const r of t.months) console.log(`  ${r.month.padEnd(8)} ${[r.sales, r.collected, r.credited, r.remitted, r.owed].map((v) => fmt(v).padStart(12)).join(" ")}`);
  console.log(`  ${"total".padEnd(8)} ${[t.totals.sales, t.totals.collected, t.totals.credited, t.totals.remitted, t.owed].map((v) => fmt(v).padStart(12)).join(" ")}`);
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
  console.log(`  Cash ${fmt(c.openingCash)} -> ${fmt(c.closingCash)}: ${c.ties ? "ties to the bank accounts" : "DOES NOT TIE"}`);
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
