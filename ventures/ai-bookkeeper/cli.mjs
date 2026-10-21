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
import { newBooks, importStatement, categorize, suggestRules, addRules, addDocuments, aging, confirm, parseSplit, acceptSuggestions, reports, closeChecks, exportJournal, exportLines, status, analyze, fmt } from "./engine.mjs";
import { accountMap } from "./ledger.mjs";

const HELP = `AI Bookkeeper: double-entry books from bank and card CSVs that learn from your corrections.

  --books FILE           the books (JSON); created on first import
  --example              start from the synthetic three-month example instead
  import FILE --account CODE [--invert] [--day-first] [--decimal-comma] [--auto 0.85]
  review                 list lines waiting for an account
  confirm ID=CODE ...    file lines (and learn from them)
  confirm ID=CODE:AMT,CODE[:AMT] ...
                         split a line: ID=4000:1000.00,6010:-30.00 for a 970.00 payout
                         (amounts signed like the bank line; one may be left out)
  documents FILE         load an invoice and bill list (CSV: type,number,date,due,party,amount,account[,against]; type may be invoice, bill, credit note, vendor credit);
                         bank lines that pay them clear receivable/payable
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
const json = has("--json"), example = has("--example"), invert = has("--invert"), dayFirst = has("--day-first"), decimalComma = has("--decimal-comma");
const asOf = flag("--as-of");
const account = flag("--account"), from = flag("--from"), to = flag("--to"), auto = flag("--auto");
let books = example ? analyze({ example: true }).books : file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : newBooks();
const save = () => { if (file) writeFileSync(file, JSON.stringify(books, null, 1)); };
const opts = { invert, dayFirst, decimalComma, ...(auto ? { autoPost: +auto } : {}) };
const [cmd, ...rest] = argv;
const map = accountMap(books.accounts);
const name = (c) => (c ? `${c} ${map.get(c)?.name ?? ""}` : "-");

if (cmd === "import") {
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
} else if (cmd === "aging") {
  const a = aging(books, asOf);
  if (json) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }
  console.log(`AGING as of ${a.asOf}`);
  for (const [h, side] of [["Receivable (owed to you)", a.receivable], ["Payable (you owe)", a.payable]]) console.log(`  ${h.padEnd(26)} ${fmt(side.total).padStart(12)}   ${a.buckets.map((b, i) => `${b}: ${fmt(side.byBucket[i])}`).join("  ")}`);
  for (const d of a.open) console.log(`    ${d.id.padEnd(14)} ${d.party.slice(0, 28).padEnd(28)} ${fmt(d.total).padStart(11)}  due ${d.due ?? d.date}  ${d.credit ? "credit not applied" : d.daysLate ? `${d.daysLate} days late` : "not due"}${d.partlyPaid ? `  (of ${fmt(d.original)})` : ""}`);
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
