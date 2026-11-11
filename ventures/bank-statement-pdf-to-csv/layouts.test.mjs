// Layouts found on a third-party benchmark of statement PDFs (eval/README.md),
// each rebuilt here from synthetic lines so the tests carry no outside file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatement, parseStatementPdf, parseAmountWord, matchDate, toCsv } from "./calc.mjs";
import { groupLines } from "./pdf-text.mjs";
import { buildStatementPdf, inflate } from "./pdf-fixtures.mjs";

// A PDF-like line: items at x positions, as the PDF reader returns them.
const L = (page, key, ...items) => ({ page, key, items: items.map(([text, x]) => ({ text, x, xEnd: x + text.length * 4.5 })) });

test("months in other languages, and a dotted day.month only as a second date", () => {
  assert.deepEqual(matchDate("1 mei"), { kind: "named", d: 1, m: 5, y: null });
  assert.deepEqual(matchDate("02 janv. 25"), { kind: "named", d: 2, m: 1, y: 2025 });
  assert.equal(matchDate("15 août 2025").m, 8);
  assert.equal(matchDate("3 Mrz 2024").m, 3);
  assert.equal(matchDate("1er mars 2025").d, 1);
  assert.equal(matchDate("Mon 3"), null);
  assert.equal(matchDate("01.05"), null, "a bare 01.05 is not a date on its own");
});

test("a later table's headings do not relabel the rows above them", () => {
  const lines = [
    L(1, -100, ["Previous Balance", 40], ["100.00", 220]),
    L(1, -110, ["New Balance", 40], ["130.00", 220]),
    L(1, -120, ["Post Date", 40], ["Description", 120], ["Amount", 440]),
    L(1, -130, ["09/01", 40], ["COFFEE", 120], ["30.00", 450]),
    // An interest box below, whose "Balance" column sits where the amounts were.
    L(1, -200, ["Balance Type", 40], ["Annual Percentage Rate", 200], ["Balance Subject To Interest", 440]),
  ];
  const r = parseStatement(lines, { kind: "card", year: 2025 });
  assert.equal(r.transactions.length, 1);
  assert.equal(r.reconcile.ok, true);
});

test("Dutch: month names, interest date, 'Balance as of' lines and a euro sign from WinAnsi", async () => {
  const text = [
    "Balance as of 01.05.2025:   1.000,00",
    "Balance as of 31.05.2025:   1.090,00",
    "Date   Interest Date   Description          Amount",
    "1 mei  01.05           SALARIS              100,00 \x80",
    "7 mei  07.05           Jumbo                -10,00 \x80",
  ].join("\n");
  const r = await parseStatementPdf(buildStatementPdf(text, { mode: "plain" }), inflate, {});
  assert.equal(r.transactions.length, 2);
  assert.equal(r.reconcile.ok, true);
  assert.equal(r.transactions[0].date.y, 2025, "year from the dated balance lines");
  assert.equal(r.transactions[1].date.m, 5);
});

test("French Canadian: space-grouped amounts with a trailing $, accented headings, Solde d'ouverture", () => {
  const lines = [
    L(1, -10, ["Solde D'ouverture 1 janvier 2025", 50], ["10 750,00 $", 296]),
    L(1, -20, ["Solde De Fermeture 31 janvier 2025", 50], ["= 9 649,55 $", 287]),
    L(1, -30, ["Détails", 40], ["Chèques et débits", 272], ["Dépôts et crédits ($)", 359], ["Solde ($)", 523]),
    L(1, -40, ["02 ", 40], ["janv. 25 AMAZON.CA", 54], ["1 200,45 $", 305], ["9 549,55 $", 513]),
    L(1, -50, ["03 ", 40], ["janv. 25 DEPOT PAIE", 54], ["100,00 $", 421], ["9 649,55 $", 518]),
  ];
  const r = parseStatement(lines, {});
  assert.deepEqual(r.transactions.map((t) => t.amount), [-120045, 10000]);
  assert.equal(r.reconcile.ok, true);
  // Pasted text keeps its spaces ambiguous: "12 345,00" is not joined there.
  assert.equal(parseAmountWord("12"), null);
});

test("a footer printed over a row a point lower is split off, not merged into the row", () => {
  const runs = [
    { text: "22 ", x: 40, y: 45.47, size: 8 }, { text: "Vattenfall", x: 153, y: 45.47, size: 8 }, { text: "-19,40", x: 523, y: 45.47, size: 8 },
    { text: "No rights can be derived from this overview.", x: 40, y: 46.98, size: 7 },
  ];
  const lines = groupLines(runs, 1);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l.items[0].text === "22 " && l.items.length === 3));
});

test("two accounts in one statement are proved one by one against their own totals", () => {
  const lines = [
    L(1, -10, ["HKD Current Account — 817-890692-838", 40]),
    L(1, -20, ["Date", 40], ["Transaction Details", 81], ["Deposit", 303], ["Withdrawal", 360], ["Balance", 520]),
    L(1, -30, ["1 Sep", 40], ["Fps payment", 81], ["100.00", 384], ["900.00", 514]),
    L(1, -40, ["2 Sep", 40], ["Fps received", 81], ["50.00", 309], ["950.00", 514]),
    L(1, -50, ["Total Deposit Amount:", 40], ["HKD 50.00", 169], ["Total Withdrawal Amount:", 298], ["HKD 100.00", 426]),
    L(2, -10, ["USD Savings Account — 817-890692-002", 40]),
    L(2, -20, ["Date", 40], ["Transaction Details", 81], ["Deposit", 303], ["Withdrawal", 360], ["Balance", 520]),
    L(2, -30, ["3 Sep", 40], ["Fps transfer", 81], ["20.00", 384], ["5,000.00", 512]),
    L(2, -40, ["Total Deposit Amount:", 40], ["USD 0.00", 169], ["Total Withdrawal Amount:", 298], ["USD 20.00", 426]),
  ];
  const r = parseStatement(lines, { year: 2024 });
  assert.equal(r.reconcile.method, "sections");
  assert.equal(r.reconcile.ok, true);
  assert.deepEqual(r.reconcile.sections.map((s) => [s.rows, s.opening, s.closing]), [[2, 100000, 95000], [1, 502000, 500000]]);
  assert.ok(!r.findings.some((f) => /running balance breaks/.test(f.title)), "a new account's balance is not a break");
  const csv = toCsv(r);
  assert.match(csv.split("\r\n")[0], /^Account,Date/);
  assert.equal(toCsv(r, { layout: "xero", account: 1 }).trim().split("\r\n").length, 2, "one account picked for Xero");
  // A row lost from the second account shows against its totals.
  const lost = parseStatement(lines.filter((l) => !(l.page === 1 && l.key === -40)), { year: 2024 });
  assert.notEqual(lost.reconcile.ok, true);
});

test("an address line above the first table heading is not a transaction", () => {
  const lines = [
    L(1, -10, ["30/09/2025", 514]),
    L(1, -12, ["FLAT 12A", 40]),
    L(1, -14, ["18,364.12", 523]),
    L(1, -20, ["Opening balance", 40], ["1,000.00", 300]),
    L(1, -22, ["Closing balance", 40], ["990.00", 300]),
    L(1, -30, ["Date", 40], ["Description", 120], ["Amount", 300]),
    L(1, -40, ["01/09/2025", 40], ["Fee", 120], ["-10.00", 300]),
  ];
  const r = parseStatement(lines, {});
  assert.equal(r.transactions.length, 1);
  assert.equal(r.reconcile.ok, true);
});

test("a card statement is recognised without being told, and the choice is shown", () => {
  const lines = [
    L(1, -5, ["Minimum Payment Due", 40], ["35.00", 200]),
    L(1, -6, ["Payment Due Date", 40], ["10/24/2025", 200]),
    L(1, -10, ["Previous Balance", 40], ["100.00", 220]),
    L(1, -11, ["New Balance", 40], ["130.00", 220]),
    L(1, -20, ["Post Date", 40], ["Description", 120], ["Amount", 440]),
    L(1, -30, ["09/01", 40], ["COFFEE", 120], ["30.00", 450]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.equal(r.kind, "card");
  assert.equal(r.transactions[0].amount, -3000, "a charge is money out in the CSV");
  assert.ok(r.findings.some((f) => f.title === "Read as a credit card statement"));
  assert.equal(parseStatement(lines, { kind: "bank", year: 2025 }).kind, "bank", "a chosen type wins");
});

test("rows that share the date above become their own transactions; zero-amount lines do not", () => {
  const lines = [
    L(1, -10, ["Opening balance:", 77], ["50,000.00", 269]),
    L(1, -11, ["Closing balance:", 77], ["48,976.44", 269]),
    L(1, -20, ["Date", 77], ["Description", 149], ["Debit", 299], ["Credit", 365], ["Balance", 457]),
    L(1, -30, ["01 Jan", 77], ["Transaction 1", 149], ["1,000.00", 282]),
    L(1, -40, ["Transaction 2", 149], ["23.56", 299]),
    L(1, -50, ["Note line about nothing", 149], ["0.00", 305]),
    L(1, -60, ["03 Jan", 77], ["Transaction 3", 149], ["0.00", 299]),
  ];
  const r = parseStatement(lines, { year: 2025 });
  assert.deepEqual(r.transactions.map((t) => [t.date.d, t.description, t.amount]), [
    [1, "Transaction 1", -100000], [1, "Transaction 2", -2356], [3, "Transaction 3", 0],
  ]);
  assert.equal(r.reconcile.ok, true);
});

test("one-decimal amounts are read only on a statement that prints them", () => {
  const lines = [
    L(1, -10, ["Date", 61], ["Description", 168], ["Debit Amt", 288], ["Credit Amt", 405], ["Balance", 528]),
    L(1, -20, ["01-08-2024", 49], ["Salary Credit", 144], ["1935.3", 294], ["6864.58", 528]),
    L(1, -30, ["02-08-2024", 49], ["UPI Payment", 144], ["1652.61", 410], ["8517.19", 528]),
    L(1, -40, ["14-08-2024", 49], ["Fuel", 144], ["3878.57", 410], ["10158.4", 528]),
  ];
  const r = parseStatement(lines, {});
  assert.equal(r.transactions.length, 3);
  assert.equal(r.transactions[2].balance, 1015840);
  assert.ok(r.findings.some((f) => /one decimal/.test(f.title)));
  assert.equal(parseAmountWord("1.5"), null, "outside such a statement 1.5 is still not money");
});

test("text repeated once on every page (a watermark) never joins a description", () => {
  const page = (p, k) => [
    L(p, k - 1, ["Date", 40], ["Description", 120], ["Amount", 400], ["Balance", 500]),
    L(p, k - 2, [`0${p}/01/2025`, 40], [`SHOP ${p}`, 120], ["-1.00", 400], [String(100 - p) + ".00", 500]),
    L(p, -300, ["SAMPLE DOCUMENT", 140]),
    L(p, k - 4 - 20 * p, ["REF 1234", 120]),
  ];
  const lines = [L(1, 0, ["Opening balance", 40], ["100.00", 500]), L(1, 1, ["Closing balance", 40], ["98.00", 500]), ...page(1, -10), ...page(2, -10)];
  const r = parseStatement(lines, {});
  assert.deepEqual(r.transactions.map((t) => t.description), ["SHOP 1 REF 1234", "SHOP 2 REF 1234"]);
});
