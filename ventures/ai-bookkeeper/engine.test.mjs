import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm, parseSplit, suggestRules, addRules, acceptSuggestions, journal, reports, closeChecks, exportJournal, exportLines, status, analyze } from "./engine.mjs";
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

test("ablation: switching a layer off removes its suggestions, and without memory nothing posts alone", () => {
  const full = runSeed(1).slice(3), noMem = runSeed(1, undefined, { skipLayers: ["memory"] }).slice(3);
  const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
  assert.ok(sum(full, "auto") > 0);
  assert.equal(sum(noMem, "auto"), 0);
  assert.equal(sum(noMem.map((r) => ({ n: r.bySource.memory?.n ?? 0 })), "n"), 0);
  const none = runSeed(1, undefined, { skipLayers: ["memory", "learned", "built-in"] }).slice(3);
  assert.equal(sum(none, "suggested"), 0);
});
