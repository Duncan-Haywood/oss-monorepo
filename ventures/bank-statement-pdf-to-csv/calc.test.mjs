import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmountWord, matchDate, parseStatementText, parseStatementPdf, toCsv, findingsCsv, formatCents, money,
  sampleStatement, sampleBroken, sampleCard,
} from "./calc.mjs";
import { parseCMap } from "./pdf-text.mjs";
import { buildStatementPdf, inflate } from "./pdf-fixtures.mjs";

test("amounts are whole cents and read every printed sign convention", () => {
  assert.deepEqual(parseAmountWord("1,234.56"), { abs: 123456, neg: false, tag: null, text: "1,234.56" });
  assert.equal(parseAmountWord("1.234,56").abs, 123456);
  assert.equal(parseAmountWord("(86.19)").neg, true);
  assert.equal(parseAmountWord("-$12.00").neg, true);
  assert.equal(parseAmountWord("12.00-").neg, true);
  assert.equal(parseAmountWord("500.00CR").tag, "CR");
  assert.equal(parseAmountWord("1,000.10").abs, 100010);
  assert.equal(parseAmountWord("2025"), null);
  assert.equal(parseAmountWord("4412"), null);
  assert.equal(parseAmountWord("1.5"), null);
  assert.equal(formatCents(-123456), "-1234.56");
  assert.equal(formatCents(5, ","), "0,05");
  assert.equal(money(-100005), "-1,000.05");
});

test("no floating point drift: 0.1 + 0.2 style sums stay exact", () => {
  const r = parseStatementText(["Beginning balance 0.10", "Ending balance 0.30", "01/02 A 0.20 0.30"].join("\n"));
  assert.equal(r.reconcile.ok, true);
});

test("dates in the formats statements print", () => {
  assert.deepEqual(matchDate("2026-01-05"), { kind: "iso", y: 2026, m: 1, d: 5 });
  assert.deepEqual(matchDate("05/01/2026"), { kind: "num", a: 5, b: 1, y: 2026 });
  assert.deepEqual(matchDate("05.01.26"), { kind: "num", a: 5, b: 1, y: 2026 });
  assert.deepEqual(matchDate("5 Jan 2026"), { kind: "named", d: 5, m: 1, y: 2026 });
  assert.deepEqual(matchDate("Jan 5"), { kind: "named", d: 5, m: 1, y: null });
  assert.deepEqual(matchDate("Sept 30, 2025"), { kind: "named", d: 30, m: 9, y: 2025 });
  assert.equal(matchDate("12.50"), null);
  assert.equal(matchDate("hello"), null);
});

test("a clean bank statement reconciles and exports signed amounts", () => {
  const r = parseStatementText(sampleStatement());
  assert.equal(r.transactions.length, 9);
  assert.equal(r.reconcile.ok, true);
  assert.equal(r.reconcile.diff, 0);
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  const t = r.transactions;
  assert.equal(t[0].amount, 142000);
  assert.equal(t[1].amount, -8619);
  assert.equal(t[7].description, "CARD PURCHASE HARDWARE WHOLESALE SPRINGFIELD ST", "wrapped description is joined");
  assert.equal(t[8].date.y, 2026, "year comes from the statement period");
  assert.ok(t.every((x) => x.source === "balance"));
});

test("a lost row is named by amount and by where the running balance breaks", () => {
  const r = parseStatementText(sampleBroken());
  assert.equal(r.reconcile.ok, false);
  assert.equal(r.reconcile.diff, -60000);
  const titles = r.findings.map((f) => f.title);
  assert.ok(titles.some((x) => /off by 600\.00/.test(x)));
  assert.ok(titles.some((x) => /running balance breaks at line 11/.test(x)));
  assert.ok(r.findings.some((f) => /money-out row of exactly 600\.00 may be missing/.test(f.detail)));
  assert.ok(r.findings.some((f) => /Money-out total differs/.test(f.title)));
});

test("the running balance overrides a wrong column and says so", () => {
  const text = [
    "Beginning balance 100.00",
    "Ending balance 150.00",
    "Date Description Withdrawals Deposits Balance",
    "01/02/2026 REFUND   50.00                  150.00",
  ].join("\n");
  const r = parseStatementText(text);
  assert.equal(r.transactions[0].amount, 5000);
  assert.equal(r.transactions[0].source, "balance");
  assert.equal(r.reconcile.ok, true);
  assert.ok(r.findings.some((f) => /sign set by the running balance/.test(f.title)));
});

test("a card statement: purchases are negative, payments positive, and it reconciles", () => {
  const r = parseStatementText(sampleCard(), { kind: "card" });
  assert.equal(r.reconcile.ok, true);
  assert.equal(r.findings.filter((f) => f.severity !== "info").length, 0, JSON.stringify(r.findings));
  const byDesc = (s) => r.transactions.find((t) => t.description.includes(s));
  assert.equal(byDesc("AMAZON").amount, -12999);
  assert.equal(byDesc("PAYMENT").amount, 50000);
  assert.equal(byDesc("RETURN").amount, 9960);
  assert.equal(byDesc("INTEREST").date.y, 2026);
  assert.equal(byDesc("AMAZON").date.y, 2025);
  assert.ok(byDesc("AMAZON").postDate);
});

test("day-month order is detected from a date that can only be one way, or warned about", () => {
  const dmy = parseStatementText("Opening balance 0.00\n25/12/2025 X 5.00 5.00\nClosing balance 5.00");
  assert.equal(dmy.dateOrder, "dmy");
  assert.equal(dmy.transactions[0].date.m, 12);
  const mdy = parseStatementText("Opening balance 0.00\n12/25/2025 X 5.00 5.00\nClosing balance 5.00");
  assert.equal(mdy.dateOrder, "mdy");
  const amb = parseStatementText("Opening balance 0.00\n03/04/2025 X 5.00 5.00\nClosing balance 5.00");
  assert.ok(amb.findings.some((f) => /ambiguous/.test(f.title)));
  const forced = parseStatementText("Opening balance 0.00\n03/04/2025 X 5.00 5.00\nClosing balance 5.00", { dateOrder: "dmy" });
  assert.equal(forced.transactions[0].date.m, 4);
});

test("a statement with no balances still converts, with a warning that it is unproven", () => {
  const r = parseStatementText("01/02/2026 COFFEE -4.50\n01/03/2026 SALARY 1,000.00");
  assert.equal(r.transactions.length, 2);
  assert.equal(r.reconcile.ok, null);
  assert.ok(r.findings.some((f) => /No opening and closing balance/.test(f.title)));
  assert.equal(r.transactions[1].amount, 100000);
});

test("unsigned amounts with nothing to go on are called a guess", () => {
  const r = parseStatementText("01/02/2026 COFFEE 4.50\n01/03/2026 SALARY 1,000.00");
  assert.ok(r.findings.some((f) => /no way to tell money in from money out/.test(f.title)));
});

test("empty and non-statement input says so instead of producing rows", () => {
  const r = parseStatementText("hello\nworld");
  assert.equal(r.transactions.length, 0);
  assert.ok(r.findings.some((f) => /No transactions found/.test(f.title)));
});

test("CSV layouts: generic, split, Xero, QuickBooks 3 and 4 column, decimal comma, formula guard", () => {
  const r = parseStatementText(sampleStatement());
  const generic = toCsv(r).split("\r\n");
  assert.equal(generic[0], "Date,Description,Amount,Balance");
  assert.equal(generic[1], "2026-01-02,ACH CREDIT STRIPE PAYOUT,1420.00,5630.55");
  assert.match(toCsv(r, { layout: "split" }), /2026-01-05,CARD PURCHASE OFFICE SUPPLY CO 4412,86\.19,,5544\.36/);
  const xero = toCsv(r, { layout: "xero", dateFormat: "dmy" }).split("\r\n");
  assert.equal(xero[0], "*Date,*Amount,Payee,Description,Reference");
  assert.equal(xero[1], "02/01/2026,1420.00,,ACH CREDIT STRIPE PAYOUT,");
  const q3 = toCsv(r, { layout: "qbo3" }).split("\r\n");
  assert.equal(q3[1], "01/02/2026,ACH CREDIT STRIPE PAYOUT,1420.00");
  const q4 = toCsv(r, { layout: "qbo4" }).split("\r\n");
  assert.equal(q4[0], "Date,Description,Credit,Debit");
  assert.equal(q4[2], "01/05/2026,CARD PURCHASE OFFICE SUPPLY CO 4412,,86.19");
  assert.match(toCsv(r, { decimal: "," }), /,"1420,00","5630,55"/);
  const evil = parseStatementText("Opening balance 0.00\n01/02/2026 =HYPERLINK(\"x\") 5.00 5.00\nClosing balance 5.00");
  assert.match(toCsv(evil), /"'=HYPERLINK\(""x""\)"/);
  assert.match(findingsCsv(r), /^Severity,Line,Finding,Detail/);
});

test("ToUnicode CMaps: bfchar, bfrange and the code length", () => {
  const cm = parseCMap("1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfchar <0003> <0020> endbfchar 1 beginbfrange <0010> <0012> <0030> endbfrange");
  assert.equal(cm.codeLen, 2);
  assert.equal(cm.map.get(3), " ");
  assert.equal(cm.map.get(0x11), "1");
  assert.equal(cm.map.get(0x12), "2");
});

for (const mode of ["plain", "tounicode", "objstm"]) {
  for (const pages of [1, 3]) {
    test(`PDF end to end: ${mode} encoding, ${pages} page(s), same answer as pasted text`, async () => {
      const pdf = buildStatementPdf(sampleStatement(), { mode, pages });
      const r = await parseStatementPdf(pdf, inflate);
      const pasted = parseStatementText(sampleStatement());
      assert.equal(r.flags.pageCount, pages);
      assert.equal(r.reconcile.ok, true, JSON.stringify(r.findings));
      assert.deepEqual(r.transactions.map((t) => [t.amount, t.description]), pasted.transactions.map((t) => [t.amount, t.description]));
    });
  }
}

test("PDF: uncompressed content streams work too, and a broken statement is still caught", async () => {
  const r = await parseStatementPdf(buildStatementPdf(sampleBroken(), { compress: false }), inflate);
  assert.equal(r.reconcile.diff, -60000);
});

test("PDF: encrypted, not-a-PDF and no-text files are named, not guessed at", async () => {
  const enc = await parseStatementPdf(buildStatementPdf(sampleStatement(), { encrypt: true }), inflate);
  assert.match(enc.findings[0].title, /password-protected/);
  const junk = await parseStatementPdf(new TextEncoder().encode("just some text"), inflate);
  assert.match(junk.findings[0].title, /not a PDF/);
  const blank = await parseStatementPdf(buildStatementPdf("", {}), inflate);
  assert.match(blank.findings[0].title, /No text in this PDF/);
  assert.match(blank.findings[0].detail, /does not do OCR/);
});

test("PDF: a composite font with no ToUnicode is reported as unreadable", async () => {
  const pdf = buildStatementPdf(sampleStatement(), { mode: "tounicode" });
  const text = Buffer.from(pdf).toString("latin1").replace(/\/ToUnicode \d+ 0 R/, "");
  const r = await parseStatementPdf(new Uint8Array(Buffer.from(text, "latin1")), inflate);
  assert.equal(r.transactions.length, 0);
  assert.match(r.findings[0].detail, /no mapping back to characters/);
});
